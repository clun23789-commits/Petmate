"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatWorkStatus = formatWorkStatus;
exports.formatGenerationPhase = formatGenerationPhase;
exports.formatGenerationStatus = formatGenerationStatus;
exports.formatUploadQualityStatus = formatUploadQualityStatus;
exports.formatEntitlementStatus = formatEntitlementStatus;
exports.formatCurrency = formatCurrency;
exports.formatUploadView = formatUploadView;
const generation_phases_1 = require("../mocks/fixtures/generation-phases");
function formatWorkStatus(status) {
    const map = {
        idle: "暂未开始",
        draft: "待完善",
        uploading: "上传中",
        generating: "生成中",
        ready: "可查看",
        failed: "处理失败",
        retouched: "已补色"
    };
    return map[status] || map.idle;
}
function formatGenerationPhase(phase) {
    if (phase === "idle") {
        return "尚未开始";
    }
    return generation_phases_1.GENERATION_PHASE_LABELS[phase] || generation_phases_1.GENERATION_PHASE_LABELS.failed;
}
function formatGenerationStatus(status) {
    const map = {
        idle: "待开始",
        uploading: "读取照片",
        queueing: "准备中",
        recognizing: "读取照片",
        generating: "生成结果",
        optimizing: "整理作品",
        success: "已完成",
        failed: "生成失败"
    };
    return map[status] || map.failed;
}
function formatUploadQualityStatus(status) {
    const map = {
        empty: "还没有素材",
        partial: "已达到最低标准",
        enough: "素材更充分",
        lowQuality: "素材暂不可用",
        failed: "上传失败",
        permissionError: "权限未开启"
    };
    return map[status] || map.empty;
}
function formatEntitlementStatus(status) {
    const map = {
        unpaid: "当前作品未开通",
        paid: "已支付待确认",
        pending_sync: "权益确认中",
        active: "当前作品可展示"
    };
    return map[status] || map.unpaid;
}
function formatCurrency(amount) {
    return `¥${amount.toFixed(2)}`;
}
function formatUploadView(view) {
    const map = {
        front: "正脸近照",
        side: "侧面轮廓",
        full: "全身姿态",
        pattern: "毛发花纹",
        ear: "耳朵细节",
        tail: "尾巴细节",
        custom: "补充照片"
    };
    return map[view] || "补充照片";
}
