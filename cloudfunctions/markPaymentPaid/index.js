"use strict";

const cloud = require("wx-server-sdk");
const { createMarkPaymentPaidHandler } = require("./core");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = createMarkPaymentPaidHandler({
  cloud,
  db: cloud.database(),
  serverEnv: process.env,
  logger: console
});
