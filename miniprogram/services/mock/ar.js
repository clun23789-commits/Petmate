"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeArSession = initializeArSession;
const FAILURE_REASON_MAP = {
    camera: "相机权限未开启，请先允许 Petmate 访问相机。",
    lighting: "当前环境光线不足，建议移动到更明亮的位置后重试。",
    plane: "暂未识别到稳定平面，请缓慢移动手机寻找桌面或地面。",
    performance: "当前设备性能可能不足，建议稍后重试或切换兼容设备。"
};
async function initializeArSession(workId, mode = "success") {
    if (mode !== "success") {
        return Promise.resolve({
            workId,
            success: false,
            reason: FAILURE_REASON_MAP[mode],
            reasonType: mode
        });
    }
    return Promise.resolve({
        workId,
        success: true,
        reason: "",
        reasonType: "success"
    });
}
