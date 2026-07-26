import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-database.mjs";
import { NOW, OPENID, WORK_ID, assetDoc, generationTaskDoc, reservationDoc, workDoc } from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const { createStartGenerationTaskHandler } = require("../../cloudfunctions/startGenerationTask/core.js");

function createDb(reservationOverrides = {}) {
  return new FakeDatabase({
    works: [workDoc()],
    uploadAssets: [assetDoc()],
    optimizeReservations: [reservationDoc("reservation-test", reservationOverrides)]
  });
}

function createHandler(db) {
  return createStartGenerationTaskHandler({
    cloud: createCloud(OPENID),
    db,
    now: () => new Date(NOW.getTime() + 1000),
    createTaskId: () => "task-created",
    logger: quietLogger()
  });
}

test("startGenerationTask creates and binds an optimize task atomically", async () => {
  const db = createDb();
  const result = await createHandler(db)({
    reservationId: "reservation-test",
    workId: WORK_ID,
    operationType: "optimize",
    dimensionSet: ["tail"]
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.task.taskId, "task-created");
  assert.deepEqual(db.get("generationTasks", "task-created").dimensionSet, ["fur"]);
  assert.equal(db.get("optimizeReservations", reservationDoc()._id).taskId, "task-created");
});

test("startGenerationTask returns the existing bound task on retry", async () => {
  const db = createDb({ taskId: "task-test" });
  db.store.get("generationTasks")?.set("task-test", generationTaskDoc());
  if (!db.store.has("generationTasks")) {
    db.store.set("generationTasks", new Map([["task-test", generationTaskDoc()]]));
  }
  const result = await createHandler(db)({
    reservationId: "reservation-test",
    workId: WORK_ID,
    operationType: "optimize"
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.duplicated, true);
  assert.equal(db.all("generationTasks").length, 1);
});

for (const [label, overrides, operationType, errorCode] of [
  ["released reservation", { status: "released" }, "optimize", "OPTIMIZE_RESERVATION_CONFLICT"],
  ["committed reservation", { status: "committed" }, "optimize", "OPTIMIZE_RESERVATION_CONFLICT"],
  ["expired reservation", { expiresAt: new Date(NOW.getTime() - 1) }, "optimize", "OPTIMIZE_RESERVATION_EXPIRED"],
  ["source mismatch", { source: "targeted_upload" }, "optimize", "OPTIMIZE_RESERVATION_CONFLICT"]
]) {
  test(`startGenerationTask rejects ${label}`, async () => {
    const db = createDb(overrides);
    const result = await createHandler(db)({
      reservationId: "reservation-test",
      workId: WORK_ID,
      operationType
    });
    assert.equal(result.errorCode, errorCode);
    assert.equal(db.all("generationTasks").length, 0);
  });
}

test("startGenerationTask rolls back task creation when reservation binding fails", async () => {
  const db = createDb();
  db.failNext("optimizeReservations", "update");
  const result = await createHandler(db)({
    reservationId: "reservation-test",
    workId: WORK_ID,
    operationType: "optimize"
  });
  assert.equal(result.errorCode, "OPTIMIZE_QUOTA_TRANSACTION_FAILED");
  assert.equal(db.all("generationTasks").length, 0);
  assert.equal(db.get("optimizeReservations", reservationDoc()._id).taskId, "");
});
