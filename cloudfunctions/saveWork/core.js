"use strict";

const VERSION_SOURCE_TYPE_SET = new Set(["initial", "optimize", "targeted_upload", "detail_retouch"]);
const RECOVERABLE_SAVE_STATUS_SET = new Set(["saving", "failed"]);
const BASIC_GENERATION_PROVIDER = "basic_generation";

class SaveWorkError extends Error {
  constructor(errorCode, message) {
    super(message);
    this.name = "SaveWorkError";
    this.errorCode = errorCode;
    this.isSaveWorkError = true;
  }
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => normalizeString(item)).filter(Boolean)))
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

function unwrapTransactionResult(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) {
    return value.result;
  }
  return value;
}

function hasLegacyPayload(event) {
  return (
    Object.prototype.hasOwnProperty.call(event, "work") ||
    Object.prototype.hasOwnProperty.call(event, "version")
  );
}

function normalizeReferences(event) {
  return {
    taskId: normalizeString(event.taskId),
    workId: normalizeString(event.workId),
    versionId: normalizeString(event.versionId),
    reason: normalizeString(event.reason)
  };
}

function getTaskResult(task) {
  return normalizeObject(task && task.resultSnapshot);
}

function validateTaskReferences(task, references, ownerOpenid) {
  if (!task || normalizeString(task.ownerOpenid) !== ownerOpenid) {
    throw new SaveWorkError("SAVE_WORK_TASK_NOT_FOUND", "生成任务不存在或无权访问。");
  }
  const taskId = normalizeString(task.taskId);
  const taskWorkId = normalizeString(task.workId);
  const result = getTaskResult(task);
  const resultVersionId = normalizeString(result.versionId);
  const resultWorkId = normalizeString(result.workId);
  if (
    taskId !== references.taskId ||
    taskWorkId !== references.workId ||
    (resultVersionId && resultVersionId !== references.versionId) ||
    (resultWorkId && resultWorkId !== references.workId)
  ) {
    throw new SaveWorkError("SAVE_WORK_REFERENCE_MISMATCH", "任务、作品或版本引用不一致。");
  }
  const targetVersionId = normalizeString(task.targetVersionId);
  const finalizedWorkId = normalizeString(task.finalizedWorkId);
  const finalizedVersionId = normalizeString(task.finalizedVersionId);
  if (
    (targetVersionId && targetVersionId !== references.versionId) ||
    (finalizedWorkId && finalizedWorkId !== references.workId) ||
    (finalizedVersionId && finalizedVersionId !== references.versionId)
  ) {
    throw new SaveWorkError("SAVE_WORK_REFERENCE_MISMATCH", "任务最终结果引用不一致。");
  }
}

function isTaskRecoverable(task) {
  if (task.status === "success" && task.resultSaveStatus === "success") {
    return true;
  }
  if (
    task.phase === "finalizing" &&
    task.status === "running" &&
    RECOVERABLE_SAVE_STATUS_SET.has(normalizeString(task.resultSaveStatus))
  ) {
    return true;
  }
  return (
    task.status === "failed" &&
    task.failureCategory === "save" &&
    task.resultSaveStatus === "failed"
  );
}

function validateTaskReady(task) {
  if (!isTaskRecoverable(task)) {
    throw new SaveWorkError("SAVE_WORK_TASK_NOT_READY", "生成任务尚未准备好恢复保存。");
  }
  const result = getTaskResult(task);
  const previewMedia = normalizeObject(result.previewMedia);
  if (
    !normalizeString(result.versionId) ||
    !normalizeString(result.workId) ||
    !normalizeString(previewMedia.cover)
  ) {
    throw new SaveWorkError("SAVE_WORK_RESULT_INVALID", "生成任务结果不完整，不能恢复保存。");
  }
}

function buildPreviewMedia(source) {
  const preview = normalizeObject(source);
  const result = {
    cover: normalizeString(preview.cover),
    modelHint: normalizeString(preview.modelHint),
    colorway: normalizeString(preview.colorway)
  };
  const poster = normalizeString(preview.poster);
  const url = normalizeString(preview.url);
  if (poster) {
    result.poster = poster;
  }
  if (url) {
    result.url = url;
  }
  return result;
}

