"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const shares = db.collection("shares");
const works = db.collection("works");
const EXPIRED_MESSAGE = "分享内容不存在或已失效";
const WORK_UNAVAILABLE_MESSAGE = "分享作品已失效";
const SHAREABLE_WORK_STATUSES = ["ready", "retouched"];
const DEFAULT_SHARE_IMAGE = "/assets/mock/pet-corgi-hero.png";
const DEFAULT_SHARE_TITLE = "Petmate 宠物数字形象作品";
const DEFAULT_SHARE_DESCRIPTION = "这是由 Petmate 生成的宠物数字形象作品。";

function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function toTime(value) {
    if (!value) {
        return 0;
    }

    if (value instanceof Date) {
        return value.getTime();
    }

    if (typeof value === "number") {
        return value;
    }

    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
}

function fail(errorCode, message) {
    return {
        ok: false,
        errorCode,
        message
    };
}

function asArray(value, fallback) {
    return Array.isArray(value) && value.length ? value : fallback;
}

function buildDefaultSteps() {
    return [
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
}

async function markShareExpired(share) {
    if (!share || !share._id) {
        return;
    }

    try {
        await shares.doc(share._id).update({
            data: {
                status: "expired",
                updatedAt: new Date()
            }
        });
    }
    catch (error) {
        console.error("mark share expired failed", error);
    }
}

async function loadShare(shareId) {
    const result = await shares
        .where({
            shareId,
            status: "active"
        })
        .limit(1)
        .get();

    return result.data && result.data[0];
}

async function loadShareWork(share) {
    if (!share || !share.ownerOpenid || !share.workId) {
        return null;
    }

    const result = await works
        .where({
            ownerOpenid: share.ownerOpenid,
            workId: share.workId,
            status: _.neq("deleted")
        })
        .limit(1)
        .get();

    return result.data && result.data[0];
}

async function trackShareView(share) {
    const viewedAt = new Date();

    await shares.doc(share._id).update({
        data: {
            viewCount: _.inc(1),
            lastViewedAt: viewedAt
        }
    });

    return viewedAt;
}

function buildPreview(share, title, petName, imageUrl, description) {
    const snapshot = share.previewSnapshot || {};
    const tags = asArray(snapshot.tags, ["作品可预览", "好友分享"]);
    const featureItems = asArray(snapshot.featureItems, [
        { icon: "▣", title: "猫狗数字形象", desc: "由 AI 生成" },
        { icon: "◇", title: "支持 AR 展示", desc: "带进真实空间" },
        { icon: "♡", title: "可分享与回看", desc: "记录宠物形象" }
    ]);

    return {
        title: normalizeString(snapshot.title) || title,
        summary: normalizeString(snapshot.summary) || description,
        ownerNickname: normalizeString(snapshot.ownerNickname) || "Petmate 用户",
        ownerAvatar: normalizeString(snapshot.ownerAvatar) || imageUrl,
        petName: normalizeString(snapshot.petName) || petName,
        petType: normalizeString(snapshot.petType) || "",
        petTypeLabel: normalizeString(snapshot.petTypeLabel) || "",
        generatedBy: normalizeString(snapshot.generatedBy) || "Petmate",
        canPreview: snapshot.canPreview === false ? false : true,
        statusText: normalizeString(snapshot.statusText) || "作品可预览",
        tags,
        featureItems,
        authorCta: normalizeString(snapshot.authorCta) || "查看我的作品",
        image: normalizeString(snapshot.image) || imageUrl
    };
}

function buildConversion(share, imageUrl) {
    const snapshot = share.conversionSnapshot || {};

    return {
        heroImage: normalizeString(snapshot.heroImage) || imageUrl,
        heroSubtitleLines: asArray(snapshot.heroSubtitleLines, [
            "这是好友生成的宠物数字形象",
            "你也可以上传猫狗照片生成专属形象"
        ]),
        questionText: normalizeString(snapshot.questionText) || "也想让你的猫狗变成数字形象吗？",
        primaryCtaText: normalizeString(snapshot.primaryCtaText) || "开始生成我的宠物",
        secondaryCtaText: normalizeString(snapshot.secondaryCtaText) || "先看看案例",
        tipText: normalizeString(snapshot.tipText) || "上传清晰正脸照片，生成效果会更稳定。",
        steps: asArray(snapshot.steps, buildDefaultSteps())
    };
}

function buildResponseData(share, viewerOpenid, tracked) {
    const title = normalizeString(share.title) || DEFAULT_SHARE_TITLE;
    const petName = normalizeString(share.petName);
    const imageUrl = normalizeString(share.imageUrl) ||
        normalizeString(share.previewSnapshot && share.previewSnapshot.image) ||
        DEFAULT_SHARE_IMAGE;
    const description = normalizeString(share.description) || DEFAULT_SHARE_DESCRIPTION;
    const viewCount = Math.max(0, Number(share.viewCount) || 0) + (tracked ? 1 : 0);

    return {
        shareId: share.shareId,
        workId: share.workId,
        sourceVersionId: normalizeString(share.sourceVersionId),
        shareStatus: "active",
        visitorRole: viewerOpenid && viewerOpenid === share.ownerOpenid ? "owner" : "new_user",
        title,
        petName,
        imageUrl,
        description,
        createdAt: share.createdAt,
        expiredAt: share.expiredAt,
        viewCount,
        preview: buildPreview(share, title, petName, imageUrl, description),
        conversion: buildConversion(share, imageUrl)
    };
}

exports.main = async (event = {}) => {
    try {
        const { OPENID } = cloud.getWXContext();
        const shareId = normalizeString(event.shareId);
        const shouldTrackView = event.trackView !== false;

        if (!shareId) {
            return fail("SHARE_NOT_FOUND", EXPIRED_MESSAGE);
        }

        const share = await loadShare(shareId);

        if (!share) {
            return fail("SHARE_NOT_FOUND", EXPIRED_MESSAGE);
        }

        if (toTime(share.expiredAt) <= Date.now()) {
            await markShareExpired(share);
            return fail("SHARE_EXPIRED", EXPIRED_MESSAGE);
        }

        const work = await loadShareWork(share);

        if (!work || !SHAREABLE_WORK_STATUSES.includes(work.status)) {
            await markShareExpired(share);
            return fail("SHARE_WORK_UNAVAILABLE", WORK_UNAVAILABLE_MESSAGE);
        }

        if (shouldTrackView) {
            await trackShareView(share);
        }

        return {
            ok: true,
            data: buildResponseData(share, OPENID, shouldTrackView)
        };
    }
    catch (error) {
        console.error("getShare failed", error);
        return fail("GET_SHARE_FAILED", EXPIRED_MESSAGE);
    }
};
