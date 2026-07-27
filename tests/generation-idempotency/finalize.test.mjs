import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-db.mjs";
import { NOW, OPENID, WORK_ID, completedVersion, taskDoc, workDoc } from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const pollCore = require("../../cloudfunctions/pollGenerationTask/core.js");

function finalizingTask(overrides = {}) {
  return taskDoc({
    phase: "finalizing",
    status: "running",
    providerStatus: "succeeded",
    progress: 85,
    resultSnapshot: completedVersion(),
    resultSaveStatus: "saving",
    ...overrides
  });
}

function handlerFor(db) {
  let tokenIndex = 0;
  return pollCore.createPollGenerationTaskHandler({
    cloud: createCloud(OPENID),
    db,
    now: () => NOW,
    createProcessingToken: () => `finalize-token-${++tokenIndex}`,
    logger: quietLogger()
  });
}

test("finalization commits work, version, and successful task atomically", async () => {
  const db = new FakeDatabase({
    generationTasks: [finalizingTask()]
  });
  const result = await handlerFor(db)({ taskId: "generation-task-test" });
  assert.equal(result.data.task.status, "success");
  assert.equal(db.all("works").length, 1);
  assert.equal(db.all("workVersions").length, 1);
  assert.equal(db.get("generationTasks", "generation-task-test").resultSaveStatus, "success");
  assert.equal(db.all("works")[0].currentVersionId, db.all("workVersions")[0].versionId);
});

test("concurrent finalization creates exactly one work and one version", async () => {
  const db = new FakeDatabase({
    generationTasks: [finalizingTask()]
  });
  const handler = handlerFor(db);
  await Promise.all(Array.from({ length: 20 }, () => handler({ taskId: "generation-task-test" })));
  assert.equal(db.all("works").length, 1);
  assert.equal(db.all("workVersions").length, 1);
  assert.equal(db.get("generationTasks", "generation-task-test").status, "success");
});

for (const [collectionName, operation] of [
  ["workVersions", "set"],
  ["works", "set"],
  ["generationTasks", "update"]
]) {
  test(`${collectionName} write failure rolls back all final success writes`, async () => {
    const db = new FakeDatabase({
      generationTasks: [finalizingTask()]
    });
    if (collectionName === "generationTasks") {
      db.failOn(collectionName, operation, 2);
    } else {
      db.failNext(collectionName, operation);
    }
    await handlerFor(db)({ taskId: "generation-task-test" });
    assert.equal(db.all("works").length, 0);
    assert.equal(db.all("workVersions").length, 0);
    assert.notEqual(db.get("generationTasks", "generation-task-test").status, "success");
    assert.notEqual(db.get("generationTasks", "generation-task-test").resultSaveStatus, "success");
  });
}

test("existing legacy work and version documents are updated in place", async () => {
  const legacyVersion = {
    _id: "legacy-version-doc",
    versionId: "version-generation-test",
    workId: WORK_ID,
    ownerOpenid: OPENID,
    status: "active",
    createdAt: new Date(NOW.getTime() - 60_000)
  };
  const db = new FakeDatabase({
    generationTasks: [finalizingTask()],
    works: [workDoc()],
    workVersions: [legacyVersion]
  });
  await handlerFor(db)({ taskId: "generation-task-test" });
  assert.equal(db.all("works").length, 1);
  assert.equal(db.all("workVersions").length, 1);
  assert.equal(db.get("works", "legacy-work-doc").currentVersionId, "version-generation-test");
  assert.equal(db.get("workVersions", "legacy-version-doc").sourceType, "initial");
});

test("an existing deterministic version is reused when finalization resumes", async () => {
  const deterministicVersionId = pollCore.getVersionDocId(OPENID, "version-generation-test");
  const db = new FakeDatabase({
    generationTasks: [finalizingTask()],
    workVersions: [
      {
        _id: deterministicVersionId,
        ...completedVersion(),
        ownerOpenid: OPENID,
        status: "active",
        updatedAt: NOW
      }
    ]
  });
  await handlerFor(db)({ taskId: "generation-task-test" });
  assert.equal(db.all("workVersions").length, 1);
  assert.equal(db.get("generationTasks", "generation-task-test").status, "success");
});

test("a deleted legacy work cannot be revived by finalization", async () => {
  const db = new FakeDatabase({
    generationTasks: [finalizingTask()],
    works: [workDoc({ status: "deleted", deletedAt: NOW })]
  });
  await handlerFor(db)({ taskId: "generation-task-test" });
  assert.equal(db.get("works", "legacy-work-doc").status, "deleted");
  assert.equal(db.all("workVersions").length, 0);
  assert.equal(db.get("generationTasks", "generation-task-test").status, "failed");
});
