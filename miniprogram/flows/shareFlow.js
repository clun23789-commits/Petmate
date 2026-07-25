"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.hydrateShareContext = hydrateShareContext;
exports.hydrateCloudShareContext = hydrateCloudShareContext;
exports.enterSharedFlow = enterSharedFlow;
exports.prepareWorkSharePayload = prepareWorkSharePayload;
exports.getDefaultSharePayload = getDefaultSharePayload;

const { createShare, getShare, loadShareContext } = require("../services/share");
const { store } = require("../store/core/createStore");
const { navigate, switchTab } = require("../utils/navigation");
const { showToast } = require("../utils/toast");

const DEFAULT_SHARE_IMAGE = "/assets/mock/pet-corgi-hero.png";
const DEFAULT_SHARE_DESCRIPTION = "这是由 Petmate 生成的宠物数字形象作品。";
const DEFAULT_SHARE_TITLE = "Petmate 宠物数字形象作品";
const DEFAULT_APP_SHARE_PATH = "/pages/works/index/index";
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

function inferPetNameFromTitle(title) {
    const match = (title || "").match(/^(.+?)(?:的宠物数字形象|的数字形象)$/);
    return (match && match[1]) || "宠物";
}

function withFallbackArray(value, fallback) {
    return Array.isArray(value) && value.length ? value : fallback;
}

function buildCloudShareContext(rawShare, shareId) {
    const title = rawShare.title || DEFAULT_SHARE_TITLE;
    const petName = rawShare.petName || inferPetNameFromTitle(title);
    const rawPreview = rawShare.preview || {};
    const rawConversion = rawShare.conversion || {};
    const image = rawPreview.image || rawShare.imageUrl || rawConversion.heroImage || DEFAULT_SHARE_IMAGE;
    const preview = {
        title: rawPreview.title || title,
        summary: rawPreview.summary || rawShare.description || DEFAULT_SHARE_DESCRIPTION,
        ownerNickname: rawPreview.ownerNickname || "Petmate 用户",
        ownerAvatar: rawPreview.ownerAvatar || image,
        petName: rawPreview.petName || petName,
        petType: rawPreview.petType || rawPreview.petTypeLabel || "宠物",
        petTypeLabel: rawPreview.petTypeLabel || "",
        generatedBy: rawPreview.generatedBy || "Petmate",
        canPreview: rawPreview.canPreview === false ? false : true,
        statusText: rawPreview.statusText || "作品可预览",
        tags: withFallbackArray(rawPreview.tags, ["作品可预览", "好友分享"]),
        featureItems: withFallbackArray(rawPreview.featureItems, [
            { icon: "▣", title: "猫狗数字形象", desc: "由 AI 生成" },
            { icon: "◇", title: "支持 AR 展示", desc: "带进真实空间" },
            { icon: "♡", title: "可分享与回看", desc: "记录宠物形象" }
        ]),
        authorCta: rawPreview.authorCta || "查看我的作品",
        image
    };
    const conversion = {
        heroImage: rawConversion.heroImage || preview.image || DEFAULT_SHARE_IMAGE,
        heroSubtitleLines: withFallbackArray(rawConversion.heroSubtitleLines, [
            "这是好友生成的宠物数字形象",
            "你也可以上传猫狗照片生成专属形象"
        ]),
        questionText: rawConversion.questionText || "也想让你的猫狗变成数字形象吗？",
        primaryCtaText: rawConversion.primaryCtaText || "开始生成我的宠物",
        secondaryCtaText: rawConversion.secondaryCtaText || "先看看案例",
        tipText: rawConversion.tipText || "上传清晰正脸照片，生成效果会更稳定。",
        steps: withFallbackArray(rawConversion.steps, DEFAULT_CONVERSION_STEPS)
    };

    return {
        shareId: rawShare.shareId || shareId,
        workId: rawShare.workId || "",
        sourceVersionId: rawShare.sourceVersionId || "",
        source: "external_share",
        visitorRole: rawShare.visitorRole || "new_user",
        shareStatus: rawShare.shareStatus || "active",
        preview,
        conversion
    };
}

