import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-db.mjs";
import { NOW, OPENID, assetDoc, taskDoc } from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const pollCore = require("../../cloudfunctions/pollGenerationTask/core.js");

function handlerFor(db, now = NOW) {
  let tokenIndex = 0;
  return pollCore.createPollGenerationTaskHandler({
    cloud: createCloud(OPENID),
    db,
    now: () => now,
    createProcessingToken: () => `processing-token-${++tokenIndex}`,
    logger: quietLogger()
  });
}

test("twenty concurrent polls allow only one request to advance", async () => {
  const db = new FakeDatabase({
    generationTasks: [taskDoc()],
    uploadAssets: [assetDoc()]
  });
  const gate = db.blockNextRead("uploadAssets");
  const handler = handlerFor(db);
  const first = handler({ taskId: "generation-task-test" });
  await gate.entered;
  const contenders = Array.from({ length: 19 }, () => handler({ taskId: "generation-task-test" }));
  const contenderResults = await Promise.all(contenders);
  gate.release();
  const firstResult = await first;
  assert.equal(firstResult.data.task.phase, "fetching_assets");
  assert.ok(contenderResults.every((result) => result.data.task.phase === "queued"));
  assert.ok(contenderResults.every((result) => result.data.processingLocked === true));
  assert.equal(db.get("generationTasks", "generation-task-test").revision, 1);
});

test("an unexpired lock is read-only and an expired lock can be recovered", async () => {
  const lockedAt = new Date(NOW.getTime() - 1_000);
  const db = new FakeDatabase({
    generationTasks: [
      taskDoc({
        revision: 3,
        processingToken: "current-token",
        processingStartedAt: lockedAt,
        processingExpiresAt: new Date(NOW.getTime() + 30_000)
      })
    ],
    uploadAssets: [assetDoc()]
  });
  const locked = await handlerFor(db)({ taskId: "generation-task-test" });
  assert.equal(locked.data.processingLocked, true);
  assert.equal(db.get("generationTasks", "generation-task-test").revision, 3);

  const recovered = await handlerFor(db, new Date(NOW.getTime() + 31_000))({
    taskId: "generation-task-test"
  });
  assert.equal(recovered.data.task.phase, "fetching_assets");
  assert.equal(db.get("generationTasks", "generation-task-test").revision, 4);
});

test("an old token cannot write after a new owner recovers the lock", async () => {
  const db = new FakeDatabase({
    generationTasks: [taskDoc()]
  });
  const first = await pollCore.acquireProcessingLock({
    db,
    taskId: "generation-task-test",
    ownerOpenid: OPENID,
    now: NOW,
    processingToken: "old-token"
  });
  const second = await pollCore.acquireProcessingLock({
    db,
    taskId: "generation-task-test",
    ownerOpenid: OPENID,
    now: new Date(NOW.getTime() + pollCore.PROCESSING_LOCK_TTL_MS + 1),
    processingToken: "new-token"
  });
  const stale = await pollCore.updateTaskWithLock({
    db,
    taskId: "generation-task-test",
    ownerOpenid: OPENID,
    token: first.token,
    revision: first.revision,
    patch: { phase: "completed" },
    now: new Date(NOW.getTime() + pollCore.PROCESSING_LOCK_TTL_MS + 2)
  });
  assert.equal(second.acquired, true);
  assert.equal(stale.updated, false);
  assert.equal(stale.errorCode, "GENERATION_TASK_LOCK_LOST");
  assert.equal(db.get("generationTasks", "generation-task-test").phase, "queued");
});

test("a matching token with the wrong revision cannot write", async () => {
  const db = new FakeDatabase({
    generationTasks: [taskDoc()]
  });
  const lock = await pollCore.acquireProcessingLock({
    db,
    taskId: "generation-task-test",
    ownerOpenid: OPENID,
    now: NOW,
    processingToken: "token"
  });
  const stale = await pollCore.updateTaskWithLock({
    db,
    taskId: "generation-task-test",
    ownerOpenid: OPENID,
    token: lock.token,
    revision: lock.revision - 1,
    patch: { phase: "completed" },
    now: NOW
  });
  assert.equal(stale.updated, false);
  assert.equal(stale.errorCode, "GENERATION_TASK_REVISION_CONFLICT");
});

for (const status of ["success", "failed"]) {
  test(`${status} tasks are immutable when polled repeatedly`, async () => {
    const terminal = taskDoc({
      phase: status === "success" ? "completed" : "failed",
      status,
      resultSaveStatus: status === "success" ? "success" : "idle",
      updatedAt: new Date(NOW.getTime() - 30_000)
    });
    const db = new FakeDatabase({
      generationTasks: [terminal]
    });
    const before = db.get("generationTasks", terminal._id);
    const handler = handlerFor(db);
    await handler({ taskId: terminal.taskId });
    await handler({ taskId: terminal.taskId });
    assert.deepEqual(db.get("generationTasks", terminal._id), before);
  });
}
