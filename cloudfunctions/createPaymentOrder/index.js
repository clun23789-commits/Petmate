"use strict";

const cloud = require("wx-server-sdk");
const { createPaymentOrderHandler } = require("./core");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = createPaymentOrderHandler({
  cloud,
  db: cloud.database(),
  serverEnv: process.env,
  logger: console
});
