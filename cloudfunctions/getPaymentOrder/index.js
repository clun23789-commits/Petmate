"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const orders = db.collection("orders");
const works = db.collection("works");

const ALLOWED_AR_WORK_STATUS = ["ready", "retouched"];

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(error, message, errorCode = "GET_PAYMENT_ORDER_FAILED") {
  console.error("getPaymentOrder failed", error);
  return {
    ok: false,
    status: "error",
    errorCode,
    message
  };
}

function isWorkUnavailable(work) {
  return !work || work.status === "deleted" || !ALLOWED_AR_WORK_STATUS.includes(work.status);
}

async function getOwnedWork(openid, workId) {
  if (!workId) {
    return null;
  }

  const result = await works
    .where({
      ownerOpenid: openid,
      workId
    })
    .limit(1)
    .get();

  return result.data && result.data[0];
}

function normalizeOrder(order, workUnavailable) {
  return {
    orderId: order.orderId,
    workId: order.workId,
    productType: order.productType,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    paymentStatus: order.paymentStatus || order.status,
    entitlementStatus: order.entitlementStatus || "none",
    entitlementId: order.entitlementId || "",
    paymentMode: order.paymentMode,
    paymentProvider: order.paymentProvider || "",
    paymentConfirmationSource: order.paymentConfirmationSource || "",
    providerTransactionId: order.providerTransactionId || "",
    providerConfirmedAt: order.providerConfirmedAt || null,
    paymentParams: order.paymentParams || null,
    workSnapshot: order.workSnapshot || null,
    workUnavailable,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt || null,
    paidAt: order.paidAt || null
  };
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const orderId = normalizeString(event.orderId);

    if (!OPENID) {
      return fail(new Error("OPENID is required"), "订单查询失败，请稍后重试。", "OPENID_REQUIRED");
    }

    if (!orderId) {
      return {
        ok: false,
        status: "error",
        errorCode: "ORDER_ID_REQUIRED",
        message: "订单信息缺失，请返回后重试。"
      };
    }

    const result = await orders
      .where({
        openid: OPENID,
        orderId
      })
      .limit(1)
      .get();
    const order = result.data && result.data[0];

    if (!order) {
      return {
        ok: true,
        status: "not_found",
        order: null
      };
    }

    const work = await getOwnedWork(OPENID, order.workId);
    const workUnavailable = isWorkUnavailable(work);

    return {
      ok: true,
      status: order.status || "pending",
      order: normalizeOrder(order, workUnavailable)
    };
  } catch (error) {
    return fail(error, "订单查询失败，请稍后重试。");
  }
};
