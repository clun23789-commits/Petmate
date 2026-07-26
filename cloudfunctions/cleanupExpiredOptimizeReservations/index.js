"use strict";

const cloud = require("wx-server-sdk");
const { createCleanupExpiredOptimizeReservationsHandler } = require("./core");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = createCleanupExpiredOptimizeReservationsHandler({
  db: cloud.database()
});
