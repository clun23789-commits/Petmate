"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapApp = bootstrapApp;
const persist_1 = require("../store/core/persist");
const createStore_1 = require("../store/core/createStore");
const user_1 = require("../services/user");
const navigation_1 = require("../utils/navigation");
const workSyncFlow_1 = require("./workSyncFlow");
let bootstrapped = false;
function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function mapCloudUserToProfile(cloudUser) {
    return {
        nickname: normalizeString(cloudUser && cloudUser.nickname) || "宠爱我家",
        avatarUrl: normalizeString(cloudUser && cloudUser.avatarUrl) || ""
    };
}
async function bootstrapCloudUser() {
    createStore_1.store.setState((state) => ({
        userState: {
            ...state.userState,
            cloudSyncStatus: "loading",
            cloudSyncError: ""
        }
    }), "bootstrapCloudUserStart");
    const result = await (0, user_1.syncUser)();
    if (result.ok !== true) {
        createStore_1.store.setState((state) => ({
            userState: {
                ...state.userState,
                cloudSyncStatus: "failed",
                cloudSyncError: result.message || "用户同步失败"
            }
        }), "bootstrapCloudUserFailed");
        return result;
    }
    const data = result.data || {};
    const cloudUser = data.user || null;
    const cloudOpenid = data.openid || "";
    const userProfile = mapCloudUserToProfile(cloudUser);
    createStore_1.store.setState((state) => ({
        userState: {
            ...state.userState,
            loginStatus: cloudOpenid ? "logged_in" : state.userState.loginStatus,
            userProfile,
            cloudOpenid,
            cloudUser,
            cloudSyncStatus: "success",
            cloudSyncError: ""
        }
    }), "bootstrapCloudUserSuccess");
    await (0, workSyncFlow_1.loadCloudWorks)({ silent: true });
    return result;
}
function bootstrapApp(options) {
    var _a;
    if (bootstrapped) {
        return;
    }
    createStore_1.store.replaceState((0, persist_1.hydrateState)((0, createStore_1.createInitialRootState)()), "bootstrap");
    createStore_1.store.subscribe((state) => {
        (0, persist_1.persistState)(state);
    });
    bootstrapped = true;
    bootstrapCloudUser().catch((error) => {
        console.error("bootstrap cloud user failed", error);
        createStore_1.store.setState((state) => ({
            userState: {
                ...state.userState,
                cloudSyncStatus: "failed",
                cloudSyncError: "用户同步失败"
            }
        }), "bootstrapCloudUserUnhandledFailed");
    });
    const shareId = ((_a = options === null || options === void 0 ? void 0 : options.query) === null || _a === void 0 ? void 0 : _a.shareId) || (options === null || options === void 0 ? void 0 : options.shareId);
    if (shareId) {
        (0, navigation_1.relaunch)("/pages/share/landing/index", { shareId });
    }
}
