"use strict";

const RESERVATION_TTL_MS = 15 * 60 * 1000;
const GENERATION_TASK_TIMEOUT_MS = 10 * 60 * 1000;
const ALLOWED_OPERATION_TYPES = new Set(["initial", "optimize", "targeted_upload"]);
const OPTIMIZE_OPERATION_TYPES = new Set(["optimize", "targeted_upload"]);
const OPERATION_SOURCE_MAP = {
  optimize: "result",
  targeted_upload: "targeted_upload"
};
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

class BusinessError extends Error {
  constructor(errorCode, message, status = "error") {
    super(message);
    this.name = "BusinessError";
    this.errorCode = errorCode;
    this.status = status;
    this.isBusinessError = true;
  }
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map((item) => normalizeString(item)).filter(Boolean)));
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function createSafeDocId(prefix, key) {
  const encoded = Buffer.from(key).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${prefix}_${encoded}`;
}

function getReservationDocId(openid, reservationId) {
  return createSafeDocId("optimize_reservation", `${openid}:${reservationId}`);
}

function getGenerationTaskDocId(openid, operationType, clientRequestId) {
  return createSafeDocId("generation_task", `${openid}:${operationType}:${clientRequestId}`);
}

function createTargetVersionId(taskId) {
  return createSafeDocId("generation_version", taskId);
}

function getUploadAssetIds(assets) {
  return (assets || []).map((asset) => normalizeString(asset.assetId)).filter(Boolean);
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

function buildSafeWorkSnapshot(input, fallbackWork, now) {
  const inputSnapshot = normalizeObject(input);
  const fallback = normalizeObject(fallbackWork);
  const workId = normalizeString(fallback.workId || inputSnapshot.workId);
  if (!workId) {
    return {};
  }
  return {
    workId,
    petType: normalizeString(fallback.petType || inputSnapshot.petType) || "cat",
    petTypeLabel: normalizeString(fallback.petTypeLabel || inputSnapshot.petTypeLabel),
    petName: normalizeString(fallback.petName || inputSnapshot.petName) || "当前宠物作品",
    displayName: normalizeString(fallback.displayName || inputSnapshot.displayName),
    versionIds: normalizeArray(fallback.versionIds || inputSnapshot.versionIds),
    previewImage: normalizeString(fallback.previewImage || inputSnapshot.previewImage),
    source: normalizeString(fallback.source || inputSnapshot.source) || BASIC_GENERATION_PROVIDER,
    createdAt: fallback.createdAt || inputSnapshot.createdAt || now
  };
}

function hasUploadAsset(assets, predicate) {
  return (assets || []).some((asset) => asset && predicate(asset));
}

function validateTaskInputs(operationType, work, activeAssets) {
  if (operationType === "initial") {
    if (!activeAssets.length || !hasUploadAsset(activeAssets, (asset) => normalizeString(asset.role) === "initial")) {
      throw new BusinessError(
        "GENERATION_TASK_NO_UPLOAD_ASSET",
        "还没有可用于生成的宠物照片，请先上传一张清晰照片。"
      );
    }
  }
  if (operationType === "targeted_upload") {
    if (!work || work.status === "deleted") {
      throw new BusinessError("GENERATION_TASK_WORK_NOT_FOUND", "作品不存在或已失效，请返回作品页刷新后重试。");
    }
    if (!hasUploadAsset(activeAssets, (asset) => normalizeString(asset.role) === "targeted")) {
      throw new BusinessError(
        "GENERATION_TASK_NO_TARGETED_ASSET",
        "还没有可用于定向优化的补充照片，请先上传补图后再生成。"
      );
    }
  }
  if (operationType === "optimize" && (!work || work.status === "deleted")) {
    throw new BusinessError("GENERATION_TASK_WORK_NOT_FOUND", "作品不存在或已失效，请返回作品页刷新后重试。");
  }
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

function buildTask({
  openid,
  clientRequestId,
  workId,
  operationType,
  reservationId,
  dimensionSet,
  activeAssets,
  work,
  event,
  taskId,
  now
}) {
  return {
    _id: taskId,
    taskId,
    clientRequestId,
    ownerOpenid: openid,
    workId,
    operationType,
    phase: "queued",
    status: "pending",
    provider: BASIC_GENERATION_PROVIDER,
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
    targetVersionId: createTargetVersionId(taskId),
    simulateFailure: event.simulateFailure === true,
    pollCount: 0,
    inputSnapshot: {
      uploadAssetIds: getUploadAssetIds(activeAssets),
      currentVersionId: work ? normalizeString(work.currentVersionId) : "",
      dimensionSet,
      views: buildInputViews(activeAssets),
      workSnapshot: buildSafeWorkSnapshot(event.workSnapshot, work, now)
    },
    resultSnapshot: {},
    resultSaveStatus: "idle",
    resultSaveErrorCode: "",
    resultSaveErrorMessage: "",
    finalizedWorkId: "",
    finalizedVersionId: "",
    revision: 0,
    processingToken: "",
    processingStartedAt: null,
    processingExpiresAt: null,
    lastProcessedAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    failedAt: null,
    timeoutAt: null,
    finalizedAt: null
  };
}

function withoutId(doc) {
  const data = { ...doc };
  delete data._id;
  return data;
}

function unwrapTransactionResult(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) {
    return value.result;
  }
  return value;
}

function verifyExistingTask(task, expected, options = {}) {
  const existingClientRequestId = normalizeString(task.clientRequestId);
  if (
    normalizeString(task.ownerOpenid) !== expected.openid ||
    normalizeString(task.workId) !== expected.workId ||
    normalizeString(task.reservationId) !== expected.reservationId ||
    normalizeString(task.operationType) !== expected.operationType ||
    (!existingClientRequestId && !options.allowMissingClientRequestId) ||
    (!options.allowClientRequestIdMismatch &&
      existingClientRequestId &&
      existingClientRequestId !== expected.clientRequestId)
  ) {
    throw new BusinessError(
      "GENERATION_REQUEST_CONFLICT",
      "该请求编号已经用于另一项生成操作，请刷新页面后重试。"
    );
  }
}

function expectedError(error) {
  return {
    ok: false,
    errorCode: error.errorCode,
    status: error.status || "error",
    message: error.message
  };
}

function logTransactionFailure(logger, details, error) {
  logger.error("startGenerationTask transaction failed", {
    functionName: "startGenerationTask",
    openid: details.openid ? createSafeDocId("user", details.openid).slice(-12) : "",
    clientRequestId: details.clientRequestId || "",
    reservationId: details.reservationId || "",
    taskId: details.taskId || "",
    workId: details.workId || "",
    errorCode: error && error.errorCode ? error.errorCode : "GENERATION_TASK_CREATE_FAILED",
    message: error && error.message ? error.message : String(error)
  });
}

function createStartGenerationTaskHandler({ cloud, db, now = () => new Date(), logger = console }) {
  if (RESERVATION_TTL_MS < GENERATION_TASK_TIMEOUT_MS) {
    throw new Error("RESERVATION_TTL_MS must not be shorter than GENERATION_TASK_TIMEOUT_MS");
  }

  return async function startGenerationTask(event = {}) {
    const context = cloud.getWXContext();
    const openid = normalizeString(context && context.OPENID);
    const clientRequestId = normalizeString(event.clientRequestId);
    const workId = normalizeString(event.workId);
    const operationType = normalizeString(event.operationType);
    const reservationId = normalizeString(event.reservationId);
    const taskId =
      openid && operationType && clientRequestId
        ? getGenerationTaskDocId(openid, operationType, clientRequestId)
        : "";
    const expectedTask = {
      openid,
      clientRequestId,
      workId,
      operationType,
      reservationId
    };
    const logDetails = {
      ...expectedTask,
      taskId
    };
    const readExistingTask = async () => {
      const existingResult = await db.runTransaction(async (transaction) => {
        const latestResult = await transaction.collection("generationTasks").doc(taskId).get();
        const latestTask = latestResult.data || null;
        if (!latestTask) {
          return null;
        }
        verifyExistingTask(latestTask, expectedTask);
        return {
          task: toTaskResponse(latestTask),
          duplicated: true
        };
      });
      return unwrapTransactionResult(existingResult);
    };

    try {
      if (!openid) {
        throw new BusinessError("GENERATION_TASK_INVALID_PAYLOAD", "生成任务用户信息无效，请重新登录后重试。");
      }
      if (!clientRequestId) {
        throw new BusinessError("CLIENT_REQUEST_ID_REQUIRED", "生成请求编号缺失，请返回后重试。");
      }
      if (!workId || !ALLOWED_OPERATION_TYPES.has(operationType)) {
        throw new BusinessError("GENERATION_TASK_INVALID_PAYLOAD", "生成任务参数不完整，请返回后重试。");
      }
      if (OPTIMIZE_OPERATION_TYPES.has(operationType) && !reservationId) {
        throw new BusinessError("GENERATION_TASK_INVALID_PAYLOAD", "优化生成任务缺少预占编号，请返回结果页重试。");
      }

      const existingDeterministicTask = await readExistingTask();
      if (existingDeterministicTask) {
        return {
          ok: true,
          data: existingDeterministicTask
        };
      }

      let work = null;
      let activeAssets = [];
      try {
        const workResult = await db
          .collection("works")
          .where({
            ownerOpenid: openid,
            workId
          })
          .limit(1)
          .get();
        work = workResult.data && workResult.data[0];
        if (operationType !== "initial" && (!work || work.status === "deleted")) {
          throw new BusinessError("GENERATION_TASK_WORK_NOT_FOUND", "作品不存在或已失效，请返回作品页刷新后重试。");
        }
        if (work && work.status === "deleted") {
          throw new BusinessError("GENERATION_TASK_WORK_NOT_FOUND", "作品不存在或已失效，请返回作品页刷新后重试。");
        }

        const assetsResult = await db
          .collection("uploadAssets")
          .where({
            ownerOpenid: openid,
            workId,
            status: "active"
          })
          .limit(20)
          .get();
        activeAssets = assetsResult.data || [];
        validateTaskInputs(operationType, work, activeAssets);
      } catch (inputError) {
        if (inputError && inputError.isBusinessError) {
          const racedTask = await readExistingTask();
          if (racedTask) {
            return {
              ok: true,
              data: racedTask
            };
          }
        }
        throw inputError;
      }
      const taskNow = now();

      const result = await db.runTransaction(async (transaction) => {
        const taskRef = transaction.collection("generationTasks").doc(taskId);
        const existingTaskResult = await taskRef.get();
        const existingTask = existingTaskResult.data || null;
        if (existingTask) {
          verifyExistingTask(existingTask, expectedTask);
          return {
            task: toTaskResponse(existingTask),
            duplicated: true
          };
        }

        let reservationRef = null;
        let reservation = null;
        if (OPTIMIZE_OPERATION_TYPES.has(operationType)) {
          reservationRef = transaction
            .collection("optimizeReservations")
            .doc(getReservationDocId(openid, reservationId));
          const reservationResult = await reservationRef.get();
          reservation = reservationResult.data || null;

          if (!reservation) {
            throw new BusinessError("OPTIMIZE_RESERVATION_NOT_FOUND", "优化预占记录不存在，请返回结果页重试。");
          }
          if (
            normalizeString(reservation.openid) !== openid ||
            normalizeString(reservation.workId) !== workId ||
            normalizeString(reservation.source) !== OPERATION_SOURCE_MAP[operationType]
          ) {
            throw new BusinessError("OPTIMIZE_RESERVATION_CONFLICT", "预占记录与作品或生成类型不匹配。");
          }
          if (reservation.status !== "reserved") {
            throw new BusinessError("OPTIMIZE_RESERVATION_CONFLICT", "预占记录已结束，不能再创建生成任务。");
          }

          const boundTaskId = normalizeString(reservation.taskId);
          if (boundTaskId) {
            const boundTaskRef = transaction.collection("generationTasks").doc(boundTaskId);
            const boundTaskResult = await boundTaskRef.get();
            const boundTask = boundTaskResult.data || null;
            if (!boundTask) {
              throw new BusinessError(
                "OPTIMIZE_GENERATION_TASK_NOT_FOUND",
                "预占已经绑定任务，但对应生成任务不存在。"
              );
            }
            verifyExistingTask(boundTask, expectedTask, {
              allowClientRequestIdMismatch: true,
              allowMissingClientRequestId: true
            });
            if (!normalizeString(boundTask.clientRequestId)) {
              await boundTaskRef.update({
                data: {
                  clientRequestId,
                  updatedAt: taskNow
                }
              });
              boundTask.clientRequestId = clientRequestId;
              boundTask.updatedAt = taskNow;
            }
            return {
              task: toTaskResponse(boundTask),
              duplicated: true
            };
          }

          const expiresAt = normalizeDate(reservation.expiresAt);
          if (!expiresAt || expiresAt.getTime() <= taskNow.getTime()) {
            throw new BusinessError("OPTIMIZE_RESERVATION_EXPIRED", "优化预占已经过期，请返回结果页重新提交。");
          }
        }

        const dimensionSet = reservation
          ? normalizeArray(reservation.dimensionSet)
          : normalizeArray(event.dimensionSet);
        const task = buildTask({
          openid,
          clientRequestId,
          workId,
          operationType,
          reservationId,
          dimensionSet,
          activeAssets,
          work,
          event,
          taskId,
          now: taskNow
        });

        await transaction.collection("generationTasks").doc(taskId).set({
          data: withoutId(task)
        });
        if (reservationRef) {
          await reservationRef.update({
            data: {
              taskId,
              boundAt: taskNow,
              updatedAt: taskNow
            }
          });
        }

        return {
          task: toTaskResponse(task),
          duplicated: false
        };
      });

      return {
        ok: true,
        data: unwrapTransactionResult(result)
      };
    } catch (error) {
      if (error && error.isBusinessError) {
        return expectedError(error);
      }
      logTransactionFailure(logger, logDetails, error);
      return {
        ok: false,
        errorCode: OPTIMIZE_OPERATION_TYPES.has(operationType)
          ? "OPTIMIZE_QUOTA_TRANSACTION_FAILED"
          : "GENERATION_TASK_CREATE_FAILED",
        message: "生成任务创建失败，请稍后重试。"
      };
    }
  };
}

module.exports = {
  ALLOWED_OPERATION_TYPES,
  BASIC_GENERATION_PROVIDER,
  BusinessError,
  GENERATION_TASK_TIMEOUT_MS,
  RESERVATION_TTL_MS,
  buildTask,
  createSafeDocId,
  createStartGenerationTaskHandler,
  getGenerationTaskDocId,
  getReservationDocId,
  toTaskResponse,
  validateTaskInputs,
  verifyExistingTask
};
