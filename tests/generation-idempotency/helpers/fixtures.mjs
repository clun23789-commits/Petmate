export const OPENID = "openid-generation-test";
export const WORK_ID = "work-generation-test";
export const NOW = new Date("2026-07-28T08:00:00.000Z");

export function workDoc(overrides = {}) {
  return {
    _id: "legacy-work-doc",
    workId: WORK_ID,
    ownerOpenid: OPENID,
    petType: "cat",
    petName: "团团",
    status: "generating",
    currentVersionId: "",
    versionIds: [],
    createdAt: new Date(NOW.getTime() - 60_000),
    updatedAt: new Date(NOW.getTime() - 60_000),
    deletedAt: null,
    ...overrides
  };
}

export function assetDoc(overrides = {}) {
  return {
    _id: "asset-generation-test",
    assetId: "asset-generation-test",
    ownerOpenid: OPENID,
    workId: WORK_ID,
    status: "active",
    role: "initial",
    viewType: "front",
    fileID: "cloud://asset-generation-test",
    ...overrides
  };
}

export function reservationDoc(operationType = "optimize", overrides = {}) {
  const reservationId = overrides.reservationId || `reservation-${operationType}`;
  return {
    _id: `reservation-doc-${operationType}`,
    openid: OPENID,
    reservationId,
    workId: WORK_ID,
    source: operationType === "targeted_upload" ? "targeted_upload" : "result",
    taskId: "",
    status: "reserved",
    dimensionSet: ["fur"],
    expiresAt: new Date(NOW.getTime() + 15 * 60_000),
    boundAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

export function taskDoc(overrides = {}) {
  return {
    _id: "generation-task-test",
    taskId: "generation-task-test",
    clientRequestId: "generation-request-test",
    ownerOpenid: OPENID,
    workId: WORK_ID,
    operationType: "initial",
    phase: "queued",
    status: "pending",
    provider: "basic_generation",
    providerStatus: "queued",
    progress: 0,
    failureCode: "",
    failureReason: "",
    failureCategory: "none",
    recoverable: true,
    reservationId: "",
    dimensionSet: [],
    targetVersionId: "version-generation-test",
    inputSnapshot: {
      uploadAssetIds: ["asset-generation-test"],
      dimensionSet: [],
      views: [],
      workSnapshot: {
        workId: WORK_ID,
        petType: "cat",
        petName: "团团",
        versionIds: [],
        createdAt: NOW
      }
    },
    resultSnapshot: {},
    resultSaveStatus: "idle",
    resultSaveErrorCode: "",
    resultSaveErrorMessage: "",
    finalizedWorkId: "",
    finalizedVersionId: "",
    revision: 0,
    processingToken: "",
    processingStartedAt: null,
    processingExpiresAt: null,
    lastProcessedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    failedAt: null,
    timeoutAt: null,
    finalizedAt: null,
    ...overrides
  };
}

export function completedVersion(overrides = {}) {
  return {
    versionId: "version-generation-test",
    workId: WORK_ID,
    sourceType: "initial",
    previewMedia: {
      cover: "cloud://asset-generation-test",
      modelHint: "测试结果",
      colorway: "测试配色"
    },
    feedbackSummary: {},
    editableTexture: {
      baseColor: "#C6A38A",
      notes: ["测试"]
    },
    createdAt: NOW,
    ...overrides
  };
}
