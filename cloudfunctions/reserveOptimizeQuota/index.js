"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const command = db.command;
const optimizeQuotas = db.collection("optimizeQuotas");
const optimizeReservations = db.collection("optimizeReservations");
const works = db.collection("works");

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function createSafeDocId(prefix, key) {
  const encoded = Buffer.from(key).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${prefix}_${encoded}`;
}

function createReservationId() {
  return `reservation-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
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
  console.error("reserveOptimizeQuota failed", error);
  return {
    ok: false,
    errorCode: "OPTIMIZE_QUOTA_RESERVE_FAILED",
    message: "优化次数预占失败，请稍后重试"
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
    const workId = normalizeString(event.workId);
    const source = normalizeString(event.source) || "result";
    const dimensionSet = normalizeArray(event.dimensionSet);
    const reservationId = normalizeString(event.reservationId) || createReservationId();

    if (!OPENID || !workId) {
      return expectedError("OPTIMIZE_QUOTA_RESERVE_INVALID_PAYLOAD", "优化预占信息不完整，请返回作品页重试");
    }

    const work = await getOwnedWork(OPENID, workId);

    if (!work || work.status === "deleted") {
      return expectedError("OPTIMIZE_QUOTA_WORK_NOT_FOUND", "当前作品不存在或已失效，请返回作品页刷新后重试");
    }

    const existingReservation = await getReservationDoc(OPENID, reservationId);

    if (existingReservation) {
      const currentQuota = await ensureQuotaDoc(OPENID);
      return {
        ok: true,
        data: {
          reservation: toReservationResponse(existingReservation),
          quota: toQuotaResponse(currentQuota),
          duplicated: true
        }
      };
    }

    const quotaDoc = await ensureQuotaDoc(OPENID);
    const quota = toQuotaResponse(quotaDoc);

    if (quota.availableCount <= 0) {
      return expectedError("OPTIMIZE_QUOTA_NOT_ENOUGH", "当前优化次数不足，请先观看广告补充次数");
    }

    const now = new Date();
    const reservationDoc = {
      _id: createSafeDocId("optimize_reservation", `${OPENID}:${reservationId}`),
      openid: OPENID,
      reservationId,
      workId,
      source,
      taskId: "",
      status: "reserved",
      dimensionSet,
      createdAt: now,
      updatedAt: now,
      releasedAt: null,
      committedAt: null
    };

    try {
      await optimizeReservations.add({
        data: reservationDoc
      });
    } catch (error) {
      const raceDoc = await getReservationDoc(OPENID, reservationId);

      if (raceDoc) {
        return {
          ok: true,
          data: {
            reservation: toReservationResponse(raceDoc),
            quota,
            duplicated: true
          }
        };
      }

      throw error;
    }

    await optimizeQuotas.doc(quotaDoc._id).update({
      data: {
        reservedCount: command.inc(1),
        updatedAt: new Date()
      }
    });

    const nextQuota = await getQuotaDoc(OPENID);

    return {
      ok: true,
      data: {
        reservation: toReservationResponse(reservationDoc),
        quota: toQuotaResponse(nextQuota),
        duplicated: false
      }
    };
  } catch (error) {
    return fail(error);
  }
};
