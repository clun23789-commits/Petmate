"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const catalog_1 = require("../../../services/catalog");
const navigation_1 = require("../../../utils/navigation");
const query_1 = require("../../../utils/query");
const toast_1 = require("../../../utils/toast");
const DEFAULT_ABOUT_ITEMS = [
    {
        icon: "▣",
        title: "真实渲染效果",
        desc: "展示 Petmate 数字形象的高清渲染效果"
    },
    {
        icon: "★",
        title: "多角度预览",
        desc: "支持旋转、缩放查看不同角度的模型效果"
    },
    {
        icon: "爪",
        title: "个性化生成",
        desc: "上传你家宠物的照片，生成专属数字形象"
    }
];
const DEFAULT_DOTS = [0, 1, 2];
const DEFAULT_NOTICE_TEXT = "这是由 Petmate 官方生成的示例模型，用于展示数字形象效果。";
const DEFAULT_NOTICE_WARNING = "不等于真实宠物生成结果，效果因宠物而异。";
const DEFAULT_WARM_TIP = "想要生成你家宠物的专属数字形象，请先解锁试用权益，再上传真实照片进行生成。";
const DEFAULT_STAGE_HINT = "左右拖动查看模型，双指缩放";
function getFallbackHeroImage(templateId) {
    return templateId === "template-dog" ? "/assets/mock/pet-corgi-hero.png" : "/assets/mock/pet-cat-hero.png";
}
function buildPreviewTabs(template, templateId) {
    const fallbackHeroImage = template.heroImage || getFallbackHeroImage(templateId);
    const source = Array.isArray(template.previewTabs) && template.previewTabs.length
        ? template.previewTabs
        : [
            { key: "front", label: "正面", image: fallbackHeroImage, type: "image" },
            { key: "side", label: "侧面", image: fallbackHeroImage, type: "image" },
            { key: "back", label: "背面", image: fallbackHeroImage, type: "image" },
            { key: "video", label: "视频", image: fallbackHeroImage, type: "video", videoId: template.videoId || "" }
        ];
    return source.map((preview) => ({
        key: preview.key || "front",
        label: preview.label || "正面",
        image: preview.image || fallbackHeroImage,
        type: preview.type || "image",
        videoId: preview.videoId || template.videoId || ""
    }));
}
function buildAboutItems(items) {
    const source = Array.isArray(items) && items.length ? items : DEFAULT_ABOUT_ITEMS;
    return source.map((item, index) => ({
        icon: item.icon,
        title: item.title,
        desc: item.desc,
        showDivider: index < source.length - 1
    }));
}
function getActiveDot(key) {
    if (key === "side") {
        return 1;
    }
    if (key === "back" || key === "video") {
        return 2;
    }
    return 0;
}
function normalizeTemplate(template, templateId) {
    return {
        templateId: template.templateId || templateId,
        title: template.title || "官方示例模型",
        noticeTitle: template.noticeTitle || "官方示例模型",
        noticeText: template.noticeText || template.summary || DEFAULT_NOTICE_TEXT,
        noticeWarning: template.noticeWarning || DEFAULT_NOTICE_WARNING,
        summary: template.summary || DEFAULT_NOTICE_TEXT,
        caseId: template.caseId || "",
        videoId: template.videoId || "",
        heroImage: template.heroImage || getFallbackHeroImage(templateId),
        previewTabs: buildPreviewTabs(template, templateId),
        aboutItems: buildAboutItems(template.aboutItems),
        tips: template.tips || DEFAULT_WARM_TIP
    };
}
Page({
    data: {
        template: {},
        templateReady: false,
        templateId: "template-cat",
        caseId: "",
        previewTabs: [],
        activePreviewKey: "front",
        activePreview: null,
        heroImageSrc: "",
        dots: DEFAULT_DOTS,
        activeDot: 0,
        currentAboutItems: buildAboutItems(DEFAULT_ABOUT_ITEMS),
        noticeTitle: "官方示例模型",
        noticeText: DEFAULT_NOTICE_TEXT,
        noticeWarning: DEFAULT_NOTICE_WARNING,
        warmTipText: DEFAULT_WARM_TIP,
        stageHint: DEFAULT_STAGE_HINT
    },
    async onLoad(options) {
        const templateId = (0, query_1.getStringParam)(options, "templateId", "template-cat");
        const caseId = (0, query_1.getStringParam)(options, "caseId", "");
        const template = await (0, catalog_1.getTemplateById)(templateId);
        const normalizedTemplate = normalizeTemplate(template || {}, templateId);
        const [activePreview] = normalizedTemplate.previewTabs;
        this.setData({
            template: normalizedTemplate,
            templateReady: true,
            templateId: normalizedTemplate.templateId,
            caseId: caseId || normalizedTemplate.caseId || "",
            previewTabs: normalizedTemplate.previewTabs,
            activePreviewKey: activePreview ? activePreview.key : "front",
            activePreview: activePreview || null,
            heroImageSrc: activePreview ? activePreview.image : normalizedTemplate.heroImage,
            activeDot: getActiveDot(activePreview ? activePreview.key : "front"),
            currentAboutItems: normalizedTemplate.aboutItems,
            noticeTitle: normalizedTemplate.noticeTitle,
            noticeText: normalizedTemplate.noticeText,
            noticeWarning: normalizedTemplate.noticeWarning,
            warmTipText: normalizedTemplate.tips
        });
    },
    handleBack() {
        const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
        if (pages.length > 1) {
            (0, navigation_1.back)();
            return;
        }
        if (this.data.caseId) {
            (0, navigation_1.navigate)("/pages/cases/detail/index", { caseId: this.data.caseId });
            return;
        }
        (0, navigation_1.switchTab)("/pages/cases/index/index");
    },
    handleReturnCase() {
        const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
        const previousPage = pages.length > 1 ? pages[pages.length - 2] : null;
        if (previousPage && previousPage.route === "pages/cases/detail/index") {
            (0, navigation_1.back)();
            return;
        }
        if (this.data.caseId) {
            (0, navigation_1.navigate)("/pages/cases/detail/index", { caseId: this.data.caseId });
            return;
        }
        if (pages.length > 1) {
            (0, navigation_1.back)();
            return;
        }
        (0, navigation_1.switchTab)("/pages/cases/index/index");
    },
    handleGestureHint(event) {
        const { type } = event.currentTarget.dataset;
        (0, toast_1.showToast)(type === "rotate" ? "左右拖动可模拟旋转查看" : "双指缩放可查看细节");
    },
    handlePreviewTap(event) {
        const { key } = event.currentTarget.dataset;
        const preview = this.data.previewTabs.find((item) => item.key === key);
        if (!preview) {
            return;
        }
        if (preview.type === "video") {
            this.handlePreviewVideo(preview);
            return;
        }
        this.setData({
            activePreviewKey: preview.key,
            activePreview: preview,
            heroImageSrc: preview.image || this.data.template.heroImage,
            activeDot: getActiveDot(preview.key)
        });
    },
    handlePreviewVideo(preview) {
        const videoId = preview.videoId || this.data.template.videoId;
        if (!videoId) {
            (0, toast_1.showToast)("暂无示例视频");
            return;
        }
        (0, navigation_1.navigate)("/pages/cases/video-detail/index", { videoId });
    },
    handleStart() {
        (0, navigation_1.navigate)("/pages/works/start-create/index");
    },
    handleWarmTip() {
        this.handleStart();
    }
});
