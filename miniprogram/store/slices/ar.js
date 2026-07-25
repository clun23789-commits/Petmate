"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialArState = void 0;
const createInitialArState = () => ({
    entitlementMapByWorkId: {},
    initStatus: "idle",
    failureReason: "",
    lastSessionWorkId: ""
});
exports.createInitialArState = createInitialArState;
