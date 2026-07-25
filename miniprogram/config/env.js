"use strict";

const {
  APP_ENV_VALUE,
  DEFAULT_APP_ENV,
  ENV_PROFILE_BY_ENV
} = require("./env.profiles");
const generated = require("./env.generated");

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function normalizeEnvName(value) {
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_APP_ENV;
}

function resolveEnvConfig() {
  const selectedEnv = normalizeEnvName(generated.SELECTED_APP_ENV);

  if (!hasOwn(ENV_PROFILE_BY_ENV, selectedEnv)) {
    throw new Error(`Unknown app environment: ${selectedEnv}`);
  }

  const profile = ENV_PROFILE_BY_ENV[selectedEnv];
  const overrides = generated.ENV_OVERRIDES || {};

  return Object.assign({}, profile, overrides, {
    currentAppEnv: selectedEnv
  });
}

const ENV_CONFIG = resolveEnvConfig();

module.exports = {
  APP_ENV_VALUE,
  ENV_CONFIG,
  ENV_PROFILE_BY_ENV
};
