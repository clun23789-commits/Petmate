"use strict";

const { getStorageValue, removeStorageValue, setStorageValue } = require("./storage");

const PENDING_CLOUD_SAVE_STORAGE_KEY = "petmate.pendingCloudSave.v1";
const PENDING_CLOUD_SAVE_TTL_MS = 24 * 60 * 60 * 1000;

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
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
        return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
    }
    return "";
}

function normalizePendingCloudSave(pending) {
    if (!isObject(pending) || !isObject(pending.work) || !isObject(pending.version)) {
        return null;
    }

    const workId = pending.workId || pending.work.workId || "";
    const versionId = pending.versionId || pending.version.versionId || "";
    if (!workId || !versionId) {
        return null;
    }

    return {
        work: pending.work,
        version: pending.version,
        taskId: pending.taskId || "",
        workId,
        versionId,
        createdAt: toIsoString(pending.createdAt) || ""
    };
}

function buildPendingCloudSave(work, version, options = {}) {
    const pending = normalizePendingCloudSave({
        work,
        version,
        taskId: options.taskId || "",
        workId: work && work.workId,
        versionId: version && version.versionId,
        createdAt: options.createdAt || new Date().toISOString()
    });

    return pending;
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
    removeStorageValue(PENDING_CLOUD_SAVE_STORAGE_KEY);
}

function readPendingCloudSave() {
    const storedValue = getStorageValue(PENDING_CLOUD_SAVE_STORAGE_KEY, null);
    const pending = normalizePendingCloudSave(storedValue);
    if (!pending) {
        if (storedValue !== null) {
            removePendingCloudSave();
        }
        return null;
    }

    if (isPendingCloudSaveExpired(pending)) {
        removePendingCloudSave();
        return null;
    }

    return pending;
}

function writePendingCloudSave(pending) {
    const normalized = normalizePendingCloudSave(pending);
    if (!normalized || isPendingCloudSaveExpired(normalized)) {
        removePendingCloudSave();
        return null;
    }

    setStorageValue(PENDING_CLOUD_SAVE_STORAGE_KEY, normalized);
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

module.exports = {
    PENDING_CLOUD_SAVE_STORAGE_KEY,
    PENDING_CLOUD_SAVE_TTL_MS,
    buildPendingCloudSave,
    clearStoredPendingCloudSave,
    isPendingCloudSaveExpired,
    matchesPendingCloudSave,
    readPendingCloudSave,
    removePendingCloudSave,
    writePendingCloudSave
};
