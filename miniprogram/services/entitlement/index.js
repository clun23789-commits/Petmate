"use strict";

const { createId } = require("../../utils/id");
const { getServiceMode, SERVICE_MODE_VALUE } = require("../runtime");
const cloudEntitlement = require("./cloud");

const entitlementMode = getServiceMode("entitlement");
const localEntitlementMap = {};

function getErrorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function normalizeEntitlement(entitlement = {}) {
  return {
    entitlementId: entitlement.entitlementId || createId("local-ar-entitlement"),
    workId: entitlement.workId || "",
    orderId: entitlement.orderId || "",
    productType: entitlement.productType || "ar_unlock",
    status: entitlement.status || "active",
    activatedAt: entitlement.activatedAt || new Date().toISOString(),
    expiresAt: entitlement.expiresAt || null,
    source: entitlement.source || "local"
  };
}

function getLocalArEntitlement(params = {}) {
  const entitlement = params.workId ? localEntitlementMap[params.workId] : null;

  return {
    ok: true,
    source: "local",
    hasEntitlement: Boolean(entitlement && entitlement.status === "active"),
    entitlement: entitlement && entitlement.status === "active" ? { ...entitlement } : null
  };
}

function grantLocalArEntitlement(params = {}) {
  if (!params.workId || !params.orderId) {
    return {
      ok: false,
      status: "error",
      message: "权益发放信息缺失，请稍后重试。"
    };
  }

  if (!localEntitlementMap[params.workId]) {
    localEntitlementMap[params.workId] = normalizeEntitlement({
      workId: params.workId,
      orderId: params.orderId
    });
  }

  return {
    ok: true,
    source: "local",
    hasEntitlement: true,
    entitlement: { ...localEntitlementMap[params.workId] }
  };
}

async function getArEntitlement(params = {}) {
  if (entitlementMode === SERVICE_MODE_VALUE.MOCK) {
    return getLocalArEntitlement(params);
  }

  try {
    const result = await cloudEntitlement.getArEntitlement(params);
    return {
      ...result,
      source: "cloud"
    };
  } catch (error) {
    console.error("getArEntitlement cloud failed", error);
    return {
      ok: false,
      status: "unavailable",
      source: "cloud",
      hasEntitlement: false,
      entitlement: null,
      cloudQueryFailed: true,
      errorCode: "AR_ENTITLEMENT_QUERY_UNAVAILABLE",
      message: getErrorMessage(error, "AR 权益查询失败，请稍后重试。")
    };
  }
}

async function grantArEntitlement(params = {}) {
  if (entitlementMode === SERVICE_MODE_VALUE.MOCK) {
    return grantLocalArEntitlement(params);
  }

  try {
    const result = await cloudEntitlement.grantArEntitlement(params);
    return {
      ...result,
      source: "cloud"
    };
  } catch (error) {
    console.error("grantArEntitlement cloud failed", error);
    return {
      ok: false,
      status: "unavailable",
      source: "cloud",
      hasEntitlement: false,
      entitlement: null,
      cloudQueryFailed: true,
      errorCode: "AR_ENTITLEMENT_GRANT_UNAVAILABLE",
      message: getErrorMessage(error, "AR 权益发放失败，请稍后重试。")
    };
  }
}

module.exports = {
  getArEntitlement,
  grantArEntitlement
};
