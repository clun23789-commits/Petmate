import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const runtimePath = path.join(projectRoot, "miniprogram", "services", "runtime.js");
const envProfilesPath = path.join(projectRoot, "miniprogram", "config", "env.profiles.js");
const envGeneratedPath = path.join(projectRoot, "miniprogram", "config", "env.generated.js");
const envPath = path.join(projectRoot, "miniprogram", "config", "env.js");
const adConfigPath = path.join(projectRoot, "miniprogram", "config", "ad.js");
const paymentOrderCorePath = path.join(projectRoot, "cloudfunctions", "createPaymentOrder", "core.js");
const markPaymentPaidCorePath = path.join(projectRoot, "cloudfunctions", "markPaymentPaid", "core.js");
const grantArEntitlementCorePath = path.join(projectRoot, "cloudfunctions", "grantArEntitlement", "core.js");
const paymentCloudServicePath = path.join(projectRoot, "miniprogram", "services", "payment", "cloud.js");
const paymentFlowPath = path.join(projectRoot, "miniprogram", "flows", "paymentFlow.js");
const environmentStrategyPath = path.join(projectRoot, "docs", "environment_strategy.md");

const serviceFiles = {
  auth: {
    path: path.join(projectRoot, "miniprogram", "services", "auth", "index.js"),
    modeValues: ["cloud", "real"],
    unavailableCode: "AUTH_SERVICE_UNAVAILABLE"
  },
  ar: {
    path: path.join(projectRoot, "miniprogram", "services", "ar", "index.js"),
    modeValues: ["real"],
    unavailableCode: "AR_SERVICE_UNAVAILABLE"
  },
  catalog: {
    path: path.join(projectRoot, "miniprogram", "services", "catalog", "index.js"),
    modeValues: ["cloud"],
    unavailableCode: "CATALOG_SERVICE_UNAVAILABLE"
  },
  help: {
    path: path.join(projectRoot, "miniprogram", "services", "help", "index.js"),
    modeValues: ["cloud"],
    unavailableCode: "HELP_SERVICE_UNAVAILABLE"
  }
};

const blockers = [];

