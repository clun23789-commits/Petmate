import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("generation request storage reuses an unfinished clientRequestId and stores references only", () => {
  const storage = require("../../miniprogram/utils/generationRequestStorage.js");
  const workId = `work-storage-${Date.now()}`;
  const first = storage.getOrCreateGenerationRequest(
    {
      workId,
      operationType: "initial",
      reservationId: ""
    },
    {
      createRequestId: () => "generation-request-persisted",
      now: () => new Date("2026-07-28T09:00:00.000Z")
    }
  );
  storage.saveGenerationTaskReference({
    ...first,
    taskId: "generation-task-persisted",
    completedVersion: { forbidden: true },
    work: { forbidden: true }
  });
  const recovered = storage.getGenerationRequest({
    workId,
    operationType: "initial",
    reservationId: ""
  });
  assert.deepEqual(recovered, {
    clientRequestId: "generation-request-persisted",
    workId,
    operationType: "initial",
    reservationId: "",
    taskId: "generation-task-persisted",
    createdAt: "2026-07-28T09:00:00.000Z"
  });
  assert.equal(
    storage.getOrCreateGenerationRequest({
      workId,
      operationType: "initial",
      reservationId: ""
    }).clientRequestId,
    "generation-request-persisted"
  );
  storage.clearGenerationRequest({
    workId,
    operationType: "initial",
    reservationId: ""
  });
  assert.equal(
    storage.getGenerationRequest({
      workId,
      operationType: "initial",
      reservationId: ""
    }),
    null
  );
});

test("cloud generation service returns task and duplicated metadata", async () => {
  const previousWx = globalThis.wx;
  globalThis.wx = {
    cloud: {
      async callFunction() {
        return {
          result: {
            ok: true,
            data: {
              task: { taskId: "generation-task-cloud" },
              duplicated: true
            }
          }
        };
      }
    }
  };
  try {
    const cloudGeneration = require("../../miniprogram/services/generation/cloud.js");
    const result = await cloudGeneration.startGenerationTask({
      clientRequestId: "generation-request-cloud"
    });
    assert.deepEqual(result, {
      task: { taskId: "generation-task-cloud" },
      duplicated: true
    });
  } finally {
    globalThis.wx = previousWx;
  }
});

test("an unfinished optimization request exposes its persisted reservation after restart", () => {
  const storage = require("../../miniprogram/utils/generationRequestStorage.js");
  const workId = `work-optimize-storage-${Date.now()}`;
  const request = storage.getOrCreateGenerationRequest(
    {
      workId,
      operationType: "optimize",
      reservationId: "reservation-persisted"
    },
    {
      createRequestId: () => "generation-request-optimize-persisted",
      now: () => new Date("2026-07-28T09:30:00.000Z")
    }
  );
  assert.deepEqual(
    storage.findGenerationRequest({
      workId,
      operationType: "optimize"
    }),
    request
  );
  storage.clearGenerationRequest(request);
});
