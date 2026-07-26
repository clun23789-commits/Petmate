import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function projectPath(relativePath) {
  return path.join(projectRoot, ...relativePath.split(/[\\/]/));
}

function readProjectFile(relativePath) {
  const absolutePath = projectPath(relativePath);

  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${relativePath}: ${error.message}`);
  }
}

const errors = [];

function assertContains(relativePath, pattern, message) {
  const content = readProjectFile(relativePath);

  if (!pattern.test(content)) {
    errors.push(`${message} (${relativePath})`);
  }
}

function assertNotContains(relativePath, pattern, message) {
  const content = readProjectFile(relativePath);

  if (pattern.test(content)) {
    errors.push(`${message} (${relativePath})`);
  }
}

try {
  assertContains("miniprogram/models/status.js", /"idle"/, "Status enums must include idle state");
  assertContains(
    "miniprogram/models/status.js",
    /"rightUnknown"/,
    "Ad unlock status must include rightUnknown"
  );
  assertContains(
    "miniprogram/models/status.js",
    /"permissionError"/,
    "Upload quality status must include permissionError"
  );

  assertContains("miniprogram/app.json", /"list"\s*:\s*\[/, "App config must define a tabbar list");

  const appJson = readProjectFile("miniprogram/app.json");
  const tabRootPattern = /"pagePath"\s*:\s*"(\/)?pages\/(works|cases|mine)\/index\/index"/g;
  const tabCount = [...appJson.matchAll(tabRootPattern)].length;
  if (tabCount !== 3) {
    errors.push("Tabbar must only include works, cases and mine root pages. (miniprogram/app.json)");
  }

  assertContains(
    "miniprogram/pages/works/exception/index.js",
    /ad:/,
    "Exception page must handle ad recovery"
  );
  assertContains(
    "miniprogram/pages/works/exception/index.js",
    /upload:/,
    "Exception page must handle upload recovery"
  );
  assertContains(
    "miniprogram/pages/works/exception/index.js",
    /generation:/,
    "Exception page must handle generation recovery"
  );
  assertNotContains(
    "miniprogram/pages/works/exception/index.js",
    /payment/,
    "Exception recovery page must not handle paid AR failures"
  );

  assertContains(
    "miniprogram/services/mock/upload.js",
    /role === "supplement"/,
    "Upload quality check must support supplement mode"
  );
  assertContains(
    "miniprogram/services/mock/upload.js",
    /permissionError/,
    "Upload mock must support permissionError"
  );
  assertContains(
    "miniprogram/services/mock/ad.js",
    /rightUnknown/,
    "Ad mock must support rightUnknown"
  );

  assertContains(
    "miniprogram/flows/creationFlow.js",
    /operationType === "targeted_upload" \? "supplement"/,
    "Targeted uploads must use supplement quality rules"
  );
  assertContains(
    "miniprogram/flows/creationFlow.js",
    /releaseOptimizationReservation/,
    "Generation failures must release reserved optimize quota"
  );
  assertContains(
    "miniprogram/flows/creationFlow.js",
    /currentWork\.versionIds\.includes/,
    "Generation success handling must avoid duplicate version appends"
  );

  assertContains(
    "miniprogram/flows/optimizationFlow.js",
    /isValidOptimizeFeedback/,
    "Optimization submission must require unlike feedback"
  );
  assertContains(
    "miniprogram/services/optimization/index.js",
    /reservation\.status !== "reserved"/,
    "Local optimization quota commits must remain idempotent"
  );
  assertContains(
    "cloudfunctions/commitOptimizeQuota/core.js",
    /reservation\.status === "committed"[\s\S]*duplicated:\s*true[\s\S]*transitionApplied:\s*false/,
    "Cloud optimization quota commits must be transactionally idempotent"
  );

  assertNotContains(
    "miniprogram/pages/works/result/index.wxml",
    /会员|VIP|订阅|月卡|年卡/,
    "Result page must not introduce forbidden product language"
  );
  assertNotContains(
    "miniprogram/pages/works/start-create/index.wxml",
    /会员|VIP|订阅|月卡|年卡/,
    "Start create page must not introduce forbidden product language"
  );
} catch (error) {
  errors.push(error.message);
}

if (errors.length > 0) {
  console.error("Product boundary check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Product boundary check passed.");
