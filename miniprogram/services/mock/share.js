"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadShareContext = loadShareContext;
exports.createSharePayload = createSharePayload;
exports.expireSharePayloadsForWork = expireSharePayloadsForWork;
exports.getDefaultSharePayload = getDefaultSharePayload;
exports.getShare = getShare;
const works_1 = require("../../mocks/data/works");
const user_1 = require("../../mocks/data/user");
const createStore_1 = require("../../store/core/createStore");
const id_1 = require("../../utils/id");
const storage_1 = require("../../utils/storage");
const SHARE_CONTEXT_STORAGE_KEY = "petmate-share-contexts";
const DEFAULT_CONVERSION_STEPS = [
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
function buildDefaultConversion(image) {
    return {
        heroImage: image || works_1.SHARE_PREVIEW.image,
        heroSubtitleLines: [
            "这是好友生成的宠物数字形象",
            "你也可以上传猫狗照片生成专属形象"
        ],
        questionText: "也想让你的猫狗变成数字形象吗？",
        primaryCtaText: "开始生成我的宠物",
        secondaryCtaText: "先看看案例",
        tipText: "上传清晰正脸照片，生成效果会更稳定。",
        steps: DEFAULT_CONVERSION_STEPS
    };
}
const STATIC_SHARE_CONTEXTS = {
    "share-owner": {
        shareId: "share-owner",
        workId: works_1.SHARE_PREVIEW.workId,
        source: "external_share",
        visitorRole: "owner",
        shareStatus: "active",
        preview: {
            title: works_1.SHARE_PREVIEW.title,
            summary: "这是我家豆豆的数字形象，好可爱呀～",
            ownerNickname: "小橘",
            ownerAvatar: "/assets/mock/upload-front.png",
            petName: "豆豆",
            petType: "狗狗",
            generatedBy: "Petmate",
            canPreview: true,
            tags: ["作品可预览", "好友分享"],
            featureItems: [
                { icon: "▣", title: "猫狗数字形象", desc: "由 AI 生成" },
                { icon: "◇", title: "支持 AR 展示", desc: "带进真实空间" },
                { icon: "♡", title: "可分享与收藏", desc: "记录美好时刻" }
            ],
            authorCta: "查看我的作品",
            image: works_1.SHARE_PREVIEW.image
        },
        conversion: buildDefaultConversion(works_1.SHARE_PREVIEW.image)
    },
    "share-new-user": {
        shareId: "share-new-user",
        workId: works_1.SHARE_PREVIEW.workId,
        source: "external_share",
        visitorRole: "new_user",
        shareStatus: "active",
        preview: {
            title: works_1.SHARE_PREVIEW.title,
            summary: "这是我家豆豆的数字形象，好可爱呀～",
            ownerNickname: "小橘",
            ownerAvatar: "/assets/mock/upload-front.png",
            petName: "豆豆",
            petType: "狗狗",
            generatedBy: "Petmate",
            canPreview: true,
            tags: ["作品可预览", "好友分享"],
            featureItems: [
                { icon: "▣", title: "猫狗数字形象", desc: "由 AI 生成" },
                { icon: "◇", title: "支持 AR 展示", desc: "带进真实空间" },
                { icon: "♡", title: "可分享与收藏", desc: "记录美好时刻" }
            ],
            authorCta: "查看我的作品",
            image: works_1.SHARE_PREVIEW.image
        },
        conversion: buildDefaultConversion(works_1.SHARE_PREVIEW.image)
    },
    "share-expired": {
        shareId: "share-expired",
        workId: works_1.SHARE_PREVIEW.workId,
        source: "external_share",
        visitorRole: "guest",
        shareStatus: "expired",
        preview: {
            title: works_1.SHARE_PREVIEW.title,
            summary: "这份分享已失效，请返回案例页继续体验。",
            ownerNickname: "小橘",
            ownerAvatar: "/assets/mock/upload-front.png",
            petName: "豆豆",
            petType: "狗狗",
            generatedBy: "Petmate",
            canPreview: false,
            tags: ["分享已失效"],
            image: works_1.SHARE_PREVIEW.image
        },
        conversion: buildDefaultConversion(works_1.SHARE_PREVIEW.image)
    }
};
function getStoredShareContexts() {
    return (0, storage_1.getStorageValue)(SHARE_CONTEXT_STORAGE_KEY, {});
}
function saveStoredShareContexts(contextMap) {
    (0, storage_1.setStorageValue)(SHARE_CONTEXT_STORAGE_KEY, contextMap);
}
function buildInvalidContext(shareId) {
    return {
        shareId,
        workId: "",
        source: "external_share",
        visitorRole: "guest",
        shareStatus: "invalid",
        preview: {
            title: "分享内容不存在",
            summary: "这份分享可能已失效、已过期，或对应作品已被删除。",
            ownerNickname: "Petmate",
            ownerAvatar: "/assets/mock/exception-hero.png",
            petName: "",
            petType: "宠物",
            generatedBy: "Petmate",
            canPreview: false,
            tags: ["分享内容不存在"],
            image: works_1.SHARE_PREVIEW.image
        },
        conversion: buildDefaultConversion(works_1.SHARE_PREVIEW.image)
    };
}
function buildPreviewFromWork(workId) {
    const state = createStore_1.store.getState();
    const work = state.workState.workMap[workId];
    const versionId = (work === null || work === void 0 ? void 0 : work.currentVersionId) || "";
    const version = versionId ? state.workState.versionMap[versionId] : null;
    const userProfile = state.userState.userProfile || user_1.DEFAULT_USER_PROFILE;
    if (!work) {
        return {
            title: "当前宠物作品的数字形象",
            summary: "这是由 Petmate 生成的宠物数字形象。",
            ownerNickname: (userProfile === null || userProfile === void 0 ? void 0 : userProfile.nickname) || "Petmate 用户",
            ownerAvatar: (userProfile === null || userProfile === void 0 ? void 0 : userProfile.avatarUrl) || works_1.SHARE_PREVIEW.ownerAvatar || works_1.SHARE_PREVIEW.image,
            petName: works_1.SHARE_PREVIEW.petName || "宠物",
            petType: works_1.SHARE_PREVIEW.petType || "宠物",
            generatedBy: "Petmate",
            canPreview: true,
            tags: works_1.SHARE_PREVIEW.tags || ["作品可预览"],
            featureItems: works_1.SHARE_PREVIEW.featureItems || [],
            authorCta: works_1.SHARE_PREVIEW.authorCta || "查看我的作品",
            image: works_1.SHARE_PREVIEW.image
        };
    }
    return {
        title: `${work.petName || "当前宠物作品"}的数字形象`,
        summary: "这是由 Petmate 生成的宠物数字形象。",
        ownerNickname: (userProfile === null || userProfile === void 0 ? void 0 : userProfile.nickname) || "Petmate 用户",
        ownerAvatar: (userProfile === null || userProfile === void 0 ? void 0 : userProfile.avatarUrl) || works_1.SHARE_PREVIEW.ownerAvatar || works_1.SHARE_PREVIEW.image,
        petName: work.petName || works_1.SHARE_PREVIEW.petName || "宠物",
        petType: "宠物",
        generatedBy: "Petmate",
        canPreview: true,
        tags: works_1.SHARE_PREVIEW.tags || ["作品可预览"],
        featureItems: works_1.SHARE_PREVIEW.featureItems || [],
        authorCta: works_1.SHARE_PREVIEW.authorCta || "查看我的作品",
        image: (version === null || version === void 0 ? void 0 : version.previewMedia.cover) || works_1.SHARE_PREVIEW.image
    };
}
async function loadShareContext(shareId) {
    const context = getStoredShareContexts()[shareId] || STATIC_SHARE_CONTEXTS[shareId];
    return Promise.resolve(context || buildInvalidContext(shareId));
}
async function getShare(shareId) {
    const context = await loadShareContext(shareId);
    if (!context || context.shareStatus !== "active") {
        throw new Error("分享内容不存在或已失效");
    }
    const preview = context.preview || {};
    const conversion = context.conversion || buildDefaultConversion(preview.image);
    return Promise.resolve({
        shareId: context.shareId || shareId,
        workId: context.workId || "",
        shareStatus: context.shareStatus || "active",
        visitorRole: context.visitorRole || "new_user",
        title: preview.title || "Petmate 宠物数字形象作品",
        petName: preview.petName || "",
        imageUrl: preview.image || works_1.SHARE_PREVIEW.image,
        description: preview.summary || "",
        preview,
        conversion
    });
}
async function createSharePayload(workId) {
    const preview = buildPreviewFromWork(workId);
    const conversion = buildDefaultConversion(preview.image);
    const shareId = (0, id_1.createId)("share");
    const context = {
        shareId,
        workId,
        source: "external_share",
        visitorRole: "new_user",
        shareStatus: "active",
        preview,
        conversion
    };
    saveStoredShareContexts({
        ...getStoredShareContexts(),
        [shareId]: context
    });
    return Promise.resolve({
        shareId,
        workId,
        title: preview.title,
        message: `快看看${preview.title}`,
        path: `/pages/share/landing/index?shareId=${encodeURIComponent(shareId)}`,
        imageUrl: preview.image,
        shareStatus: context.shareStatus,
        visitorRole: context.visitorRole,
        preview,
        conversion
    });
}
function expireSharePayloadsForWork(workId) {
    const contextMap = getStoredShareContexts();
    let changed = false;
    Object.keys(contextMap).forEach((shareId) => {
        const context = contextMap[shareId];
        if ((context === null || context === void 0 ? void 0 : context.workId) !== workId) {
            return;
        }
        contextMap[shareId] = {
            ...context,
            shareStatus: "expired",
            preview: {
                ...context.preview,
                summary: "这份分享已失效，你可以前往案例页继续体验，或开始自己的创作。"
            }
        };
        changed = true;
    });
    if (changed) {
        saveStoredShareContexts(contextMap);
    }
}
function getDefaultSharePayload(workId) {
    const preview = buildPreviewFromWork(workId);
    return {
        title: `快看看${preview.title}`,
        path: "/pages/share/landing/index?shareId=share-new-user",
        imageUrl: preview.image
    };
}
