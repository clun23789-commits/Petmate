"use strict";

const {
  getServiceMode,
  SERVICE_MODE_VALUE,
  allowsMockFallback
} = require("../runtime");
const cloudShare = require("../cloud/share");
const mockShare = require("../mock/share");

const shareMode = getServiceMode("share");
// shareMode is cloud-with-mock-fallback by default; callers must keep using this unified service.

function shouldUseMockOnly() {
  return shareMode === SERVICE_MODE_VALUE.MOCK;
}

function normalizeErrorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function getWorkIdFromPayload(payload) {
  if (typeof payload === "string") {
    return payload;
  }

  return payload && payload.workId ? payload.workId : "";
}

async function createMockShare(payload) {
  const input = payload && typeof payload === "object" ? payload : {};
  const result = await mockShare.createSharePayload(getWorkIdFromPayload(payload));

  return {
    ...result,
    workId: result.workId || input.workId || "",
    title: result.title || input.title || "Petmate 宠物数字形象作品",
    path: result.path || `/pages/share/landing/index?shareId=${encodeURIComponent(result.shareId || "")}`,
    imageUrl: result.imageUrl || input.imageUrl || "",
    description: result.description || input.description || "",
    shareStatus: result.shareStatus || "active",
    visitorRole: result.visitorRole || "new_user",
    preview: result.preview || {},
    conversion: result.conversion || {}
  };
}

async function createShare(payload = {}) {
  if (shouldUseMockOnly()) {
    return createMockShare(payload);
  }

  try {
    return await cloudShare.createShare(payload);
  } catch (error) {
    if (allowsMockFallback("share")) {
      console.warn("createShare cloud failed, fallback to mock", error);
      return createMockShare(payload);
    }

    throw new Error(normalizeErrorMessage(error, "创建分享失败，请稍后重试。"));
  }
}

async function getShare(shareId, options = {}) {
  if (shouldUseMockOnly()) {
    return mockShare.getShare(shareId, options);
  }

  try {
    return await cloudShare.getShare(shareId, options);
  } catch (error) {
    if (allowsMockFallback("share")) {
      try {
        console.warn("getShare cloud failed, fallback to mock", error);
        return await mockShare.getShare(shareId, options);
      } catch (fallbackError) {
        console.warn("getShare mock fallback failed", fallbackError);
      }
    }

    throw new Error(normalizeErrorMessage(error, "读取分享失败，请稍后重试。"));
  }
}

function loadShareContext(shareId) {
  return mockShare.loadShareContext(shareId);
}

async function expireSharePayloadsForWork(workId) {
  const localResult = mockShare.expireSharePayloadsForWork(workId);

  if (shouldUseMockOnly()) {
    return localResult;
  }

  try {
    await cloudShare.expireSharesForWork(workId);
    return localResult;
  } catch (error) {
    if (allowsMockFallback("share")) {
      console.warn("expireSharesForWork cloud failed, local share contexts were expired", error);
      return localResult;
    }

    throw new Error(normalizeErrorMessage(error, "分享失效同步失败，请稍后重试。"));
  }
}

module.exports = {
  createShare,
  getShare,
  loadShareContext,
  expireSharePayloadsForWork,
  getDefaultSharePayload: mockShare.getDefaultSharePayload,
  createSharePayload: mockShare.createSharePayload,
  shareMode
};
