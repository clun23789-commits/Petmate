"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const works = db.collection("works");
const arEntitlements = db.collection("arEntitlements");

const ALLOWED_AR_WORK_STATUS = ["ready", "retouched"];

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(error, message, errorCode = "GET_AR_ENTITLEMENT_FAILED") {
  console.error("getArEntitlement failed", error);
  return {
    ok: false,
    status: "error",
    errorCode,
    message
  };
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

function normalizeEntitlement(entitlement) {
  if (!entitlement) {
    return null;
  }

  return {
    entitlementId: entitlement.entitlementId,
    workId: entitlement.workId,
    orderId: entitlement.orderId,
    productType: entitlement.productType,
    status: entitlement.status,
    ownerOpenid: entitlement.ownerOpenid || entitlement.openid || "",
    activatedAt: entitlement.activatedAt,
    expiresAt: entitlement.expiresAt || null
  };
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const workId = normalizeString(event.workId);

    if (!OPENID) {
      return fail(new Error("OPENID is required"), "AR 权益查询失败，请稍后重试。", "OPENID_REQUIRED");
    }

    if (!workId) {
      return {
        ok: false,
        status: "error",
        errorCode: "WORK_ID_REQUIRED",
        message: "当前作品信息缺失，请返回后重试。"
      };
    }

    const work = await getOwnedWork(OPENID, workId);
    if (!work || work.status === "deleted") {
      return {
        ok: true,
        status: "work_not_found",
        hasEntitlement: false,
        entitlement: null,
        message: "作品不存在或已删除。"
      };
    }

    if (!ALLOWED_AR_WORK_STATUS.includes(work.status)) {
      return {
        ok: true,
        status: "work_not_ready",
        hasEntitlement: false,
        entitlement: null,
        message: "当前作品暂不可使用 AR 权益。"
      };
    }

    const result = await arEntitlements
      .where({
        openid: OPENID,
        workId,
        status: "active"
      })
      .limit(1)
      .get();
    const entitlement = result.data && result.data[0];

    return {
      ok: true,
      status: entitlement ? "active" : "none",
      hasEntitlement: Boolean(entitlement),
      entitlement: normalizeEntitlement(entitlement)
    };
  } catch (error) {
    return fail(error, "AR 权益查询失败，请稍后重试。");
  }
};
