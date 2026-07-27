"use strict";

const { getStorageValue, removeStorageValue, setStorageValue } = require("./storage");

const PENDING_CLOUD_SAVE_STORAGE_KEY_V1 = "petmate.pendingCloudSave.v1";
const PENDING_CLOUD_SAVE_STORAGE_KEY_V2 = "petmate.pendingCloudSave.v2";
const PENDING_CLOUD_SAVE_STORAGE_KEY = PENDING_CLOUD_SAVE_STORAGE_KEY_V2;
const PENDING_CLOUD_SAVE_TTL_MS = 24 * 60 * 60 * 1000;

let pendingMigrationNotice = null;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getTimeValue(value) {
  const time = new Date(value || "").getTime();
  return Number.isNaN(time) ? 0 : time;
}

function toIsoString(value) {
  if (!value) {
    return "";
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  return "";
}

function normalizePendingCloudSave(pending) {
  if (!isObject(pending)) {
    return null;
  }
  const taskId = normalizeString(pending.taskId);
  const workId = normalizeString(pending.workId);
  const versionId = normalizeString(pending.versionId);
  const createdAt = toIsoString(pending.createdAt);
  if (!taskId || !workId || !versionId || !createdAt) {
    return null;
  }
  return {
    taskId,
    workId,
    versionId,
    createdAt
  };
}

function normalizeLegacyPendingCloudSave(pending, now) {
  if (!isObject(pending)) {
    return null;
  }
  const legacyWork = isObject(pending.work) ? pending.work : {};
  const legacyVersion = isObject(pending.version) ? pending.version : {};
  return normalizePendingCloudSave({
    taskId: pending.taskId,
    workId: pending.workId || legacyWork.workId,
    versionId: pending.versionId || legacyVersion.versionId,
    createdAt: toIsoString(pending.createdAt) || new Date(now).toISOString()
  });
}

function buildPendingCloudSave(references, options = {}) {
  return normalizePendingCloudSave({
    taskId: references && references.taskId,
    workId: references && references.workId,
    versionId: references && references.versionId,
    createdAt: options.createdAt || (references && references.createdAt) || new Date().toISOString()
  });
}

function isPendingCloudSaveExpired(pending, now = Date.now()) {
  const createdAt = getTimeValue(pending && pending.createdAt);
  if (!createdAt) {
    return true;
  }
  return now - createdAt > PENDING_CLOUD_SAVE_TTL_MS;
}

function matchesPendingCloudSave(pending, workId, versionId) {
  if (!pending) {
    return false;
  }
  if (workId && pending.workId !== workId) {
    return false;
  }
  if (versionId && pending.versionId !== versionId) {
    return false;
  }
  return true;
}

function removePendingCloudSave() {
  removeStorageValue(PENDING_CLOUD_SAVE_STORAGE_KEY_V1);
  removeStorageValue(PENDING_CLOUD_SAVE_STORAGE_KEY_V2);
}

function readPendingCloudSaveResult(now = Date.now()) {
  const v2Value = getStorageValue(PENDING_CLOUD_SAVE_STORAGE_KEY_V2, null);
  if (v2Value !== null) {
    const pending = normalizePendingCloudSave(v2Value);
    if (!pending || isPendingCloudSaveExpired(pending, now)) {
      removeStorageValue(PENDING_CLOUD_SAVE_STORAGE_KEY_V2);
      return {
        pending: null,
        errorCode: pending ? "PENDING_CLOUD_SAVE_EXPIRED" : "PENDING_CLOUD_SAVE_INVALID"
      };
    }
    return {
      pending,
      migrated: false,
      errorCode: ""
    };
  }

  const v1Value = getStorageValue(PENDING_CLOUD_SAVE_STORAGE_KEY_V1, null);
  if (v1Value === null) {
    return {
      pending: null,
      migrated: false,
      errorCode: ""
    };
  }
  removeStorageValue(PENDING_CLOUD_SAVE_STORAGE_KEY_V1);
  const migratedPending = normalizeLegacyPendingCloudSave(v1Value, now);
  if (!migratedPending) {
    pendingMigrationNotice = {
      errorCode: "PENDING_CLOUD_SAVE_LEGACY_DROPPED",
      message: "旧版待同步数据缺少生成任务引用，请重新进入作品页刷新。"
    };
    return {
      pending: null,
      migrated: false,
      dropped: true,
      ...pendingMigrationNotice
    };
  }
  if (isPendingCloudSaveExpired(migratedPending, now)) {
    pendingMigrationNotice = {
      errorCode: "PENDING_CLOUD_SAVE_EXPIRED",
      message: "旧版待同步记录已过期，请重新进入作品页刷新。"
    };
    return {
      pending: null,
      migrated: false,
      dropped: true,
      ...pendingMigrationNotice
    };
  }
  setStorageValue(PENDING_CLOUD_SAVE_STORAGE_KEY_V2, migratedPending);
  return {
    pending: migratedPending,
    migrated: true,
    errorCode: ""
  };
}

function readPendingCloudSave() {
  return readPendingCloudSaveResult().pending;
}

function writePendingCloudSave(pending) {
  const normalized = normalizePendingCloudSave(pending);
  if (!normalized || isPendingCloudSaveExpired(normalized)) {
    removePendingCloudSave();
    return null;
  }
  removeStorageValue(PENDING_CLOUD_SAVE_STORAGE_KEY_V1);
  setStorageValue(PENDING_CLOUD_SAVE_STORAGE_KEY_V2, normalized);
  return normalized;
}

function clearStoredPendingCloudSave(workId, versionId) {
  const pending = readPendingCloudSave();
  if (!matchesPendingCloudSave(pending, workId, versionId)) {
    return false;
  }
  removePendingCloudSave();
  return true;
}

function consumePendingCloudSaveNotice() {
  const notice = pendingMigrationNotice;
  pendingMigrationNotice = null;
  return notice;
}

module.exports = {
  PENDING_CLOUD_SAVE_STORAGE_KEY,
  PENDING_CLOUD_SAVE_STORAGE_KEY_V1,
  PENDING_CLOUD_SAVE_STORAGE_KEY_V2,
  PENDING_CLOUD_SAVE_TTL_MS,
  buildPendingCloudSave,
  clearStoredPendingCloudSave,
  consumePendingCloudSaveNotice,
  isPendingCloudSaveExpired,
  matchesPendingCloudSave,
  normalizePendingCloudSave,
  readPendingCloudSave,
  readPendingCloudSaveResult,
  removePendingCloudSave,
  writePendingCloudSave
};
