import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareIndexConfiguration } from "./cloud-indexes/compare.mjs";
import {
  CloudIndexProviderError,
  fetchRemoteCollectionsAndIndexes
} from "./cloud-indexes/provider.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(projectRoot, "config", "cloud-database-indexes.json");

function formatDirection(direction) {
  if (direction === 1) {
    return "ASC";
  }
  if (direction === -1) {
    return "DESC";
  }
  return `INVALID(${String(direction)})`;
}

function formatIndex(index) {
  const keys = index.keys.map((key) => `  ${key.name} ${formatDirection(key.direction)}`);
  return [...keys, `  unique: ${String(index.unique)}`, `  status: ${index.status || "required"}`];
}

export function formatCloudIndexReport(report, { envId, appEnv = "" }) {
  const lines = [
    report.passed ? "CloudBase index check passed." : "CloudBase index check failed.",
    "",
    "Environment:",
    `  ${envId}`,
    ...(appEnv ? [`  app env: ${appEnv}`] : []),
    "",
    "Collections:",
    `  ${report.collections.found}/${report.collections.expected}`,
    "",
    "Indexes:"
  ];

  for (const match of report.matches) {
    lines.push(`  ✓ ${match.collection}.${match.name}`);
  }
  lines.push(
    "",
    `Missing: ${report.missing.length}`,
    `Mismatched: ${report.mismatched.length}`,
    `Warnings: ${report.warnings.length}`
  );

  if (report.missing.length) {
    lines.push("", "[MISSING]");
    for (const item of report.missing) {
      lines.push(
        item.type === "collection" ? `collection: ${item.collection}` : `${item.collection}.${item.name}`
      );
    }
  }

  if (report.mismatched.length) {
    lines.push("", "[MISMATCH]");
    for (const item of report.mismatched) {
      lines.push(`${item.collection}.${item.name}`, "", "Expected:", ...formatIndex(item.expected));
      lines.push("", "Actual:", ...formatIndex(item.actual));
      lines.push(
        "",
        `Differences: ${item.differences.map((difference) => difference.field).join(", ")}`,
        ""
      );
    }
  }

  if (report.warnings.length) {
    lines.push("", "[WARNING]");
    const unknownStatuses = report.warnings.filter(
      (warning) => warning.code === "INDEX_STATUS_UNKNOWN"
    );
    if (unknownStatuses.length) {
      lines.push(
        `INDEX_STATUS_UNKNOWN: ${unknownStatuses.length} indexes; official DescribeTable output did not expose build status.`
      );
    }
    for (const warning of report.warnings.filter(
      (item) => item.code !== "INDEX_STATUS_UNKNOWN"
    )) {
      lines.push(`${warning.code}: ${warning.collection}.${warning.name}`);
    }
  }

  lines.push("", "Read-only check: no cloud resources were created, changed or deleted.");
  return lines.join("\n");
}

function getRequiredEnvironment(name) {
  const value = typeof process.env[name] === "string" ? process.env[name].trim() : "";
  if (!value) {
    throw new CloudIndexProviderError(
      "CLOUD_INDEX_ENVIRONMENT_VARIABLE_MISSING",
      `${name} is required. Use credentials from a read-only CAM sub-account.`
    );
  }
  return value;
}

function readMachineConfiguration() {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

async function main() {
  try {
    const secretId = getRequiredEnvironment("TENCENTCLOUD_SECRET_ID");
    const secretKey = getRequiredEnvironment("TENCENTCLOUD_SECRET_KEY");
    const envId = getRequiredEnvironment("PETMATE_CLOUD_ENV_ID");
    const appEnv =
      typeof process.env.PETMATE_APP_ENV === "string"
        ? process.env.PETMATE_APP_ENV.trim().toLowerCase()
        : "";
    if (appEnv && !["development", "staging", "production"].includes(appEnv)) {
      throw new CloudIndexProviderError(
        "CLOUD_INDEX_APP_ENV_INVALID",
        "PETMATE_APP_ENV must be development, staging or production when provided."
      );
    }

    console.log(`Checking CloudBase indexes in environment: ${envId}`);
    console.log("Credential policy: use a read-only CAM sub-account.");
    const rawRemote = await fetchRemoteCollectionsAndIndexes({
      envId,
      secretId,
      secretKey
    });
    const report = compareIndexConfiguration(readMachineConfiguration(), rawRemote);
    console.log("");
    console.log(formatCloudIndexReport(report, { envId, appEnv }));
    if (!report.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    const errorCode =
      error instanceof CloudIndexProviderError
        ? error.errorCode
        : "CLOUD_INDEX_CHECK_FAILED";
    const message =
      error instanceof CloudIndexProviderError
        ? error.message
        : "CloudBase index verification failed before comparison.";
    console.error("CloudBase index check failed.");
    console.error(`${errorCode}: ${message}`);
    process.exitCode = 1;
  }
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).toLowerCase();

if (isMainModule) {
  await main();
}
