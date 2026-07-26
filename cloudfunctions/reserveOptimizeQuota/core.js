"use strict";

const RESERVATION_TTL_MS = 15 * 60 * 1000;
const GENERATION_TASK_TIMEOUT_MS = 10 * 60 * 1000;
const ALLOWED_SOURCES = new Set(["result", "targeted_upload"]);
const ALLOWED_DIMENSIONS = new Set(["fur", "pattern", "body", "face", "ears", "tail"]);

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

function normalizeDimensionSet(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizeString(item))
        .filter((item) => ALLOWED_DIMENSIONS.has(item))
    )
  );
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

function createQuotaDoc(openid, now) {
  return {
    _id: getQuotaDocId(openid),
    openid,
    grantedCount: 0,
    usedCount: 0,
    reservedCount: 0,
    createdAt: now,
    updatedAt: now
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

function withoutId(doc) {
  const data = {
    ...doc
  };
  delete data._id;
  return data;
}

function unwrapTransactionResult(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) {
    return value.result;
  }
  return value;
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
  logger.error("reserveOptimizeQuota transaction failed", {
    functionName: "reserveOptimizeQuota",
    openid: details.openid ? createSafeDocId("user", details.openid).slice(-12) : "",
    reservationId: details.reservationId,
    taskId: "",
    workId: details.workId,
    errorCode: error && error.errorCode ? error.errorCode : "OPTIMIZE_QUOTA_TRANSACTION_FAILED",
    message: error && error.message ? error.message : String(error)
  });
}

function createReserveOptimizeQuotaHandler({ cloud, db, now = () => new Date(), logger = console }) {
  if (RESERVATION_TTL_MS < GENERATION_TASK_TIMEOUT_MS) {
    throw new Error("RESERVATION_TTL_MS must not be shorter than GENERATION_TASK_TIMEOUT_MS");
  }

  return async function reserveOptimizeQuota(event = {}) {
    const context = cloud.getWXContext();
    const openid = normalizeString(context && context.OPENID);
    const reservationId = normalizeString(event.reservationId);
    const workId = normalizeString(event.workId);
    const source = normalizeString(event.source);
    const dimensionSet = normalizeDimensionSet(event.dimensionSet);
    const logDetails = {
      openid,
      reservationId,
      workId
    };

    try {
      if (!openid || !reservationId || !workId || !ALLOWED_SOURCES.has(source)) {
        throw new BusinessError("OPTIMIZE_QUOTA_RESERVE_INVALID_PAYLOAD", "优化预占信息不完整，请返回作品页重试");
      }

      const workResult = await db.collection("works").where({
        ownerOpenid: openid,
        workId
      }).limit(1).get();
      const work = workResult.data && workResult.data[0];
      if (!work || work.status === "deleted") {
        throw new BusinessError("OPTIMIZE_QUOTA_WORK_NOT_FOUND", "当前作品不存在或已失效，请返回作品页刷新后重试");
      }

      const result = await db.runTransaction(async (transaction) => {
        const quotaRef = transaction.collection("optimizeQuotas").doc(getQuotaDocId(openid));
        const reservationRef = transaction.collection("optimizeReservations").doc(getReservationDocId(openid, reservationId));
        const quotaResult = await quotaRef.get();
        const reservationResult = await reservationRef.get();
        let quotaDoc = quotaResult.data || null;
        const existingReservation = reservationResult.data || null;

        if (existingReservation) {
          if (!quotaDoc) {
            throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", "预占记录存在，但优化次数汇总记录缺失");
          }
          validateQuota(quotaDoc);
          if (
            existingReservation.openid !== openid ||
            existingReservation.reservationId !== reservationId ||
            existingReservation.workId !== workId ||
            existingReservation.source !== source
          ) {
            throw new BusinessError("OPTIMIZE_RESERVATION_CONFLICT", "同一个预占编号对应的作品或来源不一致");
          }

          return {
            reservation: toReservationResponse(existingReservation),
            quota: toQuotaResponse(quotaDoc),
            duplicated: true,
            transitionApplied: false
          };
        }

        const transactionNow = now();
        if (!quotaDoc) {
          quotaDoc = createQuotaDoc(openid, transactionNow);
          await quotaRef.set({
            data: withoutId(quotaDoc)
          });
        }

        const counts = validateQuota(quotaDoc);
        if (counts.availableCount <= 0) {
          throw new BusinessError("OPTIMIZE_QUOTA_NOT_ENOUGH", "当前优化次数不足，请先观看广告补充次数");
        }

        const reservationDoc = {
          _id: getReservationDocId(openid, reservationId),
          openid,
          reservationId,
          workId,
          source,
          taskId: "",
          status: "reserved",
          dimensionSet,
          expiresAt: new Date(transactionNow.getTime() + RESERVATION_TTL_MS),
          boundAt: null,
          releaseReason: "",
          releasedAt: null,
          committedAt: null,
          createdAt: transactionNow,
          updatedAt: transactionNow
        };
        const nextQuota = {
          ...quotaDoc,
          reservedCount: counts.reservedCount + 1,
          updatedAt: transactionNow
        };

        validateQuota(nextQuota);
        await reservationRef.set({
          data: withoutId(reservationDoc)
        });
        await quotaRef.update({
          data: {
            reservedCount: nextQuota.reservedCount,
            updatedAt: transactionNow
          }
        });

        return {
          reservation: toReservationResponse(reservationDoc),
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
        message: "优化次数预占失败，请稍后重试"
      };
    }
  };
}

module.exports = {
  ALLOWED_DIMENSIONS,
  BusinessError,
  GENERATION_TASK_TIMEOUT_MS,
  RESERVATION_TTL_MS,
  createReserveOptimizeQuotaHandler,
  createSafeDocId,
  getQuotaDocId,
  getReservationDocId,
  normalizeDimensionSet,
  toQuotaResponse,
  validateQuota
};
