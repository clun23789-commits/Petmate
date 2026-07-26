import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-database.mjs";
import {
  CLIENT_REWARD_ID,
  NOW,
  OPENID,
  grantedSessionDoc,
  quotaDoc,
  quotaGrantDoc,
  sessionDoc
} from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const core = require("../../cloudfunctions/getAdRewardStatus/core.js");

function createHandler(db, options = {}) {
  return core.createGetAdRewardStatusHandler({
    cloud: createCloud(options.openid || OPENID),
    db,
    now: options.now || (() => NOW),
    logger: quietLogger()
  });
}

function statusPayload(overrides = {}) {
  return {
    rewardScene: "initial_unlock",
    clientRewardId: CLIENT_REWARD_ID,
    ...overrides
  };
}

test("missing session returns not_found", async () => {
  const result = await createHandler(new FakeDatabase())(statusPayload());

  assert.equal(result.ok, true);
  assert.equal(result.status, "not_found");
});

test("pending unexpired session remains pending", async () => {
  const session = sessionDoc();
  const db = new FakeDatabase({
    adRewardGrants: [session]
  });
  const result = await createHandler(db)(statusPayload());

  assert.equal(result.ok, true);
  assert.equal(result.status, "pending");
  assert.equal(db.get("adRewardGrants", session._id).status, "pending");
});

test("expired pending session transitions only to expired", async () => {
  const session = sessionDoc({
    expiresAt: new Date(NOW.getTime() - 1)
  });
  const db = new FakeDatabase({
    adRewardGrants: [session],
    optimizeQuotas: [quotaDoc()]
  });
  const beforeCount = db.get("optimizeQuotas", quotaDoc()._id).grantedCount;
  const result = await createHandler(db)(statusPayload());

  assert.equal(result.ok, true);
  assert.equal(result.status, "expired");
  assert.equal(db.get("adRewardGrants", session._id).status, "expired");
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).grantedCount, beforeCount);
  assert.equal(db.all("optimizeQuotaGrants").length, 0);
});

test("fully settled reward returns granted with current quota", async () => {
  const session = grantedSessionDoc();
  const db = new FakeDatabase({
    adRewardGrants: [session],
    optimizeQuotaGrants: [quotaGrantDoc(session)],
    optimizeQuotas: [quotaDoc()]
  });
  const result = await createHandler(db)(statusPayload());

  assert.equal(result.ok, true);
  assert.equal(result.status, "granted");
  assert.equal(result.count, 3);
  assert.equal(result.quota.grantedCount, 3);
  assert.equal(result.quota.availableCount, 1);
});

test("granted ad without quota grant returns AD_REWARD_INCONSISTENT", async () => {
  const session = grantedSessionDoc();
  const db = new FakeDatabase({
    adRewardGrants: [session],
    optimizeQuotas: [quotaDoc()]
  });
  const result = await createHandler(db)(statusPayload());

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AD_REWARD_INCONSISTENT");
});

test("granted ad with quotaApplied false returns AD_REWARD_INCONSISTENT", async () => {
  const session = grantedSessionDoc({
    quotaApplied: false
  });
  const db = new FakeDatabase({
    adRewardGrants: [session],
    optimizeQuotaGrants: [quotaGrantDoc(session)],
    optimizeQuotas: [quotaDoc()]
  });
  const result = await createHandler(db)(statusPayload());

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AD_REWARD_INCONSISTENT");
});

test("quota grant id mismatch returns AD_REWARD_INCONSISTENT", async () => {
  const session = grantedSessionDoc();
  const db = new FakeDatabase({
    adRewardGrants: [session],
    optimizeQuotaGrants: [
      quotaGrantDoc(session, {
        grantId: "quota-grant-mismatched"
      })
    ],
    optimizeQuotas: [quotaDoc()]
  });
  const result = await createHandler(db)(statusPayload());

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AD_REWARD_INCONSISTENT");
});

test("status query never changes quota or creates grant records", async () => {
  const session = grantedSessionDoc();
  const grant = quotaGrantDoc(session);
  const quota = quotaDoc();
  const db = new FakeDatabase({
    adRewardGrants: [session],
    optimizeQuotaGrants: [grant],
    optimizeQuotas: [quota]
  });
  const handler = createHandler(db);
  const beforeQuota = db.get("optimizeQuotas", quota._id);
  const beforeGrants = db.all("optimizeQuotaGrants");

  await handler(statusPayload());
  await handler(statusPayload());

  assert.deepEqual(db.get("optimizeQuotas", quota._id), beforeQuota);
  assert.deepEqual(db.all("optimizeQuotaGrants"), beforeGrants);
});

test("rejected session is reported without issuing quota", async () => {
  const session = sessionDoc({
    status: "rejected",
    rejectedAt: NOW
  });
  const db = new FakeDatabase({
    adRewardGrants: [session]
  });
  const result = await createHandler(db)(statusPayload());

  assert.equal(result.ok, true);
  assert.equal(result.status, "rejected");
  assert.equal(db.all("optimizeQuotaGrants").length, 0);
});
