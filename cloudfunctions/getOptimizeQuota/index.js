"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const optimizeQuotas = db.collection("optimizeQuotas");

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function createQuotaDocId(openid) {
  const encoded = Buffer.from(openid).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `optimize_quota_${encoded}`;
}

function buildQuotaDoc(openid) {
  const now = new Date();
  return {
    _id: createQuotaDocId(openid),
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

  const doc = buildQuotaDoc(openid);

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

function fail(error) {
  console.error("getOptimizeQuota failed", error);
  return {
    ok: false,
    errorCode: "OPTIMIZE_QUOTA_GET_FAILED",
    message: "优化次数同步失败，请稍后重试"
  };
}

exports.main = async () => {
  try {
    const { OPENID } = cloud.getWXContext();

    if (!OPENID) {
      return {
        ok: false,
        errorCode: "OPENID_REQUIRED",
        message: "用户信息缺失，无法同步优化次数"
      };
    }

    const quotaDoc = await ensureQuotaDoc(OPENID);

    return {
      ok: true,
      data: {
        quota: toQuotaResponse(quotaDoc)
      }
    };
  } catch (error) {
    return fail(error);
  }
};
