"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bootstrap_1 = require("./flows/bootstrap");
const { ENV_CONFIG } = require("./config/env");
const { assertRuntimeConfig } = require("./services/runtime");
App({
    globalData: {
        bootstrapped: false
    },
    onLaunch(options) {
        assertRuntimeConfig();
        if (wx.cloud) {
            wx.cloud.init({
                env: ENV_CONFIG.cloudEnvId,
                traceUser: ENV_CONFIG.traceUser
            });
        }
        (0, bootstrap_1.bootstrapApp)(options);
        this.globalData.bootstrapped = true;
    }
});
