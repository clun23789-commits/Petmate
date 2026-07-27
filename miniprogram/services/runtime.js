"use strict";

const { APP_ENV_VALUE, ENV_CONFIG } = require("../config/env");

const SERVICE_MODE_VALUE = {
  MOCK: "mock",
  CLOUD: "cloud",
  REAL: "real",
  CLOUD_WITH_MOCK_DEV_FALLBACK: "cloud-with-mock-dev-fallback",
  CLOUD_WITH_MOCK_FALLBACK: "cloud-with-mock-fallback",
  CLOUD_WITH_LOCAL_FALLBACK: "cloud-with-local-fallback"
};

/*
 * mock: local MVP fixtures only.
 * cloud: cloud implementation only.
 * real: real platform capability such as payment, ad, or AR.
 * cloud-with-mock-*: prefer cloud, keep mock fallback for MVP/dev paths.
 * cloud-with-local-fallback: prefer cloud, return local-safe results on failure.
 */
const SERVICE_NAME_LIST = [
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

const SERVICE_MODE_BY_ENV = {
  development: {
    ad: SERVICE_MODE_VALUE.MOCK,
    auth: SERVICE_MODE_VALUE.MOCK,
    upload: SERVICE_MODE_VALUE.CLOUD_WITH_MOCK_DEV_FALLBACK,
    generation: SERVICE_MODE_VALUE.CLOUD_WITH_MOCK_DEV_FALLBACK,
    optimization: SERVICE_MODE_VALUE.CLOUD_WITH_LOCAL_FALLBACK,
    payment: SERVICE_MODE_VALUE.MOCK,
    ar: SERVICE_MODE_VALUE.MOCK,
    share: SERVICE_MODE_VALUE.CLOUD_WITH_MOCK_FALLBACK,
    user: SERVICE_MODE_VALUE.CLOUD_WITH_LOCAL_FALLBACK,
    work: SERVICE_MODE_VALUE.CLOUD_WITH_LOCAL_FALLBACK,
    entitlement: SERVICE_MODE_VALUE.MOCK,
    catalog: SERVICE_MODE_VALUE.MOCK,
    help: SERVICE_MODE_VALUE.MOCK
  },
  staging: {
    ad: SERVICE_MODE_VALUE.MOCK,
    auth: SERVICE_MODE_VALUE.MOCK,
    upload: SERVICE_MODE_VALUE.CLOUD,
    generation: SERVICE_MODE_VALUE.CLOUD,
    optimization: SERVICE_MODE_VALUE.CLOUD,
    payment: SERVICE_MODE_VALUE.CLOUD,
    ar: SERVICE_MODE_VALUE.MOCK,
    share: SERVICE_MODE_VALUE.CLOUD_WITH_MOCK_FALLBACK,
    user: SERVICE_MODE_VALUE.CLOUD,
    work: SERVICE_MODE_VALUE.CLOUD,
    entitlement: SERVICE_MODE_VALUE.CLOUD,
    catalog: SERVICE_MODE_VALUE.MOCK,
    help: SERVICE_MODE_VALUE.MOCK
  },
  production: {
    ad: SERVICE_MODE_VALUE.REAL,
    auth: SERVICE_MODE_VALUE.CLOUD,
    upload: SERVICE_MODE_VALUE.CLOUD,
    generation: SERVICE_MODE_VALUE.CLOUD,
    optimization: SERVICE_MODE_VALUE.CLOUD,
    payment: SERVICE_MODE_VALUE.REAL,
    ar: SERVICE_MODE_VALUE.REAL,
    share: SERVICE_MODE_VALUE.CLOUD,
    user: SERVICE_MODE_VALUE.CLOUD,
    work: SERVICE_MODE_VALUE.CLOUD,
    entitlement: SERVICE_MODE_VALUE.CLOUD,
    catalog: SERVICE_MODE_VALUE.CLOUD,
    help: SERVICE_MODE_VALUE.CLOUD
  }
};

const MODE_VALUES = Object.keys(SERVICE_MODE_VALUE).map((key) => SERVICE_MODE_VALUE[key]);
const PRODUCTION_FORBIDDEN_MODES = [
  SERVICE_MODE_VALUE.MOCK,
  SERVICE_MODE_VALUE.CLOUD_WITH_MOCK_DEV_FALLBACK,
  SERVICE_MODE_VALUE.CLOUD_WITH_MOCK_FALLBACK,
  SERVICE_MODE_VALUE.CLOUD_WITH_LOCAL_FALLBACK
];

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function getCurrentAppEnv() {
  return (ENV_CONFIG && ENV_CONFIG.currentAppEnv) || APP_ENV_VALUE.DEVELOPMENT;
}

function isKnownAppEnv(appEnv) {
  return hasOwn(SERVICE_MODE_BY_ENV, appEnv);
}

function isKnownMode(mode) {
  return MODE_VALUES.indexOf(mode) >= 0;
}

function getServiceModeMapForEnv(appEnv) {
  const envName = appEnv || getCurrentAppEnv();

  if (!isKnownAppEnv(envName)) {
    throw new Error(`未知运行环境: ${envName}`);
  }

  return Object.assign({}, SERVICE_MODE_BY_ENV[envName]);
}

const SERVICE_MODE = getServiceModeMapForEnv(getCurrentAppEnv());

function getServiceMode(serviceName) {
  if (!hasOwn(SERVICE_MODE, serviceName)) {
    throw new Error(`未知服务名称: ${serviceName}`);
  }

  const mode = SERVICE_MODE[serviceName];

  if (!isKnownMode(mode)) {
    throw new Error(`未知服务模式: ${serviceName} -> ${mode}`);
  }

  return mode;
}

function isMockMode(serviceName) {
  return getServiceMode(serviceName) === SERVICE_MODE_VALUE.MOCK;
}

function isProductionLikeEnv() {
  return getCurrentAppEnv() === APP_ENV_VALUE.PRODUCTION;
}

function allowsMockFallback(serviceName) {
  const mode = getServiceMode(serviceName);

  if (isProductionLikeEnv()) {
    return false;
  }

  if (mode === SERVICE_MODE_VALUE.CLOUD_WITH_MOCK_DEV_FALLBACK) {
    return getCurrentAppEnv() === APP_ENV_VALUE.DEVELOPMENT;
  }

  return mode === SERVICE_MODE_VALUE.CLOUD_WITH_MOCK_FALLBACK;
}

function allowsLocalFallback(serviceName) {
  if (isProductionLikeEnv()) {
    return false;
  }

  return getServiceMode(serviceName) === SERVICE_MODE_VALUE.CLOUD_WITH_LOCAL_FALLBACK;
}

function getAllServiceModes(appEnv) {
  return getServiceModeMapForEnv(appEnv || getCurrentAppEnv());
}

function assertRuntimeConfig() {
  const errors = [];
  const cloudEnvId = ENV_CONFIG && ENV_CONFIG.cloudEnvId;

  if (!isKnownAppEnv(getCurrentAppEnv())) {
    errors.push(`currentAppEnv 未配置服务矩阵: ${getCurrentAppEnv()}`);
  }

  if (!cloudEnvId || typeof cloudEnvId !== "string") {
    errors.push("ENV_CONFIG.cloudEnvId 不能为空");
  }

  Object.keys(SERVICE_MODE_BY_ENV).forEach((envName) => {
    const modeMap = SERVICE_MODE_BY_ENV[envName] || {};

    SERVICE_NAME_LIST.forEach((serviceName) => {
      if (!hasOwn(modeMap, serviceName)) {
        errors.push(`${envName} 缺少服务模式: ${serviceName}`);
        return;
      }

      if (!isKnownMode(modeMap[serviceName])) {
        errors.push(`${envName}.${serviceName} 使用未知服务模式: ${modeMap[serviceName]}`);
      }
    });
  });

  const productionModes = SERVICE_MODE_BY_ENV[APP_ENV_VALUE.PRODUCTION] || {};
  SERVICE_NAME_LIST.forEach((serviceName) => {
    const mode = productionModes[serviceName];

    if (PRODUCTION_FORBIDDEN_MODES.indexOf(mode) >= 0) {
      errors.push(`production.${serviceName} 禁止使用 ${mode}`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Runtime config check failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    ok: true,
    appEnv: getCurrentAppEnv(),
    serviceMode: getAllServiceModes()
  };
}

module.exports = {
  SERVICE_MODE,
  SERVICE_MODE_BY_ENV,
  SERVICE_MODE_VALUE,
  SERVICE_NAME_LIST,
  APP_ENV_VALUE,
  getCurrentAppEnv,
  getAllServiceModes,
  getServiceMode,
  isMockMode,
  isProductionLikeEnv,
  allowsMockFallback,
  allowsLocalFallback,
  assertRuntimeConfig
};
