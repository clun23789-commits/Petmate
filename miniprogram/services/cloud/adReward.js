"use strict";

const { AD_CONFIG } = require("../../config/ad");
const { store } = require("../../store/core/createStore");
const { createId } = require("../../utils/id");

const AD_REWARD_OPTIMIZE_COUNT = 3;
const AD_REWARD_SESSION_TTL_MS = 10 * 60 * 1000;
const ALLOWED_REWARD_SCENES = new Set(["initial_unlock", "optimize_quota"]);
const ALLOWED_SOURCES = new Set(["first_create", "optimize_refill", "recover"]);
const localRewardSessionMap = {};

function getErrorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function normalizeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function toLocalQuota(source, grantedIncrement = 0) {
  const quota = source || {};
  const grantedCount = normalizeCount(quota.grantedCount) + grantedIncrement;
  const usedCount = normalizeCount(quota.usedCount);
  const reservedCount = normalizeCount(quota.reservedCount);
  const availableCount = Math.max(0, grantedCount - usedCount - reservedCount);

  return {
    grantedCount,
    usedCount,
    reservedCount,
    availableCount,
    remainingCount: availableCount,
    updatedAt: new Date().toISOString()
  };
}

function getLocalQuota() {
  return toLocalQuota(store.getState().optimizeState);
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

function getLocalSession(payload = {}) {
  return localRewardSessionMap[buildLocalKey(payload)] || null;
}

function getLocalSessionByClientRewardId(clientRewardId) {
  return Object.values(localRewardSessionMap).find((item) => item.clientRewardId === clientRewardId) || null;
}

function toLocalSessionResponse(session, duplicated) {
  const result = {
    ok: true,
    status: session.status,
    grantId: session.grantId,
    clientRewardId: session.clientRewardId,
    rewardScene: session.rewardScene,
    workId: session.workId,
    source: session.source,
    expiresAt: session.expiresAt,
    duplicated: duplicated === true
  };

  if (session.status === "granted") {
    const currentQuota = getLocalQuota();
    const settledQuota = session.quota || currentQuota;
    result.count = AD_REWARD_OPTIMIZE_COUNT;
    result.quota =
      currentQuota.grantedCount >= settledQuota.grantedCount
        ? currentQuota
        : settledQuota;
    result.transitionApplied = false;
  }

  return result;
}

function localError(errorCode, message, status = "error") {
  return {
    ok: false,
    status,
    errorCode,
    message
  };
}

function createLocalAdRewardSession(payload = {}) {
  const clientRewardId = payload.clientRewardId || "";
  const rewardScene = payload.rewardScene || "";
  const source = payload.source || "";
  const workId = payload.workId || "";

  if (!clientRewardId || !ALLOWED_REWARD_SCENES.has(rewardScene) || !ALLOWED_SOURCES.has(source)) {
    return localError("AD_REWARD_SESSION_INVALID_PAYLOAD", "广告奖励会话信息不完整，请返回后重试");
  }
  if (rewardScene === "optimize_quota" && !workId) {
    return localError("AD_REWARD_WORK_REQUIRED", "补充优化次数时缺少当前作品，请返回作品页重试");
  }
  if (workId) {
    const work = store.getState().workState.workMap[workId];
    if (!work || work.status === "deleted") {
      return localError("AD_REWARD_WORK_NOT_FOUND", "作品不存在或已删除，请返回作品页刷新后重试");
    }
  }

  const conflicting = getLocalSessionByClientRewardId(clientRewardId);
  if (
    conflicting &&
    (
      conflicting.rewardScene !== rewardScene ||
      conflicting.workId !== workId ||
      conflicting.source !== source
    )
  ) {
    return localError("AD_REWARD_SESSION_CONFLICT", "同一个广告会话编号对应的场景、作品或来源不一致");
  }

  const existing = getLocalSession(payload);
  if (existing) {
    if (existing.status === "pending" && new Date(existing.expiresAt).getTime() <= Date.now()) {
      existing.status = "expired";
      existing.expiredAt = new Date().toISOString();
      existing.updatedAt = existing.expiredAt;
    }
    if (existing.status === "expired") {
      return localError("AD_REWARD_SESSION_EXPIRED", "广告奖励会话已过期，请重新观看广告。", "expired");
    }
    if (existing.status === "rejected") {
      return localError("AD_REWARD_ALREADY_REJECTED", "本次广告奖励会话已经结束，请重新观看广告。", "rejected");
    }
    return toLocalSessionResponse(existing, true);
  }

  const createdAt = new Date();
  const session = {
    grantId: createId("local-ad-grant"),
    clientRewardId,
    rewardScene,
    workId,
    source,
    status: "pending",
    expiresAt: new Date(createdAt.getTime() + AD_REWARD_SESSION_TTL_MS).toISOString(),
    quotaApplied: false,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString()
  };
  localRewardSessionMap[buildLocalKey(payload)] = session;
  return toLocalSessionResponse(session, false);
}

function grantLocalAdReward(payload = {}) {
  const session = getLocalSession(payload);
  if (!session) {
    const conflicting = getLocalSessionByClientRewardId(payload.clientRewardId || "");
    if (conflicting) {
      return localError(
        "AD_REWARD_SESSION_CONFLICT",
        "广告奖励会话的场景与请求不一致"
      );
    }
    return localError(
      "AD_REWARD_SESSION_NOT_FOUND",
      "广告奖励会话不存在或已失效，请重新观看广告。",
      "rejected"
    );
  }
  if (session.status === "granted") {
    return toLocalSessionResponse(session, true);
  }
  if (session.status === "rejected") {
    return localError("AD_REWARD_ALREADY_REJECTED", "本次广告奖励会话已经被拒绝，请重新观看广告", "rejected");
  }
  if (session.status === "expired" || new Date(session.expiresAt).getTime() <= Date.now()) {
    session.status = "expired";
    session.updatedAt = new Date().toISOString();
    return localError("AD_REWARD_SESSION_EXPIRED", "广告奖励会话已过期，请重新观看广告", "expired");
  }

  const completionStatus = payload.completionStatus || (payload.adResult && payload.adResult.status) || "";
  if (completionStatus !== "completed") {
    session.status = "rejected";
    session.updatedAt = new Date().toISOString();
    return localError("AD_REWARD_NOT_COMPLETED", "广告未完整完成，不能发放试用权益。", "rejected");
  }

  const quota = toLocalQuota(store.getState().optimizeState, AD_REWARD_OPTIMIZE_COUNT);
  session.status = "granted";
  session.quotaApplied = true;
  session.quota = quota;
  session.updatedAt = new Date().toISOString();

  return {
    ...toLocalSessionResponse(session, false),
    quota,
    transitionApplied: true
  };
}

function getLocalAdRewardStatus(payload = {}) {
  const session = getLocalSession(payload);

  if (!session) {
    return {
      ok: true,
      status: "not_found",
      clientRewardId: payload.clientRewardId || "",
      rewardScene: payload.rewardScene || "initial_unlock"
    };
  }
  if (session.status === "pending" && new Date(session.expiresAt).getTime() <= Date.now()) {
    session.status = "expired";
    session.updatedAt = new Date().toISOString();
  }
  return toLocalSessionResponse(session, true);
}

async function createAdRewardSession(payload = {}) {
  if (!AD_CONFIG.enableAdRewardCloudGrant) {
    return createLocalAdRewardSession(payload);
  }

  try {
    return await callAdRewardFunction("createAdRewardSession", payload);
  } catch (error) {
    console.error("createAdRewardSession service failed", error);
    return localError(
      "AD_REWARD_SESSION_UNAVAILABLE",
      getErrorMessage(error, "广告奖励会话创建失败，请稍后重试。")
    );
  }
}

async function grantAdReward(payload = {}) {
  if (!AD_CONFIG.enableAdRewardCloudGrant) {
    return grantLocalAdReward(payload);
  }

  try {
    return await callAdRewardFunction("grantAdReward", payload);
  } catch (error) {
    console.error("grantAdReward service failed", error);
    return localError(
      "AD_REWARD_GRANT_UNAVAILABLE",
      getErrorMessage(error, "广告权益确认失败，请稍后重试。")
    );
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
    return localError(
      "AD_REWARD_STATUS_UNAVAILABLE",
      getErrorMessage(error, "广告权益状态查询失败，请稍后重试。")
    );
  }
}

module.exports = {
  AD_REWARD_OPTIMIZE_COUNT,
  AD_REWARD_SESSION_TTL_MS,
  createAdRewardSession,
  grantAdReward,
  getAdRewardStatus
};
