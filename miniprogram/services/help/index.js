"use strict";

const { getServiceMode, SERVICE_MODE_VALUE } = require("../runtime");
const mockHelp = require("../mock/help");

const mode = getServiceMode("help");

function buildUnavailableResult() {
  return Promise.resolve({
    ok: false,
    status: "unavailable",
    errorCode: "HELP_SERVICE_UNAVAILABLE",
    message: "帮助中心服务暂不可用，请先补齐 help 的 cloud 实现。"
  });
}

function getUnavailableArticle() {
  return Promise.resolve(null);
}

if (mode === SERVICE_MODE_VALUE.MOCK) {
  module.exports = mockHelp;
} else {
  module.exports = {
    listHelpArticles: buildUnavailableResult,
    listHelpGroups: buildUnavailableResult,
    getHelpArticle: getUnavailableArticle
  };
}
