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

  if (params.paymentParams && params.paymentParams.mode === "mock" && !shouldFallbackToMock()) {
    return {
      ok: false,
      status: "failed",
      reason: "mock_payment_not_allowed",
      message: "当前支付模式不允许使用 mock 支付参数。"
    };
  }

  return cloudPayment.requestPayment(params);
}

async function markPaymentPaid(params = {}) {
  if (shouldUseMockOnly()) {
    return mockPayment.markPaymentPaid(params);
  }

  try {
    return await cloudPayment.markPaymentPaid(params);
  } catch (error) {
    if (!shouldFallbackToMock()) {
      console.error("markPaymentPaid cloud failed", error);
      return buildPaymentUnavailable(error, "订单支付状态确认失败，请稍后重试。");
    }

    console.warn("markPaymentPaid cloud failed, fallback to mock", error);
    const result = await mockPayment.markPaymentPaid(params);

    if (result.ok) {
      return result;
    }

    return {
      ok: false,
      status: "error",
      message: normalizeError(error, "订单支付状态确认失败，请稍后重试。")
    };
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

  const paymentResult = await requestPayment({ orderId: normalizedOrderId, scenario: mode });

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

  const paidResult = await markPaymentPaid({
    orderId: normalizedOrderId,
    workId: normalizedWorkId
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
