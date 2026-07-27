import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-db.mjs";

const require = createRequire(import.meta.url);
const {
  createGrantArEntitlementHandler,
  getEntitlementDocId
} = require("../../cloudfunctions/grantArEntitlement/core.js");

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

function paidOrder(overrides = {}) {
  return {
    _id: ORDER_ID,
    orderId: ORDER_ID,
    openid: OPENID,
    workId: WORK_ID,
    productType: "ar_unlock",
    amount: 9.9,
    currency: "CNY",
    status: "paid",
    paymentStatus: "paid",
    entitlementStatus: "pending_sync",
    entitlementId: "",
    paymentProvider: "mock",
    paymentMode: "mock",
    paymentConfirmationSource: "trusted_mock_flow",
    providerTransactionId: "",
    providerConfirmedAt: new Date(NOW),
    ...overrides
  };
}

function createHandler({
  appEnv = "development",
  openid = OPENID,
  order = paidOrder(),
  work = workDoc(),
  entitlements = []
} = {}) {
  const db = new FakeDatabase({
    orders: order ? [order] : [],
    works: work ? [work] : [],
    arEntitlements: entitlements
  });
  const handler = createGrantArEntitlementHandler({
    cloud: createCloud(openid),
    db,
    serverEnv: appEnv ? { PETMATE_APP_ENV: appEnv } : {},
    now: () => new Date(NOW),
    createEntitlementId: () => "entitlement-stable",
    logger: quietLogger()
  });
  return {
    db,
    handler
  };
}

test("an untrusted legacy paid order cannot grant entitlement", async () => {
  const { db, handler } = createHandler({
    order: paidOrder({
      paymentConfirmationSource: ""
    })
  });
  const result = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  assert.equal(result.errorCode, "PAYMENT_CONFIRMATION_SOURCE_INVALID");
  assert.equal(db.all("arEntitlements").length, 0);
});

test("grant cannot bypass a pending payment", async () => {
  const { db, handler } = createHandler({
    order: paidOrder({
      status: "pending",
      paymentStatus: "pending",
      paymentConfirmationSource: ""
    })
  });
  const result = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  assert.equal(result.errorCode, "ORDER_NOT_PAID");
  assert.equal(db.all("arEntitlements").length, 0);
});

test("production cannot grant an entitlement from a mock payment", async () => {
  const { db, handler } = createHandler({
    appEnv: "production"
  });
  const result = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  assert.equal(result.errorCode, "MOCK_PAYMENT_NOT_ALLOWED");
  assert.equal(db.all("arEntitlements").length, 0);
});

test("real payment confirmation remains unavailable", async () => {
  const { db, handler } = createHandler({
    appEnv: "production",
    order: paidOrder({
      paymentMode: "real",
      paymentProvider: "wechat",
      paymentConfirmationSource: "wechat_server_notification",
      providerTransactionId: "wechat-transaction-1"
    })
  });
  const result = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  assert.equal(result.errorCode, "REAL_PAYMENT_CONFIRMATION_NOT_IMPLEMENTED");
  assert.equal(db.all("arEntitlements").length, 0);
});

test("repeated entitlement grant keeps one active entitlement", async () => {
  const { db, handler } = createHandler();
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
  assert.equal(db.all("arEntitlements").length, 1);
  assert.equal(db.get("orders", ORDER_ID).entitlementStatus, "active");
  assert.equal(db.get("orders", ORDER_ID).entitlementId, "entitlement-stable");
});

test("concurrent entitlement grants keep one active entitlement", async () => {
  const { db, handler } = createHandler();
  const results = await Promise.all([
    handler({
      orderId: ORDER_ID,
      workId: WORK_ID
    }),
    handler({
      orderId: ORDER_ID,
      workId: WORK_ID
    })
  ]);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, true);
  assert.equal(db.all("arEntitlements").length, 1);
  assert.equal(db.all("arEntitlements")[0]._id, getEntitlementDocId(OPENID, WORK_ID));
});

test("order and entitlement changes roll back together", async () => {
  const { db, handler } = createHandler();
  db.failNext("orders", "update");
  const result = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  assert.equal(result.errorCode, "GRANT_AR_ENTITLEMENT_FAILED");
  assert.equal(db.all("arEntitlements").length, 0);
  assert.equal(db.get("orders", ORDER_ID).entitlementStatus, "pending_sync");
});

test("deleted work cannot receive an entitlement", async () => {
  const { db, handler } = createHandler({
    work: workDoc({
      status: "deleted"
    })
  });
  const result = await handler({
    orderId: ORDER_ID,
    workId: WORK_ID
  });
  assert.equal(result.errorCode, "WORK_NOT_FOUND");
  assert.equal(db.all("arEntitlements").length, 0);
});
