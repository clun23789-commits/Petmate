export const OPENID = "openid-save-work-test";
export const OTHER_OPENID = "openid-save-work-other";
export const TASK_ID = "generation-task-save-work";
export const WORK_ID = "work-save-work";
export const VERSION_ID = "version-save-work";
export const NOW = new Date("2026-07-28T10:00:00.000Z");

export function resultSnapshot(overrides = {}) {
  return {
    versionId: VERSION_ID,
    workId: WORK_ID,
    sourceType: "initial",
    previewMedia: {
      cover: "cloud://save-work-cover",
      modelHint: "服务端生成结果",
      colorway: "暖棕色",
      unknownPreviewField: "must-not-persist"
    },
    feedbackSummary: {},
    editableTexture: {
      baseColor: "#C6A38A",
      notes: ["服务端生成"],
      aiSchema: "must-not-persist",
      unknownTextureField: "must-not-persist"
    },
    createdAt: new Date("2000-01-01T00:00:00.000Z"),
    unknownVersionField: "must-not-persist",
    ...overrides
  };
}

export function taskDoc(overrides = {}) {
  return {
    _id: TASK_ID,
    taskId: TASK_ID,
    clientRequestId: "generation-request-save-work",
    ownerOpenid: OPENID,
    workId: WORK_ID,
    operationType: "initial",
    phase: "failed",
    status: "failed",
    provider: "basic_generation",
    providerTaskId: "",
    providerTraceId: "",
    providerStatus: "failed",
    progress: 100,
    failureCode: "GENERATION_RESULT_SAVE_FAILED",
    failureCategory: "save",
    failureReason: "save failed",
    recoverable: true,
    targetVersionId: VERSION_ID,
    resultSnapshot: resultSnapshot(),
    resultSaveStatus: "failed",
    finalizedWorkId: "",
    finalizedVersionId: "",
    inputSnapshot: {
      workSnapshot: {
        workId: WORK_ID,
        petType: "cat",
        petTypeLabel: "猫",
        petName: "团团",
        displayName: "团团的数字形象",
        source: "forged-client-source",
        createdAt: new Date("1999-01-01T00:00:00.000Z"),
        unknownWorkField: "must-not-persist"
      }
    },
    revision: 4,
    processingToken: "",
    processingStartedAt: null,
    processingExpiresAt: null,
    lastProcessedAt: NOW,
    createdAt: new Date("2026-07-28T09:00:00.000Z"),
    updatedAt: new Date("2026-07-28T09:30:00.000Z"),
    completedAt: null,
    finalizedAt: null,
    ...overrides
  };
}

export function legacyWork(overrides = {}) {
  return {
    _id: "legacy-work-save-work",
    workId: WORK_ID,
    ownerOpenid: OPENID,
    petType: "cat",
    petName: "原有名称",
    status: "failed",
    currentVersionId: "",
    versionIds: [],
    source: "basic_generation",
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
    updatedAt: new Date("2026-07-20T00:00:00.000Z"),
    deletedAt: null,
    ...overrides
  };
}

export function legacyVersion(overrides = {}) {
  return {
    _id: "legacy-version-save-work",
    versionId: VERSION_ID,
    workId: WORK_ID,
    ownerOpenid: OPENID,
    sourceType: "initial",
    previewMedia: {},
    feedbackSummary: {},
    editableTexture: {
      baseColor: "#000000",
      notes: []
    },
    status: "active",
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
    updatedAt: new Date("2026-07-20T00:00:00.000Z"),
    ...overrides
  };
}

export function saveEvent(overrides = {}) {
  return {
    taskId: TASK_ID,
    workId: WORK_ID,
    versionId: VERSION_ID,
    reason: "client_recovery",
    ...overrides
  };
}
