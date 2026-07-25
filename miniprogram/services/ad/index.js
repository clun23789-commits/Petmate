"use strict";

const { AD_CONFIG, AD_SERVICE_MODE } = require("../../config/ad");
const { grantAdReward, getAdRewardStatus } = require("../cloud/adReward");
const { showMockRewardedVideoAd } = require("./mockRewardedVideo");
const { showWechatRewardedVideoAd } = require("./wechatRewardedVideo");

// AD_SERVICE_MODE comes from services/runtime; real rewarded ads stay off while mode is mock.
function buildUnavailableResult(rewardScene) {
  return {
    ok: false,
    status: "unavailable",
    rewardScene,
    message: "广告暂时不可用，请稍后再试",
    raw: {},
    source: "wechat"
  };
}

async function showRewardedAd(options = {}) {
  const rewardScene = options.rewardScene || "initial_unlock";

  if (AD_CONFIG.useRealRewardedAd) {
    if (!AD_CONFIG.rewardedVideoAdUnitId) {
      return buildUnavailableResult(rewardScene);
    }

    return showWechatRewardedVideoAd({
      ...options,
      rewardScene,
      adUnitId: AD_CONFIG.rewardedVideoAdUnitId,
      rewardTimeoutMs: AD_CONFIG.rewardTimeoutMs
    });
  }

  return showMockRewardedVideoAd({
    ...options,
    rewardScene
  });
}

async function watchRewardedAd(source, scenario = "success") {
  const result = await showRewardedAd({
    source,
    scenario,
    rewardScene: source === "optimize_refill" ? "optimize_quota" : "initial_unlock"
  });

  return {
    success: result.ok === true && result.status === "completed",
    source,
    status: result.status,
    message: result.message,
    raw: result.raw
  };
}

module.exports = {
  showRewardedAd,
  watchRewardedAd,
  grantAdReward,
  getAdRewardStatus
};
