import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";

import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-database.mjs";
import {
  CLIENT_REWARD_ID,
  NOW,
  OPENID,
  OTHER_WORK_ID,
  WORK_ID,
  grantedSessionDoc,
  quotaDoc,
  quotaGrantDoc,
  workDoc
} from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const core = require("../../cloudfunctions/createAdRewardSession/core.js");

function createHandler(db, options = {}) {
  return core.createAdRewardSessionHandler({
    cloud: createCloud(options.openid || OPENID),
    db,
    now: options.now || (() => NOW),
    logger: quietLogger(),
    randomBytes: () => Buffer.alloc(16, 0xab)
  });
}

function initialPayload(overrides = {}) {
  return {
    rewardScene: "initial_unlock",
    workId: "",
    source: "first_create",
    clientRewardId: CLIENT_REWARD_ID,
    ...overrides
  };
}

function optimizePayload(overrides = {}) {
  return {
    rewardScene: "optimize_quota",
    workId: WORK_ID,
    source: "optimize_refill",
    clientRewardId: CLIENT_REWARD_ID,
    ...overrides
  };
}

test("initial_unlock creates a deterministic pending session", async () => {
  const db = new FakeDatabase();
  const result = await createHandler(db)(initialPayload());
  const id = core.getAdRewardDocId(OPENID, "initial_unlock", CLIENT_REWARD_ID);

  assert.equal(result.ok, true);
  assert.equal(result.status, "pending");
  assert.equal(result.duplicated, false);
  assert.match(result.grantId, /^grant-[a-f0-9]{32}$/);
  assert.equal(result.expiresAt.getTime(), NOW.getTime() + core.AD_REWARD_SESSION_TTL_MS);
  assert.equal(db.get("adRewardGrants", id).status, "pending");
});

test("optimize_quota creates a work-bound session for an owned active work", async () => {
  const db = new FakeDatabase({
    works: [workDoc()]
  });
  const result = await createHandler(db)(optimizePayload());

  assert.equal(result.ok, true);
  assert.equal(result.workId, WORK_ID);
  assert.equal(result.rewardScene, "optimize_quota");
});

test("optimize_quota requires a work id", async () => {
  const result = await createHandler(new FakeDatabase())(optimizePayload({ workId: "" }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AD_REWARD_WORK_REQUIRED");
});

test("work must belong to the current user", async () => {
  const db = new FakeDatabase({
    works: [workDoc({ ownerOpenid: "another-user" })]
  });
  const result = await createHandler(db)(optimizePayload());

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AD_REWARD_WORK_NOT_FOUND");
});

test("deleted work cannot create an optimize quota session", async () => {
  const db = new FakeDatabase({
    works: [workDoc({ status: "deleted" })]
  });
  const result = await createHandler(db)(optimizePayload());

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AD_REWARD_WORK_NOT_FOUND");
});

test("invalid reward scene is rejected", async () => {
  const result = await createHandler(new FakeDatabase())(initialPayload({ rewardScene: "unknown" }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AD_REWARD_SESSION_INVALID_PAYLOAD");
});

test("missing clientRewardId is rejected", async () => {
  const result = await createHandler(new FakeDatabase())(initialPayload({ clientRewardId: "" }));

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AD_REWARD_SESSION_INVALID_PAYLOAD");
});

test("repeated creation returns the same pending session", async () => {
  const db = new FakeDatabase();
  const handler = createHandler(db);
  const first = await handler(initialPayload());
  const second = await handler(initialPayload());

  assert.equal(second.ok, true);
  assert.equal(second.duplicated, true);
  assert.equal(second.grantId, first.grantId);
  assert.equal(db.all("adRewardGrants").length, 1);
});

test("same clientRewardId cannot bind to a different work", async () => {
  const db = new FakeDatabase({
    works: [
      workDoc(),
      workDoc({
        _id: "work-doc-other",
        workId: OTHER_WORK_ID
      })
    ]
  });
  const handler = createHandler(db);
  await handler(optimizePayload());
  const conflict = await handler(optimizePayload({ workId: OTHER_WORK_ID }));

  assert.equal(conflict.ok, false);
  assert.equal(conflict.errorCode, "AD_REWARD_SESSION_CONFLICT");
  assert.equal(db.all("adRewardGrants").length, 1);
});

test("same clientRewardId cannot bind to a different reward scene", async () => {
  const db = new FakeDatabase({
    works: [workDoc()]
  });
  const handler = createHandler(db);
  await handler(initialPayload());
  const conflict = await handler(optimizePayload());

  assert.equal(conflict.ok, false);
  assert.equal(conflict.errorCode, "AD_REWARD_SESSION_CONFLICT");
});

test("concurrent requests cannot bind one clientRewardId to two reward scenes", async () => {
  const db = new FakeDatabase({
    works: [workDoc()]
  });
  const handler = createHandler(db);
  const [initialResult, optimizeResult] = await Promise.all([
    handler(initialPayload()),
    handler(optimizePayload())
  ]);

  assert.equal([initialResult.ok, optimizeResult.ok].filter(Boolean).length, 1);
  assert.equal(
    [initialResult, optimizeResult].find((item) => !item.ok).errorCode,
    "AD_REWARD_SESSION_CONFLICT"
  );
  assert.equal(db.all("adRewardGrants").length, 1);
});

test("expired pending session cannot be reused", async () => {
  const db = new FakeDatabase();
  let clock = NOW;
  const handler = createHandler(db, {
    now: () => clock
  });
  await handler(initialPayload());
  clock = new Date(NOW.getTime() + core.AD_REWARD_SESSION_TTL_MS + 1);
  const result = await handler(initialPayload());

  assert.equal(result.ok, false);
  assert.equal(result.status, "expired");
  assert.equal(result.errorCode, "AD_REWARD_SESSION_EXPIRED");
});

test("repeated creation of a granted session returns the verified current quota", async () => {
  const session = grantedSessionDoc();
  const grant = quotaGrantDoc(session);
  const db = new FakeDatabase({
    adRewardGrants: [session],
    optimizeQuotaGrants: [grant],
    optimizeQuotas: [quotaDoc()]
  });
  const result = await createHandler(db)(initialPayload());

  assert.equal(result.ok, true);
  assert.equal(result.status, "granted");
  assert.equal(result.duplicated, true);
  assert.equal(result.quota.grantedCount, 3);
});

test("cloud grant id generation does not use Math.random", async () => {
  const source = await readFile(new URL("../../cloudfunctions/createAdRewardSession/core.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /Math\.random/);
  assert.match(source, /randomBytes/);
});
