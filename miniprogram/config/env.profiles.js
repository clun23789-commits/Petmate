"use strict";

const APP_ENV_VALUE = {
  DEVELOPMENT: "development",
  STAGING: "staging",
  PRODUCTION: "production"
};

const DEFAULT_APP_ENV = APP_ENV_VALUE.DEVELOPMENT;

const ENV_PROFILE_BY_ENV = {
  development: {
    currentAppEnv: APP_ENV_VALUE.DEVELOPMENT,
    cloudEnvId: "clun23789-2gawcmo5fbb15495",
    traceUser: true
  },
  staging: {
    currentAppEnv: APP_ENV_VALUE.STAGING,
    cloudEnvId: "clun23789-2gawcmo5fbb15495",
    traceUser: true
  },
  production: {
    currentAppEnv: APP_ENV_VALUE.PRODUCTION,
    cloudEnvId: "__PETMATE_PROD_CLOUD_ENV_ID__",
    traceUser: false
  }
};

module.exports = {
  APP_ENV_VALUE,
  DEFAULT_APP_ENV,
  ENV_PROFILE_BY_ENV
};
