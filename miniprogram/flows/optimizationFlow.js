"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateFeedback = updateFeedback;
exports.submitResultOptimization = submitResultOptimization;
exports.submitTargetedOptimization = submitTargetedOptimization;
exports.openTargetedUpload = openTargetedUpload;
exports.saveDetailRetouch = saveDetailRetouch;
const optimization_1 = require("../services/optimization");
const createStore_1 = require("../store/core/createStore");
const index_1 = require("../store/selectors/index");
const id_1 = require("../utils/id");
const navigation_1 = require("../utils/navigation");
const { PAGE_ROUTES } = require("../utils/routes");
const toast_1 = require("../utils/toast");
const creationFlow_1 = require("./creationFlow");
const optimizeQuota_1 = require("./optimizeQuota");
const { saveCurrentWorkToCloud } = require("./workSyncFlow");
const TARGETED_REQUIRED_VIEW = {
    fur: "front",
    pattern: "pattern",
    body: "full",
    face: "front",
    ears: "ear",
    tail: "tail"
};
async function updateFeedback(workId, dimension, value) {
    const work = (0, index_1.selectWorkById)(createStore_1.store.getState(), workId);
    if (!work || !work.currentVersionId) {
        return {
            ok: false,
            errorCode: "FEEDBACK_WORK_INVALID",
            message: "作品信息不完整，无法保存反馈"
        };
    }
    const currentVersion = createStore_1.store.getState().workState.versionMap[work.currentVersionId];
    if (!currentVersion) {
        return {
            ok: false,
            errorCode: "FEEDBACK_VERSION_INVALID",
            message: "作品版本信息缺失，无法保存反馈"
        };
    }
    const feedbackSummary = {
        ...currentVersion.feedbackSummary,
        [dimension]: {
            value
        }
    };
    const suggestions = (0, optimization_1.resolveSuggestions)(feedbackSummary);
    const now = new Date().toISOString();
    const updatedVersion = {
        ...currentVersion,
        workId,
        feedbackSummary,
        updatedAt: now
    };
    const updatedWork = {
        ...work,
        updatedAt: now
    };
    createStore_1.store.setState((state) => ({
        workState: {
            ...state.workState,
            workMap: {
                ...state.workState.workMap,
                [workId]: updatedWork
            },
            versionMap: {
                ...state.workState.versionMap,
                [currentVersion.versionId]: updatedVersion
            }
        },
        optimizeState: {
            ...state.optimizeState,
            lastSuggestionMap: {
                ...state.optimizeState.lastSuggestionMap,
                [workId]: suggestions
            }
        }
    }), "updateFeedback");

    return saveCurrentWorkToCloud(updatedWork, updatedVersion);
}
async function reserveOptimization(workId, source) {
    const work = (0, index_1.selectWorkById)(createStore_1.store.getState(), workId);
    if (!work || !work.currentVersionId) {
        return null;
    }
    const feedbackSummary = createStore_1.store.getState().workState.versionMap[work.currentVersionId].feedbackSummary;
    if (!(0, optimization_1.isValidOptimizeFeedback)(feedbackSummary)) {
        (0, toast_1.showToast)("先选择至少一个“不像”的维度，再提交本轮优化。");
        return null;
    }
    if ((0, index_1.selectRemainingOptimizeCount)(createStore_1.store.getState()) <= 0) {
        createStore_1.store.setState((state) => ({
            trialState: {
                ...state.trialState,
                pendingReturnRoute: `${PAGE_ROUTES.works.result}?workId=${workId}`
            }
        }), "setOptimizeReturn");
        (0, navigation_1.navigate)(PAGE_ROUTES.works.adUnlock, {
            source: "optimize_refill",
            returnTo: `${PAGE_ROUTES.works.result}?workId=${workId}`
        });
        return null;
    }
    const dimensions = Object.entries(feedbackSummary)
        .filter(([, item]) => (item === null || item === void 0 ? void 0 : item.value) === "unlike")
        .map(([dimension]) => dimension);
    try {
        return await (0, optimizeQuota_1.reserveOptimizationQuota)({
            workId,
            source,
            dimensionSet: dimensions
        });
    }
    catch (error) {
        if (error && error.errorCode === "OPTIMIZE_QUOTA_NOT_ENOUGH") {
            createStore_1.store.setState((state) => ({
                trialState: {
                    ...state.trialState,
                    pendingReturnRoute: `${PAGE_ROUTES.works.result}?workId=${workId}`
                }
            }), "setOptimizeReturnCloud");
            (0, navigation_1.navigate)(PAGE_ROUTES.works.adUnlock, {
                source: "optimize_refill",
                returnTo: `${PAGE_ROUTES.works.result}?workId=${workId}`
            });
            return null;
        }
        (0, toast_1.showToast)("优化次数确认失败，请稍后重试");
        return null;
    }
}
async function submitResultOptimization(workId, simulateFailure = false) {
    const reservation = await reserveOptimization(workId, "result");
    if (!reservation) {
        return;
    }
    const task = await (0, creationFlow_1.startGenerationFromUpload)({
        workId,
        operationType: "optimize",
        reservationId: reservation.reservationId,
        dimensionSet: reservation.dimensionSet,
        simulateFailure,
        qualityMode: "skip"
    });
    if (!task) {
        await (0, optimizeQuota_1.releaseOptimizationReservation)(reservation.reservationId);
    }
}
async function submitTargetedOptimization(workId, dimension, simulateFailure = false) {
    await updateFeedback(workId, dimension, "unlike");
    const reservation = await reserveOptimization(workId, "targeted_upload");
    if (!reservation) {
        return;
    }
    const task = await (0, creationFlow_1.startGenerationFromUpload)({
        workId,
        operationType: "targeted_upload",
        reservationId: reservation.reservationId,
        dimensionSet: reservation.dimensionSet,
        simulateFailure,
        qualityMode: "supplement",
        requiredViews: [TARGETED_REQUIRED_VIEW[dimension]]
    });
    if (!task) {
        await (0, optimizeQuota_1.releaseOptimizationReservation)(reservation.reservationId);
    }
}
function openTargetedUpload(workId, dimension) {
    (0, navigation_1.navigate)(PAGE_ROUTES.works.targetedUpload, {
        workId,
        dimension
    });
}
async function saveDetailRetouch(workId, versionId, color, note) {
    const currentVersion = createStore_1.store.getState().workState.versionMap[versionId];
    const currentWork = createStore_1.store.getState().workState.workMap[workId];
    if (!currentVersion || !currentWork) {
        return {
            ok: false,
            errorCode: "DETAIL_RETOUCH_INVALID",
            message: "当前作品信息缺失，请返回结果页重试"
        };
    }
    const now = new Date().toISOString();
    const currentTexture = currentVersion.editableTexture || {};
    const currentNotes = Array.isArray(currentTexture.notes) ? currentTexture.notes : [];
    const newVersion = {
        ...currentVersion,
        versionId: (0, id_1.createId)("version"),
        workId,
        sourceType: "detail_retouch",
        editableTexture: {
            baseColor: color,
            ...currentTexture,
            baseColor: color,
            notes: [...currentNotes, note || "已完成局部补色保存"]
        },
        createdAt: now,
        updatedAt: now
    };
    const nextWork = {
        ...currentWork,
        status: "retouched",
        currentVersionId: newVersion.versionId,
        updatedAt: now,
        versionIds: currentWork.versionIds.includes(newVersion.versionId)
            ? currentWork.versionIds
            : [...currentWork.versionIds, newVersion.versionId]
    };
    createStore_1.store.setState((state) => ({
        workState: {
            ...state.workState,
            versionMap: {
                ...state.workState.versionMap,
                [newVersion.versionId]: newVersion
            },
            workMap: {
                ...state.workState.workMap,
                [workId]: nextWork
            },
            currentVersionId: newVersion.versionId,
            activeWorkStatus: "retouched"
        }
    }), "saveDetailRetouch");

    const saveResult = await saveCurrentWorkToCloud(nextWork, newVersion);

    if (saveResult.ok !== true) {
        return {
            ok: false,
            errorCode: "DETAIL_RETOUCH_SAVE_FAILED",
            message: saveResult.message || "细节补色已在本地保存，但云端同步失败，请重试",
            workId,
            versionId: newVersion.versionId,
            cloudSaved: false
        };
    }

    return {
        ok: true,
        workId,
        versionId: newVersion.versionId,
        cloudSaved: true
    };
}
