"use strict";

const cloud = require("wx-server-sdk");
const { createReleaseOptimizeQuotaHandler } = require("./core");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = createReleaseOptimizeQuotaHandler({
  cloud,
  db: cloud.database()
});
