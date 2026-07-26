import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { FakeDatabase, createCloud, quietLogger } from "./helpers/fake-database.mjs";
import { NOW, OPENID, WORK_ID, quotaDoc, workDoc } from "./helpers/fixtures.mjs";

const require = createRequire(import.meta.url);
const { createReserveOptimizeQuotaHandler, getReservationDocId } = require("../../cloudfunctions/reserveOptimizeQuota/core.js");

function createHandler(db) {
  return createReserveOptimizeQuotaHandler({
    cloud: createCloud(OPENID),
    db,
    now: () => new Date(NOW),
    logger: quietLogger()
  });
}

test("reserve creates one reservation and increments reservedCount atomically", async () => {
  const db = new FakeDatabase({
    works: [workDoc()],
    optimizeQuotas: [quotaDoc()]
  });
  const result = await createHandler(db)({
    reservationId: "reservation-a",
    workId: WORK_ID,
    source: "result",
    dimensionSet: ["fur", "fur", "", "invalid", "tail"]
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.transitionApplied, true);
  assert.deepEqual(result.data.reservation.dimensionSet, ["fur", "tail"]);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 1);
  assert.equal(db.get("optimizeReservations", getReservationDocId(OPENID, "reservation-a")).status, "reserved");
});

test("reserve is idempotent and rejects a conflicting work", async () => {
  const db = new FakeDatabase({
    works: [workDoc(), workDoc({ _id: "work-doc-other", workId: "work-other" })],
    optimizeQuotas: [quotaDoc()]
  });
  const handler = createHandler(db);
  const payload = {
    reservationId: "reservation-a",
    workId: WORK_ID,
    source: "result",
    dimensionSet: ["fur"]
  };
  assert.equal((await handler(payload)).ok, true);
  const duplicated = await handler(payload);
  assert.equal(duplicated.ok, true);
  assert.equal(duplicated.data.duplicated, true);
  assert.equal(duplicated.data.transitionApplied, false);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 1);

  const conflict = await handler({
    ...payload,
    workId: "work-other"
  });
  assert.equal(conflict.errorCode, "OPTIMIZE_RESERVATION_CONFLICT");
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 1);
});

test("reserve rejects insufficient quota without a partial reservation", async () => {
  const db = new FakeDatabase({
    works: [workDoc()],
    optimizeQuotas: [quotaDoc({ grantedCount: 1, usedCount: 1 })]
  });
  const result = await createHandler(db)({
    reservationId: "reservation-no-quota",
    workId: WORK_ID,
    source: "result"
  });
  assert.equal(result.errorCode, "OPTIMIZE_QUOTA_NOT_ENOUGH");
  assert.equal(db.all("optimizeReservations").length, 0);
});

test("reserve rolls back both documents when quota update fails", async () => {
  const db = new FakeDatabase({
    works: [workDoc()],
    optimizeQuotas: [quotaDoc()]
  });
  db.failNext("optimizeQuotas", "update");
  const result = await createHandler(db)({
    reservationId: "reservation-rollback",
    workId: WORK_ID,
    source: "result"
  });
  assert.equal(result.errorCode, "OPTIMIZE_QUOTA_TRANSACTION_FAILED");
  assert.equal(db.all("optimizeReservations").length, 0);
  assert.equal(db.get("optimizeQuotas", quotaDoc()._id).reservedCount, 0);
});
