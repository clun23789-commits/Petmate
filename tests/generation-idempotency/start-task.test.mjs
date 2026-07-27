import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-db.mjs";
import { NOW, OPENID, WORK_ID, assetDoc, reservationDoc, workDoc } from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const startCore = require("../../cloudfunctions/startGenerationTask/core.js");

function createDb(extra = {}) {
  return new FakeDatabase({
    works: [workDoc()],
    uploadAssets: [assetDoc(), assetDoc({ _id: "targeted-asset", assetId: "targeted-asset", role: "targeted" })],
    ...extra
  });
}

function createHandler(db) {
  return startCore.createStartGenerationTaskHandler({
    cloud: createCloud(OPENID),
    db,
    now: () => NOW,
    logger: quietLogger()
  });
}

function initialEvent(clientRequestId = "generation-request-same") {
  return {
    clientRequestId,
    workId: WORK_ID,
    operationType: "initial",
    workSnapshot: workDoc()
  };
}

test("same initial clientRequestId submitted sequentially ten times creates one task", async () => {
  const db = createDb();
  const handler = createHandler(db);
  const results = [];
  for (let index = 0; index < 10; index += 1) {
    results.push(await handler(initialEvent()));
  }
  assert.equal(db.all("generationTasks").length, 1);
  assert.equal(results[0].data.duplicated, false);
  assert.ok(results.slice(1).every((result) => result.data.duplicated === true));
  assert.equal(new Set(results.map((result) => result.data.task.taskId)).size, 1);
});

test("same initial clientRequestId submitted concurrently ten times creates one task", async () => {
  const db = createDb();
  const handler = createHandler(db);
  const results = await Promise.all(Array.from({ length: 10 }, () => handler(initialEvent())));
  assert.equal(db.all("generationTasks").length, 1);
  assert.equal(results.filter((result) => result.data.duplicated === false).length, 1);
  assert.equal(new Set(results.map((result) => result.data.task.taskId)).size, 1);
});

test("different clientRequestId values create different deterministic tasks", async () => {
  const db = createDb();
  const handler = createHandler(db);
  const first = await handler(initialEvent("generation-request-a"));
  const second = await handler(initialEvent("generation-request-b"));
  assert.equal(db.all("generationTasks").length, 2);
  assert.notEqual(first.data.task.taskId, second.data.task.taskId);
  assert.equal(
    first.data.task.taskId,
    startCore.getGenerationTaskDocId(OPENID, "initial", "generation-request-a")
  );
});

test("same clientRequestId with changed business parameters returns a conflict", async () => {
  const db = createDb();
  const handler = createHandler(db);
  await handler(initialEvent());
  const conflict = await handler({
    ...initialEvent(),
    workId: "another-work"
  });
  assert.equal(conflict.errorCode, "GENERATION_REQUEST_CONFLICT");
  assert.equal(db.all("generationTasks").length, 1);
});

test("concurrent changed parameters cannot both claim one clientRequestId", async () => {
  const otherWorkId = "work-generation-other";
  const db = createDb({
    works: [workDoc(), workDoc({ _id: "work-other-doc", workId: otherWorkId })],
    uploadAssets: [
      assetDoc(),
      assetDoc({
        _id: "asset-other-doc",
        assetId: "asset-other",
        workId: otherWorkId
      })
    ]
  });
  const handler = createHandler(db);
  const results = await Promise.all([
    handler(initialEvent("generation-request-race")),
    handler({
      ...initialEvent("generation-request-race"),
      workId: otherWorkId
    })
  ]);
  assert.equal(results.filter((result) => result.ok === true).length, 1);
  assert.equal(results.filter((result) => result.errorCode === "GENERATION_REQUEST_CONFLICT").length, 1);
  assert.equal(db.all("generationTasks").length, 1);
});

test("missing clientRequestId is rejected", async () => {
  const db = createDb();
  const result = await createHandler(db)({
    workId: WORK_ID,
    operationType: "initial"
  });
  assert.equal(result.errorCode, "CLIENT_REQUEST_ID_REQUIRED");
  assert.equal(db.all("generationTasks").length, 0);
});

for (const operationType of ["optimize", "targeted_upload"]) {
  test(`${operationType} retry returns the reservation-bound task`, async () => {
    const reservation = reservationDoc(operationType);
    reservation._id = startCore.getReservationDocId(OPENID, reservation.reservationId);
    const db = createDb({
      optimizeReservations: [reservation]
    });
    const handler = createHandler(db);
    const event = {
      clientRequestId: `generation-request-${operationType}`,
      workId: WORK_ID,
      operationType,
      reservationId: reservation.reservationId
    };
    const first = await handler(event);
    const second = await handler(event);
    assert.equal(first.ok, true);
    assert.equal(second.data.duplicated, true);
    assert.equal(second.data.task.taskId, first.data.task.taskId);
    assert.equal(db.all("generationTasks").length, 1);
  });
}

test("a lost success response is recovered by resubmitting clientRequestId", async () => {
  const db = createDb();
  const handler = createHandler(db);
  const ignoredResponse = await handler(initialEvent("generation-request-recovery"));
  assert.equal(ignoredResponse.ok, true);
  const recovered = await handler(initialEvent("generation-request-recovery"));
  assert.equal(recovered.data.duplicated, true);
  assert.equal(recovered.data.task.taskId, ignoredResponse.data.task.taskId);
});
