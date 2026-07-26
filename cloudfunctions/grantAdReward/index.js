"use strict";

const cloud = require("wx-server-sdk");
const { createGrantAdRewardHandler } = require("./core");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = createGrantAdRewardHandler({
  cloud,
  db: cloud.database(),
  now: () => new Date(),
  logger: console
});
