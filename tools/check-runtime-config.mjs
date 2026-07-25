import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const runtimePath = path.join(projectRoot, "miniprogram", "services", "runtime.js");
const envPath = path.join(projectRoot, "miniprogram", "config", "env.js");
const envProfilesPath = path.join(projectRoot, "miniprogram", "config", "env.profiles.js");
const envGeneratedPath = path.join(projectRoot, "miniprogram", "config", "env.generated.js");
const requiredEnvs = ["development", "staging", "production"];
const requiredServices = [
  "ad",
  "auth",
  "upload",
  "generation",
  "optimization",
  "payment",
  "ar",
  "share",
  "user",
  "work",
  "entitlement",
  "catalog",
  "help"
];
const mockOnlyServiceFiles = [
  {
    serviceName: "ar",
    filePath: path.join(projectRoot, "miniprogram", "services", "ar", "index.js"),
    mockName: "mockAr"
  },
  {
    serviceName: "catalog",
    filePath: path.join(projectRoot, "miniprogram", "services", "catalog", "index.js"),
    mockName: "mockCatalog"
  },
  {
    serviceName: "help",
    filePath: path.join(projectRoot, "miniprogram", "services", "help", "index.js"),
    mockName: "mockHelp"
  }
];

const errors = [];

function addError(message) {
  errors.push(message);
}

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function readFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    addError(`Missing ${path.relative(projectRoot, filePath).replace(/\\/g, "/")}.`);
    return "";
  }

  return fs.readFileSync(filePath, "utf8");
}

function getFunctionBody(content, functionName) {
  const signature = `async function ${functionName}`;
  const start = content.indexOf(signature);

  if (start < 0) {
    addError(`Missing function ${functionName}.`);
    return "";
  }

  const openBrace = content.indexOf("{", start);
  if (openBrace < 0) {
    addError(`Unable to parse function ${functionName}.`);
    return "";
  }

  let depth = 0;
  for (let index = openBrace; index < content.length; index += 1) {
    const char = content[index];
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(openBrace + 1, index);
      }
    }
  }

  addError(`Unable to parse function body for ${functionName}.`);
  return "";
}

function assertMockOnlyExportGuard() {
  mockOnlyServiceFiles.forEach(({ serviceName, filePath, mockName }) => {
    const content = readFileIfExists(filePath);
    if (!content) {
      return;
    }

    const riskyLegacyPattern = new RegExp(
      `if\\s*\\(\\s*mode\\s*!==\\s*SERVICE_MODE_VALUE\\.MOCK\\s*\\)[\\s\\S]*?module\\.exports\\s*=\\s*${mockName}\\s*;`
    );
    if (riskyLegacyPattern.test(content)) {
      addError(`${serviceName} exports ${mockName} after detecting a non-mock mode.`);
    }

    const exportsMock = new RegExp(`module\\.exports\\s*=\\s*${mockName}\\s*;`).test(content);
    const hasMockOnlyGuard = /mode\s*===\s*SERVICE_MODE_VALUE\.MOCK/.test(content);
    const hasUnavailableBranch = /unavailable|SERVICE_UNAVAILABLE|暂不可用/.test(content);

    if (exportsMock && (!hasMockOnlyGuard || !hasUnavailableBranch)) {
      addError(`${serviceName} must only export ${mockName} inside a mock-mode branch and expose unavailable behavior otherwise.`);
    }
  });
}

