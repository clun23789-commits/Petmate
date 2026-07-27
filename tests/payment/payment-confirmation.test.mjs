import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-db.mjs";

const require = createRequire(import.meta.url);
const {
  createPaymentOrderHandler
} = require("../../cloudfunctions/createPaymentOrder/core.js");
const {
  AR_UNLOCK_AMOUNT,
  AR_UNLOCK_CURRENCY,
  createMarkPaymentPaidHandler
} = require("../../cloudfunctions/markPaymentPaid/core.js");

const NOW = "2026-07-27T08:00:00.000Z";
const OPENID = "user-openid";
const WORK_ID = "work-1";
const ORDER_ID = "order-1";

function workDoc(overrides = {}) {
  return {
    _id: "work-doc-1",
    ownerOpenid: OPENID,
    workId: WORK_ID,
    status: "ready",
    ...overrides
  };
}

function orderDoc(overrides = {}) {
  return {
    _id: ORDER_ID,
    orderId: ORDER_ID,
    openid: OPENID,
    workId: WORK_ID,
    productType: "ar_unlock",
    amount: AR_UNLOCK_AMOUNT,
    currency: AR_UNLOCK_CURRENCY,
    status: "pending",
    paymentStatus: "pending",
    entitlementStatus: "none",
    entitlementId: "",
    paymentProvider: "mock",
    paymentMode: "mock",
    paymentConfirmationSource: "",
    providerTransactionId: "",
    providerConfirmedAt: null,
    providerPayloadDigest: "",
    ...overrides
  };
}

function createHandler({
  appEnv = "development",
  openid = OPENID,
  order = orderDoc(),
  work = workDoc()
} = {}) {
  const db = new FakeDatabase({
    orders: order ? [order] : [],
    works: work ? [work] : []
  });
  const handler = createMarkPaymentPaidHandler({
    cloud: createCloud(openid),
    db,
    serverEnv: appEnv ? { PETMATE_APP_ENV: appEnv } : {},
    now: () => new Date(NOW),
    logger: quietLogger()
  });
  return {
    db,
    handler
  };
}

for (const appEnv of ["development", "staging"]) {
  test(`${appEnv} creates an explicit mock order from server configuration`, async () => {
    const db = new FakeDatabase({
      works: [workDoc()],
      orders: [],
      arEntitlements: []
    });
    const handler = createPaymentOrderHandler({
      cloud: createCloud(OPENID),
      db,
      serverEnv: {
        PETMATE_APP_ENV: appEnv
      },
      now: () => new Date(NOW),
      createOrderId: () => ORDER_ID,
      logger: quietLogger()
    });
    const result = await handler({
      workId: WORK_ID,
      productType: "ar_unlock",
      appEnv: "production",
      paymentMode: "real",
      amount: 0.01,
      currency: "USD"
    });
    assert.equal(result.ok, true);
    assert.equal(result.paymentMode, "mock");
    assert.equal(result.paymentProvider, "mock");
    assert.deepEqual(result.paymentParams, {
      mode: "mock"
    });
    const stored = db.get("orders", ORDER_ID);
    assert.equal(stored.amount, AR_UNLOCK_AMOUNT);
    assert.equal(stored.currency, AR_UNLOCK_CURRENCY);
    assert.equal(stored.paymentConfirmationSource, "");
    assert.equal(stored.providerTransactionId, "");
    assert.equal(stored.providerConfirmedAt, null);
    assert.equal(stored.providerPayloadDigest, "");
  });
}

test("production does not create a mock payment order", async () => {
  const db = new FakeDatabase({
    works: [workDoc()],
    orders: [],
    arEntitlements: []
  });
  const handler = createPaymentOrderHandler({
    cloud: createCloud(OPENID),
    db,
    serverEnv: {
      PETMATE_APP_ENV: "production"
    },
    now: () => new Date(NOW),
    createOrderId: () => ORDER_ID,
    logger: quietLogger()
  });
  const result = await handler({
    workId: WORK_ID,
    productType: "ar_unlock"
  });
  assert.equal(result.errorCode, "REAL_PAYMENT_NOT_IMPLEMENTED");
  assert.equal(db.all("orders").length, 0);
});