function buildEditableTexture(source) {
  const texture = normalizeObject(source);
  return {
    baseColor: normalizeString(texture.baseColor) || "#C6A38A",
    notes: normalizeArray(texture.notes)
  };
}

function getSourceType(task) {
  const operationType = normalizeString(task.operationType);
  return VERSION_SOURCE_TYPE_SET.has(operationType) ? operationType : "initial";
}

function buildVersionDoc(task, ownerOpenid, existingVersion, now) {
  const result = getTaskResult(task);
  const existing = normalizeObject(existingVersion);
  return {
    versionId: normalizeString(result.versionId),
    workId: normalizeString(task.workId),
    ownerOpenid,
    sourceType: getSourceType(task),
    previewMedia: buildPreviewMedia(result.previewMedia),
    feedbackSummary: normalizeObject(result.feedbackSummary),
    editableTexture: buildEditableTexture(result.editableTexture),
    status: "active",
    createdAt: normalizeDate(existing.createdAt || task.completedAt, now),
    updatedAt: now
  };
}

function buildWorkDoc(task, versionDoc, ownerOpenid, existingWork, now) {
  const snapshot = normalizeObject(task.inputSnapshot && task.inputSnapshot.workSnapshot);
  const existing = normalizeObject(existingWork);
  const versionId = normalizeString(versionDoc.versionId);
  return {
    workId: normalizeString(task.workId),
    ownerOpenid,
    petType: normalizeString(existing.petType || snapshot.petType) || "cat",
    petTypeLabel: normalizeString(existing.petTypeLabel || snapshot.petTypeLabel),
    petName: normalizeString(existing.petName || snapshot.petName) || "当前宠物作品",
    displayName: normalizeString(existing.displayName || snapshot.displayName),
    status: "ready",
    currentVersionId: versionId,
    versionIds: normalizeArray([...normalizeArray(existing.versionIds), versionId]),
    previewImage: normalizeString(versionDoc.previewMedia && versionDoc.previewMedia.cover),
    source: normalizeString(task.provider) || BASIC_GENERATION_PROVIDER,
    createdAt: normalizeDate(existing.createdAt || task.createdAt, now),
    updatedAt: now,
    deletedAt: null
  };
}

async function findLegacyDoc(db, collectionName, criteria, deterministicId) {
  const result = await db.collection(collectionName).where(criteria).limit(2).get();
  return (result.data || []).find((doc) => normalizeString(doc._id) !== deterministicId) || null;
}

