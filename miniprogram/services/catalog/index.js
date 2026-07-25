"use strict";

const { getServiceMode, SERVICE_MODE_VALUE } = require("../runtime");
const mockCatalog = require("../mock/catalog");

const mode = getServiceMode("catalog");

function buildUnavailableResult() {
  return Promise.resolve({
    ok: false,
    status: "unavailable",
    errorCode: "CATALOG_SERVICE_UNAVAILABLE",
    message: "案例内容服务暂不可用，请先补齐 catalog 的 cloud 实现。"
  });
}

function getUnavailableItem() {
  return Promise.resolve(null);
}

if (mode === SERVICE_MODE_VALUE.MOCK) {
  module.exports = mockCatalog;
} else {
  module.exports = {
    listCases: buildUnavailableResult,
    listVideos: buildUnavailableResult,
    searchCatalog: buildUnavailableResult,
    getCaseById: getUnavailableItem,
    getVideoById: getUnavailableItem,
    getTemplateById: getUnavailableItem
  };
}
