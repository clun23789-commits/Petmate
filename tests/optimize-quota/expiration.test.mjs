import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, quietLogger } from "./helpers/fake-database.mjs";
import { NOW, generationTaskDoc, quotaDoc, reservationDoc } from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const { createCleanupExpiredOptimizeReservationsHandler } = require("../../cloudfunctions/cleanupExpiredOptimizeReservations/core.js");

function createHandler(db) {
  return createCleanupExpiredOptimizeReservationsHandler({
    db,
    now: () => new Date(NOW),
    logger: quietLogger()
  });
}

function expiredReservation(overrides = {}) {
  return reservationDoc("reservation-test", {
    expiresAt: new Date(NOW.getTime() - 1000),
    ...overrides
  });
}

test("cleanup releases an expired unbound reservation and is idempotent", async () => {
  const db = new FakeDatabase({
    optimizeQuotas: [quotaDoc({ reservedCount: 1 })],
    optimizeReservations: [expiredReservation()]
  });
  const first = await createHandler(db)();
  assert.equal(first.data.released, 1);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 0);
  const second = await createHandler(db)();
  assert.equal(second.data.scanned, 0);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 0);
});

test("cleanup skips reservations that are not expired", async () => {
  const db = new FakeDatabase({
    optimizeQuotas: [quotaDoc({ reservedCount: 1 })],
    optimizeReservations: [reservationDoc()]
  });
  const result = await createHandler(db)();
  assert.equal(result.data.scanned, 0);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 1);
});

test("cleanup commits a successful saved task", async () => {
  const db = new FakeDatabase({
    optimizeQuotas: [quotaDoc({ reservedCount: 1 })],
    optimizeReservations: [expiredReservation({ taskId: "task-test" })],
    generationTasks: [generationTaskDoc()]
  });
  const result = await createHandler(db)();
  assert.equal(result.data.committed, 1);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).usedCount, 1);
  assert.equal(db.get("optimizeReservations", reservationDoc()._id).status, "committed");
});

test("cleanup marks an overdue running task failed and releases quota", async () => {
  const db = new FakeDatabase({
    optimizeQuotas: [quotaDoc({ reservedCount: 1 })],
    optimizeReservations: [expiredReservation({ taskId: "task-test" })],
    generationTasks: [generationTaskDoc("task-test", {
      status: "running",
      phase: "generating",
      resultSaveStatus: "idle",
      createdAt: new Date(NOW.getTime() - 11 * 60 * 1000)
    })]
  });
  const result = await createHandler(db)();
  assert.equal(result.data.released, 1);
  assert.equal(result.data.timedOut, 1);
  assert.equal(db.get("generationTasks", "task-test").failureCode, "GENERATION_TASK_TIMEOUT");
  assert.equal(db.get("optimizeReservations", reservationDoc()._id).releaseReason, "task_timeout");
});

test("cleanup observes a reservation already committed by another operation", async () => {
  const db = new FakeDatabase({
    optimizeQuotas: [quotaDoc({ usedCount: 1, reservedCount: 0 })],
    optimizeReservations: [expiredReservation({ status: "committed", taskId: "task-test" })],
    generationTasks: [generationTaskDoc()]
  });
  const result = await createHandler(db)();
  assert.equal(result.data.scanned, 0);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).usedCount, 1);
});
