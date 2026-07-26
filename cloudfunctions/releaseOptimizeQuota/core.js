"use strict";

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

function verifyTaskLink(task, reservation, openid) {
  if (
    normalizeString(task.taskId) !== normalizeString(reservation.taskId) ||
    normalizeString(task.ownerOpenid) !== openid ||
    normalizeString(task.reservationId) !== normalizeString(reservation.reservationId) ||
    normalizeString(task.workId) !== normalizeString(reservation.workId)
  ) {
    throw new BusinessError("OPTIMIZE_RESERVATION_TASK_MISMATCH", "优化预占与生成任务关联不一致");
  }
}

function getReleaseReason(task) {
  if (!task) {
    return "task_submit_failed";
  }
  return task.failureCode === "GENERATION_TASK_TIMEOUT" || task.phase === "timeout"
    ? "task_timeout"
    : "task_failed";
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
  logger.error("releaseOptimizeQuota transaction failed", {
    functionName: "releaseOptimizeQuota",
    openid: details.openid ? createSafeDocId("user", details.openid).slice(-12) : "",
    reservationId: details.reservationId,
    taskId: details.taskId || "",
    workId: details.workId || "",
    errorCode: error && error.errorCode ? error.errorCode : "OPTIMIZE_QUOTA_TRANSACTION_FAILED",
    message: error && error.message ? error.message : String(error)
  });
}

function createReleaseOptimizeQuotaHandler({ cloud, db, now = () => new Date(), logger = console }) {
  return async function releaseOptimizeQuota(event = {}) {
    const context = cloud.getWXContext();
    const openid = normalizeString(context && context.OPENID);
    const reservationId = normalizeString(event.reservationId);
    const logDetails = {
      openid,
      reservationId,
      taskId: "",
      workId: ""
    };

    try {
      if (!openid || !reservationId) {
        throw new BusinessError("OPTIMIZE_QUOTA_RELEASE_INVALID_PAYLOAD", "优化预占信息缺失，无法释放次数");
      }

      const result = await db.runTransaction(async (transaction) => {
        const quotaRef = transaction.collection("optimizeQuotas").doc(getQuotaDocId(openid));
        const reservationRef = transaction.collection("optimizeReservations").doc(getReservationDocId(openid, reservationId));
        const reservationResult = await reservationRef.get();
        const quotaResult = await quotaRef.get();
        const reservation = reservationResult.data || null;
        const quota = quotaResult.data || null;

        if (!reservation) {
          throw new BusinessError("OPTIMIZE_RESERVATION_NOT_FOUND", "优化预占记录不存在，请返回作品页刷新后重试");
        }
        logDetails.taskId = normalizeString(reservation.taskId);
        logDetails.workId = normalizeString(reservation.workId);
        const counts = validateQuota(quota);

        if (reservation.status === "released") {
          return {
            reservation: toReservationResponse(reservation),
            quota: toQuotaResponse(quota),
            duplicated: true,
            transitionApplied: false
          };
        }
        if (reservation.status === "committed") {
          return {
            reservation: toReservationResponse(reservation),
            quota: toQuotaResponse(quota),
            duplicated: true,
            transitionApplied: false,
            terminalReason: "already_committed"
          };
        }
        if (reservation.status !== "reserved" || normalizeString(reservation.openid) !== openid) {
          throw new BusinessError("OPTIMIZE_RESERVATION_CONFLICT", "预占记录状态或归属不允许释放");
        }

        let task = null;
        if (normalizeString(reservation.taskId)) {
          const taskResult = await transaction.collection("generationTasks").doc(reservation.taskId).get();
          task = taskResult.data || null;
          if (!task) {
            throw new BusinessError("OPTIMIZE_GENERATION_TASK_NOT_FOUND", "预占绑定的生成任务不存在");
          }
          verifyTaskLink(task, reservation, openid);
          if (task.status === "pending" || task.status === "running") {
            throw new BusinessError("OPTIMIZE_RESERVATION_TASK_ACTIVE", "生成任务仍在运行，不能释放优化次数");
          }
          if (task.status === "success") {
            throw new BusinessError("OPTIMIZE_RESERVATION_TASK_SUCCEEDED", "生成任务已经成功，应确认扣减而不是释放次数");
          }
          if (task.status !== "failed") {
            throw new BusinessError("OPTIMIZE_RESERVATION_TASK_MISMATCH", "生成任务状态异常，暂时不能释放预占");
          }
        }

        if (counts.reservedCount <= 0) {
          throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", "预占记录存在，但汇总预占次数已经为零");
        }

        const transactionNow = now();
        const releaseReason = getReleaseReason(task);
        const nextReservation = {
          ...reservation,
          status: "released",
          releaseReason,
          releasedAt: transactionNow,
          updatedAt: transactionNow
        };
        const nextQuota = {
          ...quota,
          reservedCount: counts.reservedCount - 1,
          updatedAt: transactionNow
        };
        validateQuota(nextQuota);

        await reservationRef.update({
          data: {
            status: "released",
            releaseReason,
            releasedAt: transactionNow,
            updatedAt: transactionNow
          }
        });
        await quotaRef.update({
          data: {
            reservedCount: nextQuota.reservedCount,
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
        message: "优化次数释放失败，请稍后重试"
      };
    }
  };
}

module.exports = {
  BusinessError,
  createReleaseOptimizeQuotaHandler,
  createSafeDocId,
  getQuotaDocId,
  getReservationDocId,
  getReleaseReason,
  toQuotaResponse,
  validateQuota,
  verifyTaskLink
};
