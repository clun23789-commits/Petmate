"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadQualityStatus = exports.adUnlockStatus = exports.paymentStatus = exports.arRightStatus = exports.generationStatus = void 0;
exports.generationStatus = [
    "idle",
    "uploading",
    "queueing",
    "recognizing",
    "generating",
    "optimizing",
    "success",
    "failed"
];
exports.arRightStatus = ["locked", "unlocked", "confirming", "failed"];
exports.paymentStatus = ["idle", "paying", "success", "confirmingRight", "failed", "cancelled"];
exports.adUnlockStatus = ["idle", "loading", "success", "failed", "skipped", "unavailable", "error", "rightUnknown"];
exports.uploadQualityStatus = ["empty", "partial", "enough", "lowQuality", "failed", "permissionError"];
