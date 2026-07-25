"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectRemainingOptimizeCount = selectRemainingOptimizeCount;
exports.selectCurrentWork = selectCurrentWork;
exports.selectWorkById = selectWorkById;
exports.selectVersionById = selectVersionById;
exports.selectCurrentVersion = selectCurrentVersion;
exports.selectWorkVersions = selectWorkVersions;
exports.selectWorkSuggestions = selectWorkSuggestions;
exports.selectWorkFeedback = selectWorkFeedback;
exports.selectCloudSaveStatus = selectCloudSaveStatus;
exports.selectCloudDeleteStatus = selectCloudDeleteStatus;
exports.selectUploadViews = selectUploadViews;
exports.hasSelectedDimension = hasSelectedDimension;
exports.selectCanonicalUploadQualityStatus = selectCanonicalUploadQualityStatus;
exports.selectUploadStatusSummary = selectUploadStatusSummary;
exports.selectCanonicalGenerationStatus = selectCanonicalGenerationStatus;
exports.selectGenerationStatusSummary = selectGenerationStatusSummary;
exports.selectAdUnlockSummary = selectAdUnlockSummary;
const formatter_1 = require("../../utils/formatter");
function normalizeCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
function selectRemainingOptimizeCount(state) {
    const grantedCount = normalizeCount(state.optimizeState.grantedCount);
    const usedCount = normalizeCount(state.optimizeState.usedCount);
    const reservedCount = normalizeCount(state.optimizeState.reservedCount);
    return Math.max(0, grantedCount - usedCount - reservedCount);
}
function selectCurrentWork(state) {
    const workId = state.workState.currentWorkId;
    return workId ? state.workState.workMap[workId] : null;
}
function selectWorkById(state, workId) {
    return state.workState.workMap[workId] || null;
}
function selectVersionById(state, versionId) {
    return state.workState.versionMap[versionId] || null;
}
function selectCurrentVersion(state) {
    const versionId = state.workState.currentVersionId;
    return versionId ? state.workState.versionMap[versionId] : null;
}
function selectWorkVersions(state, workId) {
    const work = state.workState.workMap[workId];
    if (!work) {
        return [];
    }
    return work.versionIds.map((versionId) => state.workState.versionMap[versionId]).filter(Boolean);
}
function selectWorkSuggestions(state, workId) {
    return state.optimizeState.lastSuggestionMap[workId] || [];
}
function selectWorkFeedback(state, workId) {
    var _a;
    const work = selectWorkById(state, workId);
    if (!work || !work.currentVersionId) {
        return {};
    }
    return ((_a = state.workState.versionMap[work.currentVersionId]) === null || _a === void 0 ? void 0 : _a.feedbackSummary) || {};
}
function selectCloudSaveStatus(state, workId) {
    return state.workState.cloudSaveStatusMap[workId] || "idle";
}
function selectCloudDeleteStatus(state, workId) {
    return state.workState.cloudDeleteStatusMap[workId] || "idle";
}
function getUsableUploadAssets(state) {
    return state.uploadState.assets.filter((asset) => asset && asset.uploadStatus !== "failed" && asset.uploadStatus !== "uploading");
}
function selectUploadViews(state) {
    return getUsableUploadAssets(state).map((asset) => asset.viewType);
}
function hasSelectedDimension(feedback) {
    return Object.values(feedback).some((item) => (item === null || item === void 0 ? void 0 : item.value) === "unlike");
}
function selectCanonicalUploadQualityStatus(state) {
    const { qualityCheckStatus, latestFailureReason } = state.uploadState;
    const usableAssets = getUsableUploadAssets(state);
    if (latestFailureReason === "permission_error") {
        return "permissionError";
    }
    if (qualityCheckStatus === "failed") {
        return "failed";
    }
    if (qualityCheckStatus === "rejected") {
        return "lowQuality";
    }
    if (qualityCheckStatus === "pending") {
        return usableAssets.length ? "partial" : "empty";
    }
    if (qualityCheckStatus === "needs_more") {
        return usableAssets.length ? "partial" : "empty";
    }
    return usableAssets.length >= 2 ? "enough" : "partial";
}
function selectUploadStatusSummary(state) {
    const status = selectCanonicalUploadQualityStatus(state);
    const missingViews = state.uploadState.missingViews.map((view) => (0, formatter_1.formatUploadView)(view));
    const canContinue = status === "partial" || status === "enough";
    const hint = state.uploadState.latestActionMessage || (0, formatter_1.formatUploadQualityStatus)(status);
    return {
        status,
        canContinue,
        label: (0, formatter_1.formatUploadQualityStatus)(status),
        hint,
        missingText: missingViews.join("、")
    };
}
function selectCanonicalGenerationStatus(state) {
    const phase = state.generationState.currentPhase;
    if (phase === "idle") {
        return getUsableUploadAssets(state).length ? "uploading" : "idle";
    }
    if (phase === "queued") {
        return "queueing";
    }
    if (phase === "fetching_assets") {
        return "uploading";
    }
    if (phase === "finalizing") {
        return "generating";
    }
    if (phase === "completed") {
        return "success";
    }
    if (phase === "timeout") {
        return "failed";
    }
    return "failed";
}
function selectGenerationStatusSummary(state) {
    const status = selectCanonicalGenerationStatus(state);
    return {
        status,
        label: (0, formatter_1.formatGenerationStatus)(status),
        reason: state.generationState.failureReason
    };
}
function selectAdUnlockSummary(state) {
    return {
        status: state.trialState.unlockStatus,
        message: state.trialState.latestUnlockMessage
    };
}
