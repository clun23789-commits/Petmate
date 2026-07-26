import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function listJavaScriptFiles(relativePath) {
  const target = path.join(root, relativePath);
  const result = [];

  for (const entry of readdirSync(target)) {
    const absolutePath = path.join(target, entry);
    const relativeEntry = path.relative(root, absolutePath);
    if (statSync(absolutePath).isDirectory()) {
      result.push(...listJavaScriptFiles(relativeEntry));
    } else if (absolutePath.endsWith(".js")) {
      result.push(relativeEntry);
    }
  }

  return result;
}

const creationFlow = read("miniprogram/flows/creationFlow.js");
const frontendSource = listJavaScriptFiles("miniprogram")
  .map((file) => read(file))
  .join("\n");
const legacySource = [
  read("cloudfunctions/grantOptimizeQuota/core.js"),
  read("cloudfunctions/grantOptimizeQuota/index.js")
].join("\n");
const settleSource = [
  read("cloudfunctions/grantAdReward/core.js"),
  read("cloudfunctions/grantAdReward/index.js")
].join("\n");
const statusSource = read("cloudfunctions/getAdRewardStatus/core.js");
const mockAndCloudServiceSource = read("miniprogram/services/cloud/adReward.js");

assert.doesNotMatch(
  creationFlow,
  /grantOptimizeQuotaFromAd/,
  "creationFlow must not use the legacy two-stage optimize quota grant"
);
assert.doesNotMatch(
  frontendSource,
  /callFunction\s*\(\s*\{[\s\S]{0,200}?name\s*:\s*["']grantOptimizeQuota["']/,
  "miniprogram production code must not call grantOptimizeQuota"
);
for (const forbidden of [
  /command\.inc/,
  /grantedCount\s*:/,
  /optimizeQuotaGrants\.add/,
  /optimizeQuotas\.doc/,
  /\.(?:add|set|update)\s*\(/
]) {
  assert.doesNotMatch(legacySource, forbidden, `legacy grantOptimizeQuota contains forbidden write pattern ${forbidden}`);
}
for (const required of [
  /runTransaction/,
  /adRewardGrants/,
  /optimizeQuotaGrants/,
  /optimizeQuotas/
]) {
  assert.match(settleSource, required, `grantAdReward is missing required transaction contract ${required}`);
}
assert.doesNotMatch(settleSource, /adResult\.raw/, "grantAdReward must not persist raw client ad data");
assert.ok(
  existsSync(path.join(root, "cloudfunctions/createAdRewardSession/core.js")),
  "createAdRewardSession core is required"
);
assert.match(creationFlow, /createAdRewardSession/, "frontend must create a reward session before showing the ad");
assert.doesNotMatch(
  statusSource,
  /collection\(["']optimize(?:QuotaGrants|Quotas)["']\)[\s\S]{0,160}?\.(?:add|set|update)\s*\(/,
  "getAdRewardStatus must not write optimize quota data"
);
assert.match(mockAndCloudServiceSource, /quota/, "mock ad reward response must include quota");
assert.match(settleSource, /quota:/, "cloud ad settlement response must include quota");

console.log("Ad reward settlement contract check passed.");
