import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, ...relativePath.split(/[\\/]/)), "utf8");
}

function addError(errors, message) {
  errors.push(message);
}

function assertIncludes(errors, content, expected, message) {
  if (!content.includes(expected)) {
    addError(errors, message);
  }
}

const errors = [];
const pollGenerationTask = [
  readProjectFile("cloudfunctions/pollGenerationTask/index.js"),
  readProjectFile("cloudfunctions/pollGenerationTask/core.js")
].join("\n");
const startGenerationTask = [
  readProjectFile("cloudfunctions/startGenerationTask/index.js"),
  readProjectFile("cloudfunctions/startGenerationTask/core.js")
].join("\n");
const creationFlow = readProjectFile("miniprogram/flows/creationFlow.js");
const pollGenerationCore = readProjectFile("cloudfunctions/pollGenerationTask/core.js");
const startGenerationCore = readProjectFile("cloudfunctions/startGenerationTask/core.js");
const generationCloudService = readProjectFile("miniprogram/services/generation/cloud.js");
const generationRequestStorage = readProjectFile("miniprogram/utils/generationRequestStorage.js");
const cloudDatabaseDoc = readProjectFile("docs/cloud_database_" + "sche" + "ma.md");

assertIncludes(errors, pollGenerationTask, "providerStatus", "pollGenerationTask must expose providerStatus.");
assertIncludes(errors, pollGenerationTask, "resultSaveStatus", "pollGenerationTask must expose resultSaveStatus.");
assertIncludes(errors, pollGenerationTask, "cloudFinalized", "pollGenerationTask must return cloudFinalized.");
assertIncludes(errors, pollGenerationTask, "GENERATION_TASK_TIMEOUT", "pollGenerationTask must classify timeout failures.");
assertIncludes(errors, startGenerationTask, "workSnapshot", "startGenerationTask must persist a safe workSnapshot.");
assertIncludes(errors, startGenerationTask, "createTargetVersionId", "startGenerationTask must pre-generate a stable targetVersionId.");
assertIncludes(errors, startGenerationCore, "clientRequestId", "startGenerationTask must require clientRequestId.");
assertIncludes(errors, startGenerationCore, "getGenerationTaskDocId", "startGenerationTask must use a deterministic task ID.");
assertIncludes(errors, startGenerationCore, "CLIENT_REQUEST_ID_REQUIRED", "startGenerationTask must reject missing clientRequestId.");
assertIncludes(errors, startGenerationCore, "GENERATION_REQUEST_CONFLICT", "startGenerationTask must reject changed idempotency parameters.");
assertIncludes(errors, startGenerationCore, "db.runTransaction", "all generation task creation paths must use transactions.");
assertIncludes(errors, pollGenerationCore, "const PROCESSING_LOCK_TTL_MS = 60 * 1000", "poll lock TTL must be 60 seconds.");
assertIncludes(errors, pollGenerationCore, "acquireProcessingLock", "pollGenerationTask must acquire a processing lock.");
assertIncludes(errors, pollGenerationCore, "processingToken", "pollGenerationTask must validate a processing token.");
assertIncludes(errors, pollGenerationCore, "GENERATION_TASK_REVISION_CONFLICT", "pollGenerationTask must reject stale revisions.");
assertIncludes(errors, pollGenerationCore, "finalizeGenerationResult", "pollGenerationTask must expose atomic finalization.");
assertIncludes(errors, pollGenerationCore, "getWorkDocId", "pollGenerationTask must use deterministic work IDs.");
assertIncludes(errors, pollGenerationCore, "getVersionDocId", "pollGenerationTask must use deterministic version IDs.");
assertIncludes(errors, creationFlow, "cloudFinalized", "creationFlow must handle cloudFinalized generation results.");
assertIncludes(errors, creationFlow, "getOrCreateGenerationRequest", "creationFlow must persist generation requests before submission.");
assertIncludes(errors, creationFlow, "saveGenerationTaskReference", "creationFlow must persist the returned taskId.");
assertIncludes(errors, creationFlow, "clearGenerationRequestByTaskId", "creationFlow must clear terminal request references.");
assertIncludes(errors, generationCloudService, "duplicated: data.duplicated === true", "cloud generation service must preserve duplicated metadata.");
for (const field of ["clientRequestId", "workId", "operationType", "reservationId", "taskId", "createdAt"]) {
  assertIncludes(errors, generationRequestStorage, field, `generation request storage must persist ${field}.`);
}
assertIncludes(errors, cloudDatabaseDoc, "providerStatus", "cloud database docs must describe providerStatus.");
assertIncludes(errors, cloudDatabaseDoc, "resultSaveStatus", "cloud database docs must describe resultSaveStatus.");
assertIncludes(errors, cloudDatabaseDoc, "cloudFinalized = true", "cloud database docs must describe cloudFinalized=true finalize behavior.");
assertIncludes(errors, cloudDatabaseDoc, "processingToken + revision", "cloud database docs must describe token and revision validation.");

if (/getPhaseByPollCount\s*\(/.test(pollGenerationTask)) {
  addError(errors, "pollGenerationTask main state machine must not call getPhaseByPollCount directly.");
}

if (/transaction\.collection\([^)]*\)\s*\.where\s*\(/.test(startGenerationCore + pollGenerationCore)) {
  addError(errors, "generation transactions must use deterministic doc() reads, not transaction.where().");
}

if (
  !/db\.runTransaction\s*\([\s\S]*collection\("workVersions"\)[\s\S]*collection\("works"\)[\s\S]*taskRef\.update/.test(
    pollGenerationCore
  )
) {
  addError(errors, "work, version, and task terminal state must be written in one finalization transaction.");
}

if (/completedVersion|resultSnapshot|previewMedia|editableTexture/.test(generationRequestStorage)) {
  addError(errors, "generation request storage must contain references only, not generated work or version payloads.");
}

if (errors.length) {
  console.error("Generation task contract check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Generation task contract check passed.");
