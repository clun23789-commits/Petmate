"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteWorkById = deleteWorkById;
const generation_1 = require("../services/generation");
const payment_1 = require("../services/payment");
const share_1 = require("../services/share");
const createStore_1 = require("../store/core/createStore");
const navigation_1 = require("../utils/navigation");
const toast_1 = require("../utils/toast");
const { clearPendingCloudSave, deleteCloudWorkOnly } = require("./workSyncFlow");

async function deleteWorkById(workId) {
    const state = createStore_1.store.getState();
    const work = state.workState.workMap[workId];
    if (!work) {
        return false;
    }
    const requiresCloudDelete = work.cloudSynced === true || work.source === "cloud";
    const successMessage = requiresCloudDelete ? "作品已删除" : "本地作品已删除";
    if (requiresCloudDelete) {
        const result = await deleteCloudWorkOnly(workId);
        if (result.ok !== true) {
            (0, toast_1.showToast)("删除失败，请稍后重试");
            return false;
        }
    }
    clearPendingCloudSave(workId, "", "clearPendingCloudSaveBeforeDeleteWorkById");
    const versionIds = new Set(work.versionIds || []);
    if (work.currentVersionId) {
        versionIds.add(work.currentVersionId);
    }
    const nextWorkMap = { ...state.workState.workMap };
    delete nextWorkMap[workId];
    const nextVersionMap = { ...state.workState.versionMap };
    versionIds.forEach((versionId) => {
        delete nextVersionMap[versionId];
    });
    const nextWorkOrder = state.workState.workOrder.filter((item) => item !== workId);
    const nextCurrentWorkId = state.workState.currentWorkId === workId
        ? nextWorkOrder[0] || ""
        : state.workState.currentWorkId;
    const nextCurrentWork = nextCurrentWorkId ? nextWorkMap[nextCurrentWorkId] : null;
    const nextCurrentVersionId = nextCurrentWork && nextVersionMap[nextCurrentWork.currentVersionId]
        ? nextCurrentWork.currentVersionId
        : "";
    const nextEntitlementMap = { ...state.arState.entitlementMapByWorkId };
    delete nextEntitlementMap[workId];
    const nextOrderMap = { ...state.paymentState.orderMap };
    let clearedCurrentOrder = false;
    Object.keys(nextOrderMap).forEach((orderId) => {
        if ((nextOrderMap[orderId] === null || nextOrderMap[orderId] === void 0 ? void 0 : nextOrderMap[orderId].workId) === workId) {
            if (state.paymentState.currentOrderId === orderId) {
                clearedCurrentOrder = true;
            }
            delete nextOrderMap[orderId];
        }
    });
    const nextSuggestionMap = { ...state.optimizeState.lastSuggestionMap };
    delete nextSuggestionMap[workId];
    let releasedReservationCount = 0;
    const nextReservationMap = Object.keys(state.optimizeState.reservationMap).reduce((result, reservationId) => {
        const reservation = state.optimizeState.reservationMap[reservationId];
        if ((reservation === null || reservation === void 0 ? void 0 : reservation.workId) === workId) {
            if (reservation.status === "reserved") {
                releasedReservationCount += 1;
            }
            return result;
        }
        result[reservationId] = reservation;
        return result;
    }, {});
    let clearedActiveTask = false;
    const nextTaskMap = Object.keys(state.generationState.taskMap).reduce((result, taskId) => {
        const task = state.generationState.taskMap[taskId];
        if ((task === null || task === void 0 ? void 0 : task.workId) === workId) {
            if (state.generationState.activeTaskId === taskId) {
                clearedActiveTask = true;
            }
            return result;
        }
        result[taskId] = task;
        return result;
    }, {});
    createStore_1.store.setState((current) => ({
        workState: {
            ...current.workState,
            workMap: nextWorkMap,
            versionMap: nextVersionMap,
            workOrder: nextWorkOrder,
            currentWorkId: nextCurrentWorkId,
            currentVersionId: nextCurrentVersionId,
            activeWorkStatus: nextCurrentWork ? nextCurrentWork.status : "idle",
            cloudSaveStatusMap: {
                ...current.workState.cloudSaveStatusMap,
                [workId]: "idle"
            },
            cloudDeleteStatusMap: {
                ...current.workState.cloudDeleteStatusMap,
                [workId]: requiresCloudDelete ? "success" : "idle"
            },
            pendingCloudSave: current.workState.pendingCloudSave && current.workState.pendingCloudSave.workId === workId
                ? null
                : current.workState.pendingCloudSave
        },
        arState: {
            ...current.arState,
            entitlementMapByWorkId: nextEntitlementMap,
            lastSessionWorkId: current.arState.lastSessionWorkId === workId ? "" : current.arState.lastSessionWorkId
        },
        paymentState: {
            ...current.paymentState,
            orderMap: nextOrderMap,
            currentOrderId: clearedCurrentOrder ? "" : current.paymentState.currentOrderId,
            paymentStatus: clearedCurrentOrder ? "idle" : current.paymentState.paymentStatus,
            entitlementSyncStatus: clearedCurrentOrder ? "none" : current.paymentState.entitlementSyncStatus
        },
        optimizeState: {
            ...current.optimizeState,
            reservedCount: Math.max(0, current.optimizeState.reservedCount - releasedReservationCount),
            reservationMap: nextReservationMap,
            lastSuggestionMap: nextSuggestionMap
        },
        generationState: {
            ...current.generationState,
            taskMap: nextTaskMap,
            activeTaskId: clearedActiveTask ? "" : current.generationState.activeTaskId,
            currentPhase: clearedActiveTask ? "idle" : current.generationState.currentPhase,
            failureReason: clearedActiveTask ? "" : current.generationState.failureReason
        },
        shareState: current.shareState.sharedWorkId === workId
            ? {
                ...current.shareState,
                sharedWorkId: "",
                shareStatus: "idle"
            }
            : current.shareState
    }), "deleteWorkById");
    (0, payment_1.clearOrdersByWorkId)(workId);
    (0, generation_1.clearTasksByWorkId)(workId);
    let finalSuccessMessage = successMessage;
    try {
        await (0, share_1.expireSharePayloadsForWork)(workId);
    } catch (error) {
        console.warn("expireSharePayloadsForWork failed", error);
        finalSuccessMessage = "作品已删除，分享同步可能稍后完成";
    }
    (0, toast_1.showToast)(finalSuccessMessage);
    if (nextWorkOrder.length) {
        (0, navigation_1.replace)("/pages/works/generated-list/index");
        return true;
    }
    (0, navigation_1.switchTab)("/pages/works/index/index");
    return true;
}
