"use strict";

function assertCloudReady() {
    if (typeof wx === "undefined" || !wx.cloud || typeof wx.cloud.callFunction !== "function") {
        throw new Error("微信云开发能力不可用，请先确认 app.js 已初始化 wx.cloud");
    }
}

function unwrapCloudResult(response, functionName) {
    if (!response || typeof response !== "object" || !response.result || typeof response.result !== "object") {
        throw new Error(`${functionName} 云函数返回格式异常`);
    }
    const result = response.result;
    if (result.ok === false) {
        throw new Error(result.message || `${functionName} 云函数调用失败`);
    }
    if (result.ok !== true || !Object.prototype.hasOwnProperty.call(result, "data")) {
        throw new Error(`${functionName} 云函数返回格式异常`);
    }
    return result.data;
}

async function createShare(payload) {
    assertCloudReady();
    const response = await wx.cloud.callFunction({
        name: "createShare",
        data: payload
    });
    return unwrapCloudResult(response, "createShare");
}

async function getShare(shareId, options = {}) {
    assertCloudReady();
    const response = await wx.cloud.callFunction({
        name: "getShare",
        data: {
            shareId,
            trackView: options.trackView !== false
        }
    });
    return unwrapCloudResult(response, "getShare");
}

async function expireSharesForWork(workId) {
    assertCloudReady();
    const response = await wx.cloud.callFunction({
        name: "expireSharesForWork",
        data: { workId }
    });
    return unwrapCloudResult(response, "expireSharesForWork");
}

module.exports = {
    createShare,
    getShare,
    expireSharesForWork
};
