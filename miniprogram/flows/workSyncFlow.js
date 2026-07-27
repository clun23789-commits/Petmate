"use strict";

const { deleteWork, getWork, listWorks, saveWorkBundle } = require("../services/work");
const { store } = require("../store/core/createStore");
const {
    buildPendingCloudSave,
    consumePendingCloudSaveNotice,
    isPendingCloudSaveExpired,
    matchesPendingCloudSave,
    readPendingCloudSave,
    readPendingCloudSaveResult,
    removePendingCloudSave,
    writePendingCloudSave
} = require("../utils/pendingCloudSaveStorage");
const { showToast } = require("../utils/toast");

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePreviewMedia(value) {
    return isObject(value) ? value : {};
}

function mergePreviewMedia(incomingPreviewMedia, existingPreviewMedia) {
    const incoming = normalizePreviewMedia(incomingPreviewMedia);
    const existing = normalizePreviewMedia(existingPreviewMedia);
    return {
        ...existing,
        ...incoming
    };
}

function toArray(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
}

function uniqueStrings(values) {
    return Array.from(new Set(toArray(values).filter((item) => typeof item === "string" && item)));
}

function toIsoString(value) {
    if (!value) {
        return "";
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
    }
    if (typeof value === "number") {
        const numericDate = new Date(value);
        return Number.isNaN(numericDate.getTime()) ? "" : numericDate.toISOString();
    }
    if (typeof value === "string") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
    }
    if (value && typeof value.toISOString === "function") {
        try {
            return value.toISOString();
        } catch (error) {
            return "";
        }
    }
    return "";
}

function getTimeValue(value) {
    const time = new Date(value || "").getTime();
    return Number.isNaN(time) ? 0 : time;
}

function stripCloudFields(record) {
    const nextRecord = {
        ...record
    };
    delete nextRecord._id;
    delete nextRecord._openid;
    delete nextRecord.ownerOpenid;
    return nextRecord;
}

function normalizeCloudVersion(version) {
    if (!isObject(version) || !version.versionId) {
        return null;
    }
    const normalized = stripCloudFields(version);
    return {
        ...normalized,
        versionId: normalized.versionId,
        workId: normalized.workId || "",
        sourceType: normalized.sourceType || "initial",
        previewMedia: normalizePreviewMedia(normalized.previewMedia),
        feedbackSummary: isObject(normalized.feedbackSummary) ? normalized.feedbackSummary : {},
        editableTexture: {
            baseColor: "#c6a38a",
            notes: [],
            ...(isObject(normalized.editableTexture) ? normalized.editableTexture : {})
        },
        status: normalized.status || "active",
        createdAt: toIsoString(normalized.createdAt),
        updatedAt: toIsoString(normalized.updatedAt),
        cloudSynced: true
    };
}

function normalizeCloudWork(work, versionsByWorkId) {
    if (!isObject(work) || !work.workId || work.status === "deleted") {
        return null;
    }
    const normalized = stripCloudFields(work);
    const relatedVersionIds = toArray(versionsByWorkId[normalized.workId]).map((version) => version.versionId);
    const versionIds = uniqueStrings([...toArray(normalized.versionIds), ...relatedVersionIds]);
    const currentVersionId = normalized.currentVersionId || versionIds[0] || "";

    return {
        ...normalized,
        workId: normalized.workId,
        petType: normalized.petType || "cat",
        petTypeLabel: normalized.petTypeLabel || "",
        petName: normalized.petName || "当前宠物作品",
        displayName: normalized.displayName || "",
        status: normalized.status || "ready",
        currentVersionId,
        versionIds,
        previewImage: normalized.previewImage || "",
        source: normalized.source || "cloud",
        createdAt: toIsoString(normalized.createdAt),
        updatedAt: toIsoString(normalized.updatedAt),
        deletedAt: toIsoString(normalized.deletedAt),
        cloudSynced: true
    };
}

function getStatusMessage(result, fallback) {
    return (result && result.message) || fallback;
}

