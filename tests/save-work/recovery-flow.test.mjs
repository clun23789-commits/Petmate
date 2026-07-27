import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("failed reference save is retained, then retry re-pulls authoritative cloud data", async () => {
  const workService = require("../../miniprogram/services/work/index.js");
  const pendingStorage = require("../../miniprogram/utils/pendingCloudSaveStorage.js");
  const { store } = require("../../miniprogram/store/core/createStore.js");
  const originalSave = workService.saveWorkBundle;
  const originalGet = workService.getWork;
  const workId = "work-recovery-flow";
  const versionId = "version-recovery-flow";
  const taskId = "task-recovery-flow";
  const payloads = [];
  let shouldFail = true;
  let getWorkCalls = 0;

  workService.saveWorkBundle = async (payload) => {
    payloads.push(payload);
    if (shouldFail) {
      return {
        ok: false,
        errorCode: "SAVE_WORK_FAILED",
        message: "injected failure"
      };
    }
    return {
      ok: true,
      data: {
        workId,
        versionId
      }
    };
  };
  workService.getWork = async () => {
    getWorkCalls += 1;
    return {
      ok: true,
      data: {
        work: {
          workId,
          status: "ready",
          currentVersionId: versionId,
          versionIds: [versionId],
          petName: "云端权威名称",
          updatedAt: new Date().toISOString()
        },
        versions: [
          {
            versionId,
            workId,
            status: "active",
            sourceType: "initial",
            previewMedia: {
              cover: "cloud://authoritative"
            },
            editableTexture: {
              baseColor: "#C6A38A",
              notes: []
            }
          }
        ]
      }
    };
  };

  delete require.cache[require.resolve("../../miniprogram/flows/workSyncFlow.js")];
  const workSync = require("../../miniprogram/flows/workSyncFlow.js");
  const localWork = {
    workId,
    petName: "本地不可信名称",
    status: "failed",
    currentVersionId: versionId,
    versionIds: [versionId]
  };
  const localVersion = {
    versionId,
    workId,
    previewMedia: {
      cover: "local://untrusted"
    }
  };

  try {
    const failed = await workSync.saveCurrentWorkToCloud(localWork, localVersion, {
      taskId,
      silent: true
    });
    assert.equal(failed.ok, false);
    assert.deepEqual(payloads[0], {
      taskId,
      workId,
      versionId,
      reason: "client_recovery"
    });
    assert.ok(pendingStorage.readPendingCloudSave());
    assert.equal(getWorkCalls, 0);

    shouldFail = false;
    const recovered = await workSync.retryPendingCloudSave({
      silent: true
    });
    assert.equal(recovered.ok, true);
    assert.equal(getWorkCalls, 1);
    assert.equal(pendingStorage.readPendingCloudSave(), null);
    assert.equal(store.getState().workState.workMap[workId].petName, "云端权威名称");
    assert.equal(
      store.getState().workState.versionMap[versionId].previewMedia.cover,
      "cloud://authoritative"
    );
    assert.deepEqual(Object.keys(payloads[1]).sort(), [
      "reason",
      "taskId",
      "versionId",
      "workId"
    ]);
  } finally {
    workService.saveWorkBundle = originalSave;
    workService.getWork = originalGet;
    pendingStorage.removePendingCloudSave();
  }
});

test("terminal task errors clear pending references to avoid infinite retries", async () => {
  const workService = require("../../miniprogram/services/work/index.js");
  const pendingStorage = require("../../miniprogram/utils/pendingCloudSaveStorage.js");
  const originalSave = workService.saveWorkBundle;
  const originalGet = workService.getWork;
  let getWorkCalls = 0;

  workService.saveWorkBundle = async () => ({
    ok: false,
    errorCode: "SAVE_WORK_TASK_NOT_FOUND",
    message: "task not found"
  });
  workService.getWork = async () => {
    getWorkCalls += 1;
    return { ok: false };
  };

  delete require.cache[require.resolve("../../miniprogram/flows/workSyncFlow.js")];
  const workSync = require("../../miniprogram/flows/workSyncFlow.js");

  try {
    const result = await workSync.saveCurrentWorkToCloud(
      {
        workId: "work-terminal-error"
      },
      {
        versionId: "version-terminal-error"
      },
      {
        taskId: "task-terminal-error",
        silent: true
      }
    );
    assert.equal(result.errorCode, "SAVE_WORK_TASK_NOT_FOUND");
    assert.equal(pendingStorage.readPendingCloudSave(), null);
    assert.equal(getWorkCalls, 0);
  } finally {
    workService.saveWorkBundle = originalSave;
    workService.getWork = originalGet;
    pendingStorage.removePendingCloudSave();
  }
});
