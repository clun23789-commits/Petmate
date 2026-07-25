"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const command = db.command;
const optimizeQuotas = db.collection("optimizeQuotas");
const optimizeQuotaGrants = db.collection("optimizeQuotaGrants");
const works = db.collection("works");

const OPTIMIZE_GRANT_COUNT = 3;
const ALLOWED_REWARD_SCENES = ["initial_unlock", "optimize_quota"];

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeGrantCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.min(OPTIMIZE_GRANT_COUNT, Math.floor(count)) : OPTIMIZE_GRANT_COUNT;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function createSafeDocId(prefix, key) {
  const encoded = Buffer.from(key).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${prefix}_${encoded}`;
}

function createQuotaDoc(openid) {
  const now = new Date();
  return {
    _id: createSafeDocId("optimize_quota", openid),
    openid,
    grantedCount: 0,
    usedCount: 0,
    reservedCount: 0,
    createdAt: now,
    updatedAt: now
  };
}

function toQuotaResponse(doc) {
  const grantedCount = normalizeNumber(doc && doc.grantedCount);
  const usedCount = normalizeNumber(doc && doc.usedCount);
  const reservedCount = normalizeNumber(doc && doc.reservedCount);
  const availableCount = Math.max(0, grantedCount - usedCount - reservedCount);

  return {
    grantedCount,
    usedCount,
    reservedCount,
    availableCount,
    remainingCount: availableCount,
    updatedAt: doc && doc.updatedAt ? doc.updatedAt : new Date()
  };
}

function expectedError(errorCode, message) {
  return {
    ok: false,
    errorCode,
    message
  };
}

function fail(error) {
  console.error("grantOptimizeQuota failed", error);
  return {
    ok: false,
    errorCode: "OPTIMIZE_QUOTA_GRANT_FAILED",
    message: "优化次数发放失败，请稍后重试"
  };
}

async function getQuotaDoc(openid) {
  const result = await optimizeQuotas
    .where({
      openid
    })
    .limit(1)
    .get();

  return result.data && result.data[0];
}

async function ensureQuotaDoc(openid) {
  const existing = await getQuotaDoc(openid);

  if (existing) {
    return existing;
  }

  const doc = createQuotaDoc(openid);

  try {
    await optimizeQuotas.add({
      data: doc
    });
    return doc;
  } catch (error) {
    const raceDoc = await getQuotaDoc(openid);

    if (raceDoc) {
      return raceDoc;
    }

    throw error;
  }
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

async function getGrantDoc(openid, idempotencyKey) {
  const result = await optimizeQuotaGrants
    .where({
      openid,
      idempotencyKey
    })
    .limit(1)
    .get();

  return result.data && result.data[0];
}

async function applyGrant(openid, count) {
  const quotaDoc = await ensureQuotaDoc(openid);
  const now = new Date();

  await optimizeQuotas.doc(quotaDoc._id).update({
    data: {
      grantedCount: command.inc(count),
      updatedAt: now
    }
  });

  return getQuotaDoc(openid);
}

function toGrantResponse(doc, quotaDoc, duplicated) {
  return {
    grant: {
      grantId: doc.grantId || "",
      clientRewardId: doc.clientRewardId || "",
      rewardScene: doc.rewardScene || "",
      workId: doc.workId || "",
      count: normalizeGrantCount(doc.count),
      status: doc.status || "granted",
      duplicated: duplicated === true
    },
    quota: toQuotaResponse(quotaDoc)
  };
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const rewardScene = normalizeString(event.rewardScene) || "initial_unlock";
    const workId = normalizeString(event.workId);
    const clientRewardId = normalizeString(event.clientRewardId);
    const adGrantId = normalizeString(event.adGrantId || event.grantId);
    const idempotencyKey = `${OPENID}:${rewardScene}:${clientRewardId}`;
    const count = OPTIMIZE_GRANT_COUNT;

    if (!OPENID || !clientRewardId || !ALLOWED_REWARD_SCENES.includes(rewardScene)) {
      return expectedError("OPTIMIZE_QUOTA_GRANT_INVALID_PAYLOAD", "优化次数发放信息不完整，请重新观看广告");
    }

    if (rewardScene === "optimize_quota" && workId) {
      const work = await getOwnedWork(OPENID, workId);

      if (!work || work.status === "deleted") {
        return expectedError("OPTIMIZE_QUOTA_WORK_NOT_FOUND", "当前作品不存在或已失效，请返回作品页刷新后重试");
      }
    }

    const existingDoc = await getGrantDoc(OPENID, idempotencyKey);

    if (existingDoc) {
      const quotaDoc = await getQuotaDoc(OPENID);

      return {
        ok: true,
        data: toGrantResponse(existingDoc, quotaDoc || (await ensureQuotaDoc(OPENID)), true)
      };
    }

    const now = new Date();
    const grantDoc = {
      _id: createSafeDocId("optimize_grant", idempotencyKey),
      openid: OPENID,
      workId,
      rewardScene,
      clientRewardId,
      adGrantId,
      idempotencyKey,
      count,
      source: normalizeString(event.source) || "rewarded_video_ad",
      status: "granted",
      quotaApplied: false,
      createdAt: now,
      updatedAt: now
    };

    try {
      await optimizeQuotaGrants.add({
        data: grantDoc
      });
    } catch (error) {
      const raceDoc = await getGrantDoc(OPENID, idempotencyKey);

      if (raceDoc) {
        const quotaDoc = await getQuotaDoc(OPENID);
        return {
          ok: true,
          data: toGrantResponse(raceDoc, quotaDoc || (await ensureQuotaDoc(OPENID)), true)
        };
      }

      throw error;
    }

    const quotaDoc = await applyGrant(OPENID, count);
    await optimizeQuotaGrants.doc(grantDoc._id).update({
      data: {
        quotaApplied: true,
        appliedAt: new Date(),
        updatedAt: new Date()
      }
    });

    return {
      ok: true,
      data: toGrantResponse(
        {
          ...grantDoc,
          quotaApplied: true
        },
        quotaDoc,
        false
      )
    };
  } catch (error) {
    return fail(error);
  }
};
