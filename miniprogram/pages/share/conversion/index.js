"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { hydrateCloudShareContext, hydrateShareContext } = require("../../../flows/shareFlow");
const navigation_1 = require("../../../utils/navigation");
const query_1 = require("../../../utils/query");
const PAGE_TITLE = "来自 Petmate 的宠物数字形象";
const DEFAULT_HERO_IMAGE = "/assets/mock/pet-corgi-hero.png";
const DEV_MOCK_SHARE_IDS = {
    "share-owner": true,
    "share-new-user": true,
    "share-expired": true
};
const DEFAULT_QUESTION_TEXT = "也想把你的宠物带进现实空间吗？";
const DEFAULT_PRIMARY_CTA_TEXT = "生成我的宠物";
const DEFAULT_SECONDARY_CTA_TEXT = "先看更多案例";
const DEFAULT_TIP_TEXT = "真实宠物上传需先解锁试用";
const DEFAULT_SUBTITLE_LINES = ["这是由 Petmate", "生成的宠物数字形象"];
const INVALID_SHARE_TITLE = "这个分享可能已经失效";
const INVALID_SHARE_DESCRIPTION = "请返回作品页，或先看看更多官方案例。";
const DEFAULT_STEPS = [
    {
        id: "upload",
        number: "1",
        title: "上传猫狗照片",
        desc: "清晰正脸更准确",
        image: "/assets/mock/upload-front.png"
    },
    {
        id: "generate",
        number: "2",
        title: "生成 AI 宠物数字形象",
        desc: "专属 3D 形象",
        image: "/assets/mock/pet-corgi-hero.png"
    },
    {
        id: "compare",
        number: "3",
        title: "判断像不像并优化",
        desc: "多次调整更贴合",
        image: "/assets/mock/retouch-before.png"
    },
    {
        id: "ar",
        number: "4",
        title: "满意后可进入 AR 展示",
        desc: "把它带进现实",
        image: "/assets/mock/pet-cat-hero.png"
    }
];
function inferPetName(preview) {
    if (preview === null || preview === void 0 ? void 0 : preview.petName) {
        return preview.petName;
    }
    const title = (preview === null || preview === void 0 ? void 0 : preview.title) || "";
    const match = title.match(/^(.+?)的宠物数字形象$/);
    return (match === null || match === void 0 ? void 0 : match[1]) || "糖糖";
}
function buildHero(context) {
    const preview = (context === null || context === void 0 ? void 0 : context.preview) || {};
    const conversion = (context === null || context === void 0 ? void 0 : context.conversion) || {};
    const subtitleLines = Array.isArray(conversion.heroSubtitleLines) && conversion.heroSubtitleLines.length
        ? conversion.heroSubtitleLines.slice(0, 2)
        : DEFAULT_SUBTITLE_LINES;
    return {
        petName: inferPetName(preview),
        image: conversion.heroImage || preview.image || DEFAULT_HERO_IMAGE,
        subtitleLines
    };
}
function buildSteps(context) {
    const conversion = (context === null || context === void 0 ? void 0 : context.conversion) || {};
    const steps = Array.isArray(conversion.steps) && conversion.steps.length ? conversion.steps : DEFAULT_STEPS;
    return steps.slice(0, 4).map((step, index) => {
        const fallback = DEFAULT_STEPS[index] || DEFAULT_STEPS[0];
        return {
            id: step.id || fallback.id || `step-${index + 1}`,
            number: step.number || String(index + 1),
            title: step.title || fallback.title,
            desc: step.desc || step.description || fallback.desc,
            image: step.image || step.cover || fallback.image,
            showArrow: index < Math.min(steps.length, 4) - 1
        };
    });
}
function buildPageState(context) {
    const conversion = (context === null || context === void 0 ? void 0 : context.conversion) || {};
    return {
        hero: buildHero(context),
        steps: buildSteps(context),
        questionText: conversion.questionText || DEFAULT_QUESTION_TEXT,
        primaryCtaText: conversion.primaryCtaText || DEFAULT_PRIMARY_CTA_TEXT,
        secondaryCtaText: conversion.secondaryCtaText || DEFAULT_SECONDARY_CTA_TEXT,
        tipText: conversion.tipText || DEFAULT_TIP_TEXT
    };
}
function isDevMockShareId(shareId) {
    return !!DEV_MOCK_SHARE_IDS[shareId];
}
Page({
    data: {
        shareId: "",
        context: null,
        hero: buildHero(null),
        steps: buildSteps(null),
        questionText: DEFAULT_QUESTION_TEXT,
        primaryCtaText: DEFAULT_PRIMARY_CTA_TEXT,
        secondaryCtaText: DEFAULT_SECONDARY_CTA_TEXT,
        tipText: DEFAULT_TIP_TEXT,
        isActive: false,
        loading: true,
        invalidTitle: "",
        invalidDescription: "",
        navTitle: PAGE_TITLE
    },
    onLoad(options) {
        const shareId = (0, query_1.getStringParam)(options, "shareId", "");
        this.loadShareContext(shareId);
    },
    applyShareContext(shareId, context) {
        const isActive = !!context && context.shareStatus === "active";
        this.setData({
            shareId: (context === null || context === void 0 ? void 0 : context.shareId) || shareId,
            context,
            isActive,
            loading: false,
            ...buildPageState(context),
            invalidTitle: INVALID_SHARE_TITLE,
            invalidDescription: INVALID_SHARE_DESCRIPTION
        });
    },
    showInvalidShare(shareId) {
        this.setData({
            shareId,
            context: null,
            isActive: false,
            loading: false,
            invalidTitle: INVALID_SHARE_TITLE,
            invalidDescription: INVALID_SHARE_DESCRIPTION
        });
    },
    async loadMockShareContext(shareId) {
        const context = await hydrateShareContext(shareId);
        this.applyShareContext(shareId, context);
    },
    async loadShareContext(shareId) {
        this.setData({
            shareId,
            context: null,
            isActive: false,
            loading: true,
            invalidTitle: "",
            invalidDescription: ""
        });

        if (!shareId) {
            this.showInvalidShare("");
            return;
        }

        try {
            const context = await hydrateCloudShareContext(shareId, { trackView: false });
            this.applyShareContext(shareId, context);
        }
        catch (error) {
            console.error("load conversion share failed", error);
            if (isDevMockShareId(shareId)) {
                await this.loadMockShareContext(shareId);
                return;
            }
            this.showInvalidShare(shareId);
        }
    },
    handleBack() {
        (0, navigation_1.safeBack)({
            fallbackPath: "/pages/cases/index/index",
            fallbackMode: "switchTab"
        });
    },
    handleCases() {
        (0, navigation_1.switchTab)("/pages/cases/index/index");
    },
    handleHome() {
        (0, navigation_1.switchTab)("/pages/works/index/index");
    },
    handleStart() {
        (0, navigation_1.navigate)("/pages/works/start-create/index");
    }
});
