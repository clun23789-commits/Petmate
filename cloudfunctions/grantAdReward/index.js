"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const adRewardGrants = db.collection("adRewardGrants");
const works = db.collection("works");

const ALLOWED_REWARD_SCENES = ["initial_unlock", "optimize_quota"];

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function createGrantId() {
  return `grant-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function createDocId(idempotencyKey) {
  const encoded = Buffer.from(idempotencyKey).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `ad_reward_${encoded}`;
}

function fail(error, message, errorCode = "AD_REWARD_GRANT_FAILED") {
  console.error("grantAdReward failed", error);
  return {
    ok: false,
    status: "error",
    errorCode,
    message
  };
}

function expectedError(errorCode, message, status = "error") {
  return {
    ok: false,
    status,
    errorCode,
    message
  };
}

async function getOwnedWork(openid, workId) {
  const result = await works
    .where({
      ownerOpenid: openid,
      workId
    })
    .limit(1)
    .get();

  return result.data && result.data[0];
}

function buildGrantDoc(payload, openid, existingDoc) {
  const now = new Date();
  const existing = normalizeObject(existingDoc);
  const rewardScene = normalizeString(payload.rewardScene) || existing.rewardScene || "initial_unlock";
  const clientRewardId = normalizeString(payload.clientRewardId);
  const grantId = existing.grantId || createGrantId();

  return {
    grantId,
    openid,
    workId: normalizeString(payload.workId) || existing.workId || "",
    rewardScene,
    clientRewardId,
    idempotencyKey: `${openid}:${rewardScene}:${clientRewardId}`,
    status: "granted",
    source: "rewarded_video_ad",
    adResult: normalizeObject(payload.adResult),
    verificationStatus: "reserved",
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
}

function toGrantResponse(doc) {
  return {
    ok: true,
    status: "granted",
    grantId: doc.grantId,
    workId: doc.workId || "",
    rewardScene: doc.rewardScene,
    clientRewardId: doc.clientRewardId
  };
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const payload = normalizeObject(event);
    const rewardScene = normalizeString(payload.rewardScene) || "initial_unlock";
    const clientRewardId = normalizeString(payload.clientRewardId);
    const workId = normalizeString(payload.workId);
    const adResult = normalizeObject(payload.adResult);

    if (!OPENID) {
      return fail(new Error("OPENID is required"), "广告权益确认失败，请稍后重试。", "OPENID_REQUIRED");
    }

    if (!clientRewardId) {
      return fail(new Error("clientRewardId is required"), "广告权益确认信息缺失，请重新观看广告。", "CLIENT_REWARD_ID_REQUIRED");
    }

    if (!ALLOWED_REWARD_SCENES.includes(rewardScene)) {
      return expectedError("INVALID_REWARD_SCENE", "广告权益场景不正确，请返回后重试。");
    }

    if (adResult.status !== "completed") {
      return {
        ok: false,
        status: "rejected",
        errorCode: "AD_NOT_COMPLETED",
        message: "广告未完整完成，不能发放试用权益。"
      };
    }

    if (rewardScene === "optimize_quota" && workId) {
      const work = await getOwnedWork(OPENID, workId);

      if (!work || work.status === "deleted") {
        return expectedError("WORK_NOT_FOUND", "作品不存在或已删除，请返回作品页刷新后重试。");
      }
    }

    const idempotencyKey = `${OPENID}:${rewardScene}:${clientRewardId}`;
    const existingResult = await adRewardGrants
      .where({
        openid: OPENID,
        idempotencyKey
      })
      .limit(1)
      .get();
    const existingDoc = existingResult.data && existingResult.data[0];

    if (existingDoc) {
      return toGrantResponse(existingDoc);
    }

    const grantDoc = buildGrantDoc(
      {
        ...payload,
        rewardScene
      },
      OPENID
    );

    try {
      await adRewardGrants.add({
        data: {
          _id: createDocId(idempotencyKey),
          ...grantDoc
        }
      });
    } catch (error) {
      const raceResult = await adRewardGrants
        .where({
          openid: OPENID,
          idempotencyKey
        })
        .limit(1)
        .get();
      const raceDoc = raceResult.data && raceResult.data[0];

      if (raceDoc) {
        return toGrantResponse(raceDoc);
      }

      throw error;
    }

    return toGrantResponse(grantDoc);
  } catch (error) {
    return fail(error, "广告权益确认失败，请稍后重试。");
  }
};
