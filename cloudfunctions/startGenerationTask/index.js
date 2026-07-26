"use strict";

const cloud = require("wx-server-sdk");
const { createStartGenerationTaskHandler } = require("./core");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = createStartGenerationTaskHandler({
  cloud,
  db: cloud.database()
});