function setPendingCloudSave(references, options = {}) {
    const pending = buildPendingCloudSave(references, options);
    if (!pending) {
        return;
    }

    const storedPending = writePendingCloudSave(pending);
    if (!storedPending) {
        return;
    }

    store.setState((state) => ({
        workState: {
            ...state.workState,
            pendingCloudSave: storedPending
        }
    }), "setPendingCloudSave");
}

function clearPendingCloudSave(workId, versionId, label = "clearPendingCloudSave") {
    const pending = store.getState().workState.pendingCloudSave;
    const storedPending = readPendingCloudSave();
    const shouldClearState = matchesPendingCloudSave(pending, workId, versionId);
    const shouldClearStorage = matchesPendingCloudSave(storedPending, workId, versionId);
    if (shouldClearStorage || (shouldClearState && !storedPending)) {
        removePendingCloudSave();
    }

    if (!shouldClearState) {
        return;
    }

    store.setState((state) => {
        return {
            workState: {
                ...state.workState,
                pendingCloudSave: null
            }
        };
    }, label);
}

function setWorkStatePatch(patch, label) {
    store.setState((state) => ({
        workState: {
            ...state.workState,
            ...patch
        }
    }), label);
}

function setWorkStatusMap(mapKey, workId, status, label, extraPatch = {}) {
    store.setState((state) => ({
        workState: {
            ...state.workState,
            ...extraPatch,
            [mapKey]: {
                ...state.workState[mapKey],
                [workId]: status
            }
        }
    }), label);
}

function buildVersionsByWorkId(versions) {
    return versions.reduce((result, version) => {
        if (!version || !version.workId) {
            return result;
        }
        result[version.workId] = result[version.workId] || [];
        result[version.workId].push(version);
        return result;
    }, {});
}

function removeWorkShellFromStore(workId, label) {
    store.setState((state) => {
        const work = state.workState.workMap[workId];
        const versionIds = new Set((work && work.versionIds) || []);
        if (work && work.currentVersionId) {
            versionIds.add(work.currentVersionId);
        }

        const workMap = {
            ...state.workState.workMap
        };
        delete workMap[workId];

        const versionMap = {
            ...state.workState.versionMap
        };
        versionIds.forEach((versionId) => {
            delete versionMap[versionId];
        });

        const workOrder = state.workState.workOrder.filter((item) => item !== workId);
        const currentWorkId = state.workState.currentWorkId === workId ? workOrder[0] || "" : state.workState.currentWorkId;
        const currentWork = currentWorkId ? workMap[currentWorkId] : null;
        const currentVersionId = currentWork && currentWork.currentVersionId && versionMap[currentWork.currentVersionId]
            ? currentWork.currentVersionId
            : "";

        return {
            workState: {
                ...state.workState,
                workMap,
                versionMap,
                workOrder,
                currentWorkId,
                currentVersionId,
                activeWorkStatus: currentWork ? currentWork.status : "idle"
            }
        };
    }, label);
}

