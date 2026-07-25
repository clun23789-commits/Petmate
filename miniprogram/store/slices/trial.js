"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialTrialState = void 0;
const createInitialTrialState = () => ({
    adGrantCount: 0,
    uploadGranted: false,
    generateGranted: false,
    lastGrantSource: "none",
    pendingReturnRoute: "",
    adRewardGrantMap: {},
    unlockStatus: "idle",
    latestUnlockMessage: ""
});
exports.createInitialTrialState = createInitialTrialState;
