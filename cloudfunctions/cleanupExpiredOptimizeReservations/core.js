"use strict";

const RESERVATION_TTL_MS = 15 * 60 * 1000;
const GENERATION_TASK_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 100;
const MAX_BATCH_LIMIT = 100;

class BusinessError extends Error {
  constructor(errorCode, message) {
    super(message);
    this.name = "BusinessError";
    this.errorCode = errorCode;
    this.isBusinessError = true;
  }
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
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

function unwrapTransactionResult(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) {
    return value.result;
  }
  return value;
}

function getBatchLimit(event) {
  const value = Number(event && event.limit);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_BATCH_LIMIT;
  }
  return Math.min(MAX_BATCH_LIMIT, Math.floor(value));
}

function verifyTaskLink(task, reservation) {
  if (
    normalizeString(task.taskId) !== normalizeString(reservation.taskId) ||
    normalizeString(task.ownerOpenid) !== normalizeString(reservation.openid) ||
    normalizeString(task.reservationId) !== normalizeString(reservation.reservationId) ||
    normalizeString(task.workId) !== normalizeString(reservation.workId)
  ) {
    throw new BusinessError("OPTIMIZE_RESERVATION_TASK_MISMATCH", "优化预占与生成任务关联不一致");
  }
}

function isTaskTimedOut(task, scanNow) {
  const createdAt = normalizeDate(task && task.createdAt);
  return Boolean(createdAt && scanNow.getTime() - createdAt.getTime() >= GENERATION_TASK_TIMEOUT_MS);
}

function buildTimeoutPatch(scanNow) {
  return {
    status: "failed",
    phase: "timeout",
    providerStatus: "timeout",
    failureCode: "GENERATION_TASK_TIMEOUT",
    failureCategory: "timeout",
    failureReason: "生成任务等待时间过长，本轮未扣减优化次数。",
    recoverable: true,
    failedAt: scanNow,
    timeoutAt: scanNow,
    updatedAt: scanNow
  };
}

