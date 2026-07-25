"use strict";

const { getServiceMode, SERVICE_MODE_VALUE, allowsMockFallback } = require("../runtime");
const cloudGeneration = require("./cloud");
const mockGeneration = require("../mock/generation");

const mode = getServiceMode("generation");

async function startGenerationTask(params = {}) {
  if (mode === SERVICE_MODE_VALUE.MOCK) {
    return mockGeneration.startGenerationTask(params);
  }

  try {
    return await cloudGeneration.startGenerationTask(params);
  } catch (error) {
    if (allowsMockFallback("generation")) {
      console.warn("startGenerationTask cloud failed, fallback to mock", error);
      return mockGeneration.startGenerationTask(params);
    }

    throw error;
  }
}

async function pollGenerationTask(taskId) {
  if (mode === SERVICE_MODE_VALUE.MOCK) {
    return mockGeneration.pollGenerationTask(taskId);
  }

  try {
    return await cloudGeneration.pollGenerationTask(taskId);
  } catch (error) {
    if (allowsMockFallback("generation")) {
      console.warn("pollGenerationTask cloud failed, fallback to mock", error);
      return mockGeneration.pollGenerationTask(taskId);
    }

    throw error;
  }
}

function clearTasksByWorkId(workId) {
  if (mockGeneration.clearTasksByWorkId) {
    mockGeneration.clearTasksByWorkId(workId);
  }
}

module.exports = {
  startGenerationTask,
  pollGenerationTask,
  clearTasksByWorkId
};
