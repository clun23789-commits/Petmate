import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const reserveCore = require("../../../cloudfunctions/reserveOptimizeQuota/core.js");

export const OPENID = "openid-test-user";
export const WORK_ID = "work-test";
export const NOW = new Date("2026-07-27T08:00:00.000Z");

export function quotaDoc(overrides = {}) {
  return {
    _id: reserveCore.getQuotaDocId(OPENID),
    openid: OPENID,
    grantedCount: 3,
    usedCount: 0,
    reservedCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

export function workDoc(overrides = {}) {
  return {
    _id: "work-doc-test",
    workId: WORK_ID,
    ownerOpenid: OPENID,
    status: "ready",
    currentVersionId: "version-current",
    versionIds: ["version-current"],
    ...overrides
  };
}

export function assetDoc(overrides = {}) {
  return {
    _id: "asset-doc-test",
    assetId: "asset-test",
    ownerOpenid: OPENID,
    workId: WORK_ID,
    status: "active",
    role: "targeted",
    viewType: "front",
    fileID: "cloud://asset-test",
    ...overrides
  };
}

export function reservationDoc(reservationId = "reservation-test", overrides = {}) {
  return {
    _id: reserveCore.getReservationDocId(OPENID, reservationId),
    openid: OPENID,
    reservationId,
    workId: WORK_ID,
    source: "result",
    taskId: "",
    status: "reserved",
    dimensionSet: ["fur"],
    expiresAt: new Date(NOW.getTime() + reserveCore.RESERVATION_TTL_MS),
    boundAt: null,
    releaseReason: "",
    releasedAt: null,
    committedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

export function generationTaskDoc(taskId = "task-test", overrides = {}) {
  return {
    _id: taskId,
    taskId,
    ownerOpenid: OPENID,
    workId: WORK_ID,
    reservationId: "reservation-test",
    operationType: "optimize",
    status: "success",
    phase: "completed",
    resultSaveStatus: "success",
    finalizedWorkId: WORK_ID,
    finalizedVersionId: "version-final",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}