function syncCloudWorksToStore(works = [], versions = [], options = {}) {
    const normalizedVersions = toArray(versions)
        .map((version) => normalizeCloudVersion(version))
        .filter((version) => version && version.status !== "deleted");
    const versionsByWorkId = buildVersionsByWorkId(normalizedVersions);
    const normalizedWorks = toArray(works)
        .map((work) => normalizeCloudWork(work, versionsByWorkId))
        .filter(Boolean);
    const incomingWorkIds = new Set(normalizedWorks.map((work) => work.workId));
    const replaceCloudBacked = Boolean(options.replaceCloudBacked);

    store.setState((state) => {
        const workMap = {
            ...state.workState.workMap
        };
        const versionMap = {
            ...state.workState.versionMap
        };

        if (replaceCloudBacked) {
            Object.keys(workMap).forEach((workId) => {
                const existingWork = workMap[workId];
                const isCloudBacked = existingWork && (existingWork.cloudSynced === true || existingWork.source === "cloud");
                if (!isCloudBacked || incomingWorkIds.has(workId)) {
                    return;
                }
                const versionIds = new Set(existingWork.versionIds || []);
                if (existingWork.currentVersionId) {
                    versionIds.add(existingWork.currentVersionId);
                }
                delete workMap[workId];
                versionIds.forEach((versionId) => {
                    delete versionMap[versionId];
                });
            });
        }

        normalizedVersions.forEach((version) => {
            const existingVersion = versionMap[version.versionId] || {};
            versionMap[version.versionId] = {
                ...existingVersion,
                ...version,
                previewMedia: mergePreviewMedia(version.previewMedia, existingVersion.previewMedia)
            };
        });

        normalizedWorks.forEach((work) => {
            const existingWork = workMap[work.workId] || {};
            const relatedVersionIds = toArray(versionsByWorkId[work.workId]).map((version) => version.versionId);
            workMap[work.workId] = {
                ...existingWork,
                ...work,
                versionIds: uniqueStrings([...toArray(existingWork.versionIds), ...toArray(work.versionIds), ...relatedVersionIds])
            };
        });

        const orderedIds = Object.keys(workMap)
            .filter((workId) => workMap[workId] && workMap[workId].status !== "deleted")
            .sort((leftId, rightId) => {
                const timeGap = getTimeValue(workMap[rightId].updatedAt || workMap[rightId].createdAt) - getTimeValue(workMap[leftId].updatedAt || workMap[leftId].createdAt);
                if (timeGap !== 0) {
                    return timeGap;
                }
                return state.workState.workOrder.indexOf(leftId) - state.workState.workOrder.indexOf(rightId);
            });
        const currentWorkId = state.workState.currentWorkId && workMap[state.workState.currentWorkId]
            ? state.workState.currentWorkId
            : orderedIds[0] || "";
        const currentWork = currentWorkId ? workMap[currentWorkId] : null;
        const currentVersionId = currentWork && currentWork.currentVersionId && versionMap[currentWork.currentVersionId]
            ? currentWork.currentVersionId
            : "";

        return {
            workState: {
                ...state.workState,
                workMap,
                versionMap,
                workOrder: orderedIds,
                currentWorkId,
                currentVersionId,
                activeWorkStatus: currentWork ? currentWork.status : "idle"
            }
        };
    }, "syncCloudWorksToStore");

    return {
        works: normalizedWorks,
        versions: normalizedVersions
    };
}

async function loadCloudWorks(options = {}) {
    const silent = Boolean(options.silent);
    setWorkStatePatch({
        cloudListStatus: "loading",
        cloudError: ""
    }, "loadCloudWorksStart");

    const result = await listWorks();

    if (result.ok !== true) {
        const message = getStatusMessage(result, "云端作品读取失败，已显示本地数据");
        setWorkStatePatch({
            cloudListStatus: "failed",
            cloudError: message
        }, "loadCloudWorksFailed");
        if (!silent) {
            showToast("云端作品读取失败，已显示本地数据");
        }
        return result;
    }

    const data = result.data || {};
    syncCloudWorksToStore(data.works || [], data.versions || [], {
        replaceCloudBacked: true
    });
    setWorkStatePatch({
        cloudListStatus: "success",
        cloudError: "",
        lastCloudSyncedAt: new Date().toISOString()
    }, "loadCloudWorksSuccess");
    await retryPendingCloudSave({ silent: true });
    return result;
}

