"use strict";

const { getServiceMode, SERVICE_MODE_VALUE } = require("../runtime");
const mockAr = require("../mock/ar");

const mode = getServiceMode("ar");

function initializeArUnavailable(workId) {
  return Promise.resolve({
    workId,
    success: false,
    reason: "AR 能力暂不可用，请先补齐真实 AR 实现。",
    reasonType: "unavailable",
    errorCode: "AR_SERVICE_UNAVAILABLE"
  });
}

if (mode === SERVICE_MODE_VALUE.MOCK) {
  module.exports = mockAr;
} else {
  module.exports = {
    initializeArSession: initializeArUnavailable
  };
}
