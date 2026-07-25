"use strict";

const GENERATION_CONFIG = {
  pollIntervalMs: 900,
  phaseLabels: {
    queued: "正在读取照片",
    fetching_assets: "正在读取照片",
    finalizing: "正在整理作品",
    completed: "生成完成",
    failed: "生成失败",
    timeout: "生成等待时间过长"
  },
  phaseProgress: {
    idle: 0,
    queued: 0,
    fetching_assets: 35,
    finalizing: 85,
    completed: 100,
    failed: 100,
    timeout: 100
  }
};

module.exports = {
  GENERATION_CONFIG
};