async function ensureCloudWorkLoaded(workId) {
    if (!workId) {
        return {
            ok: false,
            errorCode: "WORK_ID_REQUIRED",
            message: "作品不存在或已删除"
        };
    }

    setWorkStatePatch({
        cloudDetailStatus: "loading",
        cloudError: ""
    }, "ensureCloudWorkLoadedStart");

    const result = await getWork(workId);

    if (result.ok !== true) {
        const message = getStatusMessage(result, "作品不存在或已删除");
        const localWork = store.getState().workState.workMap[workId];
        setWorkStatePatch({
            cloudDetailStatus: "failed",
            cloudError: message
        }, "ensureCloudWorkLoadedFailed");
        if (!localWork || result.errorCode === "WORK_NOT_FOUND") {
            showToast(message);
        }
        return result;
    }

    const data = result.data || {};
    const works = data.work ? [data.work] : [];
    syncCloudWorksToStore(works, data.versions || []);
    setWorkStatePatch({
        cloudDetailStatus: "success",
        cloudError: "",
        lastCloudSyncedAt: new Date().toISOString()
    }, "ensureCloudWorkLoadedSuccess");
    return result;
}

const TERMINAL_SAVE_WORK_ERRORS = new Set([
    "SAVE_WORK_TASK_REQUIRED",
    "SAVE_WORK_TASK_NOT_FOUND",
    "SAVE_WORK_REFERENCE_MISMATCH",
    "SAVE_WORK_RESULT_INVALID",
    "SAVE_WORK_LEGACY_PAYLOAD_REJECTED",
    "WORK_ALREADY_DELETED"
]);

function normalizeSaveReferences(references) {
    return {
        taskId: typeof references.taskId === "string" ? references.taskId.trim() : "",
        workId: typeof references.workId === "string" ? references.workId.trim() : "",
        versionId: typeof references.versionId === "string" ? references.versionId.trim() : ""
    };
}

async function refreshRecoveredWork(workId) {
    const result = await getWork(workId);
    if (result.ok !== true) {
        return result;
    }
    const data = result.data || {};
    syncCloudWorksToStore(data.work ? [data.work] : [], data.versions || []);
    return result;
}

async function saveWorkReferences(references, options = {}) {
    const normalized = normalizeSaveReferences(references);
    if (!normalized.taskId) {
        return {
            ok: false,
            errorCode: "SAVE_WORK_TASK_REQUIRED",
            message: "缺少生成任务引用，无法恢复云端作品"
        };
    }
    if (!normalized.workId || !normalized.versionId) {
        return {
            ok: false,
            errorCode: "SAVE_WORK_REFERENCE_MISMATCH",
            message: "作品恢复引用不完整"
        };
    }

    setPendingCloudSave(normalized, {
        createdAt: options.createdAt
    });
    setWorkStatusMap("cloudSaveStatusMap", normalized.workId, "loading", "saveWorkReferencesStart", {
        cloudError: ""
    });

    const result = await saveWorkBundle({
        taskId: normalized.taskId,
        workId: normalized.workId,
        versionId: normalized.versionId,
        reason: "client_recovery"
    });

    if (result.ok !== true) {
        if (TERMINAL_SAVE_WORK_ERRORS.has(result.errorCode)) {
            clearPendingCloudSave(normalized.workId, normalized.versionId, "clearTerminalPendingCloudSave");
        }
        setWorkStatusMap("cloudSaveStatusMap", normalized.workId, "failed", "saveWorkReferencesFailed", {
            cloudError: getStatusMessage(result, "作品已生成，但暂时未同步到云端")
        });
        if (!options.silent) {
            showToast("生成结果已完成，但云端保存失败。稍后进入作品页会自动重试。");
        }
        return result;
    }

    clearPendingCloudSave(normalized.workId, normalized.versionId, "clearPendingCloudSaveAfterSuccess");
    const refreshResult = await refreshRecoveredWork(normalized.workId);
    if (refreshResult.ok !== true) {
        setWorkStatusMap("cloudSaveStatusMap", normalized.workId, "failed", "refreshRecoveredWorkFailed", {
            cloudError: getStatusMessage(refreshResult, "作品已恢复，请稍后刷新云端数据")
        });
        return {
            ...refreshResult,
            saveRecovered: true,
            errorCode: "SAVE_WORK_REFRESH_FAILED"
        };
    }

    setWorkStatusMap("cloudSaveStatusMap", normalized.workId, "success", "saveWorkReferencesSuccess", {
        cloudError: "",
        lastCloudSyncedAt: new Date().toISOString()
    });
    return {
        ...result,
        refreshed: true
    };
}

