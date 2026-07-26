"use strict";

const cloud = require("wx-server-sdk");
const { createReserveOptimizeQuotaHandler } = require("./core");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = createReserveOptimizeQuotaHandler({
  cloud,
  db: cloud.database()
});
