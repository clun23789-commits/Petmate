import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtimePath = require.resolve("../../miniprogram/services/runtime.js");
const paymentCloudPath = require.resolve("../../miniprogram/services/payment/cloud.js");

function loadPaymentCloud(isProduction) {
  const runtime = require(runtimePath);
  const original = runtime.isProductionLikeEnv;
  runtime.isProductionLikeEnv = () => isProduction;
  delete require.cache[paymentCloudPath];
  const paymentCloud = require(paymentCloudPath);
  runtime.isProductionLikeEnv = original;
  return paymentCloud;
}

test("missing payment params never default to success", async () => {
  const paymentCloud = loadPaymentCloud(false);
  const result = await paymentCloud.requestPayment({
    orderId: "order-1"
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "PAYMENT_PARAMS_MISSING");
});

test("production rejects explicit mock payment params", async () => {
  const paymentCloud = loadPaymentCloud(true);
  const result = await paymentCloud.requestPayment({
    orderId: "order-1",
    paymentParams: {
      mode: "mock"
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "MOCK_PAYMENT_NOT_ALLOWED");
});

test("invalid real payment params do not invoke wx.requestPayment", async () => {
  let requestCount = 0;
  globalThis.wx = {
    requestPayment() {
      requestCount += 1;
    }
  };
  const paymentCloud = loadPaymentCloud(false);
  const result = await paymentCloud.requestPayment({
    orderId: "order-1",
    paymentParams: {
      mode: "real",
      timeStamp: "123"
    }
  });
  delete globalThis.wx;
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "PAYMENT_PARAMS_INVALID");
  assert.equal(requestCount, 0);
});
