"use strict";

const PROVIDER_NAME = "mock_cloud_adapter";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createStableVersionId(task) {
  const targetVersionId = normalizeString(task.targetVersionId);
  if (targetVersionId) {
    return targetVersionId;
  }
  return `version-${normalizeString(task.taskId).replace(/^task-/, "")}`;
}

function getPhaseByPollCount(pollCount) {
  if (pollCount <= 0) {
    return "queued";
  }

  if (pollCount === 1) {
    return "recognizing";
  }

  if (pollCount === 2) {
    return "painting";
  }

  if (pollCount === 3) {
    return "building";
  }

  if (pollCount === 4) {
    return "finalizing";
  }

  return "completed";
}

function getProviderStatusByPhase(phase) {
  if (phase === "queued") {
    return "queued";
  }
  if (phase === "completed") {
    return "succeeded";
  }
  if (phase === "failed") {
    return "failed";
  }
  return "running";
}

function getProgressByPhase(phase) {
  const progressMap = {
    queued: 0,
    recognizing: 20,
    painting: 45,
    building: 68,
    finalizing: 88,
    completed: 100,
    failed: 100,
    timeout: 100
  };

  return progressMap[phase] === undefined ? 0 : progressMap[phase];
}

function createPreview(operationType) {
  if (operationType === "targeted_upload") {
    return {
      cover: "/assets/mock/pet-corgi-hero.png",
      modelHint: "补图优化结果",
      colorway: "根据补图重新贴合了五官与轮廓细节"
    };
  }

  if (operationType === "optimize") {
    return {
      cover: "/assets/mock/pet-cat-hero.png",
      modelHint: "反馈优化结果",
      colorway: "根据六维反馈细化了毛色、花纹与脸部特征"
    };
  }

  return {
    cover: "/assets/mock/pet-cat-hero.png",
    modelHint: "首次生成结果",
    colorway: "已完成基础识别与形象生成"
  };
}

function createCompletedVersion(task) {
  const dimensionSet = normalizeArray(task.dimensionSet);

  return {
    versionId: createStableVersionId(task),
    workId: task.workId,
    sourceType: task.operationType === "initial" ? "initial" : task.operationType,
    previewMedia: createPreview(task.operationType),
    feedbackSummary: {},
    editableTexture: {
      baseColor: task.operationType === "optimize" ? "#d3b08f" : "#c6a38a",
      notes: dimensionSet.length
        ? dimensionSet.map((item) => `已围绕 ${item} 相关反馈重新优化`)
        : ["已完成本轮基础生成"]
    },
    createdAt: new Date().toISOString()
  };
}

async function getProviderState(task) {
  const nextPollCount = Number(task.pollCount || 0) + 1;

  if (task.simulateFailure === true && nextPollCount >= 5) {
    return {
      providerStatus: "failed",
      phase: "failed",
      progress: 100,
      providerTaskId: task.providerTaskId || task.taskId,
      resultSnapshot: null,
      failureCode: "GENERATION_PROVIDER_MOCK_FAILED",
      failureReason: "本次结果没有成功返回，系统已保留你的当前权益与可用次数。",
      failureCategory: "provider",
      recoverable: true,
      providerPatch: {
        pollCount: nextPollCount
      }
    };
  }

  const phase = getPhaseByPollCount(nextPollCount);
  const providerStatus = getProviderStatusByPhase(phase);

  return {
    providerStatus,
    phase,
    progress: getProgressByPhase(phase),
    providerTaskId: task.providerTaskId || task.taskId,
    resultSnapshot: providerStatus === "succeeded" ? task.resultSnapshot || createCompletedVersion(task) : null,
    failureCode: "",
    failureReason: "",
    failureCategory: "none",
    recoverable: true,
    providerPatch: {
      pollCount: nextPollCount
    }
  };
}

module.exports = {
  PROVIDER_NAME,
  getProviderState
};
