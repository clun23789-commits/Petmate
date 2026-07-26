import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-database.mjs";
import {
  CLIENT_REWARD_ID,
  NOW,
  OPENID,
  OTHER_OPENID,
  OTHER_WORK_ID,
  WORK_ID,
  quotaDoc,
  quotaGrantDoc,
  sessionDoc,
  workDoc
} from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const core = require("../../cloudfunctions/grantAdReward/core.js");

function createHandler(db, options = {}) {
  return core.createGrantAdRewardHandler({
    cloud: createCloud(options.openid || OPENID),
    db,
    now: options.now || (() => NOW),
    logger: quietLogger(),
    randomBytes: () => Buffer.alloc(16, 0xcd)
  });
}

function settlePayload(overrides = {}) {
  return {
    rewardScene: "initial_unlock",
    clientRewardId: CLIENT_REWARD_ID,
    completionStatus: "completed",
    ...overrides
  };
}

function createSettlementDatabase(options = {}) {
  return new FakeDatabase({
    adRewardGrants: [options.session || sessionDoc()],
    optimizeQuotas: options.withoutQuota ? [] : [options.quota || quotaDoc()],
    optimizeQuotaGrants: options.quotaGrants || [],
    works: options.works || []
  });
}

test("settlement atomically grants exactly three optimize attempts", async () => {
  const session = sessionDoc();
  const db = createSettlementDatabase({ session });
  const result = await createHandler(db)(settlePayload({ count: 999, grantCount: 999 }));
  const storedSession = db.get("adRewardGrants", session._id);
  const storedQuota = db.get("optimizeQuotas", core.getQuotaDocId(OPENID));
  const grants = db.all("optimizeQuotaGrants");

  assert.equal(result.ok, true);
  assert.equal(result.status, "granted");
  assert.equal(result.count, 3);
  assert.equal(result.transitionApplied, true);
  assert.equal(result.duplicated, false);
  assert.equal(result.quota.grantedCount, 6);
  assert.equal(result.quota.usedCount, 1);
  assert.equal(result.quota.reservedCount, 1);
  assert.equal(storedQuota.grantedCount, 6);
  assert.equal(storedQuota.usedCount, 1);
  assert.equal(storedQuota.reservedCount, 1);
  assert.equal(storedSession.status, "granted");
  assert.equal(storedSession.quotaApplied, true);
  assert.equal(storedSession.verificationStatus, "client_confirmed");
  assert.equal(storedSession.completionEvidence.trustLevel, "client_reported");
  assert.equal(Object.hasOwn(storedSession, "adResult"), false);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].count, 3);
  assert.equal(grants[0].quotaApplied, true);
});

test("settlement creates a missing quota record inside the transaction", async () => {
  const db = createSettlementDatabase({ withoutQuota: true });
  const result = await createHandler(db)(settlePayload());

  assert.equal(result.ok, true);
  assert.equal(result.quota.grantedCount, 3);
  assert.equal(result.quota.usedCount, 0);
  assert.equal(result.quota.reservedCount, 0);
});

test("repeated settlement returns the existing result without another grant", async () => {
  const db = createSettlementDatabase();
  const handler = createHandler(db);
  const first = await handler(settlePayload());
  const second = await handler(settlePayload());

  assert.equal(first.transitionApplied, true);
  assert.equal(second.ok, true);
  assert.equal(second.duplicated, true);
  assert.equal(second.transitionApplied, false);
  assert.equal(second.quota.grantedCount, 6);
  assert.equal(db.all("optimizeQuotaGrants").length, 1);
});

test("two concurrent settlements increase quota only once", async () => {
  const db = createSettlementDatabase();
  const handler = createHandler(db);
  const [left, right] = await Promise.all([
    handler(settlePayload()),
    handler(settlePayload())
  ]);
  const quota = db.get("optimizeQuotas", core.getQuotaDocId(OPENID));

  assert.deepEqual(
    [left.transitionApplied, right.transitionApplied].sort(),
    [false, true]
  );
  assert.equal(quota.grantedCount, 6);
  assert.equal(db.all("optimizeQuotaGrants").length, 1);
});

test("settlement without a pre-created session is rejected", async () => {
  const db = new FakeDatabase({
    optimizeQuotas: [quotaDoc()]
  });
  const result = await createHandler(db)(settlePayload());

  assert.equal(result.ok, false);
  assert.equal(result.status, "rejected");
  assert.equal(result.errorCode, "AD_REWARD_SESSION_NOT_FOUND");
  assert.equal(db.get("optimizeQuotas", core.getQuotaDocId(OPENID)).grantedCount, 3);
});

test("a session owned by another user cannot be settled", async () => {
  const foreignSession = sessionDoc({ openid: OTHER_OPENID });
  const db = new FakeDatabase({
    adRewardGrants: [foreignSession],
    optimizeQuotas: [quotaDoc()]
  });
  const result = await createHandler(db)(settlePayload());

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AD_REWARD_SESSION_NOT_FOUND");
});

