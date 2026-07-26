"use strict";

const ALLOWED_OPERATION_TYPES = new Set(["optimize", "targeted_upload"]);

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

function createSafeDocId(prefix, key) {
  const encoded = Buffer.from(key).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${prefix}_${encoded}`;
}

function getQuotaDocId(openid) {
  return createSafeDocId("optimize_quota", openid);
}

function getReservationDocId(openid, reservationId) {
  return createSafeDocId("optimize_reservation", `${openid}:${reservationId}`);
}

function readCount(doc, field) {
  const value = doc && doc[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", `优化次数数据异常：${field} 不是有效的非负整数`);
  }
  return value;
}

function validateQuota(doc) {
  if (!doc) {
    throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", "优化次数汇总记录不存在");
  }
  const grantedCount = readCount(doc, "grantedCount");
  const usedCount = readCount(doc, "usedCount");
  const reservedCount = readCount(doc, "reservedCount");
  if (usedCount + reservedCount > grantedCount) {
    throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", "优化次数汇总与预占记录不一致");
  }
  return {
    grantedCount,
    usedCount,
    reservedCount,
    availableCount: grantedCount - usedCount - reservedCount
  };
}

function toQuotaResponse(doc) {
  const counts = validateQuota(doc);
  return {
    ...counts,
    remainingCount: counts.availableCount,
    updatedAt: doc.updatedAt
  };
}

function toReservationResponse(doc) {
  return {
    reservationId: doc.reservationId || "",
    workId: doc.workId || "",
    taskId: doc.taskId || "",
    source: doc.source || "",
    status: doc.status || "reserved",
    dimensionSet: Array.isArray(doc.dimensionSet) ? doc.dimensionSet : [],
    expiresAt: doc.expiresAt || null,
    boundAt: doc.boundAt || null,
    releaseReason: doc.releaseReason || "",
    releasedAt: doc.releasedAt || null,
    committedAt: doc.committedAt || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };
}

function unwrapTransactionResult(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) {
    return value.result;
  }
  return value;
}

function verifyTaskLink(task, reservation, openid, reservationId, taskId) {
  if (
    normalizeString(task.taskId) !== taskId ||
    normalizeString(task.ownerOpenid) !== openid ||
    normalizeString(task.reservationId) !== reservationId ||
    normalizeString(task.workId) !== normalizeString(reservation.workId) ||
    !ALLOWED_OPERATION_TYPES.has(normalizeString(task.operationType))
  ) {
    throw new BusinessError("OPTIMIZE_RESERVATION_TASK_MISMATCH", "优化预占与生成任务关联不一致");
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
  logger.error("commitOptimizeQuota transaction failed", {
    functionName: "commitOptimizeQuota",
    openid: details.openid ? createSafeDocId("user", details.openid).slice(-12) : "",
    reservationId: details.reservationId,
    taskId: details.taskId,
    workId: details.workId || "",
    errorCode: error && error.errorCode ? error.errorCode : "OPTIMIZE_QUOTA_TRANSACTION_FAILED",
    message: error && error.message ? error.message : String(error)
  });
}

function createCommitOptimizeQuotaHandler({ cloud, db, now = () => new Date(), logger = console }) {
  return async function commitOptimizeQuota(event = {}) {
    const context = cloud.getWXContext();
    const openid = normalizeString(context && context.OPENID);
    const reservationId = normalizeString(event.reservationId);
    const taskId = normalizeString(event.taskId);
    const logDetails = {
      openid,
      reservationId,
      taskId,
      workId: ""
    };

    try {
      if (!openid || !reservationId || !taskId) {
        throw new BusinessError("OPTIMIZE_QUOTA_COMMIT_INVALID_PAYLOAD", "优化预占或生成任务信息缺失，无法确认扣减");
      }

      const result = await db.runTransaction(async (transaction) => {
        const quotaRef = transaction.collection("optimizeQuotas").doc(getQuotaDocId(openid));
        const reservationRef = transaction.collection("optimizeReservations").doc(getReservationDocId(openid, reservationId));
        const taskRef = transaction.collection("generationTasks").doc(taskId);
        const reservationResult = await reservationRef.get();
        const quotaResult = await quotaRef.get();
        const reservation = reservationResult.data || null;
        const quota = quotaResult.data || null;

        if (!reservation) {
          throw new BusinessError("OPTIMIZE_RESERVATION_NOT_FOUND", "优化预占记录不存在，请返回作品页刷新后重试");
        }
        logDetails.workId = normalizeString(reservation.workId);
        const counts = validateQuota(quota);

        if (reservation.status === "committed") {
          if (normalizeString(reservation.taskId) !== taskId) {
            throw new BusinessError("OPTIMIZE_RESERVATION_CONFLICT", "该预占已经绑定并扣减了另一个生成任务");
          }
          return {
            reservation: toReservationResponse(reservation),
            quota: toQuotaResponse(quota),
            duplicated: true,
            transitionApplied: false
          };
        }
        if (reservation.status === "released") {
          throw new BusinessError("OPTIMIZE_RESERVATION_ALREADY_RELEASED", "预占已经释放，不能正式扣减");
        }
        if (reservation.status !== "reserved") {
          throw new BusinessError("OPTIMIZE_RESERVATION_CONFLICT", "预占记录状态不允许正式扣减");
        }
        if (normalizeString(reservation.openid) !== openid || normalizeString(reservation.taskId) !== taskId) {
          throw new BusinessError("OPTIMIZE_RESERVATION_TASK_MISMATCH", "优化预占与生成任务关联不一致");
        }

        const taskResult = await taskRef.get();
        const task = taskResult.data || null;
        if (!task) {
          throw new BusinessError("OPTIMIZE_GENERATION_TASK_NOT_FOUND", "预占绑定的生成任务不存在");
        }
        verifyTaskLink(task, reservation, openid, reservationId, taskId);
        if (task.status !== "success") {
          throw new BusinessError("OPTIMIZE_GENERATION_TASK_NOT_SUCCESS", "生成任务尚未成功，不能扣减优化次数");
        }
        if (task.resultSaveStatus !== "success") {
          throw new BusinessError("OPTIMIZE_GENERATION_RESULT_NOT_SAVED", "生成结果尚未成功保存，不能扣减优化次数");
        }
        if (
          normalizeString(task.finalizedWorkId) !== normalizeString(reservation.workId) ||
          !normalizeString(task.finalizedVersionId)
        ) {
          throw new BusinessError("OPTIMIZE_RESERVATION_TASK_MISMATCH", "生成结果归属与优化预占不一致");
        }
        if (counts.reservedCount <= 0) {
          throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", "预占记录存在，但汇总预占次数已经为零");
        }

        const transactionNow = now();
        const nextReservation = {
          ...reservation,
          status: "committed",
          committedAt: transactionNow,
          updatedAt: transactionNow
        };
        const nextQuota = {
          ...quota,
          reservedCount: counts.reservedCount - 1,
          usedCount: counts.usedCount + 1,
          updatedAt: transactionNow
        };
        validateQuota(nextQuota);

        await reservationRef.update({
          data: {
            status: "committed",
            committedAt: transactionNow,
            updatedAt: transactionNow
          }
        });
        await quotaRef.update({
          data: {
            reservedCount: nextQuota.reservedCount,
            usedCount: nextQuota.usedCount,
            updatedAt: transactionNow
          }
        });

        return {
          reservation: toReservationResponse(nextReservation),
          quota: toQuotaResponse(nextQuota),
          duplicated: false,
          transitionApplied: true
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
        errorCode: "OPTIMIZE_QUOTA_TRANSACTION_FAILED",
        message: "优化次数扣减失败，请稍后刷新确认"
      };
    }
  };
}

module.exports = {
  ALLOWED_OPERATION_TYPES,
  BusinessError,
  createCommitOptimizeQuotaHandler,
  createSafeDocId,
  getQuotaDocId,
  getReservationDocId,
  toQuotaResponse,
  validateQuota,
  verifyTaskLink
};
