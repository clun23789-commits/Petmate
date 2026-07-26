"use strict";

const cloud = require("wx-server-sdk");
const { createAdRewardSessionHandler } = require("./core");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = createAdRewardSessionHandler({
  cloud,
  db: cloud.database(),
  now: () => new Date(),
  logger: console
});
