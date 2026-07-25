"use strict";

const userService = require("../user");

const DEFAULT_USER_PROFILE = {
  nickname: "宠爱我家",
  avatarUrl: ""
};

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildProfileFromCloudUser(cloudUser) {
  return {
    nickname: normalizeString(cloudUser && cloudUser.nickname) || DEFAULT_USER_PROFILE.nickname,
    avatarUrl: normalizeString(cloudUser && cloudUser.avatarUrl) || DEFAULT_USER_PROFILE.avatarUrl
  };
}

function buildPermissionResult(status, scope, message) {
  return {
    ok: true,
    status,
    scope,
    message: message || ""
  };
}

function buildPermissionFailure(scope, message) {
  return {
    ok: false,
    status: "unavailable",
    scope,
    errorCode: "AUTH_PERMISSION_UNAVAILABLE",
    message: message || "授权能力暂不可用，请稍后重试"
  };
}

function callWxApi(methodName, params) {
  return new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || !wx || typeof wx[methodName] !== "function") {
      reject(new Error(`${methodName} is unavailable`));
      return;
    }

    wx[methodName]({
      ...params,
      success: resolve,
      fail: reject
    });
  });
}

async function login() {
  try {
    const result = await userService.syncUser();
    if (!result || result.ok !== true) {
      return {
        ok: false,
        status: "failed",
        errorCode: result && result.errorCode ? result.errorCode : "AUTH_LOGIN_FAILED",
        message: result && result.message ? result.message : "登录失败，请稍后重试"
      };
    }

    const data = result.data || {};
    const cloudUser = data.user || null;

    return {
      ok: true,
      status: "logged_in",
      profile: buildProfileFromCloudUser(cloudUser),
      cloudOpenid: data.openid || "",
      cloudUser
    };
  } catch (error) {
    console.error("auth login failed", error);
    return {
      ok: false,
      status: "failed",
      errorCode: "AUTH_LOGIN_FAILED",
      message: error && error.message ? error.message : "登录失败，请稍后重试"
    };
  }
}

async function requestProfilePermission() {
  return buildPermissionResult(
    "not_required",
    "profile",
    "用户资料由小程序内编辑维护"
  );
}

async function requestCameraPermission() {
  const scope = "scope.camera";

  try {
    const setting = await callWxApi("getSetting", {});
    const authSetting = setting && setting.authSetting ? setting.authSetting : {};

    if (authSetting[scope] === true) {
      return buildPermissionResult("granted", scope);
    }

    try {
      await callWxApi("authorize", { scope });
      return buildPermissionResult("granted", scope);
    } catch (error) {
      return {
        ok: true,
        status: "denied",
        scope,
        message: "请开启相机权限后再继续"
      };
    }
  } catch (error) {
    console.error("camera permission check failed", error);
    return buildPermissionFailure(scope, "相机授权状态检查失败，请稍后重试");
  }
}

async function requestAlbumPermission() {
  return buildPermissionResult(
    "not_required",
    "album",
    "选择相册图片不需要预授权"
  );
}

module.exports = {
  login,
  requestProfilePermission,
  requestCameraPermission,
  requestAlbumPermission,
  mockLogin: login,
  mockGrantProfilePermission: requestProfilePermission,
  mockGrantCameraPermission: requestCameraPermission,
  mockGrantAlbumPermission: requestAlbumPermission
};