async function findRecoveryCandidates(db, task) {
  const ownerOpenid = normalizeString(task.ownerOpenid);
  const workId = normalizeString(task.workId);
  const versionId = normalizeString(getTaskResult(task).versionId);
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

function validateExistingWork(existingWork, ownerOpenid, workId) {
  if (!existingWork) {
    return;
  }
  if (
    normalizeString(existingWork.ownerOpenid) !== ownerOpenid ||
    normalizeString(existingWork.workId) !== workId
  ) {
    throw new SaveWorkError("SAVE_WORK_RESULT_INVALID", "作品归属异常，不能恢复保存。");
  }
  if (existingWork.status === "deleted") {
    throw new SaveWorkError("WORK_ALREADY_DELETED", "作品已删除，不能恢复保存。");
  }
}

function validateExistingVersion(existingVersion, ownerOpenid, workId, versionId) {
  if (!existingVersion) {
    return;
  }
  if (
    normalizeString(existingVersion.ownerOpenid) !== ownerOpenid ||
    normalizeString(existingVersion.workId) !== workId ||
    normalizeString(existingVersion.versionId) !== versionId
  ) {
    throw new SaveWorkError("SAVE_WORK_RESULT_INVALID", "版本归属异常，不能恢复保存。");
  }
}

function createSaveWorkHandler({ cloud, db, now = () => new Date(), logger = console }) {
  return async function saveWork(event = {}) {
    try {
      if (hasLegacyPayload(event)) {
        throw new SaveWorkError(
          "SAVE_WORK_LEGACY_PAYLOAD_REJECTED",
          "旧版完整作品保存协议已停用，请刷新小程序后重试。"
        );
      }
      const context = cloud.getWXContext();
      const ownerOpenid = normalizeString(context && context.OPENID);
      const references = normalizeReferences(event);
      if (!ownerOpenid || !references.taskId) {
        throw new SaveWorkError("SAVE_WORK_TASK_REQUIRED", "保存恢复必须提供生成任务引用。");
      }
      if (!references.workId || !references.versionId) {
        throw new SaveWorkError("SAVE_WORK_REFERENCE_MISMATCH", "作品或版本引用缺失。");
      }

      const taskResult = await db.collection("generationTasks").doc(references.taskId).get();
      const task = taskResult.data || null;
      validateTaskReferences(task, references, ownerOpenid);
      validateTaskReady(task);
      const candidates = await findRecoveryCandidates(db, task);
      const transactionResult = await db.runTransaction(async (transaction) => {
        const taskRef = transaction.collection("generationTasks").doc(references.taskId);
        const latestTaskResult = await taskRef.get();
        const latestTask = latestTaskResult.data || null;
        validateTaskReferences(latestTask, references, ownerOpenid);
        validateTaskReady(latestTask);

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

        const workId = normalizeString(latestTask.workId);
        const versionId = normalizeString(getTaskResult(latestTask).versionId);
        validateExistingWork(existingWork, ownerOpenid, workId);
        validateExistingVersion(existingVersion, ownerOpenid, workId, versionId);

        if (
          latestTask.status === "success" &&
          latestTask.resultSaveStatus === "success" &&
          existingWork &&
          existingVersion &&
          normalizeString(existingWork.currentVersionId) === versionId &&
          normalizeArray(existingWork.versionIds).includes(versionId)
        ) {
          return {
            workId,
            versionId,
            savedAt: existingWork.updatedAt || latestTask.finalizedAt || latestTask.completedAt,
            duplicated: true
          };
        }

        const savedAt = now();
        const versionDoc = buildVersionDoc(latestTask, ownerOpenid, existingVersion, savedAt);
        const workDoc = buildWorkDoc(latestTask, versionDoc, ownerOpenid, existingWork, savedAt);
        await versionRef.set({
          data: versionDoc
        });
        await workRef.set({
          data: workDoc
        });

        const taskPatch = {
          phase: "completed",
          status: "success",
          providerStatus: "succeeded",
          progress: 100,
          failureCode: "",
          failureCategory: "none",
          failureReason: "",
          resultSnapshot: versionDoc,
          resultSaveStatus: "success",
          resultSaveErrorCode: "",
          resultSaveErrorMessage: "",
          finalizedWorkId: workId,
          finalizedVersionId: versionId,
          completedAt: normalizeDate(latestTask.completedAt, savedAt),
          finalizedAt: savedAt,
          updatedAt: savedAt,
          processingToken: "",
          processingStartedAt: null,
          processingExpiresAt: null,
          lastProcessedAt: savedAt
        };
        await taskRef.update({
          data: taskPatch
        });

        return {
          workId,
          versionId,
          savedAt,
          duplicated: false
        };
      });

      return {
        ok: true,
        data: unwrapTransactionResult(transactionResult)
      };
    } catch (error) {
      if (error && error.isSaveWorkError) {
        return {
          ok: false,
          errorCode: error.errorCode,
          message: error.message
        };
      }
      logger.error("saveWork failed", {
        functionName: "saveWork",
        taskId: normalizeString(event && event.taskId),
        message: error && error.message ? error.message : String(error)
      });
      return {
        ok: false,
        errorCode: "SAVE_WORK_FAILED",
        message: "作品恢复保存失败，请稍后重试。"
      };
    }
  };
}

module.exports = {
  SaveWorkError,
  buildEditableTexture,
  buildPreviewMedia,
  buildVersionDoc,
  buildWorkDoc,
  createSafeDocId,
  createSaveWorkHandler,
  getVersionDocId,
  getWorkDocId,
  isTaskRecoverable,
  validateTaskReady,
  validateTaskReferences
};
