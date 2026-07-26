"use strict";

const { getServiceMode, SERVICE_MODE_VALUE, allowsLocalFallback } = require("../runtime");
const mockOptimization = require("../mock/optimization");
const cloudOptimization = require("./cloud");
const { store } = require("../../store/core/createStore");
const { selectRemainingOptimizeCount } = require("../../store/selectors/index");

const mode = getServiceMode("optimization");
const BUSINESS_ERROR_CODES = new Set([
  "OPTIMIZE_QUOTA_RESERVE_INVALID_PAYLOAD",
  "OPTIMIZE_QUOTA_RELEASE_INVALID_PAYLOAD",
  "OPTIMIZE_QUOTA_COMMIT_INVALID_PAYLOAD",
  "OPTIMIZE_QUOTA_NOT_ENOUGH",
  "OPTIMIZE_QUOTA_WORK_NOT_FOUND",
  "OPTIMIZE_RESERVATION_NOT_FOUND",
  "OPTIMIZE_RESERVATION_CONFLICT",
  "OPTIMIZE_RESERVATION_ALREADY_RELEASED",
  "OPTIMIZE_RESERVATION_TASK_ACTIVE",
  "OPTIMIZE_RESERVATION_TASK_SUCCEEDED",
  "OPTIMIZE_RESERVATION_EXPIRED",
  "OPTIMIZE_RESERVATION_TASK_MISMATCH",
  "OPTIMIZE_GENERATION_TASK_NOT_FOUND",
  "OPTIMIZE_GENERATION_TASK_NOT_SUCCESS",
  "OPTIMIZE_GENERATION_RESULT_NOT_SAVED",
  "OPTIMIZE_QUOTA_INCONSISTENT",
  "OPTIMIZE_QUOTA_TRANSACTION_FAILED"
]);

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function toQuotaResponse(quota) {
  const grantedCount = normalizeNumber(quota && quota.grantedCount);
  const usedCount = normalizeNumber(quota && quota.usedCount);
  const reservedCount = normalizeNumber(quota && quota.reservedCount);
  const availableCount = Math.max(0, grantedCount - usedCount - reservedCount);

  return {
    grantedCount,
    usedCount,
    reservedCount,
    availableCount,
    remainingCount: availableCount,
    updatedAt: (quota && quota.updatedAt) || new Date().toISOString()
  };
}

function getLocalQuota() {
  return toQuotaResponse(store.getState().optimizeState);
}

function getLocalReservation(reservationId) {
  return store.getState().optimizeState.reservationMap[reservationId] || null;
}

function createQuotaError(errorCode, message) {
  const error = new Error(message);
  error.errorCode = errorCode;
  return error;
}

function shouldFallbackToLocal(error) {
  if (!allowsLocalFallback("optimization")) {
    return false;
  }

  return !error || !BUSINESS_ERROR_CODES.has(error.errorCode);
}

async function callCloudWithFallback(methodName, localHandler, args) {
  if (mode === SERVICE_MODE_VALUE.MOCK) {
    return localHandler(...args);
  }

  if (mode === SERVICE_MODE_VALUE.CLOUD || mode === SERVICE_MODE_VALUE.CLOUD_WITH_LOCAL_FALLBACK) {
    try {
      return await cloudOptimization[methodName](...args);
    } catch (error) {
      if (shouldFallbackToLocal(error)) {
        console.warn(`[services/optimization] ${methodName} cloud failed, fallback to local state.`, error && error.message ? error.message : error);
        return localHandler(...args);
      }

      throw error;
    }
  }

  console.warn(`[services/optimization] Unsupported mode "${mode}", fallback to local state.`);
  return localHandler(...args);
}

function getOptimizeQuotaLocal() {
  return getLocalQuota();
}

function reserveOptimizeQuotaLocal(payload = {}) {
  if (!payload.reservationId || !payload.workId) {
    throw createQuotaError("OPTIMIZE_QUOTA_RESERVE_INVALID_PAYLOAD", "优化预占信息不完整，请返回作品页重试");
  }
  const existingReservation = getLocalReservation(payload.reservationId);
  if (existingReservation) {
    if (existingReservation.workId !== payload.workId || existingReservation.source !== payload.source) {
      throw createQuotaError("OPTIMIZE_RESERVATION_CONFLICT", "同一个预占编号对应的作品或来源不一致");
    }
    return {
      reservation: existingReservation,
      quota: getLocalQuota(),
      duplicated: true,
      transitionApplied: false,
      localFallback: true
    };
  }
  if (selectRemainingOptimizeCount(store.getState()) <= 0) {
    throw createQuotaError("OPTIMIZE_QUOTA_NOT_ENOUGH", "当前优化次数不足，请先观看广告补充次数");
  }

  const reservation = mockOptimization.createReservation(
    payload.workId || "",
    payload.source || "result",
    Array.isArray(payload.dimensionSet) ? payload.dimensionSet : []
  );
  reservation.reservationId = payload.reservationId;
  const quota = getLocalQuota();

  return {
    reservation,
    quota: toQuotaResponse({
      ...quota,
      reservedCount: quota.reservedCount + 1
    }),
    duplicated: false,
    transitionApplied: true,
    localFallback: true
  };
}

function releaseOptimizeQuotaLocal(reservationId) {
  const reservation = getLocalReservation(reservationId);
  const quota = getLocalQuota();

  if (!reservation || reservation.status !== "reserved") {
    return {
      reservation,
      quota,
      localFallback: true
    };
  }

  return {
    reservation: {
      ...reservation,
      status: "released"
    },
    quota: toQuotaResponse({
      ...quota,
      reservedCount: Math.max(0, quota.reservedCount - 1)
    }),
    localFallback: true
  };
}

function commitOptimizeQuotaLocal(reservationId, taskId) {
  const reservation = getLocalReservation(reservationId);
  const quota = getLocalQuota();

  if (!reservation || reservation.status !== "reserved") {
    return {
      reservation,
      quota,
      localFallback: true
    };
  }

  return {
    reservation: {
      ...reservation,
      taskId,
      status: "committed"
    },
    quota: toQuotaResponse({
      ...quota,
      usedCount: quota.usedCount + 1,
      reservedCount: Math.max(0, quota.reservedCount - 1)
    }),
    localFallback: true
  };
}

function getOptimizeQuota() {
  return callCloudWithFallback("getOptimizeQuota", getOptimizeQuotaLocal, []);
}

function reserveOptimizeQuota(payload = {}) {
  return callCloudWithFallback("reserveOptimizeQuota", reserveOptimizeQuotaLocal, [payload]);
}

function releaseOptimizeQuota(reservationId) {
  return callCloudWithFallback("releaseOptimizeQuota", releaseOptimizeQuotaLocal, [reservationId]);
}

function commitOptimizeQuota(reservationId, taskId) {
  return callCloudWithFallback("commitOptimizeQuota", commitOptimizeQuotaLocal, [reservationId, taskId]);
}

module.exports = {
  resolveSuggestions: mockOptimization.resolveSuggestions,
  isValidOptimizeFeedback: mockOptimization.isValidOptimizeFeedback,
  createReservation: mockOptimization.createReservation,
  getOptimizeQuota,
  reserveOptimizeQuota,
  releaseOptimizeQuota,
  commitOptimizeQuota
};
