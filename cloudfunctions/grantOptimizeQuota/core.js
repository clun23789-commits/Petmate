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
  const counts = {
    grantedCount,
    usedCount,
    reservedCount
  };
  if (counts.usedCount + counts.reservedCount > counts.grantedCount) {
    throw new BusinessError("OPTIMIZE_QUOTA_INCONSISTENT", "优化次数汇总与预占记录不一致");
  }
  const availableCount = counts.grantedCount - counts.usedCount - counts.reservedCount;
  return {
    ...counts,
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
    message: error.message,
    deprecated: true
  };
}

function safeLogRef(prefix, value) {
  return value ? createSafeDocId(prefix, value).slice(-12) : "";
}

async function getSettledAdReward(db, openid, event) {
  const adGrantId = normalizeString(event.adGrantId || event.grantId);
  const clientRewardId = normalizeString(event.clientRewardId);
  const rewardScene = normalizeString(event.rewardScene);
  const query = {
    openid,
    status: "granted",
    quotaApplied: true
  };

  if (adGrantId) {
    query.grantId = adGrantId;
  } else if (clientRewardId && ALLOWED_REWARD_SCENES.has(rewardScene)) {
    query.clientRewardId = clientRewardId;
    query.rewardScene = rewardScene;
  } else {
    return null;
  }

  const result = await db.collection("adRewardGrants").where(query).limit(1).get();
  return result.data && result.data[0];
}

function createGrantOptimizeQuotaHandler({ cloud, db, now = () => new Date(), logger = console }) {
  void now;
  return async function grantOptimizeQuota(event = {}) {
    const context = cloud.getWXContext();
    const openid = normalizeString(context && context.OPENID);
    const clientRewardId = normalizeString(event.clientRewardId);
    const adGrantId = normalizeString(event.adGrantId || event.grantId);

    try {
      if (!openid) {
        throw new BusinessError("OPENID_REQUIRED", "用户信息缺失，无法查询优化次数");
      }

      const adReward = await getSettledAdReward(db, openid, event);
      if (!adReward) {
        throw new BusinessError(
          "OPTIMIZE_QUOTA_GRANT_NOT_SETTLED",
          "未查询到已完成的广告奖励结算记录。"
        );
      }

      const quotaGrantResult = await db.collection("optimizeQuotaGrants").where({
        openid,
        adGrantId: adReward.grantId,
        status: "granted",
        quotaApplied: true
      }).limit(1).get();
      const quotaGrant = quotaGrantResult.data && quotaGrantResult.data[0];
      if (
        !quotaGrant ||
        quotaGrant.adRewardDocId !== adReward._id ||
        quotaGrant.grantId !== adReward.quotaGrantId ||
        quotaGrant.rewardScene !== adReward.rewardScene ||
        normalizeString(quotaGrant.workId) !== normalizeString(adReward.workId) ||
        quotaGrant.clientRewardId !== adReward.clientRewardId ||
        quotaGrant.count !== AD_REWARD_OPTIMIZE_COUNT
      ) {
        throw new BusinessError("AD_REWARD_INCONSISTENT", "广告奖励记录对应的优化次数流水不完整");
      }

      const quotaResult = await db.collection("optimizeQuotas").where({
        openid
      }).limit(1).get();
      const quota = toQuotaResponse(quotaResult.data && quotaResult.data[0]);

      return {
        ok: true,
        deprecated: true,
        data: {
          grant: {
            grantId: quotaGrant.grantId || "",
            adGrantId: adReward.grantId,
            clientRewardId: adReward.clientRewardId,
            rewardScene: adReward.rewardScene,
            workId: adReward.workId || "",
            count: AD_REWARD_OPTIMIZE_COUNT,
            status: "granted",
            duplicated: true
          },
          quota,
          deprecated: true
        }
      };
    } catch (error) {
      if (error && error.isBusinessError) {
        return expectedError(error);
      }
      logger.error("grantOptimizeQuota legacy query failed", {
        functionName: "grantOptimizeQuota",
        openid: safeLogRef("user", openid),
        clientRewardId: safeLogRef("client", clientRewardId),
        adGrantId: safeLogRef("grant", adGrantId),
        errorCode: "OPTIMIZE_QUOTA_GRANT_QUERY_FAILED",
        message: error && error.message ? error.message : String(error)
      });
      return {
        ok: false,
        errorCode: "OPTIMIZE_QUOTA_GRANT_QUERY_FAILED",
        message: "优化次数查询失败，请稍后重试",
        deprecated: true
      };
    }
  };
}

module.exports = {
  AD_REWARD_OPTIMIZE_COUNT,
  ALLOWED_REWARD_SCENES,
  BusinessError,
  createGrantOptimizeQuotaHandler,
  getSettledAdReward,
  toQuotaResponse
};
