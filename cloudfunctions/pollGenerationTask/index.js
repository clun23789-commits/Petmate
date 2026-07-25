"use strict";

const cloud = require("wx-server-sdk");
const { GENERATION_PHASE, getProgressForPhase } = require("./lib/phase");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const generationTasks = db.collection("generationTasks");
const uploadAssets = db.collection("uploadAssets");
const works = db.collection("works");
const workVersions = db.collection("workVersions");

const TASK_TIMEOUT_MS = 10 * 60 * 1000;
const BASIC_GENERATION_PROVIDER = "basic_generation";
const FALLBACK_COVER = "/assets/mock/pet-cat-hero.png";
const VERSION_SOURCE_TYPE_SET = new Set(["initial", "optimize", "targeted_upload", "detail_retouch"]);
const SNAPSHOT_OBJECT_FIELDS = ["inputSnapshot", "resultSnapshot"];
const FORBIDDEN_TEXTURE_FIELDS = ["ai" + "Schema", "modelFamily", "patternType", "sche" + "maVersion"];
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
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeDate(value, fallback) {
  if (!value) {
    return fallback;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function expectedError(errorCode, message) {
  return {
    ok: false,
    errorCode,
    message
  };
}

function fail(error) {
  console.error("pollGenerationTask failed", error);
  return {
    ok: false,
    errorCode: "GENERATION_TASK_POLL_FAILED",
    message: "生成任务查询失败，请稍后重试"
  };
}

function failFinalize(errorCode, message, error) {
  if (error) {
    console.error("finalizeGenerationResult failed", error);
  }
  return {
    ok: false,
    errorCode,
    message
  };
}

function createTaskVersionId(task) {
  const targetVersionId = normalizeString(task.targetVersionId);
  if (targetVersionId) {
    return targetVersionId;
  }
  return `version-${normalizeString(task.taskId).replace(/^task-/, "")}`;
}

function isTaskTimedOut(task, now) {
  if (task.status === "success" || task.status === "failed") {
    return false;
  }
  const createdAt = normalizeDate(task.createdAt, null);
  return Boolean(createdAt && now.getTime() - createdAt.getTime() > TASK_TIMEOUT_MS);
}

function stripCloudControlledFields(source) {
  const result = {
    ...normalizeObject(source)
  };
  delete result._id;
  delete result._openid;
  delete result.ownerOpenid;
  delete result.deletedAt;
  return result;
}

function uniqueStrings(values) {
  return Array.from(new Set(normalizeArray(values)));
}

function buildInputView(asset) {
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
}

function buildInputViews(assets) {
  return (assets || []).map((asset) => buildInputView(asset)).filter((view) => view.assetId && view.fileID);
}

function createGenerationError(errorCode, message, failureCategory) {
  const error = new Error(message);
  error.errorCode = errorCode;
  error.failureCategory = failureCategory || "result";
  return error;
}

function getSourceType(operationType) {
  const normalized = normalizeString(operationType);
  return VERSION_SOURCE_TYPE_SET.has(normalized) ? normalized : "initial";
}

function getCoverFileID(views) {
  const frontView = (views || []).find((view) => {
    return normalizeString(view.viewType).toLowerCase() === "front" && normalizeString(view.fileID);
  });
  if (frontView) {
    return normalizeString(frontView.fileID);
  }

  const firstView = (views || []).find((view) => normalizeString(view.fileID));
  return firstView ? normalizeString(firstView.fileID) : FALLBACK_COVER;
}

function buildPreviewMedia(task, views) {
  const operationType = normalizeString(task.operationType);
  const cover = getCoverFileID(views);

  if (operationType === "targeted_upload") {
    return {
      cover,
      modelHint: "已根据补充照片整理出新的作品结果",
      colorway: "保留当前作品基础，并参考补图调整可见细节"
    };
  }

  if (operationType === "optimize") {
    return {
      cover,
      modelHint: "已根据反馈整理出新的作品结果",
      colorway: "围绕本次反馈整理主要颜色、花纹与轮廓参考"
    };
  }

  return {
    cover,
    modelHint: "已根据上传照片生成基础作品结果",
    colorway: "优先参考主图照片，并保留可继续优化的细节记录"
  };
}

function buildEditableNotes(task, views) {
  const dimensionSet = normalizeArray(task.dimensionSet || (task.inputSnapshot && task.inputSnapshot.dimensionSet));
  if (dimensionSet.length) {
    return dimensionSet.map((item) => `已围绕 ${item} 相关反馈整理本次作品`);
  }

  const viewLabels = uniqueStrings((views || []).map((view) => view.viewType)).filter(Boolean);
  if (viewLabels.length) {
    return [`已读取 ${viewLabels.length} 张可用照片并生成基础作品`];
  }

  return ["已完成本轮基础作品生成"];
}

function sanitizeEditableTexture(source) {
  const texture = {
    baseColor: "#D9A35F",
    notes: [],
    ...normalizeObject(source)
  };

  FORBIDDEN_TEXTURE_FIELDS.forEach((field) => {
    delete texture[field];
  });

  if (!Array.isArray(texture.notes)) {
    texture.notes = [];
  }

  return texture;
}

function buildBasicCompletedVersion({ task, views, now }) {
  const versionId = createTaskVersionId(task);
  const workId = normalizeString(task.workId);

  if (!versionId || !workId) {
    return null;
  }

  return {
    versionId,
    workId,
    sourceType: getSourceType(task.operationType),
    previewMedia: buildPreviewMedia(task, views),
    feedbackSummary: {},
    editableTexture: sanitizeEditableTexture({
      baseColor: normalizeString(task.operationType) === "optimize" ? "#D3B08F" : "#C6A38A",
      notes: buildEditableNotes(task, views)
    }),
    createdAt: now
  };
}

function buildWorkDoc(task, completedVersion, ownerOpenid, existingWork, now) {
  const snapshot = stripCloudControlledFields(task.inputSnapshot && task.inputSnapshot.workSnapshot);
  const existing = normalizeObject(existingWork);
  const versionId = normalizeString(completedVersion.versionId);
  const versionIds = uniqueStrings([...normalizeArray(existing.versionIds), ...normalizeArray(snapshot.versionIds), versionId]);

  return {
    workId: task.workId,
    ownerOpenid,
    petType: normalizeString(existing.petType || snapshot.petType) || "cat",
    petTypeLabel: normalizeString(existing.petTypeLabel || snapshot.petTypeLabel),
    petName: normalizeString(existing.petName || snapshot.petName) || "当前宠物作品",
    displayName: normalizeString(existing.displayName || snapshot.displayName),
    status: "ready",
    currentVersionId: versionId,
    versionIds,
    previewImage: normalizeString((completedVersion.previewMedia && completedVersion.previewMedia.cover) || existing.previewImage || snapshot.previewImage),
    source: normalizeString(existing.source || snapshot.source) || BASIC_GENERATION_PROVIDER,
    createdAt: normalizeDate(existing.createdAt || snapshot.createdAt, now),
    updatedAt: now,
    deletedAt: null
  };
}

function buildVersionDoc(task, completedVersion, ownerOpenid, existingVersion, now) {
  const version = stripCloudControlledFields(completedVersion);
  const existing = normalizeObject(existingVersion);
  const sourceType = VERSION_SOURCE_TYPE_SET.has(normalizeString(version.sourceType))
    ? normalizeString(version.sourceType)
    : VERSION_SOURCE_TYPE_SET.has(normalizeString(existing.sourceType))
      ? normalizeString(existing.sourceType)
      : "initial";

  return {
    ...version,
    versionId: normalizeString(version.versionId),
    workId: task.workId,
    ownerOpenid,
    sourceType,
    previewMedia: normalizeObject(version.previewMedia),
    feedbackSummary: normalizeObject(version.feedbackSummary),
    editableTexture: sanitizeEditableTexture({
      baseColor: "#D9A35F",
      notes: [],
      ...normalizeObject(version.editableTexture)
    }),
    status: "active",
    createdAt: normalizeDate(version.createdAt || existing.createdAt, now),
    updatedAt: now
  };
}

async function getOwnedWork(ownerOpenid, workId) {
  const result = await works
    .where({
      ownerOpenid,
      workId
    })
    .limit(1)
    .get();

  return result.data && result.data[0];
}

async function getOwnedVersion(ownerOpenid, versionId) {
  const result = await workVersions
    .where({
      ownerOpenid,
      versionId
    })
    .limit(1)
    .get();

  return result.data && result.data[0];
}

async function finalizeGenerationResult(task, completedVersion, now) {
  const ownerOpenid = normalizeString(task.ownerOpenid);
  const workId = normalizeString(task.workId);
  const versionId = normalizeString(completedVersion && completedVersion.versionId);
  const versionWorkId = normalizeString(completedVersion && completedVersion.workId);

  if (!ownerOpenid || !workId || !versionId) {
    return failFinalize("GENERATION_RESULT_INVALID", "生成结果信息不完整，暂时无法保存");
  }

  if (versionWorkId && versionWorkId !== workId) {
    return failFinalize("GENERATION_RESULT_INVALID", "生成结果版本归属异常，保存失败");
  }

  const existingWork = await getOwnedWork(ownerOpenid, workId);
  if (existingWork && existingWork.status === "deleted") {
    return failFinalize("GENERATION_RESULT_INVALID", "作品已删除，生成结果不会重新恢复");
  }

  const existingVersion = await getOwnedVersion(ownerOpenid, versionId);
  if (existingVersion && normalizeString(existingVersion.workId) !== workId) {
    return failFinalize("GENERATION_RESULT_INVALID", "生成结果版本归属异常，保存失败");
  }

  const versionDoc = buildVersionDoc(task, completedVersion, ownerOpenid, existingVersion, now);
  const workDoc = buildWorkDoc(task, versionDoc, ownerOpenid, existingWork, now);

  try {
    if (existingVersion) {
      await workVersions.doc(existingVersion._id).update({
        data: versionDoc
      });
    } else {
      await workVersions.add({
        data: versionDoc
      });
    }

    if (existingWork) {
      await works.doc(existingWork._id).update({
        data: workDoc
      });
    } else {
      await works.add({
        data: workDoc
      });
    }
  } catch (error) {
    return failFinalize("GENERATION_RESULT_SAVE_FAILED", "生成结果保存失败，请稍后重试", error);
  }

  return {
    ok: true,
    work: workDoc,
    completedVersion: versionDoc
  };
}

function buildTimeoutPatch(now) {
  return {
    phase: GENERATION_PHASE.TIMEOUT,
    status: "failed",
    provider: BASIC_GENERATION_PROVIDER,
    providerStatus: "timeout",
    providerUpdatedAt: now,
    progress: getProgressForPhase(GENERATION_PHASE.TIMEOUT),
    failureCode: "GENERATION_TASK_TIMEOUT",
    failureCategory: "timeout",
    failureReason: "生成任务等待时间过长，本轮没有扣减优化次数，请稍后重试。",
    recoverable: true,
    failedAt: now,
    timeoutAt: now,
    updatedAt: now
  };
}

function buildFailurePatch(error, now) {
  const failureCategory = error && error.failureCategory ? error.failureCategory : "result";
  const fallbackCode = failureCategory === "input" ? "GENERATION_INPUT_INVALID" : "GENERATION_RESULT_INVALID";

  return {
    phase: GENERATION_PHASE.FAILED,
    status: "failed",
    provider: BASIC_GENERATION_PROVIDER,
    providerStatus: "failed",
    providerUpdatedAt: now,
    progress: getProgressForPhase(GENERATION_PHASE.FAILED),
    failureCode: error && error.errorCode ? error.errorCode : fallbackCode,
    failureCategory,
    failureReason: error && error.message ? error.message : "生成结果异常，请重试",
    recoverable: true,
    failedAt: now,
    updatedAt: now
  };
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
    providerTraceId: task.providerTraceId || "",
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

function buildResponseData(task, work) {
  const isSuccess = task.status === "success";
  const cloudFinalized = task.resultSaveStatus === "success";

  return {
    task: toTaskResponse(task),
    completedVersion: isSuccess ? task.resultSnapshot || null : null,
    work: isSuccess && work ? work : null,
    cloudFinalized,
    resultSaveStatus: task.resultSaveStatus || "idle"
  };
}

async function getFinalizedWorkForTask(task) {
  if (task.resultSaveStatus !== "success") {
    return null;
  }

  return getOwnedWork(task.ownerOpenid, task.finalizedWorkId || task.workId);
}

function shouldReplaceAsWholeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function buildTaskUpdateData(patch) {
  const data = {
    ...patch
  };

  SNAPSHOT_OBJECT_FIELDS.forEach((field) => {
    if (
      Object.prototype.hasOwnProperty.call(data, field) &&
      shouldReplaceAsWholeObject(data[field]) &&
      typeof _.set === "function"
    ) {
      data[field] = _.set(data[field]);
    }
  });

  return data;
}

async function updateTask(task, patch) {
  await generationTasks.doc(task._id).update({
    data: buildTaskUpdateData(patch)
  });
  return {
    ...task,
    ...patch
  };
}

async function getTaskAssets(task) {
  const uploadAssetIds = normalizeArray(task.inputSnapshot && task.inputSnapshot.uploadAssetIds);
  if (!uploadAssetIds.length) {
    throw createGenerationError("GENERATION_INPUT_INVALID", "照片信息失效，请重新上传", "input");
  }

  const result = await uploadAssets
    .where({
      ownerOpenid: task.ownerOpenid,
      workId: task.workId,
      status: "active",
      assetId: _.in(uploadAssetIds)
    })
    .limit(20)
    .get();
  const assets = result.data || [];
  const foundIds = new Set(assets.map((asset) => normalizeString(asset.assetId)));
  const missing = uploadAssetIds.filter((assetId) => !foundIds.has(assetId));

  if (missing.length) {
    throw createGenerationError("GENERATION_INPUT_INVALID", "照片信息失效，请重新上传", "input");
  }

  return assets;
}

async function moveQueuedTaskToFetching(task, now) {
  const targetVersionId = createTaskVersionId(task);
  const assets = await getTaskAssets(task);
  const views = buildInputViews(assets);

  if (!views.length) {
    throw createGenerationError("GENERATION_INPUT_INVALID", "照片信息失效，请重新上传", "input");
  }

  return updateTask(
    {
      ...task,
      targetVersionId
    },
    {
      targetVersionId,
      provider: BASIC_GENERATION_PROVIDER,
      phase: GENERATION_PHASE.FETCHING_ASSETS,
      status: "running",
      providerStatus: "running",
      progress: getProgressForPhase(GENERATION_PHASE.FETCHING_ASSETS),
      inputSnapshot: {
        ...normalizeObject(task.inputSnapshot),
        views
      },
      failureCode: "",
      failureReason: "",
      failureCategory: "none",
      resultSaveStatus: task.resultSaveStatus || "idle",
      updatedAt: now
    }
  );
}

async function moveFetchingTaskToFinalizing(task, now) {
  const snapshotViews = buildInputViews(normalizeObject(task.inputSnapshot).views || []);
  const normalizedViews = snapshotViews.length ? snapshotViews : buildInputViews(await getTaskAssets(task));
  const completedVersion = buildBasicCompletedVersion({
    task,
    views: normalizedViews,
    now
  });

  if (!completedVersion) {
    throw createGenerationError("GENERATION_RESULT_INVALID", "生成结果信息不完整，暂时无法保存", "result");
  }

  return updateTask(task, {
    provider: BASIC_GENERATION_PROVIDER,
    phase: GENERATION_PHASE.FINALIZING,
    status: "running",
    providerStatus: "succeeded",
    providerUpdatedAt: now,
    progress: getProgressForPhase(GENERATION_PHASE.FINALIZING),
    resultSnapshot: completedVersion,
    resultSaveStatus: "saving",
    resultSaveErrorCode: "",
    resultSaveErrorMessage: "",
    failureCode: "",
    failureReason: "",
    failureCategory: "none",
    updatedAt: now
  });
}

async function finalizeBasicGeneration(task, now) {
  const completedVersion = normalizeObject(task.resultSnapshot);
  if (!completedVersion.versionId) {
    throw createGenerationError("GENERATION_RESULT_INVALID", "生成结果信息不完整，暂时无法保存", "result");
  }

  const finalizeResult = await finalizeGenerationResult(task, completedVersion, now);
  if (finalizeResult.ok !== true) {
    const error = createGenerationError(
      finalizeResult.errorCode || "GENERATION_RESULT_SAVE_FAILED",
      finalizeResult.message || "生成结果保存失败，请稍后重试",
      finalizeResult.errorCode === "GENERATION_RESULT_SAVE_FAILED" ? "save" : "result"
    );
    error.completedVersion = completedVersion;
    throw error;
  }

  const completedAt = new Date();
  const completedTask = await updateTask(task, {
    provider: BASIC_GENERATION_PROVIDER,
    phase: GENERATION_PHASE.COMPLETED,
    status: "success",
    providerStatus: "succeeded",
    providerUpdatedAt: completedAt,
    progress: getProgressForPhase(GENERATION_PHASE.COMPLETED),
    resultSnapshot: finalizeResult.completedVersion,
    targetVersionId: finalizeResult.completedVersion.versionId,
    resultSaveStatus: "success",
    resultSaveErrorCode: "",
    resultSaveErrorMessage: "",
    finalizedWorkId: task.workId,
    finalizedVersionId: finalizeResult.completedVersion.versionId,
    completedAt,
    finalizedAt: completedAt,
    updatedAt: completedAt
  });

  return {
    task: completedTask,
    work: finalizeResult.work
  };
}

async function runBasicGeneration(task, now) {
  const phase = normalizeString(task.phase) || GENERATION_PHASE.QUEUED;

  if (phase === GENERATION_PHASE.FINALIZING) {
    return finalizeBasicGeneration(task, now);
  }

  if (phase === GENERATION_PHASE.FETCHING_ASSETS) {
    const nextTask = await moveFetchingTaskToFinalizing(task, now);
    return {
      task: nextTask,
      work: null
    };
  }

  const nextTask = await moveQueuedTaskToFetching(task, now);
  return {
    task: nextTask,
    work: null
  };
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const taskId = normalizeString(event.taskId);

    if (!OPENID || !taskId) {
      return expectedError("GENERATION_TASK_INVALID_PAYLOAD", "生成任务信息不完整，请返回后重试");
    }

    const taskResult = await generationTasks
      .where({
        ownerOpenid: OPENID,
        taskId
      })
      .limit(1)
      .get();
    const task = taskResult.data && taskResult.data[0];

    if (!task) {
      return expectedError("GENERATION_TASK_NOT_FOUND", "生成任务不存在或已失效");
    }

    if (task.status === "success" || task.status === "failed") {
      const finalizedWork = await getFinalizedWorkForTask(task);
      return {
        ok: true,
        data: buildResponseData(task, finalizedWork)
      };
    }

    const now = new Date();
    if (isTaskTimedOut(task, now)) {
      const nextTask = await updateTask(task, buildTimeoutPatch(now));
      return {
        ok: true,
        data: buildResponseData(nextTask, null)
      };
    }

    try {
      const result = await runBasicGeneration(task, now);
      return {
        ok: true,
        data: buildResponseData(result.task, result.work)
      };
    } catch (error) {
      const failurePatch = {
        ...buildFailurePatch(error, new Date()),
        resultSnapshot: error && error.completedVersion ? error.completedVersion : normalizeObject(task.resultSnapshot),
        resultSaveStatus: error && error.failureCategory === "save" ? "failed" : task.resultSaveStatus || "idle",
        resultSaveErrorCode: error && error.failureCategory === "save" ? error.errorCode || "GENERATION_RESULT_SAVE_FAILED" : task.resultSaveErrorCode || "",
        resultSaveErrorMessage: error && error.failureCategory === "save" ? error.message || "生成结果保存失败，请稍后重试" : task.resultSaveErrorMessage || ""
      };
      const failedTask = await updateTask(task, failurePatch);
      return {
        ok: true,
        data: buildResponseData(failedTask, null)
      };
    }
  } catch (error) {
    return fail(error);
  }
};
