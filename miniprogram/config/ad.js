"use strict";

const { getServiceMode, SERVICE_MODE_VALUE } = require("../services/runtime");

const AD_SERVICE_MODE = getServiceMode("ad");

const AD_CONFIG = {
  /*
   * Development demos stay on mock rewarded ads by default.
   * Before enabling real rewarded ads, fill rewardedVideoAdUnitId and deploy
   * grantAdReward / getAdRewardStatus cloud functions.
   */
  useRealRewardedAd: AD_SERVICE_MODE === SERVICE_MODE_VALUE.REAL,
  rewardedVideoAdUnitId: "",
  rewardTimeoutMs: 15000,
  enableAdRewardCloudGrant: AD_SERVICE_MODE === SERVICE_MODE_VALUE.REAL
};

module.exports = {
  AD_CONFIG,
  AD_SERVICE_MODE
};
