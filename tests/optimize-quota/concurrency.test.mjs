import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-database.mjs";
import { NOW, OPENID, WORK_ID, quotaDoc, workDoc } from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const { createReserveOptimizeQuotaHandler } = require("../../cloudfunctions/reserveOptimizeQuota/core.js");

function handlerFor(db) {
  return createReserveOptimizeQuotaHandler({
    cloud: createCloud(OPENID),
    db,
    now: () => new Date(NOW),
    logger: quietLogger()
  });
}

test("two reservations racing for the final quota allow exactly one winner", async () => {
  const db = new FakeDatabase({
    works: [workDoc()],
    optimizeQuotas: [quotaDoc({ grantedCount: 1 })]
  });
  const handler = handlerFor(db);
  const results = await Promise.all([
    handler({ reservationId: "reservation-a", workId: WORK_ID, source: "result" }),
    handler({ reservationId: "reservation-b", workId: WORK_ID, source: "result" })
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.errorCode === "OPTIMIZE_QUOTA_NOT_ENOUGH").length, 1);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 1);
  assert.equal(db.all("optimizeReservations").length, 1);
});

test("two available quotas allow two concurrent reservations", async () => {
  const db = new FakeDatabase({
    works: [workDoc()],
    optimizeQuotas: [quotaDoc({ grantedCount: 2 })]
  });
  const handler = handlerFor(db);
  const results = await Promise.all([
    handler({ reservationId: "reservation-a", workId: WORK_ID, source: "result" }),
    handler({ reservationId: "reservation-b", workId: WORK_ID, source: "result" })
  ]);
  assert.equal(results.every((result) => result.ok), true);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 2);
});
