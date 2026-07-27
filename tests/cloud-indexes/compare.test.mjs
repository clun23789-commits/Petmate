import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatCloudIndexReport } from "../../tools/check-cloud-indexes.mjs";
import { compareIndexConfiguration } from "../../tools/cloud-indexes/compare.mjs";
import { normalizeExpectedConfiguration } from "../../tools/cloud-indexes/normalize.mjs";

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findIndex(remote, collectionName, indexName) {
  return remote.Tables.find((table) => table.TableName === collectionName).Indexes.find(
    (index) => index.Name === indexName
  );
}

const expected = readFixture("expected.json");

test("a complete definition match passes with ordered keys and unique attributes", () => {
  const report = compareIndexConfiguration(expected, readFixture("remote-matching.json"));
  assert.equal(report.passed, true);
  assert.deepEqual(report.collections, { expected: 2, found: 2 });
  assert.deepEqual(report.indexes, { expected: 6, matched: 6 });
  assert.equal(report.warnings.length, 0);
});

test("a missing collection fails", () => {
  const remote = readFixture("remote-matching.json");
  remote.Tables = remote.Tables.filter((table) => table.TableName !== "orders");
  const report = compareIndexConfiguration(expected, remote);
  assert.equal(report.passed, false);
  assert.ok(
    report.missing.some((item) => item.type === "collection" && item.collection === "orders")
  );
});

test("a missing or wrongly named required index fails", () => {
  const missingRemote = readFixture("remote-matching.json");
  findIndex(missingRemote, "works", "idx_owner_work").Name = "idx_owner_work_typo";
  const report = compareIndexConfiguration(expected, missingRemote);
  assert.equal(report.passed, false);
  assert.ok(report.missing.some((item) => item.name === "idx_owner_work"));
  assert.ok(report.warnings.some((item) => item.code === "EXTRA_INDEX"));
});

for (const [label, mutate, field] of [
  [
    "field name",
    (index) => {
      index.Keys[0].Name = "owner_openid";
    },
    "keys[0].name"
  ],
  [
    "field order",
    (index) => {
      index.Keys.reverse();
    },
    "keys[0].name"
  ],
  [
    "sort direction",
    (index) => {
      index.Keys[1].Direction = "-1";
    },
    "keys[1].direction"
  ],
  [
    "unique property",
    (index) => {
      index.Unique = true;
    },
    "unique"
  ]
]) {
  test(`${label} mismatch fails`, () => {
    const remote = readFixture("remote-matching.json");
    mutate(findIndex(remote, "works", "idx_owner_work"));
    const report = compareIndexConfiguration(expected, remote);
    assert.equal(report.passed, false);
    assert.ok(report.mismatched[0].differences.some((difference) => difference.field === field));
  });
}

test("a building index fails", () => {
  const remote = readFixture("remote-matching.json");
  findIndex(remote, "works", "idx_owner_work").Status = "BUILDING";
  const report = compareIndexConfiguration(expected, remote);
  assert.equal(report.passed, false);
  assert.ok(
    report.mismatched[0].differences.some(
      (difference) => difference.code === "INDEX_STATUS_BUILDING"
    )
  );
});

test("missing official status produces explicit warnings without inventing ready state", () => {
  const remote = readFixture("remote-matching.json");
  remote.Tables.forEach((table) => {
    table.Indexes.forEach((index) => {
      delete index.Status;
    });
  });
  const report = compareIndexConfiguration(expected, remote);
  assert.equal(report.passed, true);
  assert.equal(report.warnings.length, 6);
  assert.ok(report.warnings.every((warning) => warning.code === "INDEX_STATUS_UNKNOWN"));
});

test("an extra remote index is a warning only", () => {
  const remote = readFixture("remote-matching.json");
  remote.Tables[0].Indexes.push({
    Name: "idx_extra",
    Unique: false,
    Status: "READY",
    Keys: [{ Name: "extra", Direction: "1" }]
  });
  const report = compareIndexConfiguration(expected, remote);
  assert.equal(report.passed, true);
  assert.ok(report.warnings.some((warning) => warning.name === "idx_extra"));
});

test("missing or malformed default system indexes fail", () => {
  const missingRemote = readFixture("remote-matching.json");
  missingRemote.Tables[0].Indexes = missingRemote.Tables[0].Indexes.filter(
    (index) => index.Name !== "_id_"
  );
  const missingReport = compareIndexConfiguration(expected, missingRemote);
  assert.equal(missingReport.passed, false);
  assert.ok(missingReport.missing.some((item) => item.name === "_id_"));

  const malformedRemote = readFixture("remote-matching.json");
  findIndex(malformedRemote, "orders", "_openid_1").Unique = true;
  const malformedReport = compareIndexConfiguration(expected, malformedRemote);
  assert.equal(malformedReport.passed, false);
  assert.ok(malformedReport.mismatched.some((item) => item.name === "_openid_1"));
});

test("an empty remote response fails every expected collection", () => {
  const report = compareIndexConfiguration(expected, { Tables: [] });
  assert.equal(report.passed, false);
  assert.equal(report.collections.found, 0);
  assert.equal(report.missing.length, 2);
});

test("report output identifies the target environment and failure categories", () => {
  const remote = readFixture("remote-matching.json");
  remote.Tables[0].Indexes = remote.Tables[0].Indexes.filter(
    (index) => index.Name !== "idx_owner_work"
  );
  const report = compareIndexConfiguration(expected, remote);
  const output = formatCloudIndexReport(report, {
    envId: "test-env",
    appEnv: "staging"
  });
  assert.match(output, /CloudBase index check failed/);
  assert.match(output, /test-env/);
  assert.match(output, /app env: staging/);
  assert.match(output, /\[MISSING\]/);
  assert.match(output, /works\.idx_owner_work/);
  assert.match(output, /Read-only check/);
});

test("the project machine source defines twelve collections and valid ordered indexes", () => {
  const projectRoot = path.resolve(fixtureRoot, "..", "..", "..");
  const config = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "config", "cloud-database-indexes.json"), "utf8")
  );
  const normalized = normalizeExpectedConfiguration(config);
  assert.equal(normalized.collections.length, 12);
  assert.equal(
    normalized.collections.reduce((count, collection) => count + collection.indexes.length, 0),
    48
  );
  assert.deepEqual(
    clone(config.collections.works[1].keys),
    [
      { name: "ownerOpenid", direction: 1 },
      { name: "status", direction: 1 },
      { name: "updatedAt", direction: -1 }
    ]
  );
});

test("package scripts keep the credentialed check outside ordinary project checks", () => {
  const projectRoot = path.resolve(fixtureRoot, "..", "..", "..");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
  );

  assert.equal(packageJson.scripts["check:deployment"], "npm run check:cloud-indexes");
  assert.doesNotMatch(packageJson.scripts.check, /check:(cloud-indexes|deployment)/);
  assert.match(packageJson.scripts["release:precheck"], /check:deployment/);
});
