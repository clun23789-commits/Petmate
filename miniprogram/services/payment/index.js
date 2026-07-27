"use strict";

const {
  getServiceMode,
  SERVICE_MODE_VALUE,
  allowsMockFallback
} = require("../runtime");
const cloudPayment = require("./cloud");
const mockPayment = require("./mock");

const paymentMode = getServiceMode("payment");

function normalizeError(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function shouldUseMockOnly() {
  return paymentMode === SERVICE_MODE_VALUE.MOCK;
}

function shouldFallbackToMock() {
  return allowsMockFallback("payment");
}

function buildPaymentUnavailable(error, fallback) {
  return {
    ok: false,
    status: "error",
    errorCode: "PAYMENT_SERVICE_UNAVAILABLE",
    message: normalizeError(error, fallback)
  };
}

async function createPaymentOrder(params = {}) {
  if (shouldUseMockOnly()) {
    return mockPayment.createPaymentOrder(params);
  }

  try {
    return await cloudPayment.createPaymentOrder(params);
  } catch (error) {
    if (shouldFallbackToMock()) {
      console.warn("createPaymentOrder cloud failed, fallback to mock", error);
      return mockPayment.createPaymentOrder(params);
    }

    console.error("createPaymentOrder cloud failed", error);
    return buildPaymentUnavailable(error, "订单创建失败，请稍后重试。");
  }
}

async function requestPayment(params = {}) {
  if (shouldUseMockOnly()) {
    return mockPayment.requestPayment(params);
  }

  return cloudPayment.requestPayment(params);
}

async function markPaymentPaid(params = {}) {
  if (shouldUseMockOnly()) {
    return mockPayment.markPaymentPaid(params);
  }

  if (normalizeString(params.paymentMode) !== "mock") {
    return {
      ok: false,
      status: "confirming",
      errorCode: "REAL_PAYMENT_CONFIRMATION_NOT_IMPLEMENTED",
      message: "真实支付结果必须等待服务端通知确认。"
    };
  }

  try {
    return await cloudPayment.markPaymentPaid(params);
  } catch (error) {
    console.error("markPaymentPaid cloud failed", error);
    return buildPaymentUnavailable(error, "订单支付状态确认失败，请稍后重试。");
  }
}

async function getPaymentOrder(params = {}) {
  if (shouldUseMockOnly()) {
    return mockPayment.getPaymentOrder(params);
  }

  try {
    return await cloudPayment.getPaymentOrder(params);
  } catch (error) {
    if (shouldFallbackToMock()) {
      console.warn("getPaymentOrder cloud failed, fallback to mock", error);
      return mockPayment.getPaymentOrder(params);
    }

    console.error("getPaymentOrder cloud failed", error);
    return buildPaymentUnavailable(error, "订单查询失败，请稍后重试。");
  }
}

function clearOrdersByWorkId(workId) {
  mockPayment.clearOrdersByWorkId(workId);
}

async function createOrder(workId) {
  return createPaymentOrder({
    workId,
    productType: "ar_unlock"
  });
}

async function payOrder(orderId, workId, mode = "success") {
  const normalizedOrderId = normalizeString(orderId);
  const normalizedWorkId = normalizeString(workId);

  if (!normalizedOrderId || !normalizedWorkId) {
    return {
      ok: false,
      orderId: normalizedOrderId,
      workId: normalizedWorkId,
      paymentStatus: "error",
      status: "error",
      entitlementStatus: "none",
      message: "订单或作品信息缺失，请返回后重试。"
    };
  }

  const orderResult = await getPaymentOrder({
    orderId: normalizedOrderId
  });
  const order = orderResult && orderResult.order;

  if (!order || order.workId !== normalizedWorkId) {
    return {
      ok: false,
      orderId: normalizedOrderId,
      workId: normalizedWorkId,
      paymentStatus: "error",
      status: "error",
      entitlementStatus: "none",
      errorCode: "ORDER_NOT_FOUND",
      message: "订单不存在或与当前作品不匹配。"
    };
  }

  const paymentResult = await requestPayment({
    orderId: normalizedOrderId,
    paymentParams: order.paymentParams,
    scenario: mode
  });

  if (!paymentResult.ok) {
    return {
      orderId: normalizedOrderId,
      workId: normalizedWorkId,
      paymentStatus: paymentResult.status,
      status: paymentResult.status,
      entitlementStatus: "none",
      message: paymentResult.message
    };
  }

  if (order.paymentMode !== "mock") {
    return {
      ...order,
      ok: false,
      paymentStatus: "confirming",
      status: "confirming",
      entitlementStatus: order.entitlementStatus || "none",
      errorCode: "REAL_PAYMENT_CONFIRMATION_NOT_IMPLEMENTED",
      message: "支付请求已完成，正在等待服务端确认支付结果。"
    };
  }

  const paidResult = await markPaymentPaid({
    orderId: normalizedOrderId,
    workId: normalizedWorkId,
    paymentMode: order.paymentMode
  });

  if (!paidResult.ok) {
    return null;
  }

  return {
    ...paidResult,
    paymentStatus: "paid",
    entitlementStatus: paidResult.entitlementStatus || "pending_sync"
  };
}

async function retryQueryEntitlement(orderId) {
  if (!shouldUseMockOnly() && !shouldFallbackToMock()) {
    return null;
  }

  return mockPayment.retryQueryEntitlement(orderId);
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
