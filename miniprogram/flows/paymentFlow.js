"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPayment = startPayment;
exports.retryPaymentSync = retryPaymentSync;
const { grantArEntitlement, getArEntitlement } = require("../services/entitlement");
const { createPaymentOrder, requestPayment, markPaymentPaid } = require("../services/payment");
const { mockRights } = require("../mocks/data/mockRights");
const createStore_1 = require("../store/core/createStore");
const toast_1 = require("../utils/toast");
function normalizeOrder(rawOrder = {}) {
    return {
        ...rawOrder,
        orderId: rawOrder.orderId || "",
        workId: rawOrder.workId || "",
        amount: rawOrder.amount || mockRights.currentWorkArPrice,
        currency: rawOrder.currency || "CNY",
        paymentStatus: rawOrder.paymentStatus || rawOrder.status || "pending",
        status: rawOrder.status || rawOrder.paymentStatus || "pending",
        entitlementStatus: rawOrder.entitlementStatus || "none"
    };
}
function isMockPaymentOrder(order = {}) {
    return order.paymentMode === "mock" &&
        order.paymentProvider === "mock" &&
        order.paymentParams &&
        order.paymentParams.mode === "mock";
}
function writeOrder(order, label) {
    const normalized = normalizeOrder(order);
    if (!normalized.orderId) {
        return;
    }
    createStore_1.store.setState((state) => ({
        paymentState: {
            ...state.paymentState,
            orderMap: {
                ...state.paymentState.orderMap,
                [normalized.orderId]: normalized
            },
            currentOrderId: normalized.orderId,
            paymentStatus: normalized.paymentStatus,
            entitlementSyncStatus: normalized.entitlementStatus
        }
    }), label);
}
function activateEntitlement(workId, orderId, status, entitlement = {}) {
    createStore_1.store.setState((state) => ({
        arState: {
            ...state.arState,
            entitlementMapByWorkId: {
                ...state.arState.entitlementMapByWorkId,
                [workId]: {
                    ...entitlement,
                    workId,
                    status,
                    activatedAt: entitlement.activatedAt || new Date().toISOString(),
                    lastOrderId: orderId
                }
            }
        }
    }), "activateEntitlement");
}
async function syncExistingEntitlement(workId) {
    const result = await getArEntitlement({ workId });
    if (result.ok && result.hasEntitlement && result.entitlement) {
        activateEntitlement(workId, result.entitlement.orderId || "", "active", result.entitlement);
        return result.entitlement;
    }
    if (result.ok && result.hasEntitlement === false) {
        createStore_1.store.setState((state) => {
            const nextMap = { ...state.arState.entitlementMapByWorkId };
            delete nextMap[workId];
            return {
                arState: {
                    ...state.arState,
                    entitlementMapByWorkId: nextMap
                }
            };
        }, "clearMissingArEntitlement");
    }
    return null;
}
async function startPayment(workId, mode = "success") {
    const existingCloudEntitlement = await syncExistingEntitlement(workId);
    const entitlement = existingCloudEntitlement || createStore_1.store.getState().arState.entitlementMapByWorkId[workId];
    if ((entitlement === null || entitlement === void 0 ? void 0 : entitlement.status) === "active") {
        (0, toast_1.showToast)("当前宠物作品 AR 权益已可使用", "success");
        return null;
    }
    if ((entitlement === null || entitlement === void 0 ? void 0 : entitlement.status) === "pending_sync") {
        (0, toast_1.showToast)("正在确认当前作品 AR 权益，请先重新查询", "none");
        return null;
    }
    const order = await createPaymentOrder({
        workId,
        productType: "ar_unlock",
        amount: mockRights.currentWorkArPrice,
        currency: "CNY"
    });
    if (order && order.errorCode === "AR_ALREADY_UNLOCKED") {
        const syncedEntitlement = await syncExistingEntitlement(workId);
        if (syncedEntitlement) {
            (0, toast_1.showToast)("当前宠物作品 AR 权益已可使用", "success");
        }
        else {
            (0, toast_1.showToast)(order.message || "当前作品已解锁 AR 权益，请稍后重新查询。");
        }
        return null;
    }
    if (!order || !order.ok || !order.orderId) {
        (0, toast_1.showToast)((order && order.message) || "订单创建失败，请稍后重试。");
        return null;
    }
    writeOrder({
        ...order,
        paymentStatus: "pending",
        entitlementStatus: "none"
    }, "createArPaymentOrder");
    const paymentResult = await requestPayment({
        orderId: order.orderId,
        paymentParams: order.paymentParams,
        scenario: mode
    });
    if (!paymentResult.ok) {
        const nextStatus = paymentResult.status === "cancelled" ? "cancelled" : "failed";
        const nextOrder = {
            ...order,
            status: nextStatus,
            paymentStatus: nextStatus,
            entitlementStatus: "none",
            message: paymentResult.message
        };
        writeOrder(nextOrder, "arPaymentNotCompleted");
        (0, toast_1.showToast)(paymentResult.message || (nextStatus === "cancelled" ? "支付已取消" : "支付失败，请稍后重试"));
        return nextOrder;
    }
    if (!isMockPaymentOrder(order)) {
        const confirmingOrder = {
            ...order,
            status: "confirming",
            paymentStatus: "confirming",
            entitlementStatus: order.entitlementStatus || "none",
            errorCode: "REAL_PAYMENT_CONFIRMATION_NOT_IMPLEMENTED",
            message: "支付请求已完成，正在等待服务端确认支付结果。"
        };
        writeOrder(confirmingOrder, "awaitServerPaymentConfirmation");
        (0, toast_1.showToast)("支付结果正在由服务端确认，请稍后查询");
        return confirmingOrder;
    }
    const paidResult = await markPaymentPaid({
        orderId: order.orderId,
        workId,
        paymentMode: order.paymentMode
    });
    if (!paidResult.ok || paidResult.status !== "paid") {
        const nextOrder = {
            ...order,
            ...paidResult,
            paymentStatus: "failed",
            status: "failed",
            entitlementStatus: "none"
        };
        writeOrder(nextOrder, "arPaymentPaidConfirmFailed");
        (0, toast_1.showToast)((paidResult && paidResult.message) || "支付失败，请稍后重试");
        return nextOrder;
    }
    const paidOrder = {
        ...order,
        ...paidResult,
        paymentStatus: "paid",
        status: "paid",
        entitlementStatus: mode === "pending_sync" ? "pending_sync" : paidResult.entitlementStatus || "pending_sync"
    };
    writeOrder(paidOrder, "markArPaymentPaid");
    if (mode === "pending_sync") {
        (0, toast_1.showToast)("支付已完成，正在确认当前作品权益");
        return paidOrder;
    }
    const entitlementResult = await grantArEntitlement({
        orderId: order.orderId,
        workId
    });
    if (!entitlementResult.ok || !entitlementResult.entitlement) {
        const pendingOrder = {
            ...paidOrder,
            entitlementStatus: "pending_sync"
        };
        writeOrder(pendingOrder, "arEntitlementGrantPending");
        (0, toast_1.showToast)((entitlementResult && entitlementResult.message) || "支付已完成，权益正在确认中");
        return pendingOrder;
    }
    const entitlementResultData = entitlementResult.entitlement;
    activateEntitlement(workId, order.orderId, "active", entitlementResultData);
    const completedOrder = {
        ...paidOrder,
        entitlementStatus: "active"
    };
    writeOrder(completedOrder, "arEntitlementGranted");
    (0, toast_1.showToast)("AR 已解锁", "success");
    return completedOrder;
}
async function retryPaymentSync(orderId) {
    const currentOrder = createStore_1.store.getState().paymentState.orderMap[orderId];
    if (!currentOrder || !currentOrder.workId) {
        (0, toast_1.showToast)("订单信息缺失，请返回后重试。");
        return null;
    }
    const existingEntitlement = await syncExistingEntitlement(currentOrder.workId);
    if (existingEntitlement) {
        const syncedOrder = {
            ...currentOrder,
            paymentStatus: "paid",
            status: "paid",
            entitlementStatus: "active"
        };
        writeOrder(syncedOrder, "retryPaymentSyncExistingEntitlement");
        (0, toast_1.showToast)("AR 权益已确认", "success");
        return syncedOrder;
    }
    const result = await grantArEntitlement({
        orderId,
        workId: currentOrder.workId
    });
    if (!result.ok || !result.entitlement) {
        (0, toast_1.showToast)((result && result.message) || "权益仍在确认中，请稍后重试");
        return null;
    }
    activateEntitlement(currentOrder.workId, orderId, "active", result.entitlement);
    const syncedOrder = {
        ...currentOrder,
        paymentStatus: "paid",
        status: "paid",
        entitlementStatus: "active"
    };
    writeOrder(syncedOrder, "retryPaymentSync");
    (0, toast_1.showToast)("AR 权益已确认", "success");
    return syncedOrder;
}
