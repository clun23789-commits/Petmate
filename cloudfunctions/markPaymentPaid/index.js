"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const orders = db.collection("orders");
const works = db.collection("works");

const ALLOWED_PRODUCT_TYPE = "ar_unlock";
const ALLOWED_AR_WORK_STATUS = ["ready", "retouched"];

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(error, message, errorCode = "MARK_PAYMENT_PAID_FAILED") {
  console.error("markPaymentPaid failed", error);
  return {
    ok: false,
    status: "error",
    errorCode,
    message
  };
}

function expectedError(errorCode, message, status = "error") {
  return {
    ok: false,
    status,
    errorCode,
    message
  };
}

function isPayableWork(work) {
  return work && work.status !== "deleted" && ALLOWED_AR_WORK_STATUS.includes(work.status);
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

function toPaidResponse(order) {
  return {
    ok: true,
    orderId: order.orderId,
    workId: order.workId,
    productType: order.productType,
    amount: order.amount,
    currency: order.currency,
    status: "paid",
    paymentStatus: "paid",
    entitlementStatus: order.entitlementStatus || "pending_sync",
    entitlementId: order.entitlementId || "",
    paidAt: order.paidAt || new Date(),
    updatedAt: order.updatedAt || order.paidAt || new Date(),
    workSnapshot: order.workSnapshot || null
  };
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const orderId = normalizeString(event.orderId);
    const workId = normalizeString(event.workId);

    if (!OPENID) {
      return fail(new Error("OPENID is required"), "支付状态确认失败，请稍后重试。", "OPENID_REQUIRED");
    }

    if (!orderId || !workId) {
      return fail(new Error("orderId and workId are required"), "订单信息缺失，请返回后重试。", "ORDER_INFO_REQUIRED");
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
      return fail(new Error("order not found"), "订单不存在，请重新发起支付。", "ORDER_NOT_FOUND");
    }

    if (order.workId !== workId) {
      return fail(new Error("workId mismatch"), "订单与当前作品不匹配。", "ORDER_WORK_MISMATCH");
    }

    if (order.productType !== ALLOWED_PRODUCT_TYPE) {
      return fail(new Error("invalid productType"), "暂不支持该支付项目。", "INVALID_PRODUCT_TYPE");
    }

    const work = await getOwnedWork(OPENID, workId);
    if (!work || work.status === "deleted") {
      return expectedError("WORK_NOT_FOUND", "作品不存在或已删除，请返回作品页刷新后重试。");
    }

    if (!isPayableWork(work)) {
      return expectedError("WORK_STATUS_NOT_PAYABLE", "当前作品状态暂不能解锁 AR 权益。");
    }

    if (order.status === "paid") {
      return toPaidResponse(order);
    }

    if (order.status !== "pending") {
      return {
        ok: false,
        status: order.status || "failed",
        errorCode: "ORDER_STATUS_NOT_PAYABLE",
        message: "当前订单状态不能确认支付，请重新发起支付。"
      };
    }

    const now = new Date();
    await orders.doc(order._id).update({
      data: {
        status: "paid",
        paymentStatus: "paid",
        entitlementStatus: "pending_sync",
        paidAt: now,
        updatedAt: now
      }
    });

    return toPaidResponse({
      ...order,
      status: "paid",
      paymentStatus: "paid",
      entitlementStatus: "pending_sync",
      paidAt: now
    });
  } catch (error) {
    return fail(error, "支付状态确认失败，请稍后重试。");
  }
};
