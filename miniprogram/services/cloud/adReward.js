"use strict";

const { AD_CONFIG } = require("../../config/ad");
const { createId } = require("../../utils/id");

const localRewardGrantMap = {};

function getErrorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}

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

async function callAdRewardFunction(name, data = {}) {
  assertCloudReady();
  const response = await wx.cloud.callFunction({
    name,
    data
  });

  return unwrapCloudEnvelope(response, name);
}

function buildLocalKey(payload = {}) {
  return `${payload.rewardScene || "initial_unlock"}:${payload.clientRewardId || ""}`;
}

function grantLocalAdReward(payload = {}) {
  if (!payload.clientRewardId || !payload.adResult || payload.adResult.status !== "completed") {
    return {
      ok: false,
      status: "rejected",
      message: "广告未完整完成，不能发放试用权益。"
    };
  }

  const key = buildLocalKey(payload);

  if (localRewardGrantMap[key]) {
    return localRewardGrantMap[key];
  }

  const result = {
    ok: true,
    status: "granted",
    grantId: createId("local-ad-grant"),
    clientRewardId: payload.clientRewardId,
    rewardScene: payload.rewardScene || "initial_unlock",
    workId: payload.workId || "",
    source: "local_rewarded_video_ad"
  };

  localRewardGrantMap[key] = result;
  return result;
}

function getLocalAdRewardStatus(payload = {}) {
  const granted = localRewardGrantMap[buildLocalKey(payload)];

  if (!granted) {
    return {
      ok: true,
      status: "not_found",
      clientRewardId: payload.clientRewardId || "",
      rewardScene: payload.rewardScene || "initial_unlock"
    };
  }

  return {
    ...granted,
    ok: true,
    status: "granted"
  };
}

async function grantAdReward(payload = {}) {
  if (!AD_CONFIG.enableAdRewardCloudGrant) {
    return grantLocalAdReward(payload);
  }

  try {
    return await callAdRewardFunction("grantAdReward", payload);
  } catch (error) {
    console.error("grantAdReward service failed", error);
    return {
      ok: false,
      status: "error",
      errorCode: "AD_REWARD_GRANT_UNAVAILABLE",
      message: getErrorMessage(error, "广告权益确认失败，请稍后重试。")
    };
  }
}

async function getAdRewardStatus(payload = {}) {
  if (!AD_CONFIG.enableAdRewardCloudGrant) {
    return getLocalAdRewardStatus(payload);
  }

  try {
    return await callAdRewardFunction("getAdRewardStatus", payload);
  } catch (error) {
    console.error("getAdRewardStatus service failed", error);
    return {
      ok: false,
      status: "error",
      errorCode: "AD_REWARD_STATUS_UNAVAILABLE",
      message: getErrorMessage(error, "广告权益状态查询失败，请稍后重试。")
    };
  }
}

module.exports = {
  grantAdReward,
  getAdRewardStatus
};
