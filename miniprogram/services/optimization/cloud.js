"use strict";

function assertCloudReady() {
  if (typeof wx === "undefined" || !wx.cloud || typeof wx.cloud.callFunction !== "function") {
    throw new Error("微信云开发能力不可用，请先确认 app.js 已初始化 wx.cloud");
  }
}

function unwrapCloudEnvelope(response, functionName, defaultErrorCode) {
  if (!response || typeof response !== "object" || !response.result || typeof response.result !== "object") {
    throw new Error(`${functionName} 云函数返回格式异常`);
  }

  const result = response.result;

  if (result.ok !== true && result.ok !== false) {
    throw new Error(`${functionName} 云函数返回格式异常`);
  }

  if (result.ok !== true) {
    const error = new Error(result.message || `${functionName} 云函数调用失败`);
    error.errorCode = result.errorCode || defaultErrorCode;
    error.status = result.status || "error";
    throw error;
  }

  return result.data || {};
}

async function callOptimizeFunction(name, data = {}, defaultErrorCode = "OPTIMIZE_QUOTA_CLOUD_FAILED") {
  assertCloudReady();
  const response = await wx.cloud.callFunction({
    name,
    data
  });

  return unwrapCloudEnvelope(response, name, defaultErrorCode);
}

async function getOptimizeQuota() {
  const data = await callOptimizeFunction("getOptimizeQuota", {}, "OPTIMIZE_QUOTA_GET_FAILED");
  return data.quota;
}

function grantOptimizeQuota(payload = {}) {
  return callOptimizeFunction(
    "grantOptimizeQuota",
    {
      workId: payload.workId || "",
      rewardScene: payload.rewardScene || "",
      source: payload.source || "",
      clientRewardId: payload.clientRewardId || "",
      adGrantId: payload.adGrantId || payload.grantId || ""
    },
    "OPTIMIZE_QUOTA_GRANT_FAILED"
  );
}

function reserveOptimizeQuota(payload = {}) {
  return callOptimizeFunction(
    "reserveOptimizeQuota",
    {
      reservationId: payload.reservationId || "",
      workId: payload.workId || "",
      source: payload.source || "",
      dimensionSet: Array.isArray(payload.dimensionSet) ? payload.dimensionSet : []
    },
    "OPTIMIZE_QUOTA_RESERVE_FAILED"
  );
}

function releaseOptimizeQuota(reservationId) {
  return callOptimizeFunction("releaseOptimizeQuota", { reservationId }, "OPTIMIZE_QUOTA_RELEASE_FAILED");
}

function commitOptimizeQuota(reservationId, taskId) {
  return callOptimizeFunction("commitOptimizeQuota", { reservationId, taskId }, "OPTIMIZE_QUOTA_COMMIT_FAILED");
}

module.exports = {
  getOptimizeQuota,
  grantOptimizeQuota,
  reserveOptimizeQuota,
  releaseOptimizeQuota,
  commitOptimizeQuota
};