function assertPaymentFallbackGuards() {
  const paymentPath = path.join(projectRoot, "miniprogram", "services", "payment", "index.js");
  const content = readFileIfExists(paymentPath);
  if (!content) {
    return;
  }

  ["createPaymentOrder", "markPaymentPaid", "getPaymentOrder"].forEach((functionName) => {
    const body = getFunctionBody(content, functionName);
    if (!body) {
      return;
    }

    if (/catch\s*\([^)]*\)\s*{[\s\S]*?mockPayment\./.test(body) && !/shouldFallbackToMock\s*\(\s*\)/.test(body)) {
      addError(`${functionName} falls back to mock payment without an allowsMockFallback guard.`);
    }
  });

  const requestPaymentBody = getFunctionBody(content, "requestPayment");
  if (
    /paymentParams\.mode\s*===\s*["']mock["']/.test(requestPaymentBody) &&
    !/mock_payment_not_allowed/.test(requestPaymentBody)
  ) {
    addError("requestPayment must reject mock paymentParams outside mock/fallback mode.");
  }
}

function assertEntitlementFallbackGuards() {
  const entitlementPath = path.join(projectRoot, "miniprogram", "services", "entitlement", "index.js");
  const content = readFileIfExists(entitlementPath);
  if (!content) {
    return;
  }

  if (!/getServiceMode\s*\(\s*["']entitlement["']\s*\)/.test(content)) {
    addError("entitlement service must read its runtime service mode.");
  }

  ["getArEntitlement", "grantArEntitlement"].forEach((functionName) => {
    const body = getFunctionBody(content, functionName);
    if (!body) {
      return;
    }

    if (/catch\s*\([^)]*\)\s*{[\s\S]*?(getLocalArEntitlement|grantLocalArEntitlement|local_fallback)/.test(body)) {
      addError(`${functionName} performs local entitlement fallback after cloud failure.`);
    }
  });
}

if (!fs.existsSync(runtimePath)) {
  addError("Missing miniprogram/services/runtime.js.");
}

if (!fs.existsSync(envPath)) {
  addError("Missing miniprogram/config/env.js.");
}

if (!fs.existsSync(envProfilesPath)) {
  addError("Missing miniprogram/config/env.profiles.js.");
}

if (!fs.existsSync(envGeneratedPath)) {
  addError("Missing miniprogram/config/env.generated.js.");
}

let runtime = null;
let envConfig = null;
let envProfiles = null;
let envGenerated = null;

if (errors.length === 0) {
  try {
    runtime = require(runtimePath);
    envConfig = require(envPath);
    envProfiles = require(envProfilesPath);
    envGenerated = require(envGeneratedPath);
  } catch (error) {
    addError(`Failed to load runtime config: ${error && error.message ? error.message : error}`);
  }
}

if (envProfiles) {
  const profileByEnv = envProfiles.ENV_PROFILE_BY_ENV || {};

  requiredEnvs.forEach((envName) => {
    if (!hasOwn(profileByEnv, envName)) {
      addError(`ENV_PROFILE_BY_ENV is missing ${envName}.`);
      return;
    }

    const profile = profileByEnv[envName] || {};
    ["currentAppEnv", "cloudEnvId", "traceUser"].forEach((key) => {
      if (!hasOwn(profile, key)) {
        addError(`ENV_PROFILE_BY_ENV.${envName} is missing ${key}.`);
      }
    });

    if (profile.currentAppEnv !== envName) {
      addError(`ENV_PROFILE_BY_ENV.${envName}.currentAppEnv must be ${envName}.`);
    }
  });
}

if (envGenerated) {
  const selectedEnv = envGenerated.SELECTED_APP_ENV;
  const overrides = envGenerated.ENV_OVERRIDES;

  if (!selectedEnv) {
    addError("env.generated.js must export SELECTED_APP_ENV.");
  } else if (requiredEnvs.indexOf(selectedEnv) < 0) {
    addError(`env.generated.js SELECTED_APP_ENV uses unknown env ${selectedEnv}.`);
  }

  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    addError("env.generated.js must export ENV_OVERRIDES as an object.");
  }
}

if (runtime) {
  const serviceModeValue = runtime.SERVICE_MODE_VALUE || {};
  const modeValues = Object.keys(serviceModeValue).map((key) => serviceModeValue[key]);
  const serviceModeByEnv = runtime.SERVICE_MODE_BY_ENV || {};
  const productionForbiddenModes = [
    serviceModeValue.MOCK,
    serviceModeValue.CLOUD_WITH_MOCK_DEV_FALLBACK,
    serviceModeValue.CLOUD_WITH_MOCK_FALLBACK,
    serviceModeValue.CLOUD_WITH_LOCAL_FALLBACK
  ];

  [
    "mock",
    "cloud",
    "real",
    "cloud-with-mock-dev-fallback",
    "cloud-with-mock-fallback",
    "cloud-with-local-fallback"
  ].forEach((mode) => {
    if (modeValues.indexOf(mode) < 0) {
      addError(`SERVICE_MODE_VALUE is missing ${mode}.`);
    }
  });

  requiredEnvs.forEach((envName) => {
    if (!hasOwn(serviceModeByEnv, envName)) {
      addError(`SERVICE_MODE_BY_ENV is missing ${envName}.`);
      return;
    }

    const modeMap = serviceModeByEnv[envName] || {};

    requiredServices.forEach((serviceName) => {
      if (!hasOwn(modeMap, serviceName)) {
        addError(`${envName} is missing service mode for ${serviceName}.`);
        return;
      }

      if (modeValues.indexOf(modeMap[serviceName]) < 0) {
        addError(`${envName}.${serviceName} uses unknown mode ${modeMap[serviceName]}.`);
      }
    });
  });

  const productionModes = serviceModeByEnv.production || {};
  requiredServices.forEach((serviceName) => {
    if (productionForbiddenModes.indexOf(productionModes[serviceName]) >= 0) {
      addError(`production.${serviceName} must not use ${productionModes[serviceName]}.`);
    }
  });

  const developmentModes = serviceModeByEnv.development || {};
  [
    "upload",
    "generation",
    "optimization",
    "share",
    "user",
    "work"
  ].forEach((serviceName) => {
    const mode = developmentModes[serviceName];
    const isFallbackMode = mode === serviceModeValue.CLOUD_WITH_MOCK_DEV_FALLBACK ||
      mode === serviceModeValue.CLOUD_WITH_MOCK_FALLBACK ||
      mode === serviceModeValue.CLOUD_WITH_LOCAL_FALLBACK;

    if (!isFallbackMode) {
      addError(`development.${serviceName} should keep an MVP fallback mode.`);
    }
  });

  if (typeof runtime.assertRuntimeConfig === "function") {
    try {
      runtime.assertRuntimeConfig();
    } catch (error) {
      addError(error && error.message ? error.message : String(error));
    }
  } else {
    addError("runtime.assertRuntimeConfig is not exported.");
  }
}

if (envConfig) {
  const config = envConfig.ENV_CONFIG || {};

  if (!envConfig.APP_ENV_VALUE) {
    addError("env.js must export APP_ENV_VALUE.");
  }

  if (!envConfig.ENV_CONFIG) {
    addError("env.js must export ENV_CONFIG.");
  }

  if (!hasOwn(config, "cloudEnvId") || !config.cloudEnvId) {
    addError("ENV_CONFIG.cloudEnvId is required.");
  }

  if (!hasOwn(config, "currentAppEnv")) {
    addError("ENV_CONFIG.currentAppEnv is required.");
  }

  if (envGenerated && config.currentAppEnv !== envGenerated.SELECTED_APP_ENV) {
    addError("ENV_CONFIG.currentAppEnv must match env.generated.js SELECTED_APP_ENV.");
  }
}

assertMockOnlyExportGuard();
assertPaymentFallbackGuards();
assertEntitlementFallbackGuards();

if (errors.length > 0) {
  console.error("Runtime config check failed:");
  errors.forEach((error) => {
    console.error(`- ${error}`);
  });
  process.exit(1);
}

console.log("Runtime config check passed.");
