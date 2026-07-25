"use strict";
const user_1 = require("../../mocks/data/user");

async function login() {
    return Promise.resolve({
        ok: true,
        status: "logged_in",
        profile: user_1.DEFAULT_USER_PROFILE
    });
}

async function requestProfilePermission() {
    return Promise.resolve({
        ok: true,
        status: "granted",
        scope: "profile",
        message: ""
    });
}

async function requestCameraPermission() {
    return Promise.resolve({
        ok: true,
        status: "granted",
        scope: "scope.camera",
        message: ""
    });
}

async function requestAlbumPermission() {
    return Promise.resolve({
        ok: true,
        status: "granted",
        scope: "album",
        message: ""
    });
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
