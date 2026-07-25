"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMockAsset = createMockAsset;
exports.runQualityCheck = runQualityCheck;
const id_1 = require("../../utils/id");
const UPLOAD_ASSET_MAP = {
    front: "/assets/mock/upload-front.png",
    side: "/assets/mock/upload-side.png",
    full: "/assets/mock/upload-full.png",
    pattern: "/assets/mock/targeted-reference.png",
    ear: "/assets/mock/targeted-reference.png",
    tail: "/assets/mock/targeted-reference.png",
    custom: "/assets/mock/upload-close.png"
};
async function createMockAsset(viewType, role, scenario = "success") {
    if (scenario === "permissionError") {
        return Promise.resolve({
            ok: false,
            status: "permissionError",
            message: "没有获得相册或相机权限，请先允许访问照片。"
        });
    }
    if (scenario === "failed") {
        return Promise.resolve({
            ok: false,
            status: "failed",
            message: "照片上传失败了，请稍后再试一次。"
        });
    }
    return Promise.resolve({
        ok: true,
        status: "partial",
        message: "照片已加入本次创作素材。",
        asset: {
            assetId: (0, id_1.createId)("asset"),
            localPath: UPLOAD_ASSET_MAP[viewType],
            role,
            viewType,
            qualityStatus: "passed"
        }
    });
}
async function runQualityCheck(assets, role = "initial", requiredViews = []) {
    const viewSet = new Set(assets.map((asset) => asset.viewType));
    const hasFront = viewSet.has("front");
    const hasBody = viewSet.has("side") || viewSet.has("full");
    const hasEnoughViews = [hasFront, viewSet.has("side"), viewSet.has("full")].filter(Boolean).length >= 2;
    if (role === "supplement") {
        if (assets.length === 0) {
            return Promise.resolve({
                status: "empty",
                missingViews: requiredViews,
                canContinue: false,
                message: "先补充一张本轮建议角度的照片，再开始定向优化。"
            });
        }
        if (requiredViews.length && !requiredViews.some((view) => viewSet.has(view))) {
            return Promise.resolve({
                status: "lowQuality",
                missingViews: requiredViews,
                canContinue: false,
                message: "这轮优化还缺少建议角度的照片，补一张会更准确。"
            });
        }
        return Promise.resolve({
            status: "enough",
            missingViews: [],
            canContinue: true,
            message: "定向补图已达到要求，可以继续优化。"
        });
    }
    if (assets.length === 0) {
        return Promise.resolve({
            status: "empty",
            missingViews: ["front"],
            canContinue: false,
            message: "先上传一张清晰主图，达到最低标准后就能继续生成。"
        });
    }
    if (!hasFront) {
        return Promise.resolve({
            status: "lowQuality",
            missingViews: ["front"],
            canContinue: false,
            message: "当前缺少正脸主图，系统还无法稳定识别宠物特征。"
        });
    }
    if (hasEnoughViews && hasBody) {
        return Promise.resolve({
            status: "enough",
            missingViews: [],
            canContinue: true,
            message: "素材角度比较充分，能帮助提高相似度。"
        });
    }
    return Promise.resolve({
        status: "partial",
        missingViews: hasBody ? [] : ["side", "full"],
        canContinue: true,
        message: "已经达到最低生成标准，也可以再补充侧面或全身来提升相似度。"
    });
}
