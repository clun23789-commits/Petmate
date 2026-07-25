"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const works = db.collection("works");
const uploadAssets = db.collection("uploadAssets");
const generationTasks = db.collection("generationTasks");

const ALLOWED_OPERATION_TYPES = new Set(["initial", "optimize", "targeted_upload"]);
const BASIC_GENERATION_PROVIDER = "basic_generation";
const VIEW_MAP = {
  front: "front",
  side: "left",
  full: "front",
  pattern: "back",
  ear: "front",
  tail: "tail",
  custom: "unknown"
};

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function createTaskId() {
  return `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function createTargetVersionId(taskId) {
  return `version-${normalizeString(taskId).replace(/^task-/, "")}`;
}

function expectedError(errorCode, message) {
  return {
    ok: false,
    errorCode,
    message
  };
}

function fail(error) {
  console.error("startGenerationTask failed", error);
  return {
    ok: false,
    errorCode: "GENERATION_TASK_CREATE_FAILED",
    message: "生成任务创建失败，请稍后重试"
  };
}

async function getOwnedWork(openid, workId) {
  const result = await works
    .where({
      ownerOpenid: openid,
      workId
    })
    .limit(1)
    .get();

  return result.data && result.data[0];
}

async function getActiveUploadAssets(openid, workId) {
  const result = await uploadAssets
    .where({
      ownerOpenid: openid,
      workId,
      status: "active"
    })
    .limit(20)
    .get();

  return result.data || [];
}

function getUploadAssetIds(assets) {
  return (assets || []).map((asset) => normalizeString(asset.assetId)).filter(Boolean);
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function buildInputViews(activeAssets) {
  return (activeAssets || [])
    .map((asset) => {
      const viewType = normalizeString(asset.viewType);
      return {
        assetId: normalizeString(asset.assetId),
        viewType,
        view: VIEW_MAP[viewType] || "unknown",
        role: normalizeString(asset.role),
        fileID: normalizeString(asset.fileID),
        cloudPath: normalizeString(asset.cloudPath),
        width: normalizeNumber(asset.width),
        height: normalizeNumber(asset.height),
        size: normalizeNumber(asset.size),
        fileType: normalizeString(asset.fileType)
      };
    })
    .filter((item) => item.assetId && item.fileID);
}

function buildSafeWorkSnapshot(input, fallbackWork) {
  const source = {
    ...normalizeObject(input),
    ...normalizeObject(fallbackWork)
  };
  const workId = normalizeString(source.workId);

  if (!workId) {
    return {};
  }

  return {
    workId,
    petType: normalizeString(source.petType) || "cat",
    petTypeLabel: normalizeString(source.petTypeLabel),
    petName: normalizeString(source.petName) || "当前宠物作品",
    displayName: normalizeString(source.displayName),
    versionIds: normalizeArray(source.versionIds),
    previewImage: normalizeString(source.previewImage),
    source: normalizeString(source.source) || BASIC_GENERATION_PROVIDER,
    createdAt: source.createdAt || new Date()
  };
}

function hasUploadAsset(assets, predicate) {
  return (assets || []).some((asset) => asset && predicate(asset));
}

function validateTaskInputs(operationType, work, activeAssets) {
  if (operationType === "initial") {
    const hasInitialAsset = hasUploadAsset(activeAssets, (asset) => normalizeString(asset.role) === "initial");

    if (!activeAssets.length || !hasInitialAsset) {
      return expectedError(
        "GENERATION_TASK_NO_UPLOAD_ASSET",
        "还没有可用于生成的宠物照片，请先上传一张清晰正脸图。"
      );
    }

  }

  if (operationType === "targeted_upload") {
    const hasTargetedAsset = hasUploadAsset(activeAssets, (asset) => normalizeString(asset.role) === "targeted");

    if (!work || work.status === "deleted") {
      return expectedError("GENERATION_TASK_WORK_NOT_FOUND", "作品不存在或已失效，请返回作品页刷新后重试");
    }

    if (!hasTargetedAsset) {
      return expectedError(
        "GENERATION_TASK_NO_TARGETED_ASSET",
        "还没有可用于定向优化的补充照片，请先上传补图后再生成。"
      );
    }
  }

  if (operationType === "optimize" && (!work || work.status === "deleted")) {
    return expectedError("GENERATION_TASK_WORK_NOT_FOUND", "作品不存在或已失效，请返回作品页刷新后重试");
  }

  return null;
}

function toTaskResponse(task) {
  return {
    taskId: task.taskId,
    workId: task.workId,
    targetVersionId: task.targetVersionId || "",
    operationType: task.operationType,
    phase: task.phase,
    status: task.status,
    provider: task.provider || BASIC_GENERATION_PROVIDER,
    providerStatus: task.providerStatus || "queued",
    progress: Number(task.progress || 0),
    failureCode: task.failureCode || "",
    failureCategory: task.failureCategory || "none",
    failureReason: task.failureReason || "",
    recoverable: task.recoverable !== false,
    resultSaveStatus: task.resultSaveStatus || "idle",
    finalizedWorkId: task.finalizedWorkId || "",
    finalizedVersionId: task.finalizedVersionId || "",
    reservationId: task.reservationId || ""
  };
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const workId = normalizeString(event.workId);
    const operationType = normalizeString(event.operationType);
    const reservationId = normalizeString(event.reservationId);
    const dimensionSet = normalizeArray(event.dimensionSet);

    if (!OPENID || !workId || !ALLOWED_OPERATION_TYPES.has(operationType)) {
      return expectedError("GENERATION_TASK_INVALID_PAYLOAD", "生成任务参数不完整，请返回后重试");
    }

    let work = null;
    if (operationType !== "initial") {
      work = await getOwnedWork(OPENID, workId);

      if (!work || work.status === "deleted") {
        return expectedError("GENERATION_TASK_WORK_NOT_FOUND", "作品不存在或已失效，请返回作品页刷新后重试");
      }

      if (work.ownerOpenid !== OPENID) {
        return expectedError("GENERATION_TASK_WORK_FORBIDDEN", "当前作品不属于你，无法创建生成任务");
      }
    } else {
      work = await getOwnedWork(OPENID, workId);

      if (work && work.status === "deleted") {
        return expectedError("GENERATION_TASK_WORK_NOT_FOUND", "作品不存在或已失效，请返回作品页刷新后重试");
      }
    }

    const now = new Date();
    const taskId = createTaskId();
    const targetVersionId = createTargetVersionId(taskId);
    const provider = BASIC_GENERATION_PROVIDER;
    const activeAssets = await getActiveUploadAssets(OPENID, workId);
    const inputError = validateTaskInputs(operationType, work, activeAssets);
    if (inputError) {
      return inputError;
    }

    const uploadAssetIds = getUploadAssetIds(activeAssets);
    const task = {
      _id: taskId,
      taskId,
      ownerOpenid: OPENID,
      workId,
      operationType,
      phase: "queued",
      status: "pending",
      provider,
      providerTaskId: "",
      providerTraceId: "",
      providerStatus: "queued",
      providerUpdatedAt: now,
      progress: 0,
      failureCode: "",
      failureReason: "",
      failureCategory: "none",
      recoverable: true,
      reservationId,
      dimensionSet,
      targetVersionId,
      simulateFailure: event.simulateFailure === true,
      pollCount: 0,
      inputSnapshot: {
        uploadAssetIds,
        currentVersionId: work ? normalizeString(work.currentVersionId) : "",
        dimensionSet,
        views: buildInputViews(activeAssets),
        workSnapshot: buildSafeWorkSnapshot(event.workSnapshot, work)
      },
      resultSnapshot: {},
      resultSaveStatus: "idle",
      resultSaveErrorCode: "",
      resultSaveErrorMessage: "",
      finalizedWorkId: "",
      finalizedVersionId: "",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      failedAt: null,
      timeoutAt: null,
      finalizedAt: null
    };

    /*
     * Initial generation may create the cloud work record only after a successful
     * result. Keep upload asset collection as the soft input snapshot instead of
     * requiring an existing works document here.
     */
    await generationTasks.add({
      data: task
    });

    return {
      ok: true,
      data: {
        task: toTaskResponse(task)
      }
    };
  } catch (error) {
    return fail(error);
  }
};