for (const appEnv of ["development", "staging"]) {
  test(`${appEnv} trusted mock order can be confirmed`, async () => {
    const { db, handler } = createHandler({ appEnv });
    const result = await handler({
      orderId: ORDER_ID,
      workId: WORK_ID,
      appEnv: "production",
      paymentMode: "real"
    });
    assert.equal(result.ok, true);
    assert.equal(result.paymentConfirmationSource, "trusted_mock_flow");
    const stored = db.get("orders", ORDER_ID);
    assert.equal(stored.status, "paid");
    assert.equal(stored.paymentStatus, "paid");
    assert.equal(stored.paymentConfirmationSource, "trusted_mock_flow");
    assert.equal(stored.providerTransactionId, "");
    assert.equal(new Date(stored.providerConfirmedAt).toISOString(), NOW);
  });
}

test("production rejects mock confirmation", async () => {
  const { db, handler } = createHandler({ appEnv: "production" });
  const result = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  assert.equal(result.errorCode, "MOCK_PAYMENT_NOT_ALLOWED");
  assert.equal(db.get("orders", ORDER_ID).status, "pending");
});

test("missing server environment fails closed", async () => {
  const { db, handler } = createHandler({ appEnv: "" });
  const result = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  assert.equal(result.errorCode, "SERVER_ENV_INVALID");
  assert.equal(db.get("orders", ORDER_ID).status, "pending");
});

test("real and wechat orders cannot use mock confirmation", async () => {
  for (const overrides of [
    { paymentMode: "real", paymentProvider: "wechat" },
    { paymentMode: "mock", paymentProvider: "wechat" }
  ]) {
    const { db, handler } = createHandler({
      order: orderDoc(overrides)
    });
    const result = await handler({
      orderId: ORDER_ID,
      workId: WORK_ID
    });
    assert.equal(result.errorCode, "PAYMENT_CONFIRMATION_SOURCE_INVALID");
    assert.equal(db.get("orders", ORDER_ID).status, "pending");
  }
});

test("amount and currency are server-authoritative", async () => {
  for (const overrides of [
    { amount: AR_UNLOCK_AMOUNT + 1 },
    { currency: "USD" }
  ]) {
    const { db, handler } = createHandler({
      order: orderDoc(overrides)
    });
    const result = await handler({
      orderId: ORDER_ID,
      workId: WORK_ID
    });
    assert.equal(result.errorCode, "ORDER_PRODUCT_CONFIG_MISMATCH");
    assert.equal(db.get("orders", ORDER_ID).status, "pending");
  }
});

test("a user cannot confirm another user's order", async () => {
  const { db, handler } = createHandler({
    openid: "attacker-openid"
  });
  const result = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  assert.equal(result.errorCode, "ORDER_NOT_FOUND");
  assert.equal(db.get("orders", ORDER_ID).status, "pending");
});

test("work mismatch is rejected", async () => {
  const { db, handler } = createHandler();
  const result = await handler({
    orderId: ORDER_ID,
    workId: "work-other"
  });
  assert.equal(result.errorCode, "ORDER_WORK_MISMATCH");
  assert.equal(db.get("orders", ORDER_ID).status, "pending");
});

test("a non-pending order cannot be confirmed for the first time", async () => {
  const { db, handler } = createHandler({
    order: orderDoc({
      status: "failed",
      paymentStatus: "failed"
    })
  });
  const result = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  assert.equal(result.errorCode, "ORDER_STATUS_NOT_PAYABLE");
  assert.equal(db.get("orders", ORDER_ID).status, "failed");
});

test("trusted mock paid confirmation is idempotent", async () => {
  const { db, handler } = createHandler({
    order: orderDoc({
      status: "paid",
      paymentStatus: "paid",
      paymentConfirmationSource: "trusted_mock_flow",
      providerConfirmedAt: new Date(NOW),
      paidAt: new Date(NOW)
    })
  });
  const first = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  const second = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  assert.equal(first.ok, true);
  assert.deepEqual(second, first);
  assert.equal(db.all("orders").length, 1);
});

test("legacy paid order without a trusted source is rejected", async () => {
  const { handler } = createHandler({
    order: orderDoc({
      status: "paid",
      paymentStatus: "paid"
    })
  });
  const result = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  assert.equal(result.errorCode, "PAYMENT_CONFIRMATION_SOURCE_INVALID");
});
