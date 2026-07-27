"use strict";

const crypto = require("crypto");
const { GENERATION_PHASE, getProgressForPhase } = require("./lib/phase");

const TASK_TIMEOUT_MS = 10 * 60 * 1000;
const PROCESSING_LOCK_TTL_MS = 60 * 1000;
const BASIC_GENERATION_PROVIDER = "basic_generation";
const FALLBACK_COVER = "/assets/mock/pet-cat-hero.png";
const VERSION_SOURCE_TYPE_SET = new Set(["initial", "optimize", "targeted_upload", "detail_retouch"]);
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

class GenerationError extends Error {
  constructor(errorCode, message, failureCategory = "result") {
    super(message);
    this.name = "GenerationError";
    this.errorCode = errorCode;
    this.failureCategory = failureCategory;
  }
}

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

function normalizeDate(value, fallback = null) {
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

function createSafeDocId(prefix, key) {
  const encoded = Buffer.from(key).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${prefix}_${encoded}`;
}

function getWorkDocId(ownerOpenid, workId) {
  return createSafeDocId("work", `${ownerOpenid}:${workId}`);
}

function getVersionDocId(ownerOpenid, versionId) {
  return createSafeDocId("work_version", `${ownerOpenid}:${versionId}`);
}

function createDefaultProcessingToken() {
  return `generation-lock-${crypto.randomBytes(18).toString("hex")}`;
}

function unwrapTransactionResult(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) {
    return value.result;
  }
  return value;
}

function isTerminalTask(task) {
  return task && (task.status === "success" || task.status === "failed");
}

function isTaskTimedOut(task, now) {
  if (isTerminalTask(task)) {
    return false;
  }
  const createdAt = normalizeDate(task.createdAt);
  return Boolean(createdAt && now.getTime() - createdAt.getTime() > TASK_TIMEOUT_MS);
}

function createTaskVersionId(task) {
  const targetVersionId = normalizeString(task.targetVersionId);
  if (targetVersionId) {
    return targetVersionId;
  }
  return createSafeDocId("generation_version", normalizeString(task.taskId));
}

function uniqueStrings(values) {
  return Array.from(new Set(normalizeArray(values)));
}

function withoutId(doc) {
  const data = { ...doc };
  delete data._id;
  return data;
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

function getSourceType(operationType) {
  const normalized = normalizeString(operationType);
  return VERSION_SOURCE_TYPE_SET.has(normalized) ? normalized : "initial";
}

function getCoverFileID(views) {
  const frontView = (views || []).find(
    (view) => normalizeString(view.viewType).toLowerCase() === "front" && normalizeString(view.fileID)
  );
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
  const snapshot = normalizeObject(task.inputSnapshot && task.inputSnapshot.workSnapshot);
  const existing = normalizeObject(existingWork);
  const versionId = normalizeString(completedVersion.versionId);
  const versionIds = uniqueStrings([
    ...normalizeArray(existing.versionIds),
    ...normalizeArray(snapshot.versionIds),
    versionId
  ]);
  return {
    workId: normalizeString(task.workId),
    ownerOpenid,
    petType: normalizeString(existing.petType || snapshot.petType) || "cat",
    petTypeLabel: normalizeString(existing.petTypeLabel || snapshot.petTypeLabel),
    petName: normalizeString(existing.petName || snapshot.petName) || "当前宠物作品",
    displayName: normalizeString(existing.displayName || snapshot.displayName),
    status: "ready",
    currentVersionId: versionId,
    versionIds,
    previewImage: normalizeString(
      (completedVersion.previewMedia && completedVersion.previewMedia.cover) ||
        existing.previewImage ||
        snapshot.previewImage
    ),
    source: normalizeString(existing.source || snapshot.source) || BASIC_GENERATION_PROVIDER,
    createdAt: normalizeDate(existing.createdAt || snapshot.createdAt, now),
    updatedAt: now,
    deletedAt: null
  };
}

function buildVersionDoc(task, completedVersion, ownerOpenid, existingVersion, now) {
  const version = normalizeObject(completedVersion);
  const existing = normalizeObject(existingVersion);
  const versionId = normalizeString(version.versionId);
  const sourceType = VERSION_SOURCE_TYPE_SET.has(normalizeString(version.sourceType))
    ? normalizeString(version.sourceType)
    : VERSION_SOURCE_TYPE_SET.has(normalizeString(existing.sourceType))
      ? normalizeString(existing.sourceType)
      : "initial";
  return {
    versionId,
    workId: normalizeString(task.workId),
    ownerOpenid,
    sourceType,
    previewMedia: normalizeObject(version.previewMedia),
    feedbackSummary: normalizeObject(version.feedbackSummary),
    editableTexture: sanitizeEditableTexture(version.editableTexture),
    status: "active",
    createdAt: normalizeDate(version.createdAt || existing.createdAt, now),
    updatedAt: now
  };
}

function toTaskResponse(task) {
  return {
    taskId: task.taskId,
    clientRequestId: task.clientRequestId || "",
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
    reservationId: task.reservationId || "",
    revision: Number(task.revision || 0)
  };
}

function buildResponseData(task, work, options = {}) {
  const isSuccess = task.status === "success";
  return {
    task: toTaskResponse(task),
    completedVersion: isSuccess ? task.resultSnapshot || null : null,
    work: isSuccess && work ? work : null,
    cloudFinalized: task.resultSaveStatus === "success",
    resultSaveStatus: task.resultSaveStatus || "idle",
    processingLocked: options.processingLocked === true,
    processingErrorCode: options.processingLocked === true ? "GENERATION_TASK_LOCKED" : ""
  };
}

function buildTaskUpdateData(db, patch) {
  const data = { ...patch };
  for (const field of ["inputSnapshot", "resultSnapshot"]) {
    if (
      Object.prototype.hasOwnProperty.call(data, field) &&
      data[field] &&
      typeof data[field] === "object" &&
      !Array.isArray(data[field]) &&
      db.command &&
      typeof db.command.set === "function"
    ) {
      data[field] = db.command.set(data[field]);
    }
  }
  return data;
}

async function acquireProcessingLock({
  db,
  taskId,
  ownerOpenid,
  now,
  processingToken = createDefaultProcessingToken()
}) {
  const result = await db.runTransaction(async (transaction) => {
    const taskRef = transaction.collection("generationTasks").doc(taskId);
    const taskResult = await taskRef.get();
    const task = taskResult.data || null;
    if (!task || normalizeString(task.ownerOpenid) !== ownerOpenid) {
      return {
        found: false,
        acquired: false,
        terminal: false,
        locked: false,
        task: null
      };
    }
    if (isTerminalTask(task)) {
      return {
        found: true,
        acquired: false,
        terminal: true,
        locked: false,
        task
      };
    }
    const currentToken = normalizeString(task.processingToken);
    const expiresAt = normalizeDate(task.processingExpiresAt);
    if (currentToken && expiresAt && expiresAt.getTime() > now.getTime()) {
      return {
        found: true,
        acquired: false,
        terminal: false,
        locked: true,
        task
      };
    }
    const revision = Math.max(0, Number(task.revision || 0)) + 1;
    const patch = {
      revision,
      processingToken,
      processingStartedAt: now,
      processingExpiresAt: new Date(now.getTime() + PROCESSING_LOCK_TTL_MS)
    };
    await taskRef.update({
      data: patch
    });
    return {
      found: true,
      acquired: true,
      terminal: false,
      locked: false,
      token: processingToken,
      revision,
      task: {
        ...task,
        ...patch
      }
    };
  });
  return unwrapTransactionResult(result);
}

async function updateTaskWithLock({
  db,
  taskId,
  ownerOpenid,
  token,
  revision,
  patch,
  now,
  releaseLock = true
}) {
  const result = await db.runTransaction(async (transaction) => {
    const taskRef = transaction.collection("generationTasks").doc(taskId);
    const taskResult = await taskRef.get();
    const task = taskResult.data || null;
    if (!task || normalizeString(task.ownerOpenid) !== ownerOpenid) {
      return {
        updated: false,
        errorCode: "GENERATION_TASK_NOT_FOUND",
        task: null
      };
    }
    if (normalizeString(task.processingToken) !== token) {
      return {
        updated: false,
        errorCode: "GENERATION_TASK_LOCK_LOST",
        task
      };
    }
    if (Number(task.revision || 0) !== Number(revision)) {
      return {
        updated: false,
        errorCode: "GENERATION_TASK_REVISION_CONFLICT",
        task
      };
    }
    if (isTerminalTask(task)) {
      return {
        updated: false,
        terminal: true,
        task
      };
    }
    const nextPatch = {
      ...patch
    };
    if (releaseLock) {
      nextPatch.processingToken = "";
      nextPatch.processingStartedAt = null;
      nextPatch.processingExpiresAt = null;
      nextPatch.lastProcessedAt = now;
    }
    await taskRef.update({
      data: buildTaskUpdateData(db, nextPatch)
    });
    return {
      updated: true,
      task: {
        ...task,
        ...nextPatch
      }
    };
  });
  return unwrapTransactionResult(result);
}

async function getTaskAssets(db, task) {
  const uploadAssetIds = normalizeArray(task.inputSnapshot && task.inputSnapshot.uploadAssetIds);
  if (!uploadAssetIds.length) {
    throw new GenerationError("GENERATION_INPUT_INVALID", "照片信息失效，请重新上传。", "input");
  }
  const criteria = {
    ownerOpenid: task.ownerOpenid,
    workId: task.workId,
    status: "active"
  };
  if (db.command && typeof db.command.in === "function") {
    criteria.assetId = db.command.in(uploadAssetIds);
  }
  const result = await db.collection("uploadAssets").where(criteria).limit(20).get();
  const assets = (result.data || []).filter((asset) => uploadAssetIds.includes(normalizeString(asset.assetId)));
  const foundIds = new Set(assets.map((asset) => normalizeString(asset.assetId)));
  const missing = uploadAssetIds.filter((assetId) => !foundIds.has(assetId));
  if (missing.length) {
    throw new GenerationError("GENERATION_INPUT_INVALID", "照片信息失效，请重新上传。", "input");
  }
  return assets;
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

function buildFailurePatch(error, task, now) {
  const failureCategory = error && error.failureCategory ? error.failureCategory : "result";
  const fallbackCode = failureCategory === "input" ? "GENERATION_INPUT_INVALID" : "GENERATION_RESULT_INVALID";
  const isSaveFailure =
    failureCategory === "save" || normalizeString(task.phase) === GENERATION_PHASE.FINALIZING;
  return {
    phase: GENERATION_PHASE.FAILED,
    status: "failed",
    provider: BASIC_GENERATION_PROVIDER,
    providerStatus: "failed",
    providerUpdatedAt: now,
    progress: getProgressForPhase(GENERATION_PHASE.FAILED),
    failureCode: (error && error.errorCode) || fallbackCode,
    failureCategory,
    failureReason: (error && error.message) || "生成结果异常，请重试。",
    recoverable: true,
    resultSnapshot: normalizeObject(task.resultSnapshot),
    resultSaveStatus: isSaveFailure ? "failed" : task.resultSaveStatus || "idle",
    resultSaveErrorCode: isSaveFailure
      ? (error && error.errorCode) || "GENERATION_RESULT_SAVE_FAILED"
      : task.resultSaveErrorCode || "",
    resultSaveErrorMessage: isSaveFailure
      ? (error && error.message) || "生成结果保存失败，请稍后重试。"
      : task.resultSaveErrorMessage || "",
    failedAt: now,
    updatedAt: now
  };
}

async function findLegacyDoc(db, collectionName, criteria, deterministicId) {
  const result = await db.collection(collectionName).where(criteria).limit(2).get();
  return (result.data || []).find((doc) => normalizeString(doc._id) !== deterministicId) || null;
}

async function findFinalizeCandidates(db, task) {
  const ownerOpenid = normalizeString(task.ownerOpenid);
  const workId = normalizeString(task.workId);
  const versionId = normalizeString(task.resultSnapshot && task.resultSnapshot.versionId);
  const deterministicWorkId = getWorkDocId(ownerOpenid, workId);
  const deterministicVersionId = getVersionDocId(ownerOpenid, versionId);
  const [legacyWork, legacyVersion] = await Promise.all([
    findLegacyDoc(db, "works", { ownerOpenid, workId }, deterministicWorkId),
    findLegacyDoc(db, "workVersions", { ownerOpenid, versionId }, deterministicVersionId)
  ]);
  return {
    deterministicWorkId,
    deterministicVersionId,
    legacyWorkId: legacyWork ? normalizeString(legacyWork._id) : "",
    legacyVersionId: legacyVersion ? normalizeString(legacyVersion._id) : ""
  };
}

async function finalizeGenerationResult({
  db,
  taskId,
  ownerOpenid,
  token,
  revision,
  candidates,
  now
}) {
  const result = await db.runTransaction(async (transaction) => {
    const taskRef = transaction.collection("generationTasks").doc(taskId);
    const taskResult = await taskRef.get();
    const task = taskResult.data || null;
    if (!task || normalizeString(task.ownerOpenid) !== ownerOpenid) {
      throw new GenerationError("GENERATION_TASK_NOT_FOUND", "生成任务不存在或已失效。", "input");
    }
    if (normalizeString(task.processingToken) !== token) {
      return {
        finalized: false,
        errorCode: "GENERATION_TASK_LOCK_LOST",
        task
      };
    }
    if (Number(task.revision || 0) !== Number(revision)) {
      return {
        finalized: false,
        errorCode: "GENERATION_TASK_REVISION_CONFLICT",
        task
      };
    }
    if (isTerminalTask(task)) {
      return {
        finalized: false,
        terminal: true,
        task
      };
    }

    const completedVersion = normalizeObject(task.resultSnapshot);
    const workId = normalizeString(task.workId);
    const versionId = normalizeString(completedVersion.versionId);
    if (!ownerOpenid || !workId || !versionId || normalizeString(completedVersion.workId) !== workId) {
      throw new GenerationError("GENERATION_RESULT_INVALID", "生成结果信息不完整，暂时无法保存。", "result");
    }

    const deterministicWorkRef = transaction.collection("works").doc(candidates.deterministicWorkId);
    const deterministicVersionRef = transaction
      .collection("workVersions")
      .doc(candidates.deterministicVersionId);
    const deterministicWorkResult = await deterministicWorkRef.get();
    const deterministicVersionResult = await deterministicVersionRef.get();
    let workRef = deterministicWorkRef;
    let versionRef = deterministicVersionRef;
    let existingWork = deterministicWorkResult.data || null;
    let existingVersion = deterministicVersionResult.data || null;

    if (!existingWork && candidates.legacyWorkId) {
      workRef = transaction.collection("works").doc(candidates.legacyWorkId);
      const legacyWorkResult = await workRef.get();
      existingWork = legacyWorkResult.data || null;
    }
    if (!existingVersion && candidates.legacyVersionId) {
      versionRef = transaction.collection("workVersions").doc(candidates.legacyVersionId);
      const legacyVersionResult = await versionRef.get();
      existingVersion = legacyVersionResult.data || null;
    }

    if (
      existingWork &&
      (normalizeString(existingWork.ownerOpenid) !== ownerOpenid ||
        normalizeString(existingWork.workId) !== workId)
    ) {
      throw new GenerationError("GENERATION_RESULT_INVALID", "作品归属异常，生成结果不会保存。", "result");
    }
    if (existingWork && existingWork.status === "deleted") {
      throw new GenerationError("GENERATION_RESULT_INVALID", "作品已删除，生成结果不会重新恢复。", "result");
    }
    if (
      existingVersion &&
      (normalizeString(existingVersion.ownerOpenid) !== ownerOpenid ||
        normalizeString(existingVersion.workId) !== workId ||
        normalizeString(existingVersion.versionId) !== versionId)
    ) {
      throw new GenerationError("GENERATION_RESULT_INVALID", "生成结果版本归属异常，保存失败。", "result");
    }

    const versionDoc = buildVersionDoc(task, completedVersion, ownerOpenid, existingVersion, now);
    const workDoc = buildWorkDoc(task, versionDoc, ownerOpenid, existingWork, now);
    await versionRef.set({
      data: versionDoc
    });
    await workRef.set({
      data: workDoc
    });

    const completedPatch = {
      provider: BASIC_GENERATION_PROVIDER,
      phase: GENERATION_PHASE.COMPLETED,
      status: "success",
      providerStatus: "succeeded",
      providerUpdatedAt: now,
      progress: getProgressForPhase(GENERATION_PHASE.COMPLETED),
      resultSnapshot: versionDoc,
      targetVersionId: versionId,
      resultSaveStatus: "success",
      resultSaveErrorCode: "",
      resultSaveErrorMessage: "",
      finalizedWorkId: workId,
      finalizedVersionId: versionId,
      completedAt: now,
      finalizedAt: now,
      updatedAt: now,
      processingToken: "",
      processingStartedAt: null,
      processingExpiresAt: null,
      lastProcessedAt: now
    };
    await taskRef.update({
      data: buildTaskUpdateData(db, completedPatch)
    });
    return {
      finalized: true,
      task: {
        ...task,
        ...completedPatch
      },
      work: workDoc,
      completedVersion: versionDoc
    };
  });
  return unwrapTransactionResult(result);
}

async function getOwnedWork(db, ownerOpenid, workId) {
  const deterministicId = getWorkDocId(ownerOpenid, workId);
  const deterministicResult = await db.collection("works").doc(deterministicId).get();
  if (deterministicResult.data) {
    return deterministicResult.data;
  }
  const result = await db
    .collection("works")
    .where({
      ownerOpenid,
      workId
    })
    .limit(1)
    .get();
  return result.data && result.data[0];
}

async function advanceLockedTask({ db, lock, ownerOpenid, now }) {
  const task = lock.task;
  if (isTaskTimedOut(task, now)) {
    return updateTaskWithLock({
      db,
      taskId: task.taskId,
      ownerOpenid,
      token: lock.token,
      revision: lock.revision,
      patch: buildTimeoutPatch(now),
      now
    });
  }

  const phase = normalizeString(task.phase) || GENERATION_PHASE.QUEUED;
  if (phase === GENERATION_PHASE.FINALIZING) {
    const completedVersion = normalizeObject(task.resultSnapshot);
    if (
      !normalizeString(completedVersion.versionId) ||
      normalizeString(completedVersion.workId) !== normalizeString(task.workId)
    ) {
      throw new GenerationError("GENERATION_RESULT_INVALID", "生成结果信息不完整，暂时无法保存。", "result");
    }
    const candidates = await findFinalizeCandidates(db, task);
    return finalizeGenerationResult({
      db,
      taskId: task.taskId,
      ownerOpenid,
      token: lock.token,
      revision: lock.revision,
      candidates,
      now
    });
  }

  if (phase === GENERATION_PHASE.FETCHING_ASSETS) {
    if (task.simulateFailure === true) {
      throw new GenerationError("GENERATION_RESULT_INVALID", "本次生成没有成功返回可用结果。", "result");
    }
    const snapshotViews = buildInputViews(normalizeObject(task.inputSnapshot).views || []);
    const views = snapshotViews.length ? snapshotViews : buildInputViews(await getTaskAssets(db, task));
    const completedVersion = buildBasicCompletedVersion({
      task,
      views,
      now
    });
    if (!completedVersion) {
      throw new GenerationError("GENERATION_RESULT_INVALID", "生成结果信息不完整，暂时无法保存。", "result");
    }
    return updateTaskWithLock({
      db,
      taskId: task.taskId,
      ownerOpenid,
      token: lock.token,
      revision: lock.revision,
      patch: {
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
      },
      now
    });
  }

  const assets = await getTaskAssets(db, task);
  const views = buildInputViews(assets);
  if (!views.length) {
    throw new GenerationError("GENERATION_INPUT_INVALID", "照片信息失效，请重新上传。", "input");
  }
  const targetVersionId = createTaskVersionId(task);
  return updateTaskWithLock({
    db,
    taskId: task.taskId,
    ownerOpenid,
    token: lock.token,
    revision: lock.revision,
    patch: {
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
    },
    now
  });
}

function createPollGenerationTaskHandler({
  cloud,
  db,
  now = () => new Date(),
  createProcessingToken = createDefaultProcessingToken,
  logger = console
}) {
  return async function pollGenerationTask(event = {}) {
    const context = cloud.getWXContext();
    const ownerOpenid = normalizeString(context && context.OPENID);
    const taskId = normalizeString(event.taskId);
    if (!ownerOpenid || !taskId) {
      return {
        ok: false,
        errorCode: "GENERATION_TASK_INVALID_PAYLOAD",
        message: "生成任务信息不完整，请返回后重试。"
      };
    }

    try {
      const lockNow = now();
      const lock = await acquireProcessingLock({
        db,
        taskId,
        ownerOpenid,
        now: lockNow,
        processingToken: createProcessingToken()
      });
      if (!lock.found) {
        return {
          ok: false,
          errorCode: "GENERATION_TASK_NOT_FOUND",
          message: "生成任务不存在或已失效。"
        };
      }
      if (!lock.acquired) {
        const work =
          lock.terminal && lock.task.resultSaveStatus === "success"
            ? await getOwnedWork(db, ownerOpenid, lock.task.finalizedWorkId || lock.task.workId)
            : null;
        return {
          ok: true,
          data: buildResponseData(lock.task, work, {
            processingLocked: lock.locked
          })
        };
      }

      try {
        const outcome = await advanceLockedTask({
          db,
          lock,
          ownerOpenid,
          now: lockNow
        });
        const outcomeTask = outcome.task || lock.task;
        const work = outcome.work || null;
        return {
          ok: true,
          data: buildResponseData(outcomeTask, work, {
            processingLocked: outcome.updated === false && !outcome.terminal
          })
        };
      } catch (error) {
        const failureCategory =
          error && error.failureCategory
            ? error.failureCategory
            : /workVersions|works|injected failure/.test(error && error.message ? error.message : "")
              ? "save"
              : "result";
        const normalizedError =
          error instanceof GenerationError
            ? error
            : new GenerationError(
                "GENERATION_RESULT_SAVE_FAILED",
                "生成结果保存失败，请稍后重试。",
                failureCategory
              );
        logger.error("pollGenerationTask processing failed", {
          functionName: "pollGenerationTask",
          taskId,
          errorCode: normalizedError.errorCode,
          message: error && error.message ? error.message : String(error)
        });
        const failed = await updateTaskWithLock({
          db,
          taskId,
          ownerOpenid,
          token: lock.token,
          revision: lock.revision,
          patch: buildFailurePatch(normalizedError, lock.task, now()),
          now: now()
        });
        return {
          ok: true,
          data: buildResponseData(failed.task || lock.task, null, {
            processingLocked: failed.updated === false
          })
        };
      }
    } catch (error) {
      logger.error("pollGenerationTask failed", {
        functionName: "pollGenerationTask",
        taskId,
        message: error && error.message ? error.message : String(error)
      });
      return {
        ok: false,
        errorCode: "GENERATION_TASK_POLL_FAILED",
        message: "生成任务查询失败，请稍后重试。"
      };
    }
  };
}

module.exports = {
  BASIC_GENERATION_PROVIDER,
  GenerationError,
  PROCESSING_LOCK_TTL_MS,
  TASK_TIMEOUT_MS,
  acquireProcessingLock,
  advanceLockedTask,
  buildBasicCompletedVersion,
  buildResponseData,
  buildVersionDoc,
  buildWorkDoc,
  createPollGenerationTaskHandler,
  createSafeDocId,
  finalizeGenerationResult,
  getVersionDocId,
  getWorkDocId,
  toTaskResponse,
  updateTaskWithLock
};