function createCleanupExpiredOptimizeReservationsHandler({ db, now = () => new Date(), logger = console }) {
  if (RESERVATION_TTL_MS < GENERATION_TASK_TIMEOUT_MS) {
    throw new Error("RESERVATION_TTL_MS must not be shorter than GENERATION_TASK_TIMEOUT_MS");
  }

  return async function cleanupExpiredOptimizeReservations(event = {}) {
    const scanNow = now();
    const limit = getBatchLimit(event);
    const expiredResult = await db.collection("optimizeReservations").where({
      status: "reserved",
      expiresAt: db.command.lte(scanNow)
    }).limit(limit).get();
    const expiredReservations = expiredResult.data || [];
    const summary = {
      scanned: expiredReservations.length,
      released: 0,
      committed: 0,
      timedOut: 0,
      skipped: 0,
      failed: 0,
      results: []
    };

    for (const seed of expiredReservations) {
      const openid = normalizeString(seed.openid);
      const reservationId = normalizeString(seed.reservationId);
      const workId = normalizeString(seed.workId);
      const taskId = normalizeString(seed.taskId);

      try {
        if (!openid || !reservationId) {
          throw new BusinessError("OPTIMIZE_RESERVATION_CONFLICT", "过期预占记录缺少用户或预占编号");
        }

        const transactionResult = await db.runTransaction(async (transaction) => {
          const reservationRef = transaction
            .collection("optimizeReservations")
            .doc(getReservationDocId(openid, reservationId));
          const quotaRef = transaction.collection("optimizeQuotas").doc(getQuotaDocId(openid));
          const reservationResult = await reservationRef.get();
          const reservation = reservationResult.data || null;

          if (!reservation || reservation.status !== "reserved") {
            return {
              action: "skipped",
              reason: "state_changed"
            };
          }
          const expiresAt = normalizeDate(reservation.expiresAt);
          if (!expiresAt || expiresAt.getTime() > scanNow.getTime()) {
            return {
              action: "skipped",
              reason: "not_expired"
            };
          }

          const quotaResult = await quotaRef.get();
          const quota = quotaResult.data || null;
          const counts = validateQuota(quota);
          if (counts.reservedCount <= 0) {
            throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", "过期预占存在，但汇总预占次数已经为零");
          }

          let action = "released";
          let releaseReason = "reservation_expired";
          let task = null;
          let timedOut = false;
          const boundTaskId = normalizeString(reservation.taskId);

          if (boundTaskId) {
            const taskResult = await transaction.collection("generationTasks").doc(boundTaskId).get();
            task = taskResult.data || null;
            if (!task) {
              throw new BusinessError("OPTIMIZE_GENERATION_TASK_NOT_FOUND", "过期预占绑定的生成任务不存在");
            }
            verifyTaskLink(task, reservation);

            if (task.status === "success") {
              if (
                task.resultSaveStatus !== "success" ||
                normalizeString(task.finalizedWorkId) !== normalizeString(reservation.workId) ||
                !normalizeString(task.finalizedVersionId)
              ) {
                return {
                  action: "skipped",
                  reason: "success_result_not_saved"
                };
              }
              action = "committed";
            } else if (task.status === "failed") {
              releaseReason = task.failureCode === "GENERATION_TASK_TIMEOUT" || task.phase === "timeout"
                ? "task_timeout"
                : "task_failed";
            } else if (task.status === "pending" || task.status === "running") {
              if (!isTaskTimedOut(task, scanNow)) {
                return {
                  action: "skipped",
                  reason: "task_active"
                };
              }
              timedOut = true;
              releaseReason = "task_timeout";
              await transaction.collection("generationTasks").doc(boundTaskId).update({
                data: buildTimeoutPatch(scanNow)
              });
            } else {
              return {
                action: "skipped",
                reason: "task_status_unknown"
              };
            }
          }

          const nextQuota = {
            ...quota,
            reservedCount: counts.reservedCount - 1,
            usedCount: action === "committed" ? counts.usedCount + 1 : counts.usedCount,
            updatedAt: scanNow
          };
          validateQuota(nextQuota);

          if (action === "committed") {
            await reservationRef.update({
              data: {
                status: "committed",
                committedAt: scanNow,
                updatedAt: scanNow
              }
            });
          } else {
            await reservationRef.update({
              data: {
                status: "released",
                releaseReason,
                releasedAt: scanNow,
                updatedAt: scanNow
              }
            });
          }
          await quotaRef.update({
            data: {
              reservedCount: nextQuota.reservedCount,
              usedCount: nextQuota.usedCount,
              updatedAt: scanNow
            }
          });

          return {
            action,
            reason: action === "committed" ? "success_result_saved" : releaseReason,
            timedOut
          };
        });

        const item = unwrapTransactionResult(transactionResult);
        if (item.action === "committed") {
          summary.committed += 1;
        } else if (item.action === "released") {
          summary.released += 1;
        } else {
          summary.skipped += 1;
        }
        if (item.timedOut) {
          summary.timedOut += 1;
        }
        summary.results.push({
          reservationId,
          taskId,
          workId,
          ...item
        });
      } catch (error) {
        summary.failed += 1;
        summary.results.push({
          reservationId,
          taskId,
          workId,
          action: "failed",
          errorCode: error && error.errorCode ? error.errorCode : "OPTIMIZE_QUOTA_TRANSACTION_FAILED"
        });
        logger.error("cleanupExpiredOptimizeReservations item failed", {
          functionName: "cleanupExpiredOptimizeReservations",
          openid: openid ? createSafeDocId("user", openid).slice(-12) : "",
          reservationId,
          taskId,
          workId,
          errorCode: error && error.errorCode ? error.errorCode : "OPTIMIZE_QUOTA_TRANSACTION_FAILED",
          message: error && error.message ? error.message : String(error)
        });
      }
    }

    return {
      ok: true,
      data: summary
    };
  };
}

module.exports = {
  BusinessError,
  DEFAULT_BATCH_LIMIT,
  GENERATION_TASK_TIMEOUT_MS,
  MAX_BATCH_LIMIT,
  RESERVATION_TTL_MS,
  buildTimeoutPatch,
  createCleanupExpiredOptimizeReservationsHandler,
  createSafeDocId,
  getQuotaDocId,
  getReservationDocId,
  isTaskTimedOut,
  validateQuota,
  verifyTaskLink
};