function addBlocker(category, message) {
  blockers.push(`[${category}] ${message}`);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlaceholder(value) {
  const text = normalizeString(value).toLowerCase();
  return !text ||
    text.includes("__") ||
    text.includes("placeholder") ||
    text.includes("replace") ||
    text.includes("demo") ||
    text.includes("test");
}

function relativePath(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}

function readRequiredFile(filePath, category) {
  if (!fs.existsSync(filePath)) {
    addBlocker(category, `${relativePath(filePath)} is missing.`);
    return "";
  }

  return fs.readFileSync(filePath, "utf8");
}

function loadRequiredModule(filePath, category) {
  if (!fs.existsSync(filePath)) {
    addBlocker(category, `${relativePath(filePath)} is missing.`);
    return null;
  }

  try {
    return require(filePath);
  } catch (error) {
    addBlocker(category, `Failed to load ${relativePath(filePath)}: ${error && error.message ? error.message : error}`);
    return null;
  }
}

function getAdUnitId(adContent) {
  const match = adContent.match(/rewardedVideoAdUnitId\s*:\s*["']([^"']*)["']/);
  return match ? match[1] : "";
}

const envProfiles = loadRequiredModule(envProfilesPath, "ENV");
const generated = loadRequiredModule(envGeneratedPath, "ENV");
const env = loadRequiredModule(envPath, "ENV");
const runtime = loadRequiredModule(runtimePath, "RUNTIME");

if (envProfiles && envProfiles.ENV_PROFILE_BY_ENV) {
  const productionProfile = envProfiles.ENV_PROFILE_BY_ENV.production || {};
  if (isPlaceholder(productionProfile.cloudEnvId)) {
    addBlocker("ENV", "production cloudEnvId is missing or placeholder.");
  }
} else {
  addBlocker("ENV", "ENV_PROFILE_BY_ENV is not exported.");
}

if (generated && generated.SELECTED_APP_ENV === "production") {
  const generatedCloudEnvId = generated.ENV_OVERRIDES && generated.ENV_OVERRIDES.cloudEnvId;
  if (isPlaceholder(generatedCloudEnvId)) {
    addBlocker("ENV", "current generated production env requires an explicit non-placeholder cloudEnvId override.");
  }
}

if (generated && generated.SELECTED_APP_ENV === "production" && env && env.ENV_CONFIG) {
  if (isPlaceholder(env.ENV_CONFIG.cloudEnvId)) {
    addBlocker("ENV", "current ENV_CONFIG.cloudEnvId is missing or placeholder for production.");
  }
}

let productionModes = {};
if (runtime && runtime.SERVICE_MODE_BY_ENV && runtime.SERVICE_MODE_VALUE) {
  const serviceModeValue = runtime.SERVICE_MODE_VALUE;
  productionModes = runtime.SERVICE_MODE_BY_ENV.production || {};
  const forbiddenModes = [
    serviceModeValue.MOCK,
    serviceModeValue.CLOUD_WITH_MOCK_DEV_FALLBACK,
    serviceModeValue.CLOUD_WITH_MOCK_FALLBACK,
    serviceModeValue.CLOUD_WITH_LOCAL_FALLBACK
  ];

  Object.keys(productionModes).forEach((serviceName) => {
    const mode = productionModes[serviceName];
    if (forbiddenModes.includes(mode)) {
      addBlocker("RUNTIME", `production.${serviceName} must not use ${mode}.`);
    }
  });
} else {
  addBlocker("RUNTIME", "SERVICE_MODE_BY_ENV or SERVICE_MODE_VALUE is not exported.");
}

Object.entries(serviceFiles).forEach(([serviceName, config]) => {
  const mode = productionModes[serviceName];
  if (!config.modeValues.includes(mode)) {
    return;
  }

  const content = readRequiredFile(config.path, serviceName.toUpperCase());
  if (content.includes(config.unavailableCode)) {
    addBlocker(
      serviceName.toUpperCase(),
      `production.${serviceName} is ${mode} but ${serviceName} service returns ${config.unavailableCode}.`
    );
  }
});

if (productionModes.ad === "real") {
  const adContent = readRequiredFile(adConfigPath, "AD");
  const rewardedVideoAdUnitId = getAdUnitId(adContent);
  if (isPlaceholder(rewardedVideoAdUnitId)) {
    addBlocker("AD", "production.ad is real but rewardedVideoAdUnitId is empty or placeholder.");
  }
}

if (productionModes.payment === "real") {
  const paymentOrderContent = readRequiredFile(paymentOrderCorePath, "PAYMENT");
  const markPaymentContent = readRequiredFile(markPaymentPaidCorePath, "PAYMENT");
  const entitlementContent = readRequiredFile(grantArEntitlementCorePath, "PAYMENT");
  const paymentCloudContent = readRequiredFile(paymentCloudServicePath, "PAYMENT");
  const paymentFlowContent = readRequiredFile(paymentFlowPath, "PAYMENT");

  if (
    !/PETMATE_APP_ENV/.test(paymentOrderContent) ||
    !/appEnv\s*===\s*["']production["']/.test(paymentOrderContent) ||
    !/REAL_PAYMENT_NOT_IMPLEMENTED/.test(paymentOrderContent)
  ) {
    addBlocker("PAYMENT", "createPaymentOrder must fail closed from the server environment while real payment is unavailable.");
  }
  if (
    !/PETMATE_APP_ENV/.test(markPaymentContent) ||
    !/MOCK_PAYMENT_NOT_ALLOWED/.test(markPaymentContent) ||
    !/paymentMode\s*!==\s*["']mock["']/.test(markPaymentContent) ||
    !/paymentProvider\s*!==\s*["']mock["']/.test(markPaymentContent)
  ) {
    addBlocker("PAYMENT", "markPaymentPaid is missing the server-side Mock-only confirmation boundary.");
  }
  if (
    !/paymentConfirmationSource/.test(entitlementContent) ||
    !/trusted_mock_flow/.test(entitlementContent) ||
    !/wechat_server_notification/.test(entitlementContent) ||
    !/REAL_PAYMENT_CONFIRMATION_NOT_IMPLEMENTED/.test(entitlementContent)
  ) {
    addBlocker("PAYMENT", "grantArEntitlement must require a trusted payment confirmation source.");
  }
  if (
    !/PAYMENT_PARAMS_MISSING/.test(paymentCloudContent) ||
    !/MOCK_PAYMENT_NOT_ALLOWED/.test(paymentCloudContent) ||
    !/isProductionLikeEnv/.test(paymentCloudContent) ||
    !/PAYMENT_PARAMS_INVALID/.test(paymentCloudContent)
  ) {
    addBlocker("PAYMENT", "the client payment adapter must reject missing, invalid, or production Mock payment params.");
  }

  const mockGuardIndex = paymentFlowContent.indexOf("if (!isMockPaymentOrder(order))");
  const markCallIndex = paymentFlowContent.indexOf("const paidResult = await markPaymentPaid");
  if (mockGuardIndex < 0 || markCallIndex < 0 || mockGuardIndex > markCallIndex) {
    addBlocker("PAYMENT", "the payment flow must stop real payments before calling client-side markPaymentPaid.");
  }

  addBlocker("PAYMENT", "real WeChat payment and server notification confirmation are not implemented.");
}

if (!fs.existsSync(environmentStrategyPath)) {
  addBlocker("DOCS", "docs/environment_strategy.md is missing.");
} else {
  const environmentStrategyContent = readRequiredFile(environmentStrategyPath, "DOCS");
  if (!/PETMATE_APP_ENV/.test(environmentStrategyContent)) {
    addBlocker("DOCS", "docs/environment_strategy.md must document the server-side PETMATE_APP_ENV requirement.");
  }
}

if (blockers.length > 0) {
  console.error("Production readiness check failed:");
  blockers.forEach((blocker) => {
    console.error(`- ${blocker}`);
  });
  process.exit(1);
}

console.log("Production readiness check passed.");
