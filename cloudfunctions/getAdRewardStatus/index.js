"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const adRewardGrants = db.collection("adRewardGrants");

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(error, message, errorCode = "AD_REWARD_STATUS_FAILED") {
  console.error("getAdRewardStatus failed", error);
  return {
    ok: false,
    status: "error",
    errorCode,
    message
  };
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const clientRewardId = normalizeString(event.clientRewardId);
    const rewardScene = normalizeString(event.rewardScene);

    if (!OPENID) {
      return fail(new Error("OPENID is required"), "广告权益状态查询失败，请稍后重试。", "OPENID_REQUIRED");
    }

    if (!clientRewardId) {
      return {
        ok: false,
        status: "error",
        errorCode: "CLIENT_REWARD_ID_REQUIRED",
        message: "广告权益查询信息缺失，请返回广告说明页重试。"
      };
    }

    const query = {
      openid: OPENID,
      clientRewardId
    };

    if (rewardScene) {
      query.rewardScene = rewardScene;
    }

    const result = await adRewardGrants.where(query).limit(1).get();
    const grant = result.data && result.data[0];

    if (!grant) {
      return {
        ok: true,
        status: "not_found",
        clientRewardId,
        rewardScene: rewardScene || ""
      };
    }

    return {
      ok: true,
      status: "granted",
      grantId: grant.grantId,
      workId: grant.workId || "",
      rewardScene: grant.rewardScene,
      clientRewardId: grant.clientRewardId
    };
  } catch (error) {
    return fail(error, "广告权益状态查询失败，请稍后重试。");
  }
};
