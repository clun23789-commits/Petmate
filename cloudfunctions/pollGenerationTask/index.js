"use strict";

const cloud = require("wx-server-sdk");
const { createPollGenerationTaskHandler } = require("./core");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = createPollGenerationTaskHandler({
  cloud,
  db: cloud.database()
});
