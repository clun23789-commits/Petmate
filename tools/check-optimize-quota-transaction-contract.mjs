import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function requirePattern(relativePath, pattern, message) {
  const content = read(relativePath);
  if (!pattern.test(content)) {
    failures.push(`${relativePath}: ${message}`);
  }
}

function rejectPattern(relativePath, pattern, message) {
  const content = read(relativePath);
  if (pattern.test(content)) {
    failures.push(`${relativePath}: ${message}`);
  }
}

for (const name of ["reserveOptimizeQuota", "commitOptimizeQuota", "releaseOptimizeQuota"]) {
  requirePattern(
    `cloudfunctions/${name}/core.js`,
    /\bdb\.runTransaction\s*\(/,
    "must execute its quota state transition with db.runTransaction"
  );
  rejectPattern(
    `cloudfunctions/${name}/core.js`,
    /Math\.max\s*\(\s*0\s*,\s*[^)]*reservedCount/,
    "must not hide a reservedCount inconsistency with Math.max"
  );
}

requirePattern(
  "cloudfunctions/reserveOptimizeQuota/core.js",
  /getQuotaDocId[\s\S]*getReservationDocId[\s\S]*reservedCount:\s*counts\.reservedCount\s*\+\s*1/,
  "must read deterministic quota/reservation IDs and increment reservedCount in the transaction"
);
requirePattern(
  "cloudfunctions/commitOptimizeQuota/core.js",
  /task\.status\s*!==\s*"success"[\s\S]*task\.resultSaveStatus\s*!==\s*"success"[\s\S]*finalizedVersionId/,
  "must verify task success, saved result, and finalized version before commit"
);
requirePattern(
  "cloudfunctions/releaseOptimizeQuota/core.js",
  /task\.status\s*===\s*"pending"\s*\|\|\s*task\.status\s*===\s*"running"[\s\S]*OPTIMIZE_RESERVATION_TASK_ACTIVE[\s\S]*task\.status\s*===\s*"success"[\s\S]*OPTIMIZE_RESERVATION_TASK_SUCCEEDED/,
  "must protect active and successful generation tasks from release"
);
requirePattern(
  "cloudfunctions/startGenerationTask/core.js",
  /db\.runTransaction\s*\([\s\S]*generationTasks"\)\.doc\(taskId\)\.set[\s\S]*reservationRef\.update[\s\S]*taskId[\s\S]*boundAt/,
  "must create the generation task and bind taskId/boundAt in one transaction"
);

const creationFlow = read("miniprogram/flows/creationFlow.js");
const pollStart = creationFlow.indexOf("async function pollActiveGeneration");
const pollNoResult = creationFlow.indexOf("if (!result.task)", pollStart);
const pollQuerySection = pollStart >= 0 && pollNoResult > pollStart
  ? creationFlow.slice(pollStart, pollNoResult)
  : "";
if (!pollQuerySection || /releaseOptimizationReservation/.test(pollQuerySection)) {
  failures.push("miniprogram/flows/creationFlow.js: poll query exceptions must preserve the reservation");
}
if (!/result\.task\.status\s*===\s*"failed"[\s\S]*releaseOptimizationReservation/.test(creationFlow)) {
  failures.push("miniprogram/flows/creationFlow.js: explicit cloud task failure must still request release");
}
if (!/result\.task\.status\s*===\s*"success"[\s\S]*result\.task\.resultSaveStatus\s*===\s*"success"[\s\S]*commitOptimizationReservation/.test(creationFlow)) {
  failures.push("miniprogram/flows/creationFlow.js: only a successful saved result may request commit");
}

requirePattern(
  "miniprogram/flows/optimizationFlow.js",
  /createId\)\("reservation"\)[\s\S]*inFlightOptimizationMap[\s\S]*pendingReservationIdMap/,
  "must create a client reservationId and protect submissions with single-flight state"
);
requirePattern(
  "miniprogram/services/optimization/cloud.js",
  /reserveOptimizeQuota[\s\S]*reservationId:\s*payload\.reservationId[\s\S]*workId:\s*payload\.workId[\s\S]*source:\s*payload\.source[\s\S]*dimensionSet:/,
  "must forward the complete reservation contract explicitly"
);
requirePattern(
  "miniprogram/pages/works/result/index.js",
  /isOptimizeSubmitting[\s\S]*handleOptimize/,
  "result page must expose an optimization submission lock"
);
requirePattern(
  "miniprogram/pages/works/result/index.wxml",
  /正在提交优化[\s\S]*disabled="\{\{isOptimizeSubmitting\}\}"/,
  "result page button must show and enforce the submission lock"
);

for (const relativePath of [
  "docs/cloud_database_schema.md",
  "docs/cloud_database_indexes.md",
  "docs/cloudfunctions_deployment_checklist.md",
  "docs/smoke_test_checklist.md"
]) {
  requirePattern(relativePath, /expiresAt/, "must document reservation expiration");
  requirePattern(relativePath, /boundAt/, "must document task binding time");
  requirePattern(relativePath, /releaseReason/, "must document server-controlled release reasons");
}

for (const relativePath of [
  "cloudfunctions/cleanupExpiredOptimizeReservations/index.js",
  "cloudfunctions/cleanupExpiredOptimizeReservations/core.js",
  "cloudfunctions/cleanupExpiredOptimizeReservations/package.json"
]) {
  if (!fs.existsSync(path.join(repoRoot, relativePath))) {
    failures.push(`${relativePath}: cleanup cloud function file is missing`);
  }
}

function readConstant(relativePath, constantName) {
  const match = read(relativePath).match(new RegExp(`const\\s+${constantName}\\s*=\\s*(\\d+)\\s*\\*\\s*60\\s*\\*\\s*1000`));
  return match ? Number(match[1]) : null;
}

const ttlFiles = [
  "cloudfunctions/reserveOptimizeQuota/core.js",
  "cloudfunctions/startGenerationTask/core.js",
  "cloudfunctions/cleanupExpiredOptimizeReservations/core.js"
];
const ttlValues = ttlFiles.map((relativePath) => readConstant(relativePath, "RESERVATION_TTL_MS"));
const timeoutFiles = [
  "cloudfunctions/reserveOptimizeQuota/core.js",
  "cloudfunctions/startGenerationTask/core.js",
  "cloudfunctions/cleanupExpiredOptimizeReservations/core.js"
];
const timeoutValues = timeoutFiles.map((relativePath) => readConstant(relativePath, "GENERATION_TASK_TIMEOUT_MS"));
const pollTimeout = readConstant("cloudfunctions/pollGenerationTask/index.js", "TASK_TIMEOUT_MS");

if (ttlValues.some((value) => value === null) || new Set(ttlValues).size !== 1) {
  failures.push("reservation TTL constants must exist and match across reserve/start/cleanup");
}
if (timeoutValues.some((value) => value === null) || new Set([...timeoutValues, pollTimeout]).size !== 1) {
  failures.push("generation task timeout constants must match across reserve/start/cleanup/poll");
}
if (ttlValues[0] !== null && timeoutValues[0] !== null && ttlValues[0] < timeoutValues[0]) {
  failures.push("reservation TTL must not be shorter than generation task timeout");
}

if (failures.length) {
  console.error("Optimize quota transaction contract check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Optimize quota transaction contract check passed.");
