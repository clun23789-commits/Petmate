import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, quietLogger } from "./helpers/fake-database.mjs";
import { NOW, generationTaskDoc, quotaDoc, reservationDoc } from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const { createCleanupExpiredOptimizeReservationsHandler } = require("../../cloudfunctions/cleanupExpiredOptimizeReservations/core.js");

function createHandler(db, overrides = {}) {
  return createCleanupExpiredOptimizeReservationsHandler({
    db,
    now: () => new Date(NOW),
    logger: quietLogger(),
    ...overrides
  });
}

function expiredReservation(overrides = {}) {
  return reservationDoc("reservation-test", {
    expiresAt: new Date(NOW.getTime() - 1000),
    ...overrides
  });
}

test("client invocation is rejected before database access", async () => {
  let warnCount = 0;
  const db = {
    collection() {
      throw new Error("database should not be accessed");
    }
  };
  const result = await createHandler(db, {
    getInvocationContext: () => ({
      OPENID: "malicious-client-openid"
    }),
    logger: {
      error() {},
      warn(message, details) {
        warnCount += 1;
        assert.equal(message, "cleanupExpiredOptimizeReservations forbidden client invocation");
        assert.deepEqual(details, {
          functionName: "cleanupExpiredOptimizeReservations",
          errorCode: "CLEANUP_OPTIMIZE_RESERVATIONS_FORBIDDEN"
        });
      }
    }
  })();

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "CLEANUP_OPTIMIZE_RESERVATIONS_FORBIDDEN");
  assert.equal(result.status, "forbidden");
  assert.equal(warnCount, 1);
  assert.equal(JSON.stringify(result).includes("malicious-client-openid"), false);
  assert.equal("data" in result, false);
});

test("scheduled invocation without OPENID can execute cleanup", async () => {
  const db = new FakeDatabase({
    optimizeQuotas: [quotaDoc({ reservedCount: 1 })],
    optimizeReservations: [expiredReservation()]
  });
  const result = await createHandler(db, {
    getInvocationContext: () => ({})
  })();

  assert.equal(result.ok, true);
  assert.equal(result.data.scanned, 1);
  assert.equal(result.data.released, 1);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 0);
});

test("cleanup response contains aggregate counters only", async () => {
  const db = new FakeDatabase({
    optimizeQuotas: [quotaDoc({ reservedCount: 2 })],
    optimizeReservations: [
      reservationDoc("reservation-a", {
        expiresAt: new Date(NOW.getTime() - 1000)
      }),
      reservationDoc("reservation-b", {
        expiresAt: new Date(NOW.getTime() - 1000)
      })
    ]
  });
  const result = await createHandler(db)();

  assert.deepEqual(
    Object.keys(result.data).sort(),
    [
      "committed",
      "failed",
      "released",
      "scanned",
      "skipped",
      "timedOut"
    ]
  );
  assert.equal("results" in result.data, false);
  assert.equal(JSON.stringify(result).includes("reservation-"), false);
  assert.equal(JSON.stringify(result).includes("task-"), false);
  assert.equal(JSON.stringify(result).includes("work-"), false);
});

test("cleanup failure logs contain hashed references only", async () => {
  const db = new FakeDatabase({
    optimizeQuotas: [quotaDoc({ reservedCount: 1 })],
    optimizeReservations: [
      reservationDoc("reservation-sensitive", {
        taskId: "task-sensitive",
        workId: "work-sensitive",
        expiresAt: new Date(NOW.getTime() - 1000)
      })
    ]
  });
  db.failNext("optimizeQuotas", "get");
  const errors = [];
  const result = await createHandler(db, {
    logger: {
      error(message, details) {
        errors.push({
          message,
          details
        });
      },
      warn() {}
    }
  })();

  assert.equal(result.data.failed, 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, "cleanupExpiredOptimizeReservations item failed");
  for (const field of ["userRef", "reservationRef", "taskRef", "workRef"]) {
    assert.match(errors[0].details[field], /^[0-9a-f]{12}$/);
  }
  for (const field of ["openid", "reservationId", "taskId", "workId"]) {
    assert.equal(field in errors[0].details, false);
  }
  const serializedLog = JSON.stringify(errors[0]);
  for (const rawId of [
    "user-openid",
    "reservation-sensitive",
    "task-sensitive",
    "work-sensitive"
  ]) {
    assert.equal(serializedLog.includes(rawId), false);
  }
});

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
