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
const pollGenerationTask = readProjectFile("cloudfunctions/pollGenerationTask/index.js");
const startGenerationTask = [
  readProjectFile("cloudfunctions/startGenerationTask/index.js"),
  readProjectFile("cloudfunctions/startGenerationTask/core.js")
].join("\n");
const creationFlow = readProjectFile("miniprogram/flows/creationFlow.js");
const cloudDatabaseDoc = readProjectFile("docs/cloud_database_" + "sche" + "ma.md");

assertIncludes(errors, pollGenerationTask, "providerStatus", "pollGenerationTask must expose providerStatus.");
assertIncludes(errors, pollGenerationTask, "resultSaveStatus", "pollGenerationTask must expose resultSaveStatus.");
assertIncludes(errors, pollGenerationTask, "cloudFinalized", "pollGenerationTask must return cloudFinalized.");
assertIncludes(errors, pollGenerationTask, "GENERATION_TASK_TIMEOUT", "pollGenerationTask must classify timeout failures.");
assertIncludes(errors, startGenerationTask, "workSnapshot", "startGenerationTask must persist a safe workSnapshot.");
assertIncludes(errors, startGenerationTask, "createTargetVersionId", "startGenerationTask must pre-generate a stable targetVersionId.");
assertIncludes(errors, creationFlow, "cloudFinalized", "creationFlow must handle cloudFinalized generation results.");
assertIncludes(errors, cloudDatabaseDoc, "providerStatus", "cloud database docs must describe providerStatus.");
assertIncludes(errors, cloudDatabaseDoc, "resultSaveStatus", "cloud database docs must describe resultSaveStatus.");
assertIncludes(errors, cloudDatabaseDoc, "cloudFinalized = true", "cloud database docs must describe cloudFinalized=true finalize behavior.");

if (/getPhaseByPollCount\s*\(/.test(pollGenerationTask)) {
  addError(errors, "pollGenerationTask main state machine must not call getPhaseByPollCount directly.");
}

if (errors.length) {
  console.error("Generation task contract check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Generation task contract check passed.");
