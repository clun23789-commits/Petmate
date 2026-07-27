"use strict";

const { createId } = require("./id");
const { getStorageValue, setStorageValue } = require("./storage");

const STORAGE_KEY = "petmate.generationRequests.v1";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getScopeKey(input = {}) {
  return [
    normalizeString(input.workId),
    normalizeString(input.operationType),
    normalizeString(input.reservationId)
  ].join("|");
}

function readRequestMap() {
  const value = getStorageValue(STORAGE_KEY, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sanitizeRequest(input = {}) {
  const clientRequestId = normalizeString(input.clientRequestId);
  const workId = normalizeString(input.workId);
  const operationType = normalizeString(input.operationType);
  if (!clientRequestId || !workId || !operationType) {
    return null;
  }
  return {
    clientRequestId,
    workId,
    operationType,
    reservationId: normalizeString(input.reservationId),
    taskId: normalizeString(input.taskId),
    createdAt: normalizeString(input.createdAt)
  };
}

function getGenerationRequest(scope = {}) {
  const request = readRequestMap()[getScopeKey(scope)];
  return sanitizeRequest(request);
}

function findGenerationRequest(scope = {}) {
  const workId = normalizeString(scope.workId);
  const operationType = normalizeString(scope.operationType);
  if (!workId || !operationType) {
    return null;
  }
  const requestMap = readRequestMap();
  const request = Object.values(requestMap).find((item) => {
    return (
      normalizeString(item && item.workId) === workId &&
      normalizeString(item && item.operationType) === operationType
    );
  });
  return sanitizeRequest(request);
}

function getOrCreateGenerationRequest(scope = {}, dependencies = {}) {
  const existing = getGenerationRequest(scope);
  if (existing) {
    return existing;
  }
  const createRequestId =
    typeof dependencies.createRequestId === "function"
      ? dependencies.createRequestId
      : () => createId("generation-request");
  const now = typeof dependencies.now === "function" ? dependencies.now : () => new Date();
  const request = sanitizeRequest({
    clientRequestId: createRequestId(),
    workId: scope.workId,
    operationType: scope.operationType,
    reservationId: scope.reservationId,
    taskId: "",
    createdAt: now().toISOString()
  });
  if (!request) {
    throw new Error("生成请求恢复信息不完整");
  }
  return saveGenerationTaskReference(request);
}

function saveGenerationTaskReference(input = {}) {
  const request = sanitizeRequest(input);
  if (!request) {
    throw new Error("生成请求恢复信息不完整");
  }
  const requestMap = readRequestMap();
  requestMap[getScopeKey(request)] = request;
  setStorageValue(STORAGE_KEY, requestMap);
  return request;
}

function clearGenerationRequest(scope = {}) {
  const requestMap = readRequestMap();
  const scopeKey = getScopeKey(scope);
  if (!Object.prototype.hasOwnProperty.call(requestMap, scopeKey)) {
    return;
  }
  delete requestMap[scopeKey];
  setStorageValue(STORAGE_KEY, requestMap);
}

function clearGenerationRequestByTaskId(taskId) {
  const normalizedTaskId = normalizeString(taskId);
  if (!normalizedTaskId) {
    return;
  }
  const requestMap = readRequestMap();
  let changed = false;
  Object.keys(requestMap).forEach((scopeKey) => {
    if (normalizeString(requestMap[scopeKey] && requestMap[scopeKey].taskId) === normalizedTaskId) {
      delete requestMap[scopeKey];
      changed = true;
    }
  });
  if (changed) {
    setStorageValue(STORAGE_KEY, requestMap);
  }
}

module.exports = {
  STORAGE_KEY,
  clearGenerationRequest,
  clearGenerationRequestByTaskId,
  findGenerationRequest,
  getGenerationRequest,
  getOrCreateGenerationRequest,
  saveGenerationTaskReference
};
