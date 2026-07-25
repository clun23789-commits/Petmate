"use strict";

const cloudUser = require("../cloud/user");
const { getServiceMode } = require("../runtime");

const userMode = getServiceMode("user");
// userMode is cloud-with-local-fallback by default; this file remains the unified user service entry.

function getErrorMessage(error, fallback) {
    return error && error.message ? error.message : fallback;
}

async function syncUser() {
    try {
        return await cloudUser.syncUser();
    } catch (error) {
        console.error("syncUser service failed", error);
        return {
            ok: false,
            errorCode: "SYNC_USER_UNAVAILABLE",
            message: getErrorMessage(error, "用户同步失败")
        };
    }
}

async function updateUserProfile(profile) {
    try {
        return await cloudUser.updateUserProfile(profile);
    } catch (error) {
        console.error("updateUserProfile service failed", error);
        return {
            ok: false,
            errorCode: "UPDATE_USER_PROFILE_UNAVAILABLE",
            message: getErrorMessage(error, "用户资料更新失败")
        };
    }
}

module.exports = {
    syncUser,
    updateUserProfile
};
