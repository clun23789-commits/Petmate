"use strict";

const crypto = require("node:crypto");

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

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

function createQuotaGrantId(randomBytes = crypto.randomBytes) {
  return `quota-grant-${randomBytes(16).toString("hex")}`;
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

function readCount(doc, field) {
  const value = doc && doc[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", `优化次数数据异常：${field} 不是有效的非负整数`);
  }
  return value;
}

function validateQuota(doc) {
  if (!doc) {
    throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", "优化次数汇总记录不存在");
  }
  const grantedCount = readCount(doc, "grantedCount");
  const usedCount = readCount(doc, "usedCount");
  const reservedCount = readCount(doc, "reservedCount");
  if (usedCount + reservedCount > grantedCount) {
    throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", "优化次数汇总与预占记录不一致");
  }
  return {
    grantedCount,
    usedCount,
    reservedCount,
    availableCount: grantedCount - usedCount - reservedCount
  };
}

function createQuotaDoc(openid, currentTime) {
  return {
    _id: getQuotaDocId(openid),
    openid,
    grantedCount: 0,
    usedCount: 0,
    reservedCount: 0,
    createdAt: currentTime,
    updatedAt: currentTime
  };
}

function toQuotaResponse(doc) {
  const counts = validateQuota(doc);
  return {
    ...counts,
    remainingCount: counts.availableCount,
    updatedAt: doc.updatedAt
  };
}

function toGrantResponse(session, quotaDoc, duplicated, transitionApplied) {
  return {
    ok: true,
    status: "granted",
    grantId: session.grantId,
    clientRewardId: session.clientRewardId,
    rewardScene: session.rewardScene,
    workId: session.workId || "",
    count: AD_REWARD_OPTIMIZE_COUNT,
    quota: toQuotaResponse(quotaDoc),
    duplicated: duplicated === true,
    transitionApplied: transitionApplied === true
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

function validateSessionOwnership(session, openid, rewardScene, clientRewardId) {
  if (session.openid !== openid) {
    throw new BusinessError("AD_REWARD_SESSION_NOT_FOUND", "广告奖励会话不存在或已失效，请重新观看广告。", "rejected");
  }
  if (session.clientRewardId !== clientRewardId || session.rewardScene !== rewardScene) {
    throw new BusinessError("AD_REWARD_SESSION_CONFLICT", "广告奖励会话的场景与请求不一致");
  }
}

function validateQuotaGrant(quotaGrant, session) {
  if (
    !quotaGrant ||
    quotaGrant.openid !== session.openid ||
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
}

async function getSessionInTransaction(transaction, openid, rewardScene, clientRewardId) {
  const requestedId = getAdRewardDocId(openid, rewardScene, clientRewardId);
  const requestedResult = await transaction.collection("adRewardGrants").doc(requestedId).get();
  if (requestedResult.data) {
    return requestedResult.data;
  }
  const alternateScene = rewardScene === "initial_unlock" ? "optimize_quota" : "initial_unlock";
  const alternateResult = await transaction.collection("adRewardGrants")
    .doc(getAdRewardDocId(openid, alternateScene, clientRewardId))
    .get();
  if (alternateResult.data) {
    throw new BusinessError("AD_REWARD_SESSION_CONFLICT", "广告奖励会话的场景与请求不一致");
  }
  throw new BusinessError(
    "AD_REWARD_SESSION_NOT_FOUND",
    "广告奖励会话不存在或已失效，请重新观看广告。",
    "rejected"
  );
}

async function validateOwnedWork(transaction, session, openid) {
  if (session.rewardScene !== "optimize_quota") {
    return;
  }
  const workId = normalizeString(session.workId);
  if (!workId) {
    throw new BusinessError("AD_REWARD_WORK_REQUIRED", "补充优化次数时缺少当前作品，请重新观看广告");
  }
  const workResult = await transaction.collection("works").where({
    ownerOpenid: openid,
    workId
  }).limit(1).get();
  const work = workResult.data && workResult.data[0];
  if (!work || work.status === "deleted") {
    throw new BusinessError("AD_REWARD_WORK_NOT_FOUND", "作品不存在或已删除，请返回作品页刷新后重试");
  }
}

function createGrantAdRewardHandler({
  cloud,
  db,
  now = () => new Date(),
  logger = console,
  randomBytes = crypto.randomBytes
}) {
  return async function grantAdReward(event = {}) {
    const context = cloud.getWXContext();
    const openid = normalizeString(context && context.OPENID);
    const clientRewardId = normalizeString(event.clientRewardId);
    const rewardScene = normalizeString(event.rewardScene);
    const adResult = normalizeObject(event.adResult);
    const completionStatus = normalizeString(event.completionStatus) || normalizeString(adResult.status);

    try {
      if (!openid) {
        throw new BusinessError("OPENID_REQUIRED", "用户信息缺失，无法结算广告奖励");
      }
      if (!clientRewardId || !ALLOWED_REWARD_SCENES.has(rewardScene)) {
        throw new BusinessError("AD_REWARD_SESSION_INVALID_PAYLOAD", "广告奖励结算信息不完整，请重新观看广告");
      }

      const transactionResult = await db.runTransaction(async (transaction) => {
        const session = await getSessionInTransaction(transaction, openid, rewardScene, clientRewardId);
        validateSessionOwnership(session, openid, rewardScene, clientRewardId);
        const sessionRef = transaction.collection("adRewardGrants").doc(session._id);

        if (session.status === "rejected") {
          throw new BusinessError("AD_REWARD_ALREADY_REJECTED", "本次广告奖励会话已经被拒绝，请重新观看广告", "rejected");
        }
        if (session.status === "expired") {
          throw new BusinessError("AD_REWARD_SESSION_EXPIRED", "广告奖励会话已过期，请重新观看广告", "expired");
        }
        if (session.status !== "pending" && session.status !== "granted") {
          throw new BusinessError("AD_REWARD_INCONSISTENT", "广告奖励会话状态异常");
        }

        const transactionNow = now();
        if (session.status === "pending" && isExpired(session, transactionNow)) {
          await sessionRef.update({
            data: {
              status: "expired",
              expiredAt: transactionNow,
              updatedAt: transactionNow
            }
          });
          return expectedError(
            new BusinessError(
              "AD_REWARD_SESSION_EXPIRED",
              "广告奖励会话已过期，请重新观看广告",
              "expired"
            )
          );
        }
        if (session.status === "pending" && completionStatus !== "completed") {
          await sessionRef.update({
            data: {
              status: "rejected",
              rejectedAt: transactionNow,
              updatedAt: transactionNow
            }
          });
          return expectedError(
            new BusinessError(
              "AD_REWARD_NOT_COMPLETED",
              "广告未完整完成，不能发放试用权益。",
              "rejected"
            )
          );
        }

        await validateOwnedWork(transaction, session, openid);

        const quotaRef = transaction.collection("optimizeQuotas").doc(getQuotaDocId(openid));
        const quotaResult = await quotaRef.get();
        let quotaDoc = quotaResult.data || null;
        if (session.status === "granted" && !quotaDoc) {
          throw new BusinessError("AD_REWARD_INCONSISTENT", "广告奖励已结算，但优化次数汇总记录不存在");
        }
        if (!quotaDoc) {
          quotaDoc = createQuotaDoc(openid, transactionNow);
          await quotaRef.set({
            data: withoutId(quotaDoc)
          });
        }
        const counts = validateQuota(quotaDoc);

        const quotaGrantRef = transaction.collection("optimizeQuotaGrants")
          .doc(getQuotaGrantDocId(openid, session.grantId));
        const quotaGrantResult = await quotaGrantRef.get();
        const existingQuotaGrant = quotaGrantResult.data || null;

        if (session.status === "granted") {
          if (
            session.quotaApplied !== true ||
            !normalizeString(session.quotaGrantId) ||
            session.quotaCount !== AD_REWARD_OPTIMIZE_COUNT
          ) {
            throw new BusinessError("AD_REWARD_INCONSISTENT", "广告奖励记录与优化次数发放状态不一致");
          }
          validateQuotaGrant(existingQuotaGrant, session);
          return toGrantResponse(session, quotaDoc, true, false);
        }

        if (existingQuotaGrant) {
          throw new BusinessError("AD_REWARD_INCONSISTENT", "广告尚未结算，但优化次数流水已经存在");
        }

        const quotaGrantId = createQuotaGrantId(randomBytes);
        const quotaGrantDoc = {
          _id: getQuotaGrantDocId(openid, session.grantId),
          schemaVersion: 2,
          grantId: quotaGrantId,
          openid,
          adGrantId: session.grantId,
          adRewardDocId: session._id,
          workId: session.workId || "",
          rewardScene: session.rewardScene,
          clientRewardId: session.clientRewardId,
          idempotencyKey: `${openid}:${session.grantId}`,
          count: AD_REWARD_OPTIMIZE_COUNT,
          source: "rewarded_video_ad",
          status: "granted",
          quotaApplied: true,
          appliedAt: transactionNow,
          createdAt: transactionNow,
          updatedAt: transactionNow
        };
        const nextQuota = {
          ...quotaDoc,
          grantedCount: counts.grantedCount + AD_REWARD_OPTIMIZE_COUNT,
          updatedAt: transactionNow
        };
        validateQuota(nextQuota);
        const nextSession = {
          ...session,
          status: "granted",
          completionEvidence: {
            type: "wechat_client_on_close",
            status: "completed",
            trustLevel: "client_reported",
            receivedAt: transactionNow
          },
          verificationStatus: "client_confirmed",
          quotaCount: AD_REWARD_OPTIMIZE_COUNT,
          quotaApplied: true,
          quotaGrantId,
          settledAt: transactionNow,
          updatedAt: transactionNow
        };

        await quotaGrantRef.set({
          data: withoutId(quotaGrantDoc)
        });
        await quotaRef.update({
          data: {
            grantedCount: nextQuota.grantedCount,
            updatedAt: transactionNow
          }
        });
        await sessionRef.update({
          data: {
            status: "granted",
            completionEvidence: nextSession.completionEvidence,
            verificationStatus: "client_confirmed",
            quotaCount: AD_REWARD_OPTIMIZE_COUNT,
            quotaApplied: true,
            quotaGrantId,
            settledAt: transactionNow,
            updatedAt: transactionNow
          }
        });

        return toGrantResponse(nextSession, nextQuota, false, true);
      });

      return unwrapTransactionResult(transactionResult);
    } catch (error) {
      if (error && error.isBusinessError) {
        return expectedError(error);
      }
      logger.error("grantAdReward transaction failed", {
        functionName: "grantAdReward",
        openid: safeLogRef("user", openid),
        clientRewardId: safeLogRef("client", clientRewardId),
        rewardScene,
        errorCode: "AD_REWARD_TRANSACTION_FAILED",
        message: error && error.message ? error.message : String(error)
      });
      return {
        ok: false,
        status: "error",
        errorCode: "AD_REWARD_TRANSACTION_FAILED",
        message: "广告奖励结算失败，请稍后重新查询权益状态。"
      };
    }
  };
}

module.exports = {
  AD_REWARD_OPTIMIZE_COUNT,
  ALLOWED_REWARD_SCENES,
  BusinessError,
  createGrantAdRewardHandler,
  createQuotaGrantId,
  createSafeDocId,
  getAdRewardDocId,
  getQuotaDocId,
  getQuotaGrantDocId,
  isExpired,
  toGrantResponse,
  toQuotaResponse,
  validateQuota,
  validateQuotaGrant
};
