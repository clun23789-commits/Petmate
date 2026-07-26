"use strict";

const crypto = require("node:crypto");

const AD_REWARD_OPTIMIZE_COUNT = 3;
const AD_REWARD_SESSION_TTL_MS = 10 * 60 * 1000;
const ALLOWED_REWARD_SCENES = new Set(["initial_unlock", "optimize_quota"]);
const ALLOWED_SOURCES = new Set(["first_create", "optimize_refill", "recover"]);

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

function createGrantId(randomBytes = crypto.randomBytes) {
  return `grant-${randomBytes(16).toString("hex")}`;
}

function withoutId(doc) {
  const data = {
    ...doc
  };
  delete data._id;
  return data;
}

function unwrapTransactionResult(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) {
    return value.result;
  }
  return value;
}

function isExpired(doc, currentTime) {
  const expiresAt = doc && doc.expiresAt ? new Date(doc.expiresAt).getTime() : NaN;
  return !Number.isFinite(expiresAt) || expiresAt <= currentTime.getTime();
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

function toSessionResponse(doc, duplicated, quota) {
  const response = {
    ok: true,
    status: doc.status,
    grantId: doc.grantId,
    clientRewardId: doc.clientRewardId,
    rewardScene: doc.rewardScene,
    workId: doc.workId || "",
    source: doc.source,
    expiresAt: doc.expiresAt,
    duplicated: duplicated === true
  };
  if (quota) {
    response.count = AD_REWARD_OPTIMIZE_COUNT;
    response.quota = quota;
  }
  return response;
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

async function getOwnedWork(database, openid, workId) {
  const result = await database.collection("works").where({
    ownerOpenid: openid,
    workId
  }).limit(1).get();
  return result.data && result.data[0];
}

async function getExistingSession(db, openid, rewardScene, clientRewardId) {
  const requestedId = getAdRewardDocId(openid, rewardScene, clientRewardId);
  const requestedResult = await db.collection("adRewardGrants").doc(requestedId).get();
  if (requestedResult.data) {
    return requestedResult.data;
  }

  const alternateScene = rewardScene === "initial_unlock" ? "optimize_quota" : "initial_unlock";
  const alternateId = getAdRewardDocId(openid, alternateScene, clientRewardId);
  const alternateResult = await db.collection("adRewardGrants").doc(alternateId).get();
  return alternateResult.data || null;
}

async function getGrantedQuota(db, openid, session) {
  if (session.status !== "granted" || session.quotaApplied !== true || !normalizeString(session.quotaGrantId)) {
    throw new BusinessError("AD_REWARD_INCONSISTENT", "广告奖励记录与优化次数发放状态不一致");
  }
  const grantResult = await db.collection("optimizeQuotaGrants")
    .doc(getQuotaGrantDocId(openid, session.grantId))
    .get();
  const quotaGrant = grantResult.data || null;
  if (
    !quotaGrant ||
    quotaGrant.openid !== openid ||
    quotaGrant.adGrantId !== session.grantId ||
    quotaGrant.grantId !== session.quotaGrantId ||
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
  const quotaResult = await db.collection("optimizeQuotas").doc(getQuotaDocId(openid)).get();
  return toQuotaResponse(quotaResult.data || null);
}

async function respondToExistingSession({
  db,
  session,
  openid,
  clientRewardId,
  rewardScene,
  workId,
  source,
  currentTime
}) {
  if (
    session.openid !== openid ||
    session.clientRewardId !== clientRewardId ||
    session.rewardScene !== rewardScene ||
    normalizeString(session.workId) !== workId ||
    normalizeString(session.source) !== source
  ) {
    throw new BusinessError("AD_REWARD_SESSION_CONFLICT", "同一个广告会话编号对应的场景、作品或来源不一致");
  }

  if (session.status === "pending" && isExpired(session, currentTime)) {
    await db.collection("adRewardGrants").doc(session._id).update({
      data: {
        status: "expired",
        expiredAt: currentTime,
        updatedAt: currentTime
      }
    });
    throw new BusinessError(
      "AD_REWARD_SESSION_EXPIRED",
      "广告奖励会话已过期，请重新观看广告。",
      "expired"
    );
  }
  if (session.status === "pending") {
    return toSessionResponse(session, true);
  }
  if (session.status === "granted") {
    const quota = await getGrantedQuota(db, openid, session);
    return toSessionResponse(session, true, quota);
  }
  if (session.status === "expired") {
    throw new BusinessError(
      "AD_REWARD_SESSION_EXPIRED",
      "广告奖励会话已过期，请重新观看广告。",
      "expired"
    );
  }
  if (session.status === "rejected") {
    throw new BusinessError(
      "AD_REWARD_ALREADY_REJECTED",
      "本次广告奖励会话已经结束，请重新观看广告。",
      "rejected"
    );
  }
  throw new BusinessError("AD_REWARD_INCONSISTENT", "广告奖励会话状态异常");
}

function createAdRewardSessionHandler({
  cloud,
  db,
  now = () => new Date(),
  logger = console,
  randomBytes = crypto.randomBytes
}) {
  return async function createAdRewardSession(event = {}) {
    const context = cloud.getWXContext();
    const openid = normalizeString(context && context.OPENID);
    const clientRewardId = normalizeString(event.clientRewardId);
    const rewardScene = normalizeString(event.rewardScene);
    const source = normalizeString(event.source);
    const workId = normalizeString(event.workId);

    try {
      if (!openid) {
        throw new BusinessError("OPENID_REQUIRED", "用户信息缺失，无法创建广告奖励会话");
      }
      if (!clientRewardId) {
        throw new BusinessError("AD_REWARD_SESSION_INVALID_PAYLOAD", "广告奖励会话信息不完整，请返回后重试");
      }
      if (!ALLOWED_REWARD_SCENES.has(rewardScene)) {
        throw new BusinessError("AD_REWARD_SESSION_INVALID_PAYLOAD", "广告奖励场景不正确，请返回后重试");
      }
      if (!ALLOWED_SOURCES.has(source)) {
        throw new BusinessError("AD_REWARD_SESSION_INVALID_PAYLOAD", "广告奖励来源不正确，请返回后重试");
      }
      if (rewardScene === "optimize_quota" && !workId) {
        throw new BusinessError("AD_REWARD_WORK_REQUIRED", "补充优化次数时缺少当前作品，请返回作品页重试");
      }
      if (workId) {
        const work = await getOwnedWork(db, openid, workId);
        if (!work || work.status === "deleted") {
          throw new BusinessError("AD_REWARD_WORK_NOT_FOUND", "作品不存在或已删除，请返回作品页刷新后重试");
        }
      }

      const currentTime = now();
      const existing = await getExistingSession(db, openid, rewardScene, clientRewardId);
      if (existing) {
        return await respondToExistingSession({
          db,
          session: existing,
          openid,
          clientRewardId,
          rewardScene,
          workId,
          source,
          currentTime
        });
      }

      const idempotencyKey = `${openid}:${rewardScene}:${clientRewardId}`;
      const doc = {
        _id: getAdRewardDocId(openid, rewardScene, clientRewardId),
        schemaVersion: 2,
        grantId: createGrantId(randomBytes),
        openid,
        rewardScene,
        workId,
        source,
        clientRewardId,
        idempotencyKey,
        status: "pending",
        completionEvidence: null,
        verificationStatus: "pending",
        quotaCount: AD_REWARD_OPTIMIZE_COUNT,
        quotaApplied: false,
        quotaGrantId: "",
        expiresAt: new Date(currentTime.getTime() + AD_REWARD_SESSION_TTL_MS),
        settledAt: null,
        rejectedAt: null,
        expiredAt: null,
        createdAt: currentTime,
        updatedAt: currentTime
      };

      const transactionResult = await db.runTransaction(async (transaction) => {
        const raceSession = await getExistingSession(transaction, openid, rewardScene, clientRewardId);
        if (raceSession) {
          return {
            existing: raceSession
          };
        }
        await transaction.collection("adRewardGrants").doc(doc._id).set({
          data: withoutId(doc)
        });
        return {
          created: true
        };
      });
      const creationResult = unwrapTransactionResult(transactionResult);
      if (creationResult && creationResult.existing) {
        return await respondToExistingSession({
          db,
          session: creationResult.existing,
          openid,
          clientRewardId,
          rewardScene,
          workId,
          source,
          currentTime: now()
        });
      }

      return toSessionResponse(doc, false);
    } catch (error) {
      if (error && error.isBusinessError) {
        return expectedError(error);
      }
      logger.error("createAdRewardSession failed", {
        functionName: "createAdRewardSession",
        openid: safeLogRef("user", openid),
        clientRewardId: safeLogRef("client", clientRewardId),
        workId: safeLogRef("work", workId),
        errorCode: "AD_REWARD_SESSION_CREATE_FAILED",
        message: error && error.message ? error.message : String(error)
      });
      return {
        ok: false,
        status: "error",
        errorCode: "AD_REWARD_SESSION_CREATE_FAILED",
        message: "广告奖励会话创建失败，请稍后重试。"
      };
    }
  };
}

module.exports = {
  AD_REWARD_OPTIMIZE_COUNT,
  AD_REWARD_SESSION_TTL_MS,
  ALLOWED_REWARD_SCENES,
  ALLOWED_SOURCES,
  BusinessError,
  createAdRewardSessionHandler,
  createGrantId,
  createSafeDocId,
  getAdRewardDocId,
  getQuotaDocId,
  getQuotaGrantDocId,
  isExpired,
  toQuotaResponse
};
