"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const creationFlow_1 = require("../../../flows/creationFlow");
const { experienceFlags } = require("../../../config/experience");
const mockWorks_1 = require("../../../mocks/data/mockWorks");
const bindStore_1 = require("../../../store/core/bindStore");
const index_1 = require("../../../store/selectors/index");
const query_1 = require("../../../utils/query");
const VIEW_LABEL_MAP = {
    front: "正脸",
    side: "侧面",
    full: "全身",
    custom: "补充"
};
const RECOMMEND_ICON_MAP = {
    front: "正",
    side: "侧",
    full: "全"
};
function buildRecommendations(recommendations) {
    return recommendations.map((item) => ({
        ...item,
        icon: RECOMMEND_ICON_MAP[item.key] || "补"
    }));
}
function buildSelectedPhotos(assets) {
    return assets.map((asset, index) => ({
        assetId: asset.assetId,
        localPath: asset.localPath,
        viewType: asset.viewType,
        label: VIEW_LABEL_MAP[asset.viewType] || "补充",
        qualityText: asset.uploadStatus === "uploading"
            ? "上传中"
            : asset.uploadStatus === "uploaded"
                ? "已上传"
                : asset.uploadStatus === "failed"
                    ? "上传失败"
                    : asset.qualityStatus === "passed"
                        ? "已选择"
                        : "待检查",
        qualityTone: asset.uploadStatus === "failed" ? "danger" : asset.uploadStatus === "uploading" ? "warning" : "success",
        order: index + 1
    }));
}
function getNextUploadSlot(assets) {
    const viewSet = new Set(assets.map((asset) => asset.viewType));
    if (!viewSet.has("front")) {
        return "front";
    }
    if (!viewSet.has("side")) {
        return "side";
    }
    if (!viewSet.has("full")) {
        return "full";
    }
    return "custom";
}
function buildQualityChecks(status, assets) {
    const viewSet = new Set(assets.map((asset) => asset.viewType));
    const hasAssets = assets.length > 0;
    const hasFront = viewSet.has("front");
    const hasAngle = viewSet.has("side") || viewSet.has("full");
    const isEnough = status === "enough";
    const isPartial = status === "partial";
    return [
        {
            title: "主体识别",
            result: status === "permissionError"
                ? "等待照片访问权限"
                : hasFront
                    ? "识别到单只宠物"
                    : hasAssets
                        ? "建议补充正脸"
                        : "等待上传",
            tone: hasFront ? "success" : hasAssets || status === "permissionError" ? "warning" : "neutral",
            helper: "?",
            icon: hasFront ? "✓" : hasAssets || status === "permissionError" ? "!" : "·"
        },
        {
            title: "清晰度",
            result: status === "failed"
                ? "检查中断，请重新添加"
                : hasAssets
                    ? "清晰可用"
                    : "上传后检查",
            tone: hasAssets ? "success" : status === "failed" ? "warning" : "neutral",
            helper: "?",
            icon: hasAssets ? "✓" : status === "failed" ? "!" : "·"
        },
        {
            title: "视角丰富度",
            result: isEnough
                ? "高"
                : isPartial || hasAngle
                    ? "中（建议补充更多角度）"
                    : status === "lowQuality"
                        ? "待补充正脸"
                        : "待补充",
            tone: isEnough ? "success" : isPartial || hasAngle || status === "lowQuality" ? "warning" : "neutral",
            helper: ">",
            icon: isEnough ? "✓" : isPartial || hasAngle || status === "lowQuality" ? "!" : "·"
        }
    ];
}
function buildBottomStatusMeta(summary) {
    if (summary.status === "enough") {
        return {
            text: "素材角度比较充分，可以开始生成。",
            tone: "success",
            icon: "✓"
        };
    }
    if (summary.status === "partial") {
        return {
            text: "已达到最低标准，可以继续生成；补充更多清晰照片，结果会更接近你的宠物。",
            tone: "success",
            icon: "✓"
        };
    }
    if (summary.status === "lowQuality") {
        return {
            text: "当前照片还不适合生成，请先更换或补充清晰正脸照。",
            tone: "warning",
            icon: "!"
        };
    }
    if (summary.status === "permissionError") {
        return {
            text: "需要先允许访问相册或相机，上传成功后才能继续质检。",
            tone: "warning",
            icon: "!"
        };
    }
    if (summary.status === "failed") {
        return {
            text: "照片上传出了点问题，请重新添加后再检查。",
            tone: "warning",
            icon: "!"
        };
    }
    return {
        text: "先上传一张清晰正脸照，达到最低标准后即可继续生成。",
        tone: "neutral",
        icon: "✓"
    };
}
function buildQualitySummary(summary, assets) {
    const count = assets.length;
    if (!count) {
        return {
            title: "还没有选择照片",
            desc: "先上传一张清晰正脸照，达到最低标准后即可开始生成。",
            tone: "neutral",
            icon: "照"
        };
    }
    if (summary.status === "permissionError") {
        return {
            title: "需要开启照片权限",
            desc: summary.hint || "请允许访问相册或相机后再继续上传。",
            tone: "warning",
            icon: "!"
        };
    }
    if (summary.status === "failed") {
        return {
            title: "照片上传遇到问题",
            desc: summary.hint || "请重新添加照片后再检查。",
            tone: "warning",
            icon: "!"
        };
    }
    if (summary.status === "lowQuality") {
        return {
            title: "当前照片还不适合生成",
            desc: summary.hint || "请更换或补充一张更清晰的正脸照。",
            tone: "warning",
            icon: "!"
        };
    }
    if (summary.status === "enough") {
        return {
            title: "照片素材比较充分",
            desc: `已选择 ${count} 张照片，可以开始生成。`,
            tone: "success",
            icon: "✓"
        };
    }
    if (summary.status === "partial") {
        return {
            title: "已达到最低生成标准",
            desc: "现在可以继续生成；补充更多清晰角度，结果会更接近你的宠物。",
            tone: "success",
            icon: "✓"
        };
    }
    return {
        title: "等待照片质检",
        desc: summary.hint || "上传后会自动检查清晰度和视角。",
        tone: "neutral",
        icon: "·"
    };
}
function buildPrimaryMeta(summary, assets, uploadState) {
    const availableCount = assets.length;
    if (uploadState.uploadSubmitStatus === "loading") {
        return {
            text: "照片上传中",
            subtext: "请稍候，不要重复点击",
            blockedReason: "照片上传中，请稍候。",
            loading: true
        };
    }
    if (uploadState.uploadSubmitStatus === "failed") {
        return {
            text: `重新上传并生成（${availableCount} 张）`,
            subtext: uploadState.uploadSubmitError || "照片上传失败，请检查网络后重试",
            blockedReason: uploadState.uploadSubmitError || "照片上传失败，请检查网络后重试",
            loading: false
        };
    }
    if (summary.status === "permissionError") {
        return {
            text: "请先授权",
            subtext: "需要先允许访问相册或相机",
            blockedReason: summary.hint || "需要先允许访问相册或相机",
            loading: false
        };
    }
    if (summary.status === "failed") {
        return {
            text: "重新添加照片",
            subtext: "照片上传出了点问题，请重新添加",
            blockedReason: summary.hint || "照片上传出了点问题，请重新添加",
            loading: false
        };
    }
    if (summary.status === "lowQuality") {
        return {
            text: "请更换照片",
            subtext: "当前素材还不适合生成",
            blockedReason: summary.hint || "当前素材还不适合生成",
            loading: false
        };
    }
    if (availableCount > 0) {
        return {
            text: `开始生成（${availableCount} 张可用）`,
            subtext: summary.canContinue ? "生成过程中不会扣减优化次数" : "请先上传一张清晰正脸照",
            blockedReason: summary.hint || "请先上传一张清晰正脸照",
            loading: false
        };
    }
    return {
        text: "开始生成",
        subtext: "请先上传一张清晰正脸照",
        blockedReason: summary.hint || "请先上传一张清晰正脸照",
        loading: false
    };
}
let unbind = null;
function showUploadBusyToast() {
    wx.showToast({
        title: "照片上传中，请稍候",
        icon: "none"
    });
}
Page({
    data: {
        mode: "initial",
        assets: [],
        selectedPhotos: [],
        nextSlot: "front",
        qualityStatus: "empty",
        qualityHint: "先上传一张清晰正脸照。",
        missingText: "",
        canContinue: false,
        recommendations: buildRecommendations(mockWorks_1.mockWorks.uploadRecommendations),
        qualityChecks: buildQualityChecks("empty", []),
        qualitySummary: buildQualitySummary({ status: "empty", hint: "" }, []),
        showQualityDetails: false,
        bottomStatusText: "先上传一张清晰正脸照，达到最低标准后即可继续生成。",
        bottomStatusTone: "neutral",
        bottomStatusIcon: "✓",
        primaryText: "开始生成",
        primarySubtext: "请先上传一张清晰正脸照",
        submitDisabled: true,
        submitBlockedReason: "请先上传一张清晰正脸照",
        uploadScenario: "success",
        generationScenario: "success",
        submitLoading: false
    },
    onLoad(options) {
        const mode = (0, query_1.getStringParam)(options, "mode", "initial");
        const uploadScenario = experienceFlags.showDevOnlyUi
            ? (0, query_1.getStringParam)(options, "uploadScenario", "success")
            : "success";
        const generationScenario = experienceFlags.showDevOnlyUi
            ? (0, query_1.getStringParam)(options, "generationScenario", "success")
            : "success";
        this.setData({ mode, uploadScenario, generationScenario });
        (0, creationFlow_1.initUploadFlow)(mode === "supplement" ? "supplement" : "initial");
        unbind = (0, bindStore_1.bindStore)(this, (state) => {
            const summary = (0, index_1.selectUploadStatusSummary)(state);
            const assets = state.uploadState.assets;
            const bottomStatusMeta = buildBottomStatusMeta(summary);
            const primaryMeta = buildPrimaryMeta(summary, assets, state.uploadState);
            return {
                assets,
                selectedPhotos: buildSelectedPhotos(assets),
                nextSlot: getNextUploadSlot(assets),
                qualityStatus: summary.status,
                qualityHint: summary.hint,
                missingText: summary.missingText,
                canContinue: summary.canContinue,
                qualityChecks: buildQualityChecks(summary.status, assets),
                qualitySummary: buildQualitySummary(summary, assets),
                bottomStatusText: bottomStatusMeta.text,
                bottomStatusTone: bottomStatusMeta.tone,
                bottomStatusIcon: bottomStatusMeta.icon,
                primaryText: primaryMeta.text,
                primarySubtext: primaryMeta.subtext,
                submitDisabled: !summary.canContinue || primaryMeta.loading,
                submitBlockedReason: primaryMeta.blockedReason,
                submitLoading: primaryMeta.loading
            };
        });
    },
    onUnload() {
        if (unbind) {
            unbind();
            unbind = null;
        }
    },
    async handleSelect(event) {
        if (this.data.submitLoading) {
            showUploadBusyToast();
            return;
        }
        if ((this.data.assets || []).length >= 10) {
            wx.showToast({
                title: "最多选择 10 张照片",
                icon: "none"
            });
            return;
        }
        const slot = event.currentTarget.dataset.slot || this.data.nextSlot || "front";
        await (0, creationFlow_1.addUploadAsset)(slot, this.data.uploadScenario);
    },
    async handleRemove(event) {
        await (0, creationFlow_1.removeUploadAsset)(event.currentTarget.dataset.assetId);
    },
    handleBatchManage() {
        wx.showToast({
            title: "点击照片右上角可删除",
            icon: "none"
        });
    },
    async handleClearAll() {
        const assets = this.data.assets || [];
        if (!assets.length) {
            wx.showToast({
                title: "还没有可清空的照片",
                icon: "none"
            });
            return;
        }
        for (const asset of [...assets]) {
            await (0, creationFlow_1.removeUploadAsset)(asset.assetId);
        }
        wx.showToast({
            title: "已清空",
            icon: "none"
        });
        this.setData({ showQualityDetails: false });
    },
    handleRecheck() {
        wx.showToast({
            title: (this.data.assets || []).length ? "已根据当前照片重新检查" : "还没有照片可检查",
            icon: "none"
        });
    },
    handleToggleQualityDetails() {
        this.setData({
            showQualityDetails: !this.data.showQualityDetails
        });
    },
    async handleSubmit() {
        if (this.data.submitLoading) {
            return;
        }
        if (this.data.submitDisabled) {
            wx.showToast({
                title: this.data.submitBlockedReason || this.data.primarySubtext,
                icon: "none"
            });
            return;
        }
        await (0, creationFlow_1.startGenerationFromUpload)({
            operationType: "initial",
            simulateFailure: this.data.generationScenario === "failed"
        });
    }
});
