"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const works = db.collection("works");
const workVersions = db.collection("workVersions");
const shares = db.collection("shares");
const SHARE_EXPIRE_DAYS = 30;
const SHAREABLE_WORK_STATUSES = ["ready", "retouched"];
const DEFAULT_SHARE_DESCRIPTION = "这是由 Petmate 生成的宠物数字形象作品。";

function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function createShareId() {
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `share_${Date.now()}_${randomPart}`;
}

function fail(errorCode, message) {
    return {
        ok: false,
        errorCode,
        message
    };
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

function resolveVersionImage(version) {
    const previewMedia = (version && version.previewMedia) || {};
    return normalizeString(previewMedia.cover) ||
        normalizeString(previewMedia.poster) ||
        normalizeString(previewMedia.url) ||
        normalizeString(version && version.previewImage) ||
        "";
}

function buildConversionSteps() {
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

function buildShareSnapshots(work, snapshot) {
    const previewSnapshot = {
        title: snapshot.title,
        summary: snapshot.description,
        petName: snapshot.petName,
        petType: normalizeString(work.petType),
        petTypeLabel: normalizeString(work.petTypeLabel),
        image: snapshot.imageUrl,
        statusText: "作品可预览",
        tags: ["作品可预览", "好友分享"],
        featureItems: [
            { icon: "▣", title: "猫狗数字形象", desc: "由 AI 生成" },
            { icon: "◇", title: "支持 AR 展示", desc: "带进真实空间" },
            { icon: "♡", title: "可分享与回看", desc: "记录宠物形象" }
        ]
    };

    const conversionSnapshot = {
        heroImage: snapshot.imageUrl,
        heroSubtitleLines: [
            "这是好友生成的宠物数字形象",
            "你也可以上传猫狗照片生成专属形象"
        ],
        questionText: "也想让你的猫狗变成数字形象吗？",
        primaryCtaText: "开始生成我的宠物",
        secondaryCtaText: "先看看案例",
        tipText: "上传清晰正脸照片，生成效果会更稳定。",
        steps: buildConversionSteps()
    };

    return {
        previewSnapshot,
        conversionSnapshot
    };
}

async function loadActiveWork(OPENID, workId) {
    const result = await works
        .where({
            ownerOpenid: OPENID,
            workId,
            status: _.in(SHAREABLE_WORK_STATUSES)
        })
        .limit(1)
        .get();

    return result.data && result.data[0];
}

async function loadCurrentVersion(OPENID, work) {
    const versionId = normalizeString(work && work.currentVersionId);

    if (!versionId) {
        return null;
    }

    try {
        const result = await workVersions
            .where({
                ownerOpenid: OPENID,
                workId: work.workId,
                versionId,
                status: "active"
            })
            .limit(1)
            .get();

        return (result.data && result.data[0]) || null;
    }
    catch (error) {
        console.error("load current work version failed", error);
        return null;
    }
}

async function findReusableShare(query, nowTime) {
    const result = await shares
        .where(query)
        .limit(20)
        .get();

    const shareList = result.data || [];
    const reusableShare = shareList.find((share) => toTime(share.expiredAt) > nowTime);

    if (reusableShare) {
        return reusableShare;
    }

    const expiredShare = shareList.find((share) => share && share._id);
    if (expiredShare) {
        await shares.doc(expiredShare._id).update({
            data: {
                status: "expired",
                updatedAt: new Date()
            }
        });
    }

    return null;
}

exports.main = async (event = {}) => {
    try {
        const { OPENID } = cloud.getWXContext();
        const workId = normalizeString(event.workId);

        if (!OPENID || !workId) {
            return fail("SHARE_WORK_NOT_FOUND", "作品不存在或暂时不能分享");
        }

        const work = await loadActiveWork(OPENID, workId);

        if (!work) {
            return fail("SHARE_WORK_NOT_FOUND", "作品不存在或暂时不能分享");
        }

        const version = await loadCurrentVersion(OPENID, work);
        const petName = normalizeString(work.petName) ||
            normalizeString(event.petName) ||
            normalizeString(work.displayName) ||
            "宠物";
        const title = normalizeString(event.title) || `${petName}的宠物数字形象`;
        const imageUrl = normalizeString(work.previewImage) ||
            resolveVersionImage(version) ||
            normalizeString(event.imageUrl);
        const description = normalizeString(event.description) || DEFAULT_SHARE_DESCRIPTION;

        if (!imageUrl) {
            return fail("SHARE_IMAGE_REQUIRED", "作品封面暂不可用，无法分享");
        }

        const sourceVersionId = normalizeString(work.currentVersionId);
        const now = new Date();
        const expiredAt = new Date(now.getTime() + SHARE_EXPIRE_DAYS * 24 * 60 * 60 * 1000);
        const snapshots = buildShareSnapshots(work, {
            title,
            petName,
            imageUrl,
            description
        });
        const reusableShare = await findReusableShare({
            ownerOpenid: OPENID,
            workId,
            sourceVersionId,
            status: "active"
        }, now.getTime());

        if (reusableShare) {
            const shareId = reusableShare.shareId;
            await shares.doc(reusableShare._id).update({
                data: {
                    title,
                    petName,
                    imageUrl,
                    description,
                    previewSnapshot: snapshots.previewSnapshot,
                    conversionSnapshot: snapshots.conversionSnapshot,
                    updatedAt: now
                }
            });

            return {
                ok: true,
                data: {
                    shareId,
                    workId,
                    title,
                    imageUrl,
                    path: `/pages/share/landing/index?shareId=${encodeURIComponent(shareId)}`,
                    reused: true
                }
            };
        }

        const shareId = createShareId();
        await shares.add({
            data: {
                shareId,
                workId,
                sourceVersionId,
                ownerOpenid: OPENID,
                title,
                petName,
                imageUrl,
                description,
                previewSnapshot: snapshots.previewSnapshot,
                conversionSnapshot: snapshots.conversionSnapshot,
                status: "active",
                viewCount: 0,
                createdAt: now,
                updatedAt: now,
                expiredAt
            }
        });

        return {
            ok: true,
            data: {
                shareId,
                workId,
                title,
                imageUrl,
                path: `/pages/share/landing/index?shareId=${encodeURIComponent(shareId)}`,
                reused: false
            }
        };
    }
    catch (error) {
        console.error("createShare failed", error);
        return fail("CREATE_SHARE_FAILED", "创建分享失败，请稍后重试");
    }
};
