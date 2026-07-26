"use strict";

const AD_REWARD_OPTIMIZE_COUNT = 3;
const ALLOWED_REWARD_SCENES = new Set(["initial_unlock", "optimize_quota"]);

class BusinessError extends Error {
  constructor(errorCode, message, status = "error") {
    super(message);
    this.name = "BusinessError";
    this.errorCode = errorCode;
    this.status = status;
    this.isBusinessError = true;
  }
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createSafeDocId(prefix, key) {
  const encoded = Buffer.from(key).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${prefix}_${encoded}`;
}

function getAdRewardDocId(openid, rewardScene, clientRewardId) {
  return createSafeDocId("ad_reward", `${openid}:${rewardScene}:${clientRewardId}`);
}

function getQuotaDocId(openid) {
  return createSafeDocId("optimize_quota", openid);
}

function getQuotaGrantDocId(openid, adGrantId) {
  return createSafeDocId("optimize_grant", `${openid}:${adGrantId}`);
}

function unwrapTransactionResult(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) {
    return value.result;
  }
  return value;
}

function readCount(doc, field) {
  const value = doc && doc[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", `优化次数数据异常：${field} 不是有效的非负整数`);
  }
  return value;
}

function toQuotaResponse(doc) {
  if (!doc) {
    throw new BusinessError("AD_REWARD_INCONSISTENT", "广告奖励已结算，但优化次数汇总记录不存在");
  }
  const grantedCount = readCount(doc, "grantedCount");
  const usedCount = readCount(doc, "usedCount");
  const reservedCount = readCount(doc, "reservedCount");
  if (usedCount + reservedCount > grantedCount) {
    throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", "优化次数汇总与预占记录不一致");
  }
  const availableCount = grantedCount - usedCount - reservedCount;
  return {
    grantedCount,
    usedCount,
    reservedCount,
    availableCount,
    remainingCount: availableCount,
    updatedAt: doc.updatedAt
  };
}

function expectedError(error) {
  return {
    ok: false,
    status: error.status || "error",
    errorCode: error.errorCode,
    message: error.message
  };
}

function safeLogRef(prefix, value) {
  return value ? createSafeDocId(prefix, value).slice(-12) : "";
}

function isExpired(session, currentTime) {
  const expiresAt = session && session.expiresAt ? new Date(session.expiresAt).getTime() : NaN;
  return !Number.isFinite(expiresAt) || expiresAt <= currentTime.getTime();
}

function validateQuotaGrant(quotaGrant, session, openid) {
  if (
    !quotaGrant ||
    quotaGrant.openid !== openid ||
    quotaGrant.adGrantId !== session.grantId ||
    quotaGrant.adRewardDocId !== session._id ||
    quotaGrant.rewardScene !== session.rewardScene ||
    normalizeString(quotaGrant.workId) !== normalizeString(session.workId) ||
    quotaGrant.clientRewardId !== session.clientRewardId ||
    quotaGrant.count !== AD_REWARD_OPTIMIZE_COUNT ||
    quotaGrant.status !== "granted" ||
    quotaGrant.quotaApplied !== true
  ) {
    throw new BusinessError("AD_REWARD_INCONSISTENT", "广告奖励记录对应的优化次数流水不完整");
  }
}

async function markExpiredIfNeeded(db, sessionId, currentTime) {
  const transactionResult = await db.runTransaction(async (transaction) => {
    const sessionRef = transaction.collection("adRewardGrants").doc(sessionId);
    const result = await sessionRef.get();
    const latest = result.data || null;
    if (latest && latest.status === "pending" && isExpired(latest, currentTime)) {
      await sessionRef.update({
        data: {
          status: "expired",
          expiredAt: currentTime,
          updatedAt: currentTime
        }
      });
      return {
        ...latest,
        status: "expired",
        expiredAt: currentTime,
        updatedAt: currentTime
      };
    }
    return latest;
  });
  return unwrapTransactionResult(transactionResult);
}

function createGetAdRewardStatusHandler({ cloud, db, now = () => new Date(), logger = console }) {
  return async function getAdRewardStatus(event = {}) {
    const context = cloud.getWXContext();
    const openid = normalizeString(context && context.OPENID);
    const clientRewardId = normalizeString(event.clientRewardId);
    const rewardScene = normalizeString(event.rewardScene);

    try {
      if (!openid) {
        throw new BusinessError("OPENID_REQUIRED", "用户信息缺失，无法查询广告奖励状态");
      }
      if (!clientRewardId || !ALLOWED_REWARD_SCENES.has(rewardScene)) {
        throw new BusinessError("AD_REWARD_SESSION_INVALID_PAYLOAD", "广告奖励查询信息缺失，请返回广告说明页重试");
      }

      const sessionId = getAdRewardDocId(openid, rewardScene, clientRewardId);
      const sessionResult = await db.collection("adRewardGrants").doc(sessionId).get();
      let session = sessionResult.data || null;
      if (!session) {
        return {
          ok: true,
          status: "not_found",
          clientRewardId,
          rewardScene
        };
      }
      if (
        session.openid !== openid ||
        session.clientRewardId !== clientRewardId ||
        session.rewardScene !== rewardScene
      ) {
        throw new BusinessError("AD_REWARD_SESSION_CONFLICT", "广告奖励会话与查询信息不一致");
      }

      const currentTime = now();
      if (session.status === "pending" && isExpired(session, currentTime)) {
        session = await markExpiredIfNeeded(db, sessionId, currentTime);
      }
      if (!session) {
        return {
          ok: true,
          status: "not_found",
          clientRewardId,
          rewardScene
        };
      }
      if (session.status === "pending") {
        return {
          ok: true,
          status: "pending",
          grantId: session.grantId,
          clientRewardId,
          rewardScene,
          workId: session.workId || "",
          expiresAt: session.expiresAt
        };
      }
      if (session.status === "expired") {
        return {
          ok: true,
          status: "expired",
          grantId: session.grantId,
          clientRewardId,
          rewardScene,
          workId: session.workId || ""
        };
      }
      if (session.status === "rejected") {
        return {
          ok: true,
          status: "rejected",
          grantId: session.grantId,
          clientRewardId,
          rewardScene,
          workId: session.workId || ""
        };
      }
      if (session.status !== "granted") {
        throw new BusinessError("AD_REWARD_INCONSISTENT", "广告奖励会话状态异常");
      }
      if (
        session.quotaApplied !== true ||
        session.quotaCount !== AD_REWARD_OPTIMIZE_COUNT ||
        !normalizeString(session.quotaGrantId)
      ) {
        throw new BusinessError("AD_REWARD_INCONSISTENT", "广告奖励记录与优化次数发放状态不一致");
      }

      const quotaGrantResult = await db.collection("optimizeQuotaGrants")
        .doc(getQuotaGrantDocId(openid, session.grantId))
        .get();
      validateQuotaGrant(quotaGrantResult.data || null, session, openid);
      const quotaResult = await db.collection("optimizeQuotas").doc(getQuotaDocId(openid)).get();

      return {
        ok: true,
        status: "granted",
        grantId: session.grantId,
        clientRewardId: session.clientRewardId,
        rewardScene: session.rewardScene,
        workId: session.workId || "",
        count: AD_REWARD_OPTIMIZE_COUNT,
        quota: toQuotaResponse(quotaResult.data || null)
      };
    } catch (error) {
      if (error && error.isBusinessError) {
        return expectedError(error);
      }
      logger.error("getAdRewardStatus failed", {
        functionName: "getAdRewardStatus",
        openid: safeLogRef("user", openid),
        clientRewardId: safeLogRef("client", clientRewardId),
        rewardScene,
        errorCode: "AD_REWARD_STATUS_FAILED",
        message: error && error.message ? error.message : String(error)
      });
      return {
        ok: false,
        status: "error",
        errorCode: "AD_REWARD_STATUS_FAILED",
        message: "广告权益状态查询失败，请稍后重试。"
      };
    }
  };
}

module.exports = {
  AD_REWARD_OPTIMIZE_COUNT,
  ALLOWED_REWARD_SCENES,
  BusinessError,
  createGetAdRewardStatusHandler,
  createSafeDocId,
  getAdRewardDocId,
  getQuotaDocId,
  getQuotaGrantDocId,
  isExpired,
  markExpiredIfNeeded,
  toQuotaResponse,
  validateQuotaGrant
};
