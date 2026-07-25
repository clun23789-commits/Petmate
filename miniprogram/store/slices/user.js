"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialUserState = void 0;
const createInitialUserState = () => ({
    loginStatus: "guest",
    profileAuth: "unknown",
    cameraAuth: "unknown",
    albumAuth: "unknown",
    userProfile: null,
    cloudOpenid: "",
    cloudUser: null,
    cloudSyncStatus: "idle",
    cloudSyncError: ""
});
exports.createInitialUserState = createInitialUserState;
