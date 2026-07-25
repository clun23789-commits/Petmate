"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const catalog_1 = require("../../../services/catalog");
const navigation_1 = require("../../../utils/navigation");
const query_1 = require("../../../utils/query");
const toast_1 = require("../../../utils/toast");
const DEFAULT_PREVIEW_CONFIG = [
    { key: "full", label: "整体展示", type: "image" },
    { key: "side", label: "侧面展示", type: "image" },
    { key: "face", label: "正面特写", type: "image" },
    { key: "back", label: "背面展示", type: "image" },
    { key: "video", label: "AR 展示视频", type: "video" }
];
const DEFAULT_HIGHLIGHTS = [
    {
        key: "restore",
        icon: "像",
        title: "高识别度还原",
        description: "保留真实宠物的毛色、花纹与五官特征，第一眼就能认出是它。"
    },
    {
        key: "interactive",
        icon: "3D",
        title: "3D 可互动",
        description: "支持旋转、缩放与动作展示，从不同角度欣赏你的宠物。"
    },
    {
        key: "ar",
        icon: "AR",
        title: "AR 现实展示",
        description: "可放置在真实环境中，自由摆放、拍照或录屏分享。"
    }
];
const GENERIC_TAGS = ["推荐案例", "AR 展示", "3D 模型", "官方示例模型", "免费层示例"];
function pickTypeAndBreed(item) {
    const sourceTags = Array.isArray(item.tags) ? item.tags.filter((tag) => !GENERIC_TAGS.includes(tag)) : [];
    const fallbackBreed = Array.isArray(item.displayTags) && item.displayTags.length ? item.displayTags[0] : "官方案例";
    return {
        petType: item.petType || item.petTypeLabel || sourceTags[0] || "宠物案例",
        breed: item.breed || sourceTags[1] || fallbackBreed
    };
}
function buildCaseTags(item) {
    const { petType, breed } = pickTypeAndBreed(item);
    return [
        { key: "petType", label: petType, accent: true },
        { key: "breed", label: breed, accent: false }
    ].filter((tag) => tag.label);
}
function buildPreviewTabs(item) {
    const heroImage = item.heroImage || item.image;
    if (Array.isArray(item.gallery) && item.gallery.length) {
        return item.gallery.map((preview, index) => {
            const fallback = DEFAULT_PREVIEW_CONFIG[index] || DEFAULT_PREVIEW_CONFIG[0];
            return {
                key: preview.key || fallback.key,
                label: preview.label || fallback.label,
                type: preview.type || fallback.type,
                image: preview.image || heroImage
            };
        });
    }
    return DEFAULT_PREVIEW_CONFIG.map((preview) => ({
        key: preview.key,
        label: preview.label,
        type: preview.type,
        image: heroImage
    }));
}
function normalizeCase(item) {
    const caseTags = buildCaseTags(item);
    return Object.assign(Object.assign({}, item), { displayName: item.petName || item.title, displayDescription: item.description || item.summary || "查看这个官方案例如何把真实宠物特征转成轻低多边形数字形象。", caseTags,
        heroImage: item.heroImage || item.image,
        createImage: item.createImage || item.image,
        officialTitle: item.officialTitle || "官方示例模型", officialDescription: item.officialDescription || "该模型由官方生成，用于展示能力与效果预期，非真实用户宠物。上传自家宠物照片后，将生成属于你的专属形象。", highlightCards: Array.isArray(item.highlightCards) && item.highlightCards.length
            ? item.highlightCards
            : DEFAULT_HIGHLIGHTS, shareTitle: item.shareTitle || `看看 ${item.petName || item.title} 的 Petmate 官方模型案例`, isOfficial: item.isOfficial !== false });
}
function getDefaultTemplateId(item) {
    const petText = `${item.petType || ""}${item.petTypeLabel || ""}${Array.isArray(item.tags) ? item.tags.join("") : ""}`;
    return petText.includes("狗") ? "template-dog" : "template-cat";
}
Page({
    data: {
        item: null,
        loading: true,
        loadFailed: false,
        previewTabs: [],
        activePreviewKey: "full",
        activePreview: null
    },
    async onLoad(options) {
        const caseId = (0, query_1.getStringParam)(options, "caseId", "case-ragdoll");
        if (wx.showShareMenu) {
            wx.showShareMenu();
        }
        await this.loadCase(caseId);
    },
    async loadCase(caseId) {
        const item = await (0, catalog_1.getCaseById)(caseId);
        if (!item) {
            this.setData({
                item: null,
                loading: false,
                loadFailed: true,
                previewTabs: [],
                activePreview: null
            });
            return;
        }
        const normalizedItem = normalizeCase(item);
        const previewTabs = buildPreviewTabs(normalizedItem);
        const activePreview = previewTabs.find((preview) => preview.key === "full" && preview.type === "image")
            || previewTabs.find((preview) => preview.type === "image")
            || previewTabs[0]
            || null;
        this.setData({
            item: normalizedItem,
            loading: false,
            loadFailed: false,
            previewTabs,
            activePreviewKey: activePreview ? activePreview.key : "",
            activePreview
        });
    },
    handleBack() {
        const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
        if (pages.length > 1) {
            (0, navigation_1.back)();
            return;
        }
        (0, navigation_1.switchTab)("/pages/cases/index/index");
    },
    handleGoCases() {
        (0, navigation_1.switchTab)("/pages/cases/index/index");
    },
    handleSelectPreview(event) {
        const { key } = event.currentTarget.dataset;
        const preview = this.data.previewTabs.find((item) => item.key === key);
        if (!preview) {
            return;
        }
        if (preview.type === "video") {
            this.handleVideo();
            return;
        }
        this.setData({
            activePreviewKey: preview.key,
            activePreview: preview
        });
    },
    handleVideo() {
        if (!this.data.item || !this.data.item.videoId) {
            (0, toast_1.showToast)("暂无 AR 展示视频");
            return;
        }
        (0, navigation_1.navigate)("/pages/cases/video-detail/index", {
            videoId: this.data.item.videoId
        });
    },
    handleTemplate() {
        if (!this.data.item) {
            return;
        }
        (0, navigation_1.navigate)("/pages/cases/template-demo/index", {
            templateId: this.data.item.templateId || getDefaultTemplateId(this.data.item)
        });
    },
    handleStart() {
        (0, navigation_1.navigate)("/pages/works/start-create/index");
    },
    onShareAppMessage() {
        const { item } = this.data;
        if (!item) {
            return {
                title: "看看这个 Petmate 官方宠物模型案例",
                path: "/pages/cases/index/index"
            };
        }
        return {
            title: item.shareTitle,
            path: `/pages/cases/detail/index?caseId=${item.id}`,
            imageUrl: item.heroImage || item.image
        };
    }
});
