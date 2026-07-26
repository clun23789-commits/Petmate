"use strict";

const cloud = require("wx-server-sdk");
const { createCommitOptimizeQuotaHandler } = require("./core");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = createCommitOptimizeQuotaHandler({
  cloud,
  db: cloud.database()
});