async function saveCurrentWorkToCloud(work, version, options = {}) {
    return saveWorkReferences({
        taskId: options.taskId,
        workId: work && work.workId,
        versionId: version && version.versionId
    }, options);
}

async function retryPendingCloudSave(options = {}) {
    const currentPending = store.getState().workState.pendingCloudSave;
    const readResult = currentPending
        ? { pending: currentPending, errorCode: "" }
        : readPendingCloudSaveResult();
    const pending = readResult.pending;
    if (!pending) {
        const notice = consumePendingCloudSaveNotice();
        const errorCode = readResult.errorCode || (notice && notice.errorCode);
        if (errorCode) {
            const message = (notice && notice.message) || "待同步记录已失效，请重新进入作品页刷新";
            setWorkStatePatch({
                cloudError: message
            }, "pendingCloudSaveUnavailable");
            if (!options.silent || errorCode === "PENDING_CLOUD_SAVE_LEGACY_DROPPED") {
                showToast(message);
            }
            return {
                ok: false,
                skipped: true,
                errorCode,
                message
            };
        }
        return {
            ok: true,
            skipped: true
        };
    }

    if (isPendingCloudSaveExpired(pending)) {
        clearPendingCloudSave(pending.workId, pending.versionId, "clearExpiredPendingCloudSave");
        return {
            ok: false,
            skipped: true,
            errorCode: "PENDING_CLOUD_SAVE_EXPIRED",
            message: "待同步作品已过期"
        };
    }

    if (!currentPending) {
        store.setState((state) => ({
            workState: {
                ...state.workState,
                pendingCloudSave: pending
            }
        }), "restorePendingCloudSaveBeforeRetry");
    }

    const result = await saveWorkReferences(pending, {
        createdAt: pending.createdAt,
        silent: options.silent
    });
    if (result.ok === true && !options.silent) {
        showToast("作品已重新同步到云端", "success");
    }
    return result;
}

async function retrySaveWorkToCloud(workId) {
    const pending = store.getState().workState.pendingCloudSave || readPendingCloudSave();
    if (!pending || pending.workId !== workId) {
        return {
            ok: false,
            errorCode: "SAVE_WORK_TASK_REQUIRED",
            message: "缺少生成任务引用，无法重试云端恢复"
        };
    }
    return retryPendingCloudSave();
}

async function deleteCloudWorkOnly(workId) {
    if (!workId) {
        return {
            ok: false,
            errorCode: "WORK_ID_REQUIRED",
            message: "删除失败，请稍后重试"
        };
    }

    setWorkStatusMap("cloudDeleteStatusMap", workId, "loading", "deleteCloudWorkStart", {
        cloudError: ""
    });

    const result = await deleteWork(workId);

    if (result.ok !== true) {
        setWorkStatusMap("cloudDeleteStatusMap", workId, "failed", "deleteCloudWorkFailed", {
            cloudError: getStatusMessage(result, "删除失败，请稍后重试")
        });
        return result;
    }

    setWorkStatusMap("cloudDeleteStatusMap", workId, "success", "deleteCloudWorkSuccess", {
        cloudError: "",
        lastCloudSyncedAt: new Date().toISOString()
    });
    clearPendingCloudSave(workId, "", "clearPendingCloudSaveAfterDelete");
    return result;
}

async function deleteCloudWorkAndUpdateStore(workId) {
    return deleteCloudWorkOnly(workId);
}

module.exports = {
    syncCloudWorksToStore,
    loadCloudWorks,
    ensureCloudWorkLoaded,
    clearPendingCloudSave,
    saveCurrentWorkToCloud,
    retryPendingCloudSave,
    retrySaveWorkToCloud,
    deleteCloudWorkOnly,
    deleteCloudWorkAndUpdateStore
};
