"use strict";

const cloud = require("wx-server-sdk");
const { createSaveWorkHandler } = require("./core");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = createSaveWorkHandler({
  cloud,
  db: cloud.database()
});
