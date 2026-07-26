import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-database.mjs";
import { NOW, OPENID, WORK_ID, generationTaskDoc, quotaDoc, reservationDoc } from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const { createCommitOptimizeQuotaHandler } = require("../../cloudfunctions/commitOptimizeQuota/core.js");

function createDb(taskOverrides = {}, reservationOverrides = {}, quotaOverrides = {}) {
  return new FakeDatabase({
    optimizeQuotas: [quotaDoc({ reservedCount: 1, ...quotaOverrides })],
    optimizeReservations: [reservationDoc("reservation-test", { taskId: "task-test", ...reservationOverrides })],
    generationTasks: [generationTaskDoc("task-test", taskOverrides)]
  });
}

function createHandler(db) {
  return createCommitOptimizeQuotaHandler({
    cloud: createCloud(OPENID),
    db,
    now: () => new Date(NOW.getTime() + 1000),
    logger: quietLogger()
  });
}

test("commit validates the saved generation result and converts quota once", async () => {
  const db = createDb();
  const handler = createHandler(db);
  const first = await handler({
    reservationId: "reservation-test",
    taskId: "task-test"
  });
  assert.equal(first.ok, true);
  assert.equal(first.data.transitionApplied, true);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 0);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).usedCount, 1);

  const second = await handler({
    reservationId: "reservation-test",
    taskId: "task-test"
  });
  assert.equal(second.ok, true);
  assert.equal(second.data.duplicated, true);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).usedCount, 1);
});

for (const [label, taskOverrides, errorCode] of [
  ["pending task", { status: "pending" }, "OPTIMIZE_GENERATION_TASK_NOT_SUCCESS"],
  ["running task", { status: "running" }, "OPTIMIZE_GENERATION_TASK_NOT_SUCCESS"],
  ["failed task", { status: "failed" }, "OPTIMIZE_GENERATION_TASK_NOT_SUCCESS"],
  ["unsaved result", { resultSaveStatus: "failed" }, "OPTIMIZE_GENERATION_RESULT_NOT_SAVED"],
  ["wrong finalized work", { finalizedWorkId: "work-other" }, "OPTIMIZE_RESERVATION_TASK_MISMATCH"],
  ["missing version", { finalizedVersionId: "" }, "OPTIMIZE_RESERVATION_TASK_MISMATCH"]
]) {
  test(`commit rejects ${label}`, async () => {
    const db = createDb(taskOverrides);
    const result = await createHandler(db)({
      reservationId: "reservation-test",
      taskId: "task-test"
    });
    assert.equal(result.errorCode, errorCode);
    assert.equal(db.get("optimizeQuotas", quotaDoc()._id).usedCount, 0);
  });
}

test("commit rejects released reservations and task mismatches", async () => {
  const releasedDb = createDb({}, { status: "released" });
  const released = await createHandler(releasedDb)({
    reservationId: "reservation-test",
    taskId: "task-test"
  });
  assert.equal(released.errorCode, "OPTIMIZE_RESERVATION_ALREADY_RELEASED");

  const mismatchDb = createDb({}, { taskId: "task-other" });
  const mismatch = await createHandler(mismatchDb)({
    reservationId: "reservation-test",
    taskId: "task-test"
  });
  assert.equal(mismatch.errorCode, "OPTIMIZE_RESERVATION_TASK_MISMATCH");
});

test("commit detects reservedCount zero and rolls back an injected write failure", async () => {
  const inconsistentDb = createDb({}, {}, { reservedCount: 0 });
  const inconsistent = await createHandler(inconsistentDb)({
    reservationId: "reservation-test",
    taskId: "task-test"
  });
  assert.equal(inconsistent.errorCode, "OPTIMIZE_QUOTA_INCONSISTENT");

  const rollbackDb = createDb();
  rollbackDb.failNext("optimizeQuotas", "update");
  const rollback = await createHandler(rollbackDb)({
    reservationId: "reservation-test",
    taskId: "task-test"
  });
  assert.equal(rollback.errorCode, "OPTIMIZE_QUOTA_TRANSACTION_FAILED");
  assert.equal(rollbackDb.get("optimizeReservations", reservationDoc()._id).status, "reserved");
  assert.equal(rollbackDb.get("optimizeQuotas", quotaDoc()._id).usedCount, 0);
});
