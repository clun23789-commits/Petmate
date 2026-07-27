import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, ...relativePath.split(/[\\/]/)), "utf8");
}

function assertIncludes(errors, content, expected, message) {
  if (!content.includes(expected)) {
    errors.push(message);
  }
}

const errors = [];
const saveWorkCore = readProjectFile("cloudfunctions/saveWork/core.js");
const saveWorkIndex = readProjectFile("cloudfunctions/saveWork/index.js");
const workCloudService = readProjectFile("miniprogram/services/cloud/work.js");
const workSyncFlow = readProjectFile("miniprogram/flows/workSyncFlow.js");
const pendingStorage = readProjectFile("miniprogram/utils/pendingCloudSaveStorage.js");
const optimizationFlow = readProjectFile("miniprogram/flows/optimizationFlow.js");

assertIncludes(errors, saveWorkIndex, "createSaveWorkHandler", "saveWork index must use the testable core handler.");
assertIncludes(errors, saveWorkCore, 'collection("generationTasks")', "saveWork must read generationTasks.");
assertIncludes(errors, saveWorkCore, "db.runTransaction", "saveWork must commit recovery in a transaction.");
assertIncludes(errors, saveWorkCore, 'collection("workVersions")', "saveWork must write workVersions.");
assertIncludes(errors, saveWorkCore, 'collection("works")', "saveWork must write works.");
assertIncludes(errors, saveWorkCore, "taskRef.update", "saveWork must finalize the task in the same transaction.");
assertIncludes(
  errors,
  saveWorkCore,
  "SAVE_WORK_LEGACY_PAYLOAD_REJECTED",
  "saveWork must explicitly reject the legacy full-object protocol."
);
assertIncludes(errors, saveWorkCore, "getWorkDocId", "saveWork must use deterministic work document IDs.");
assertIncludes(errors, saveWorkCore, "getVersionDocId", "saveWork must use deterministic version document IDs.");
assertIncludes(
  errors,
  pendingStorage,
  "petmate.pendingCloudSave.v2",
  "pending cloud save storage must use the v2 key."
);
assertIncludes(
  errors,
  pendingStorage,
  "PENDING_CLOUD_SAVE_LEGACY_DROPPED",
  "pending cloud save storage must safely drop unusable v1 data."
);
for (const field of ["taskId", "workId", "versionId", "createdAt"]) {
  assertIncludes(errors, pendingStorage, field, `pending cloud save storage must persist ${field}.`);
}
assertIncludes(errors, workSyncFlow, "saveWorkBundle({", "workSyncFlow must call the recovery endpoint.");
assertIncludes(errors, workSyncFlow, 'reason: "client_recovery"', "workSyncFlow must identify recovery calls.");
assertIncludes(errors, workSyncFlow, "refreshRecoveredWork", "successful recovery must re-pull authoritative data.");
assertIncludes(errors, workSyncFlow, "readPendingCloudSaveResult", "workSyncFlow must handle v1 migration outcomes.");
assertIncludes(errors, workCloudService, "taskId: payload.taskId", "cloud work service must forward taskId.");
assertIncludes(errors, workCloudService, "workId: payload.workId", "cloud work service must forward workId.");
assertIncludes(errors, workCloudService, "versionId: payload.versionId", "cloud work service must forward versionId.");

if (/\bevent\s*\.\s*(?:work|version)\b/.test(saveWorkCore + saveWorkIndex)) {
  errors.push("saveWork must not read event.work or event.version.");
}

if (/\.\.\.\s*(?:clientWork|clientVersion|unknownSnapshot|event\.work|event\.version)\b/.test(saveWorkCore)) {
  errors.push("saveWork must not spread client-controlled work or version objects.");
}

if (/transaction\.collection\([^)]*\)\s*\.where\s*\(/.test(saveWorkCore)) {
  errors.push("saveWork transactions must use deterministic doc() reads, not transaction.where().");
}

if (
  !/return\s+\{\s*taskId,\s*workId,\s*versionId,\s*createdAt\s*\};/s.test(pendingStorage)
) {
  errors.push("pending v2 normalizer must return references and createdAt only.");
}

if (/\bpending\s*\.\s*(?:work|version)\b/.test(workSyncFlow)) {
  errors.push("workSyncFlow must never resend full work/version objects from pending storage.");
}

const recoveryCall = /saveWorkBundle\s*\(\s*\{([\s\S]*?)\}\s*\)/.exec(workSyncFlow);
if (
  !recoveryCall ||
  !["taskId", "workId", "versionId", "reason"].every((field) => recoveryCall[1].includes(field)) ||
  /\b(?:work|version)\s*,/.test(recoveryCall[1])
) {
  errors.push("workSyncFlow saveWorkBundle payload must contain task/work/version references only.");
}

if (/\bsaveCurrentWorkToCloud\b/.test(optimizationFlow)) {
  errors.push("feedback and detail retouch must not use the generation recovery endpoint.");
}

if (errors.length) {
  console.error("Save work contract check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Save work contract check passed.");
