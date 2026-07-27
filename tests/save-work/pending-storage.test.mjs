import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const storage = require("../../miniprogram/utils/storage.js");
const pendingStorage = require("../../miniprogram/utils/pendingCloudSaveStorage.js");

function cleanup() {
  storage.removeStorageValue(pendingStorage.PENDING_CLOUD_SAVE_STORAGE_KEY_V1);
  storage.removeStorageValue(pendingStorage.PENDING_CLOUD_SAVE_STORAGE_KEY_V2);
  pendingStorage.removePendingCloudSave();
  if (pendingStorage.consumePendingCloudSaveNotice) {
    pendingStorage.consumePendingCloudSaveNotice();
  }
}

test.beforeEach(cleanup);
test.afterEach(cleanup);

test("v2 pending storage persists references only", () => {
  const pending = pendingStorage.writePendingCloudSave({
    taskId: "task-v2",
    workId: "work-v2",
    versionId: "version-v2",
    createdAt: new Date().toISOString(),
    work: { forbidden: true },
    version: { forbidden: true },
    previewMedia: { forbidden: true },
    editableTexture: { forbidden: true },
    ownerOpenid: "forbidden",
    status: "deleted"
  });
  assert.deepEqual(Object.keys(pending).sort(), [
    "createdAt",
    "taskId",
    "versionId",
    "workId"
  ]);
  assert.deepEqual(
    storage.getStorageValue(pendingStorage.PENDING_CLOUD_SAVE_STORAGE_KEY_V2, null),
    pending
  );
});

test("v1 with task references migrates safely to v2 and drops full objects", () => {
  const createdAt = new Date().toISOString();
  storage.setStorageValue(pendingStorage.PENDING_CLOUD_SAVE_STORAGE_KEY_V1, {
    taskId: "task-legacy",
    workId: "work-legacy",
    versionId: "version-legacy",
    createdAt,
    work: {
      workId: "work-legacy",
      status: "deleted",
      unknown: true
    },
    version: {
      versionId: "version-legacy",
      editableTexture: { forbidden: true }
    }
  });
  const result = pendingStorage.readPendingCloudSaveResult();
  assert.equal(result.migrated, true);
  assert.deepEqual(result.pending, {
    taskId: "task-legacy",
    workId: "work-legacy",
    versionId: "version-legacy",
    createdAt
  });
  assert.equal(
    storage.getStorageValue(pendingStorage.PENDING_CLOUD_SAVE_STORAGE_KEY_V1, null),
    null
  );
  assert.deepEqual(
    storage.getStorageValue(pendingStorage.PENDING_CLOUD_SAVE_STORAGE_KEY_V2, null),
    result.pending
  );
});

test("v1 without taskId is dropped with an explicit migration error", () => {
  storage.setStorageValue(pendingStorage.PENDING_CLOUD_SAVE_STORAGE_KEY_V1, {
    workId: "work-legacy-drop",
    versionId: "version-legacy-drop",
    work: { workId: "work-legacy-drop" },
    version: { versionId: "version-legacy-drop" }
  });
  const result = pendingStorage.readPendingCloudSaveResult();
  assert.equal(result.pending, null);
  assert.equal(result.errorCode, "PENDING_CLOUD_SAVE_LEGACY_DROPPED");
  assert.equal(
    storage.getStorageValue(pendingStorage.PENDING_CLOUD_SAVE_STORAGE_KEY_V1, null),
    null
  );
  assert.equal(
    storage.getStorageValue(pendingStorage.PENDING_CLOUD_SAVE_STORAGE_KEY_V2, null),
    null
  );
});
