"use strict";

function assertCloudReady() {
  if (typeof wx === "undefined" || !wx.cloud || typeof wx.cloud.callFunction !== "function") {
    throw new Error("微信云开发能力不可用，请先确认 app.js 已初始化 wx.cloud");
  }
}

function unwrapCloudEnvelope(response, functionName) {
  if (!response || typeof response !== "object" || !response.result || typeof response.result !== "object") {
    throw new Error(`${functionName} 云函数返回格式异常`);
  }

  const result = response.result;

  if (result.ok !== true && result.ok !== false) {
    throw new Error(`${functionName} 云函数返回格式异常`);
  }

  if (result.ok !== true) {
    const error = new Error(result.message || `${functionName} 云函数调用失败`);
    error.errorCode = result.errorCode || "GENERATION_CLOUD_FAILED";
    throw error;
  }

  return result.data || {};
}

async function callGenerationFunction(name, data = {}) {
  assertCloudReady();
  const response = await wx.cloud.callFunction({
    name,
    data
  });

  return unwrapCloudEnvelope(response, name);
}

async function startGenerationTask(params = {}) {
  const data = await callGenerationFunction("startGenerationTask", params);
  return {
    task: data.task || null,
    duplicated: data.duplicated === true
  };
}

async function pollGenerationTask(taskId) {
  return callGenerationFunction("pollGenerationTask", { taskId });
}

module.exports = {
  startGenerationTask,
  pollGenerationTask
};
