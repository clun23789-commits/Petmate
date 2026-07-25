"use strict";

function assertCloudReady() {
  if (typeof wx === "undefined" || !wx.cloud || typeof wx.cloud.callFunction !== "function") {
    throw new Error("微信云开发能力不可用，请先确认 app.js 已初始化 wx.cloud");
  }
}

function unwrapCloudEnvelope(response, functionName) {
  if (!response || typeof response !== "object" || !response.result || typeof response.result !== "object") {
    throw new Error(`${functionName} 云函数返回格式异常`);
  }

  const result = response.result;

  if (result.ok !== true && result.ok !== false) {
    throw new Error(`${functionName} 云函数返回格式异常`);
  }

  return result;
}

async function callPaymentFunction(name, data = {}) {
  assertCloudReady();
  const response = await wx.cloud.callFunction({
    name,
    data
  });

  return unwrapCloudEnvelope(response, name);
}

function isCancelError(error) {
  const message = (error && (error.errMsg || error.message)) || "";
  return /cancel|取消/i.test(message);
}

function requestWechatPayment(paymentParams = {}) {
  if (typeof wx === "undefined" || typeof wx.requestPayment !== "function") {
    return Promise.reject(new Error("微信支付能力不可用"));
  }

  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: paymentParams.timeStamp || "",
      nonceStr: paymentParams.nonceStr || "",
      package: paymentParams.package || "",
      signType: paymentParams.signType || "RSA",
      paySign: paymentParams.paySign || "",
      success: resolve,
      fail: reject
    });
  });
}

async function createPaymentOrder(params = {}) {
  return callPaymentFunction("createPaymentOrder", params);
}

async function requestPayment(params = {}) {
  const paymentParams = params.paymentParams || {};

  if (!paymentParams || paymentParams.mode === "mock") {
    return {
      ok: true,
      status: "success",
      orderId: params.orderId || "",
      raw: {
        mock: true
      }
    };
  }

  try {
    const raw = await requestWechatPayment(paymentParams);
    return {
      ok: true,
      status: "success",
      orderId: params.orderId || "",
      raw
    };
  } catch (error) {
    if (isCancelError(error)) {
      return {
        ok: false,
        status: "cancelled",
        reason: "payment_cancelled",
        message: "支付已取消",
        raw: error
      };
    }

    return {
      ok: false,
      status: "failed",
      reason: "payment_failed",
      message: "支付失败，请稍后重试",
      raw: error
    };
  }
}

async function markPaymentPaid(params = {}) {
  return callPaymentFunction("markPaymentPaid", params);
}

async function getPaymentOrder(params = {}) {
  return callPaymentFunction("getPaymentOrder", params);
}

module.exports = {
  createPaymentOrder,
  requestPayment,
  markPaymentPaid,
  getPaymentOrder
};
