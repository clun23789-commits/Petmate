"use strict";

const { mockRights } = require("../../mocks/data/mockRights");
const { createId } = require("../../utils/id");

const orderRuntimeMap = {};

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAmount(amount) {
  return typeof amount === "number" && amount > 0 ? amount : mockRights.currentWorkArPrice;
}

async function createPaymentOrder(params = {}) {
  const order = {
    ok: true,
    orderId: createId("mock-order"),
    workId: params.workId || "",
    productType: params.productType || "ar_unlock",
    amount: normalizeAmount(params.amount),
    currency: params.currency || "CNY",
    status: "pending",
    paymentStatus: "pending",
    entitlementStatus: "none",
    paymentProvider: "wechat",
    paymentMode: "mock",
    paymentParams: {
      mode: "mock",
      timeStamp: "",
      nonceStr: "",
      package: "",
      signType: "RSA",
      paySign: ""
    },
    createdAt: new Date().toISOString(),
    paidAt: null,
    retryCount: 0
  };

  orderRuntimeMap[order.orderId] = order;
  return { ...order };
}

async function requestPayment(params = {}) {
  const scenario = params.scenario || params.mode || "success";

  if (scenario === "cancelled") {
    return {
      ok: false,
      status: "cancelled",
      reason: "payment_cancelled",
      message: "支付已取消"
    };
  }

  if (scenario === "failed") {
    return {
      ok: false,
      status: "failed",
      reason: "payment_failed",
      message: "支付失败，请稍后重试"
    };
  }

  return {
    ok: true,
    status: "success",
    orderId: params.orderId || ""
  };
}

async function markPaymentPaid(params = {}) {
  const orderId = normalizeString(params.orderId);
  const workId = normalizeString(params.workId);
  const order = orderRuntimeMap[orderId];

  if (!orderId || !workId) {
    return {
      ok: false,
      status: "error",
      errorCode: "ORDER_INFO_REQUIRED",
      message: "订单或作品信息缺失，请返回后重试。"
    };
  }

  if (!order) {
    return {
      ok: false,
      status: "not_found",
      message: "订单不存在，请重新发起支付。"
    };
  }

  if (order.workId !== workId) {
    return {
      ok: false,
      status: "work_mismatch",
      errorCode: "ORDER_WORK_MISMATCH",
      message: "订单与当前作品不匹配。"
    };
  }

  order.status = "paid";
  order.paymentStatus = "paid";
  order.entitlementStatus = "pending_sync";
  order.paidAt = order.paidAt || new Date().toISOString();

  return {
    ok: true,
    orderId: order.orderId,
    workId: order.workId,
    productType: order.productType,
    amount: order.amount,
    currency: order.currency,
    status: "paid",
    paymentStatus: "paid",
    entitlementStatus: order.entitlementStatus,
    paidAt: order.paidAt
  };
}

async function getPaymentOrder(params = {}) {
  const order = orderRuntimeMap[params.orderId];

  if (!order) {
    return {
      ok: true,
      status: "not_found",
      order: null
    };
  }

  return {
    ok: true,
    status: order.status,
    order: { ...order }
  };
}

function clearOrdersByWorkId(workId) {
  Object.keys(orderRuntimeMap).forEach((orderId) => {
    if (orderRuntimeMap[orderId] && orderRuntimeMap[orderId].workId === workId) {
      delete orderRuntimeMap[orderId];
    }
  });
}

async function createOrder(workId) {
  return createPaymentOrder({
    workId,
    productType: "ar_unlock",
    amount: mockRights.currentWorkArPrice,
    currency: "CNY"
  });
}

async function payOrder(orderId, workId, mode = "success") {
  const normalizedOrderId = normalizeString(orderId);
  const normalizedWorkId = normalizeString(workId);

  if (!normalizedOrderId || !normalizedWorkId) {
    return {
      ok: false,
      status: "error",
      paymentStatus: "error",
      entitlementStatus: "none",
      message: "订单或作品信息缺失，请返回后重试。"
    };
  }

  const paymentResult = await requestPayment({ orderId: normalizedOrderId, scenario: mode });

  if (!paymentResult.ok) {
    const order = orderRuntimeMap[normalizedOrderId];

    if (order) {
      order.status = paymentResult.status;
      order.paymentStatus = paymentResult.status;
      order.entitlementStatus = "none";
      return { ...order };
    }

    return null;
  }

  const paidResult = await markPaymentPaid({
    orderId: normalizedOrderId,
    workId: normalizedWorkId
  });
  const order = orderRuntimeMap[normalizedOrderId];

  if (order) {
    order.entitlementStatus = "pending_sync";
  }

  return paidResult.ok && order ? { ...order } : null;
}

async function retryQueryEntitlement(orderId) {
  const order = orderRuntimeMap[orderId];

  if (!order) {
    return null;
  }

  order.retryCount += 1;
  order.status = "paid";
  order.paymentStatus = "paid";
  order.entitlementStatus = "active";
  order.paidAt = order.paidAt || new Date().toISOString();
  return { ...order };
}

module.exports = {
  createPaymentOrder,
  requestPayment,
  markPaymentPaid,
  getPaymentOrder,
  clearOrdersByWorkId,
  createOrder,
  payOrder,
  retryQueryEntitlement
};
