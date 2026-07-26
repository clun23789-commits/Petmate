import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const settleCore = require("../../../cloudfunctions/grantAdReward/core.js");

export const OPENID = "openid-ad-reward-user";
export const OTHER_OPENID = "openid-other-user";
export const WORK_ID = "work-ad-reward";
export const OTHER_WORK_ID = "work-ad-reward-other";
export const CLIENT_REWARD_ID = "ad-reward-client-test";
export const NOW = new Date("2026-07-27T08:00:00.000Z");

export function workDoc(overrides = {}) {
  return {
    _id: "work-doc-ad-reward",
    workId: WORK_ID,
    ownerOpenid: OPENID,
    status: "ready",
    currentVersionId: "version-current",
    ...overrides
  };
}

export function quotaDoc(overrides = {}) {
  return {
    _id: settleCore.getQuotaDocId(OPENID),
    openid: OPENID,
    grantedCount: 3,
    usedCount: 1,
    reservedCount: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

export function sessionDoc(overrides = {}) {
  const rewardScene = overrides.rewardScene || "initial_unlock";
  const clientRewardId = overrides.clientRewardId || CLIENT_REWARD_ID;
  const openid = overrides.openid || OPENID;
  const workId = Object.prototype.hasOwnProperty.call(overrides, "workId")
    ? overrides.workId
    : rewardScene === "optimize_quota"
      ? WORK_ID
      : "";
  return {
    _id: settleCore.getAdRewardDocId(openid, rewardScene, clientRewardId),
    schemaVersion: 2,
    grantId: overrides.grantId || "grant-ad-reward-test",
    openid,
    rewardScene,
    workId,
    source: overrides.source || (rewardScene === "optimize_quota" ? "optimize_refill" : "first_create"),
    clientRewardId,
    idempotencyKey: `${openid}:${rewardScene}:${clientRewardId}`,
    status: "pending",
    completionEvidence: null,
    verificationStatus: "pending",
    quotaCount: 3,
    quotaApplied: false,
    quotaGrantId: "",
    expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
    settledAt: null,
    rejectedAt: null,
    expiredAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
    _id: settleCore.getAdRewardDocId(openid, rewardScene, clientRewardId),
    openid,
    rewardScene,
    clientRewardId,
    workId
  };
}

export function grantedSessionDoc(overrides = {}) {
  const base = sessionDoc(overrides);
  return {
    ...base,
    status: "granted",
    verificationStatus: "client_confirmed",
    completionEvidence: {
      type: "wechat_client_on_close",
      status: "completed",
      trustLevel: "client_reported",
      receivedAt: NOW
    },
    quotaCount: 3,
    quotaApplied: true,
    quotaGrantId: overrides.quotaGrantId || "quota-grant-test",
    settledAt: NOW,
    ...overrides
  };
}

export function quotaGrantDoc(session = grantedSessionDoc(), overrides = {}) {
  return {
    _id: settleCore.getQuotaGrantDocId(session.openid, session.grantId),
    schemaVersion: 2,
    grantId: session.quotaGrantId || "quota-grant-test",
    openid: session.openid,
    adGrantId: session.grantId,
    adRewardDocId: session._id,
    workId: session.workId || "",
    rewardScene: session.rewardScene,
    clientRewardId: session.clientRewardId,
    idempotencyKey: `${session.openid}:${session.grantId}`,
    count: 3,
    source: "rewarded_video_ad",
    status: "granted",
    quotaApplied: true,
    appliedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}