test("expired session is rejected without changing quota", async () => {
  const session = sessionDoc({
    expiresAt: new Date(NOW.getTime() - 1)
  });
  const db = createSettlementDatabase({ session });
  const result = await createHandler(db)(settlePayload());

  assert.equal(result.ok, false);
  assert.equal(result.status, "expired");
  assert.equal(result.errorCode, "AD_REWARD_SESSION_EXPIRED");
  assert.equal(db.get("optimizeQuotas", core.getQuotaDocId(OPENID)).grantedCount, 3);
});

test("incomplete ad completion signal is rejected", async () => {
  const session = sessionDoc();
  const db = createSettlementDatabase({ session });
  const result = await createHandler(db)(settlePayload({ completionStatus: "skipped" }));

  assert.equal(result.ok, false);
  assert.equal(result.status, "rejected");
  assert.equal(result.errorCode, "AD_REWARD_NOT_COMPLETED");
  assert.equal(db.get("adRewardGrants", session._id).status, "rejected");
  assert.equal(db.all("optimizeQuotaGrants").length, 0);
});

test("legacy adResult.status is accepted but raw client data is not stored", async () => {
  const session = sessionDoc();
  const db = createSettlementDatabase({ session });
  const result = await createHandler(db)({
    rewardScene: "initial_unlock",
    clientRewardId: CLIENT_REWARD_ID,
    adResult: {
      status: "completed",
      raw: {
        untrusted: "large-client-object"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(db.get("adRewardGrants", session._id), "adResult"), false);
});

test("forged workId does not change the pre-created session binding", async () => {
  const session = sessionDoc({
    rewardScene: "optimize_quota",
    workId: WORK_ID
  });
  const db = createSettlementDatabase({
    session,
    works: [workDoc()]
  });
  const result = await createHandler(db)(settlePayload({
    rewardScene: "optimize_quota",
    workId: OTHER_WORK_ID
  }));

  assert.equal(result.ok, true);
  assert.equal(result.workId, WORK_ID);
  assert.equal(db.get("adRewardGrants", session._id).workId, WORK_ID);
});

test("forged rewardScene conflicts with the pre-created session", async () => {
  const db = createSettlementDatabase();
  const result = await createHandler(db)(settlePayload({
    rewardScene: "optimize_quota"
  }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AD_REWARD_SESSION_CONFLICT");
});

test("optimize_quota revalidates work ownership and deletion state", async () => {
  const session = sessionDoc({
    rewardScene: "optimize_quota",
    workId: WORK_ID
  });
  const db = createSettlementDatabase({
    session,
    works: [workDoc({ status: "deleted" })]
  });
  const result = await createHandler(db)(settlePayload({
    rewardScene: "optimize_quota"
  }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AD_REWARD_WORK_NOT_FOUND");
});

test("inconsistent quota data aborts the whole settlement", async () => {
  const session = sessionDoc();
  const db = createSettlementDatabase({
    session,
    quota: quotaDoc({
      grantedCount: 1,
      usedCount: 1,
      reservedCount: 1
    })
  });
  const result = await createHandler(db)(settlePayload());

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "OPTIMIZE_QUOTA_INCONSISTENT");
  assert.equal(db.get("adRewardGrants", session._id).status, "pending");
  assert.equal(db.all("optimizeQuotaGrants").length, 0);
});

test("pre-existing inconsistent quota grant aborts settlement", async () => {
  const session = sessionDoc();
  const inconsistentGrant = quotaGrantDoc(session, {
    count: 99,
    quotaApplied: false
  });
  const db = createSettlementDatabase({
    session,
    quotaGrants: [inconsistentGrant]
  });
  const result = await createHandler(db)(settlePayload());

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AD_REWARD_INCONSISTENT");
  assert.equal(db.get("adRewardGrants", session._id).status, "pending");
  assert.equal(db.get("optimizeQuotas", core.getQuotaDocId(OPENID)).grantedCount, 3);
});

for (const failure of [
  ["optimizeQuotaGrants", "set"],
  ["optimizeQuotas", "update"],
  ["adRewardGrants", "update"]
]) {
  test(`transaction rolls back when ${failure.join(".")} fails`, async () => {
    const session = sessionDoc();
    const db = createSettlementDatabase({ session });
    db.failNext(failure[0], failure[1]);
    const result = await createHandler(db)(settlePayload());

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "AD_REWARD_TRANSACTION_FAILED");
    assert.equal(db.get("adRewardGrants", session._id).status, "pending");
    assert.equal(db.get("optimizeQuotas", core.getQuotaDocId(OPENID)).grantedCount, 3);
    assert.equal(db.all("optimizeQuotaGrants").length, 0);
  });
}
