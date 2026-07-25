"use strict";

const { getServiceMode, SERVICE_MODE_VALUE } = require("../runtime");
const mockAuth = require("../mock/auth");
const wechatAuth = require("./wechat");

const mode = getServiceMode("auth");

if (mode === SERVICE_MODE_VALUE.MOCK) {
  module.exports = mockAuth;
} else {
  module.exports = wechatAuth;
}
