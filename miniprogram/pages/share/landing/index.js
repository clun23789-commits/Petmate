"use strict";

const { getShare } = require("../../../services/share");
const navigation = require("../../../utils/navigation");
const { getStringParam } = require("../../../utils/query");

const DEFAULT_SHARE_IMAGE = "/assets/mock/pet-corgi-hero.png";
const DEFAULT_SHARE_TITLE = "Petmate 宠物数字形象作品";
const DEFAULT_ERROR_TEXT = "这个分享可能已经失效";
const DEFAULT_ERROR_DESC = "请返回作品页，或先看看 Petmate 里的官方案例。";
const DEFAULT_SHARE_DESCRIPTION = "这是由 Petmate 生成的宠物数字形象作品。";
const WORKS_HOME_PATH = "/pages/works/index/index";
const CASES_HOME_PATH = "/pages/cases/index/index";
const WORK_DETAIL_PATH = "/pages/works/detail/index";

function withFallbackArray(value, fallback) {
    return Array.isArray(value) && value.length ? value : fallback;
}

function normalizeShare(rawShare, shareId) {
    const preview = rawShare.preview || {};
    const imageUrl = preview.image || rawShare.imageUrl || "";
    const title = preview.title || rawShare.title || DEFAULT_SHARE_TITLE;
    const description = preview.summary || rawShare.description || DEFAULT_SHARE_DESCRIPTION;

    return {
        shareId: rawShare.shareId || shareId,
        workId: rawShare.workId || "",
        title,
        petName: preview.petName || rawShare.petName || "",
        imageUrl,
        description,
        visitorRole: rawShare.visitorRole || "new_user",
        shareStatus: rawShare.shareStatus || rawShare.status || "active",
        createdAt: rawShare.createdAt || "",
        statusText: preview.statusText || "作品可预览",
        generatedBy: preview.generatedBy || "Petmate",
        tags: withFallbackArray(preview.tags, ["作品可预览", "好友分享"]),
        featureItems: withFallbackArray(preview.featureItems, [])
    };
}

Page({
    data: {
        status: "loading",
        shareId: "",
        share: null,
        errorText: "",
        errorDesc: "",
        primaryActionTitle: "我也想生成宠物数字形象",
        primaryActionDesc: "先了解这份分享作品，再开始自己的创作。",
        primaryActionText: "立即体验",
        secondaryActionText: "返回作品首页"
    },

    onLoad(options) {
        const shareId = getStringParam(options, "shareId", "");

        if (!shareId) {
            this.setData({
                status: "error",
                shareId: "",
                share: null,
                errorText: DEFAULT_ERROR_TEXT,
                errorDesc: DEFAULT_ERROR_DESC
            });
            return;
        }

        this.loadShareDetail(shareId);
    },

    async loadShareDetail(shareId) {
        this.setData({
            status: "loading",
            shareId,
            share: null,
            errorText: "",
            errorDesc: ""
        });

        try {
            const rawShare = await getShare(shareId, { trackView: true });
            const share = normalizeShare(rawShare || {}, shareId);

            if (share.shareStatus !== "active") {
                this.setData({
                    status: "error",
                    share: null,
                    errorText: DEFAULT_ERROR_TEXT,
                    errorDesc: DEFAULT_ERROR_DESC
                });
                return;
            }

            this.setData({
                status: "success",
                share,
                errorText: "",
                errorDesc: "",
                primaryActionTitle: share.visitorRole === "owner" ? "查看这份作品" : "我也想生成宠物数字形象",
                primaryActionDesc: share.visitorRole === "owner" ? "这是你分享出去的作品，可回到作品详情继续管理。" : "先了解这份分享作品，再开始自己的创作。",
                primaryActionText: share.visitorRole === "owner" ? "查看我的作品" : "立即体验",
                secondaryActionText: share.visitorRole === "owner" ? "返回作品首页" : "返回作品首页"
            });
        }
        catch (error) {
            console.error("load share detail failed", error);
            this.setData({
                status: "error",
                share: null,
                errorText: DEFAULT_ERROR_TEXT,
                errorDesc: DEFAULT_ERROR_DESC
            });
        }
    },

    handleBack() {
        const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
        if (pages.length > 1) {
            navigation.back();
            return;
        }
        this.handleGoWorks();
    },

    handleEnterConversion() {
        const share = this.data.share;
        if (share && share.visitorRole === "owner") {
            if (share.workId) {
                navigation.navigate(WORK_DETAIL_PATH, {
                    workId: share.workId
                });
                return;
            }

            this.handleGoWorks();
            return;
        }

        navigation.navigate("/pages/share/conversion/index", {
            shareId: this.data.shareId
        });
    },

    handleGoWorks() {
        navigation.switchTab(WORKS_HOME_PATH);
    },

    handleGoCases() {
        navigation.switchTab(CASES_HOME_PATH);
    },

    onShareAppMessage() {
        const share = this.data.share;

        if (share) {
            return {
                title: share.title || DEFAULT_SHARE_TITLE,
                path: `/pages/share/landing/index?shareId=${encodeURIComponent(share.shareId || this.data.shareId)}`,
                imageUrl: share.imageUrl || DEFAULT_SHARE_IMAGE
            };
        }

        return {
            title: DEFAULT_SHARE_TITLE,
            path: "/pages/share/landing/index",
            imageUrl: DEFAULT_SHARE_IMAGE
        };
    }
});
