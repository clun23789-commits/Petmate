"use strict";

const cloud = require("wx-server-sdk");
const { createGrantArEntitlementHandler } = require("./core");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = createGrantArEntitlementHandler({
  cloud,
  db: cloud.database(),
  serverEnv: process.env,
  logger: console
});
