import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";

import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-database.mjs";
import {
  CLIENT_REWARD_ID,
  OPENID,
  grantedSessionDoc,
  quotaDoc,
  quotaGrantDoc
} from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const core = require("../../cloudfunctions/grantOptimizeQuota/core.js");

function createHandler(db) {
  return core.createGrantOptimizeQuotaHandler({
    cloud: createCloud(OPENID),
    db,
    logger: quietLogger()
  });
}

test("arbitrary clientRewardId cannot increase optimize quota", async () => {
  const quota = quotaDoc();
  const db = new FakeDatabase({
    optimizeQuotas: [quota]
  });
  const result = await createHandler(db)({
    clientRewardId: "forged-client-id",
    rewardScene: "initial_unlock",
    count: 999
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "OPTIMIZE_QUOTA_GRANT_NOT_SETTLED");
  assert.deepEqual(db.get("optimizeQuotas", quota._id), quota);
  assert.equal(db.all("optimizeQuotaGrants").length, 0);
});

test("arbitrary adGrantId cannot increase optimize quota", async () => {
  const quota = quotaDoc();
  const db = new FakeDatabase({
    optimizeQuotas: [quota]
  });
  const result = await createHandler(db)({
    adGrantId: "forged-grant-id"
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "OPTIMIZE_QUOTA_GRANT_NOT_SETTLED");
  assert.deepEqual(db.get("optimizeQuotas", quota._id), quota);
});

test("settled ad reward only returns existing grant and current quota", async () => {
  const session = grantedSessionDoc();
  const grant = quotaGrantDoc(session);
  const quota = quotaDoc();
  const db = new FakeDatabase({
    adRewardGrants: [session],
    optimizeQuotaGrants: [grant],
    optimizeQuotas: [quota]
  });
  const result = await createHandler(db)({
    clientRewardId: CLIENT_REWARD_ID,
    rewardScene: "initial_unlock",
    count: 999
  });

  assert.equal(result.ok, true);
  assert.equal(result.deprecated, true);
  assert.equal(result.data.deprecated, true);
  assert.equal(result.data.grant.count, 3);
  assert.equal(result.data.quota.grantedCount, quota.grantedCount);
  assert.deepEqual(db.get("optimizeQuotas", quota._id), quota);
});

test("repeated legacy calls leave every database count unchanged", async () => {
  const session = grantedSessionDoc();
  const grant = quotaGrantDoc(session);
  const quota = quotaDoc();
  const db = new FakeDatabase({
    adRewardGrants: [session],
    optimizeQuotaGrants: [grant],
    optimizeQuotas: [quota]
  });
  const handler = createHandler(db);
  const payload = {
    adGrantId: session.grantId
  };
  const beforeQuota = db.get("optimizeQuotas", quota._id);
  const beforeGrants = db.all("optimizeQuotaGrants");

  await handler(payload);
  await handler(payload);

  assert.deepEqual(db.get("optimizeQuotas", quota._id), beforeQuota);
  assert.deepEqual(db.all("optimizeQuotaGrants"), beforeGrants);
});

test("legacy compatibility source contains no quota write operations", async () => {
  const coreSource = await readFile(new URL("../../cloudfunctions/grantOptimizeQuota/core.js", import.meta.url), "utf8");
  const indexSource = await readFile(new URL("../../cloudfunctions/grantOptimizeQuota/index.js", import.meta.url), "utf8");
  const source = `${coreSource}\n${indexSource}`;

  assert.doesNotMatch(source, /command\.inc/);
  assert.doesNotMatch(source, /grantedCount\s*:/);
  assert.doesNotMatch(source, /optimizeQuotaGrants\.add/);
  assert.doesNotMatch(source, /optimizeQuotas\.doc/);
  assert.doesNotMatch(source, /\.(?:add|set|update)\s*\(/);
});
