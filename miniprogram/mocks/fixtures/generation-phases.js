"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GENERATION_PHASE_LABELS = exports.GENERATION_PHASES = void 0;
exports.GENERATION_PHASES = [
    "queued",
    "fetching_assets",
    "finalizing",
    "completed"
];
exports.GENERATION_PHASE_LABELS = {
    queued: "正在读取照片",
    fetching_assets: "正在读取照片",
    finalizing: "正在整理作品",
    completed: "生成完成",
    failed: "生成失败",
    timeout: "生成等待时间过长"
};
