"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const optimizeQuotas = db.collection("optimizeQuotas");
const optimizeReservations = db.collection("optimizeReservations");

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
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

function toReservationResponse(doc) {
  return {
    reservationId: doc.reservationId || "",
    workId: doc.workId || "",
    taskId: doc.taskId || "",
    source: doc.source || "",
    status: doc.status || "reserved",
    dimensionSet: Array.isArray(doc.dimensionSet) ? doc.dimensionSet : []
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
  console.error("releaseOptimizeQuota failed", error);
  return {
    ok: false,
    errorCode: "OPTIMIZE_QUOTA_RELEASE_FAILED",
    message: "优化次数释放失败，请稍后重试"
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

async function getReservationDoc(openid, reservationId) {
  const result = await optimizeReservations
    .where({
      openid,
      reservationId
    })
    .limit(1)
    .get();

  return result.data && result.data[0];
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const reservationId = normalizeString(event.reservationId);

    if (!OPENID || !reservationId) {
      return expectedError("OPTIMIZE_QUOTA_RELEASE_INVALID_PAYLOAD", "优化预占信息缺失，无法释放次数");
    }

    const reservationDoc = await getReservationDoc(OPENID, reservationId);

    if (!reservationDoc) {
      return expectedError("OPTIMIZE_RESERVATION_NOT_FOUND", "优化预占记录不存在，请返回作品页刷新后重试");
    }

    const quotaDoc = await ensureQuotaDoc(OPENID);

    if (reservationDoc.status !== "reserved") {
      return {
        ok: true,
        data: {
          reservation: toReservationResponse(reservationDoc),
          quota: toQuotaResponse(quotaDoc)
        }
      };
    }

    const nextReservedCount = Math.max(0, normalizeNumber(quotaDoc.reservedCount) - 1);
    const now = new Date();

    await optimizeReservations.doc(reservationDoc._id).update({
      data: {
        status: "released",
        updatedAt: now,
        releasedAt: now
      }
    });

    await optimizeQuotas.doc(quotaDoc._id).update({
      data: {
        reservedCount: nextReservedCount,
        updatedAt: now
      }
    });

    const nextQuota = await getQuotaDoc(OPENID);

    return {
      ok: true,
      data: {
        reservation: toReservationResponse({
          ...reservationDoc,
          status: "released"
        }),
        quota: toQuotaResponse(nextQuota)
      }
    };
  } catch (error) {
    return fail(error);
  }
};
