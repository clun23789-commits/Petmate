"use strict";

function assertCloudReady() {
    if (typeof wx === "undefined" || !wx.cloud || typeof wx.cloud.callFunction !== "function") {
        throw new Error("微信云开发能力不可用，请先确认 app.js 已初始化 wx.cloud");
    }
}

function unwrapCloudEnvelope(response, functionName) {
    if (!response || typeof response !== "object" || !response.result || typeof response.result !== "object") {
        throw new Error(`${functionName} 云函数返回格式异常`);
    }
    const result = response.result;
    if (result.ok !== true && result.ok !== false) {
        throw new Error(`${functionName} 云函数返回格式异常`);
    }
    return result;
}

async function syncUser() {
    assertCloudReady();
    const response = await wx.cloud.callFunction({
        name: "syncUser",
        data: {}
    });
    return unwrapCloudEnvelope(response, "syncUser");
}

async function updateUserProfile(profile) {
    assertCloudReady();
    const response = await wx.cloud.callFunction({
        name: "updateUserProfile",
        data: profile || {}
    });
    return unwrapCloudEnvelope(response, "updateUserProfile");
}

module.exports = {
    syncUser,
    updateUserProfile
};
