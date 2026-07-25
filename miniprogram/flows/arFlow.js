"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enterArGuide = enterArGuide;
exports.enterArEntry = enterArEntry;
exports.continueFromArGuide = continueFromArGuide;
exports.openArView = openArView;
exports.syncArEntitlement = syncArEntitlement;

const { getArEntitlement } = require("../services/entitlement");
const createStore_1 = require("../store/core/createStore");
const navigation_1 = require("../utils/navigation");
const { withReturnContext } = require("../utils/navigationContext");
const { PAGE_ROUTES } = require("../utils/routes");
const toast_1 = require("../utils/toast");

const AR_UNAVAILABLE_TEXT = "AR 功能暂未开放，后续版本开放。";

function writeEntitlementCache(workId, entitlement) {
    createStore_1.store.setState((state) => {
        const nextMap = { ...state.arState.entitlementMapByWorkId };
        if (entitlement && entitlement.status === "active") {
            nextMap[workId] = {
                ...entitlement,
                workId,
                status: "active",
                lastOrderId: entitlement.orderId || entitlement.lastOrderId || "",
                activatedAt: entitlement.activatedAt || new Date().toISOString()
            };
        }
        else {
            delete nextMap[workId];
        }
        return {
            arState: {
                ...state.arState,
                entitlementMapByWorkId: nextMap
            }
        };
    }, "writeArEntitlementCache");
}

async function syncArEntitlement(workId) {
    if (!workId) {
        return null;
    }
    try {
        const result = await getArEntitlement({ workId });
        if (result.ok && result.hasEntitlement && result.entitlement) {
            writeEntitlementCache(workId, result.entitlement);
            return result.entitlement;
        }
        if (result.ok && result.hasEntitlement === false && !result.cloudQueryFailed) {
            writeEntitlementCache(workId, null);
        }
    }
    catch (error) {
        console.error("syncArEntitlement failed", error);
    }
    return null;
}

function enterArGuide(workId, options = {}) {
    navigation_1.navigate(PAGE_ROUTES.works.arGuide, withReturnContext({ workId }, options));
}

function routeWithMode(path, query, mode) {
    if (mode === "replace") {
        navigation_1.replace(path, query);
        return;
    }
    navigation_1.navigate(path, query);
}

async function enterArEntry(workId, options = {}) {
    if (!workId) {
        toast_1.showToast("作品信息缺失，请返回作品列表后重试");
        return false;
    }
    await syncArEntitlement(workId);
    toast_1.showToast(AR_UNAVAILABLE_TEXT);
    routeWithMode(PAGE_ROUTES.works.arGuide, withReturnContext({ workId }, options), options.mode || "navigate");
    return true;
}

async function continueFromArGuide(workId, options = {}) {
    await syncArEntitlement(workId);
    toast_1.showToast(AR_UNAVAILABLE_TEXT);
    navigation_1.replace(PAGE_ROUTES.works.arGuide, withReturnContext({ workId }, options));
}

async function openArView(workId, mode = "success", options = {}) {
    createStore_1.store.setState((state) => ({
        arState: {
            ...state.arState,
            initStatus: "failed",
            failureReason: AR_UNAVAILABLE_TEXT,
            lastSessionWorkId: workId
        }
    }), "arUnavailable");
    toast_1.showToast(AR_UNAVAILABLE_TEXT);
    navigation_1.replace(PAGE_ROUTES.works.arFailure, withReturnContext({
        workId,
        reason: AR_UNAVAILABLE_TEXT,
        reasonType: "ar_unavailable"
    }, options));
    return false;
}
