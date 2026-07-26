import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-database.mjs";
import { NOW, OPENID, generationTaskDoc, quotaDoc, reservationDoc } from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const { createReleaseOptimizeQuotaHandler } = require("../../cloudfunctions/releaseOptimizeQuota/core.js");

function createDb({ task = null, reservation = {}, quota = {} } = {}) {
  return new FakeDatabase({
    optimizeQuotas: [quotaDoc({ reservedCount: 1, ...quota })],
    optimizeReservations: [reservationDoc("reservation-test", reservation)],
    generationTasks: task ? [generationTaskDoc("task-test", task)] : []
  });
}

function createHandler(db) {
  return createReleaseOptimizeQuotaHandler({
    cloud: createCloud(OPENID),
    db,
    now: () => new Date(NOW.getTime() + 1000),
    logger: quietLogger()
  });
}

test("release frees an unbound reservation exactly once", async () => {
  const db = createDb();
  const handler = createHandler(db);
  const first = await handler({ reservationId: "reservation-test" });
  assert.equal(first.ok, true);
  assert.equal(first.data.reservation.releaseReason, "task_submit_failed");
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 0);
  const second = await handler({ reservationId: "reservation-test" });
  assert.equal(second.data.duplicated, true);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 0);
});

test("release permits failed and timeout tasks", async () => {
  const failedDb = createDb({
    reservation: { taskId: "task-test" },
    task: { status: "failed", phase: "failed" }
  });
  assert.equal((await createHandler(failedDb)({ reservationId: "reservation-test" })).data.reservation.releaseReason, "task_failed");

  const timeoutDb = createDb({
    reservation: { taskId: "task-test" },
    task: { status: "failed", phase: "timeout", failureCode: "GENERATION_TASK_TIMEOUT" }
  });
  assert.equal((await createHandler(timeoutDb)({ reservationId: "reservation-test" })).data.reservation.releaseReason, "task_timeout");
});

for (const [status, errorCode] of [
  ["pending", "OPTIMIZE_RESERVATION_TASK_ACTIVE"],
  ["running", "OPTIMIZE_RESERVATION_TASK_ACTIVE"],
  ["success", "OPTIMIZE_RESERVATION_TASK_SUCCEEDED"]
]) {
  test(`release protects a ${status} task`, async () => {
    const db = createDb({
      reservation: { taskId: "task-test" },
      task: { status }
    });
    const result = await createHandler(db)({ reservationId: "reservation-test" });
    assert.equal(result.errorCode, errorCode);
    assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 1);
    assert.equal(db.get("optimizeReservations", reservationDoc()._id).status, "reserved");
  });
}

test("release leaves committed reservations unchanged", async () => {
  const db = createDb({
    reservation: { status: "committed", taskId: "task-test" },
    quota: { reservedCount: 0, usedCount: 1 }
  });
  const result = await createHandler(db)({ reservationId: "reservation-test" });
  assert.equal(result.ok, true);
  assert.equal(result.data.terminalReason, "already_committed");
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).usedCount, 1);
});

test("release rolls back when quota update fails", async () => {
  const db = createDb();
  db.failNext("optimizeQuotas", "update");
  const result = await createHandler(db)({ reservationId: "reservation-test" });
  assert.equal(result.errorCode, "OPTIMIZE_QUOTA_TRANSACTION_FAILED");
  assert.equal(db.get("optimizeReservations", reservationDoc()._id).status, "reserved");
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 1);
});
