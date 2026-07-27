import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-db.mjs";
import {
  NOW,
  OPENID,
  OTHER_OPENID,
  TASK_ID,
  VERSION_ID,
  WORK_ID,
  legacyVersion,
  legacyWork,
  resultSnapshot,
  saveEvent,
  taskDoc
} from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const saveCore = require("../../cloudfunctions/saveWork/core.js");

function createDb(seed = {}) {
  return new FakeDatabase({
    generationTasks: [taskDoc()],
    ...seed
  });
}

function createHandler(db, openid = OPENID) {
  return saveCore.createSaveWorkHandler({
    cloud: createCloud(openid),
    db,
    now: () => NOW,
    logger: quietLogger()
  });
}

test("legacy full work/version payload is rejected without writes", async () => {
  const db = createDb();
  const result = await createHandler(db)({
    ...saveEvent(),
    work: { workId: WORK_ID },
    version: { versionId: VERSION_ID }
  });
  assert.equal(result.errorCode, "SAVE_WORK_LEGACY_PAYLOAD_REJECTED");
  assert.equal(db.all("works").length, 0);
  assert.equal(db.all("workVersions").length, 0);
});

test("server builds strict work and version allowlists from the task", async () => {
  const db = createDb();
  const result = await createHandler(db)({
    ...saveEvent(),
    status: "deleted",
    ownerOpenid: OTHER_OPENID,
    source: "forged-source",
    createdAt: "2001-01-01T00:00:00.000Z",
    unknownClientField: "must-not-persist"
  });
  assert.equal(result.ok, true);
  const work = db.all("works")[0];
  const version = db.all("workVersions")[0];
  assert.deepEqual(Object.keys(work).sort(), [
    "_id",
    "createdAt",
    "currentVersionId",
    "deletedAt",
    "displayName",
    "ownerOpenid",
    "petName",
    "petType",
    "petTypeLabel",
    "previewImage",
    "source",
    "status",
    "updatedAt",
    "versionIds",
    "workId"
  ]);
  assert.deepEqual(Object.keys(version).sort(), [
    "_id",
    "createdAt",
    "editableTexture",
    "feedbackSummary",
    "ownerOpenid",
    "previewMedia",
    "sourceType",
    "status",
    "updatedAt",
    "versionId",
    "workId"
  ]);
  assert.equal(work.status, "ready");
  assert.equal(work.ownerOpenid, OPENID);
  assert.equal(work.source, "basic_generation");
  assert.equal(work.createdAt.toISOString(), "2026-07-28T09:00:00.000Z");
  assert.equal(version.ownerOpenid, OPENID);
  assert.equal(version.createdAt.toISOString(), NOW.toISOString());
  assert.deepEqual(version.previewMedia, {
    cover: "cloud://save-work-cover",
    modelHint: "服务端生成结果",
    colorway: "暖棕色"
  });
  assert.deepEqual(version.editableTexture, {
    baseColor: "#C6A38A",
    notes: ["服务端生成"]
  });
});

test("a task owned by another user is rejected", async () => {
  const db = createDb();
  const result = await createHandler(db, OTHER_OPENID)(saveEvent());
  assert.equal(result.errorCode, "SAVE_WORK_TASK_NOT_FOUND");
});

test("missing task is rejected", async () => {
  const db = new FakeDatabase();
  const result = await createHandler(db)(saveEvent());
  assert.equal(result.errorCode, "SAVE_WORK_TASK_NOT_FOUND");
});

test("missing task reference is rejected", async () => {
  const db = createDb();
  const result = await createHandler(db)({
    workId: WORK_ID,
    versionId: VERSION_ID
  });
  assert.equal(result.errorCode, "SAVE_WORK_TASK_REQUIRED");
});

test("a task that has not reached a recoverable result state is rejected", async () => {
  const db = createDb({
    generationTasks: [
      taskDoc({
        phase: "fetching_assets",
        status: "running",
        failureCategory: "none",
        resultSaveStatus: "idle",
        resultSnapshot: {}
      })
    ]
  });
  const result = await createHandler(db)(saveEvent());
  assert.equal(result.errorCode, "SAVE_WORK_TASK_NOT_READY");
});

for (const [label, overrides] of [
  ["work", { workId: "work-mismatch" }],
  ["version", { versionId: "version-mismatch" }]
]) {
  test(`${label} reference mismatch is rejected`, async () => {
    const db = createDb();
    const result = await createHandler(db)(saveEvent(overrides));
    assert.equal(result.errorCode, "SAVE_WORK_REFERENCE_MISMATCH");
    assert.equal(db.all("works").length, 0);
    assert.equal(db.all("workVersions").length, 0);
  });
}

test("an incomplete resultSnapshot is rejected", async () => {
  const db = createDb({
    generationTasks: [
      taskDoc({
        resultSnapshot: resultSnapshot({
          previewMedia: {}
        })
      })
    ]
  });
  const result = await createHandler(db)(saveEvent());
  assert.equal(result.errorCode, "SAVE_WORK_RESULT_INVALID");
});

test("a deleted work cannot be revived", async () => {
  const deleted = legacyWork({
    status: "deleted",
    deletedAt: NOW
  });
  const db = createDb({
    works: [deleted]
  });
  const result = await createHandler(db)(saveEvent());
  assert.equal(result.errorCode, "WORK_ALREADY_DELETED");
  assert.equal(db.get("works", deleted._id).status, "deleted");
  assert.equal(db.all("workVersions").length, 0);
});

test("work, version, and recovered task success commit atomically", async () => {
  const db = createDb();
  const result = await createHandler(db)(saveEvent());
  assert.equal(result.ok, true);
  assert.equal(db.all("works").length, 1);
  assert.equal(db.all("workVersions").length, 1);
  const task = db.get("generationTasks", TASK_ID);
  assert.equal(task.status, "success");
  assert.equal(task.resultSaveStatus, "success");
  assert.equal(task.finalizedWorkId, WORK_ID);
  assert.equal(task.finalizedVersionId, VERSION_ID);
});

for (const [collectionName, operation] of [
  ["workVersions", "set"],
  ["works", "set"]
]) {
  test(`${collectionName} failure rolls back work, version, and task`, async () => {
    const db = createDb();
    db.failNext(collectionName, operation);
    const result = await createHandler(db)(saveEvent());
    assert.equal(result.errorCode, "SAVE_WORK_FAILED");
    assert.equal(db.all("works").length, 0);
    assert.equal(db.all("workVersions").length, 0);
    assert.equal(db.get("generationTasks", TASK_ID).status, "failed");
  });
}

test("repeated recovery keeps one work and one version", async () => {
  const db = createDb();
  const handler = createHandler(db);
  const first = await handler(saveEvent());
  const second = await handler(saveEvent());
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.data.duplicated, true);
  assert.equal(db.all("works").length, 1);
  assert.equal(db.all("workVersions").length, 1);
});

test("legacy work and version documents are updated in place", async () => {
  const work = legacyWork();
  const version = legacyVersion();
  const db = createDb({
    works: [work],
    workVersions: [version]
  });
  const result = await createHandler(db)(saveEvent());
  assert.equal(result.ok, true);
  assert.equal(db.all("works").length, 1);
  assert.equal(db.all("workVersions").length, 1);
  assert.equal(db.get("works", work._id).currentVersionId, VERSION_ID);
  assert.equal(db.get("workVersions", version._id).previewMedia.cover, "cloud://save-work-cover");
});