function persistShareContext(context, actionName) {
    store.setState((state) => ({
        shareState: {
            ...state.shareState,
            entrySource: context.source,
            visitorRole: context.visitorRole,
            sharedWorkId: context.workId,
            shareStatus: context.shareStatus
        }
    }), actionName);
}

function resolveWorkImage(work) {
    const state = store.getState();
    const versionId = (work && work.currentVersionId) || "";
    const version = versionId ? state.workState.versionMap[versionId] : null;

    return (work && work.coverImage) ||
        (work && work.imageUrl) ||
        (work && work.previewImage) ||
        (version && version.previewMedia && (version.previewMedia.cover || version.previewMedia.poster || version.previewMedia.url)) ||
        DEFAULT_SHARE_IMAGE;
}

function resolveWorkShareTitle(work, petName, options = {}) {
    if (options.title) {
        return options.title;
    }

    if (options.scene === "ar") {
        return petName ? `我把${petName}带到现实空间里啦` : "来看看我的 3D 宠物伙伴";
    }

    return work.title || (petName ? `${petName}的宠物数字形象` : "我的宠物数字形象");
}

function buildWorkShareInput(work, options = {}) {
    if (!work) {
        throw new Error("无法准备分享：作品不存在");
    }

    if (!work.workId) {
        throw new Error("无法准备分享：作品缺少 workId");
    }

    const petName = work.petName || work.displayName || "";
    const title = resolveWorkShareTitle(work, petName, options);

    // 真实上线时，分享图片应使用云存储 fileID 转换后的可访问地址，或 HTTPS 图片地址。
    const imageUrl = resolveWorkImage(work);

    return {
        workId: work.workId,
        title,
        petName,
        imageUrl,
        description: options.description || work.description || DEFAULT_SHARE_DESCRIPTION
    };
}

function getDefaultSharePayload(work, options = {}) {
    const petName = (work && (work.petName || work.displayName)) || "";
    const title = resolveWorkShareTitle(work || {}, petName, options);

    return {
        title,
        path: DEFAULT_APP_SHARE_PATH,
        imageUrl: work ? resolveWorkImage(work) : DEFAULT_SHARE_IMAGE,
        preview: {
            title
        }
    };
}

async function prepareWorkSharePayload(work, options = {}) {
    const shareInput = buildWorkShareInput(work, options);
    const share = await createShare(shareInput);

    if (!share || !share.shareId || !share.path) {
        throw new Error("创建分享记录失败：云函数返回数据不完整");
    }

    if (share.path.indexOf("/pages/share/landing/index?shareId=") !== 0) {
        throw new Error("创建分享记录失败：分享路径格式异常");
    }

    return {
        title: share.title || shareInput.title,
        path: share.path,
        imageUrl: share.imageUrl || shareInput.imageUrl,
        shareId: share.shareId,
        workId: shareInput.workId,
        preview: {
            title: share.title || shareInput.title
        }
    };
}

async function hydrateShareContext(shareId) {
    const context = await loadShareContext(shareId);
    persistShareContext(context, "hydrateShareContext");
    return context;
}

async function hydrateCloudShareContext(shareId, options = {}) {
    const share = await getShare(shareId, options);
    const context = buildCloudShareContext(share || {}, shareId);
    persistShareContext(context, "hydrateCloudShareContext");
    return context;
}

function enterSharedFlow(context) {
    if (context.shareStatus !== "active") {
        showToast("分享已失效，已为你打开案例页");
        switchTab("/pages/cases/index/index");
        return;
    }

    if (context.visitorRole === "owner") {
        if (context.workId && store.getState().workState.workMap[context.workId]) {
            navigate("/pages/works/detail/index", { workId: context.workId });
            return;
        }

        switchTab("/pages/works/index/index");
        return;
    }

    navigate("/pages/share/conversion/index", {
        shareId: context.shareId || ""
    });
}
