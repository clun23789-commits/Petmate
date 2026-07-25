"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const works = db.collection("works");
const workVersions = db.collection("workVersions");
const WORK_STATUS_SET = new Set(["uploading", "generating", "ready", "failed", "retouched", "draft"]);
const VERSION_STATUS_SET = new Set(["active"]);
const VERSION_SOURCE_TYPE_SET = new Set(["initial", "optimize", "targeted_upload", "detail_retouch"]);

function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mergePreviewMedia(incomingPreviewMedia, existingPreviewMedia) {
    const incoming = normalizeObject(incomingPreviewMedia);
    const existing = normalizeObject(existingPreviewMedia);
    return {
        ...existing,
        ...incoming
    };
}

function normalizeArray(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function normalizeDate(value, fallback) {
    if (!value) {
        return fallback;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? fallback : value;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function stripCloudControlledFields(source) {
    const result = {
        ...normalizeObject(source)
    };
    delete result._id;
    delete result._openid;
    delete result.ownerOpenid;
    return result;
}

function normalizeStatus(value, allowedSet, fallback) {
    const status = normalizeString(value);
    return allowedSet.has(status) ? status : fallback;
}

function buildWorkDoc(inputWork, inputVersion, ownerOpenid, existingWork) {
    const now = new Date();
    const work = stripCloudControlledFields(inputWork);
    const version = normalizeObject(inputVersion);
    const existing = normalizeObject(existingWork);
    const workId = normalizeString(work.workId);
    const versionId = normalizeString(version.versionId);
    const versionIds = normalizeArray(work.versionIds || existing.versionIds);

    if (versionId && versionIds.indexOf(versionId) === -1) {
        versionIds.push(versionId);
    }

    return {
        ...work,
        workId,
        ownerOpenid,
        petType: normalizeString(work.petType) || existing.petType || "cat",
        petTypeLabel: normalizeString(work.petTypeLabel) || existing.petTypeLabel || "",
        petName: normalizeString(work.petName) || existing.petName || "当前宠物作品",
        displayName: normalizeString(work.displayName) || existing.displayName || "",
        status: normalizeStatus(work.status, WORK_STATUS_SET, WORK_STATUS_SET.has(existing.status) ? existing.status : "ready"),
        currentVersionId: normalizeString(work.currentVersionId) || existing.currentVersionId || versionId,
        versionIds,
        previewImage: normalizeString(work.previewImage) || existing.previewImage || (version.previewMedia && version.previewMedia.cover) || "",
        source: normalizeString(work.source) || existing.source || "mock_generation",
        createdAt: normalizeDate(work.createdAt || existing.createdAt, now),
        updatedAt: now,
        deletedAt: work.deletedAt ? normalizeDate(work.deletedAt, null) : existing.deletedAt || null
    };
}

function buildVersionDoc(inputVersion, workId, ownerOpenid, existingVersion) {
    const now = new Date();
    const version = stripCloudControlledFields(inputVersion);
    const existing = normalizeObject(existingVersion);

    return {
        ...version,
        versionId: normalizeString(version.versionId),
        workId,
        ownerOpenid,
        sourceType: normalizeStatus(version.sourceType, VERSION_SOURCE_TYPE_SET, VERSION_SOURCE_TYPE_SET.has(existing.sourceType) ? existing.sourceType : "initial"),
        previewMedia: mergePreviewMedia(version.previewMedia, existing.previewMedia),
        feedbackSummary: normalizeObject(version.feedbackSummary || existing.feedbackSummary),
        editableTexture: {
            baseColor: "#c6a38a",
            notes: [],
            ...normalizeObject(existing.editableTexture),
            ...normalizeObject(version.editableTexture)
        },
        status: normalizeStatus(version.status, VERSION_STATUS_SET, VERSION_STATUS_SET.has(existing.status) ? existing.status : "active"),
        createdAt: normalizeDate(version.createdAt || existing.createdAt, now),
        updatedAt: now
    };
}

function validateWorkVersionLink(work, versionId) {
    const currentVersionId = normalizeString(work.currentVersionId);
    const versionIds = normalizeArray(work.versionIds);

    if (!currentVersionId) {
        return "";
    }

    if (currentVersionId === versionId || versionIds.indexOf(versionId) >= 0) {
        return "";
    }

    return "作品版本信息不一致，保存失败";
}

function fail(error) {
    console.error("saveWork failed", error);
    return {
        ok: false,
        errorCode: "SAVE_WORK_FAILED",
        message: "作品保存失败"
    };
}

function failWith(errorCode, message, error) {
    if (error) {
        console.error("saveWork failed", error);
    }
    return {
        ok: false,
        errorCode,
        message
    };
}

exports.main = async (event = {}) => {
    try {
        const { OPENID } = cloud.getWXContext();
        const work = normalizeObject(event.work);
        const version = normalizeObject(event.version);
        const workId = normalizeString(work.workId);
        const versionId = normalizeString(version.versionId);
        const inputVersionWorkId = normalizeString(version.workId);

        if (!OPENID || !workId || !versionId) {
            return failWith("SAVE_WORK_INVALID_PAYLOAD", "作品信息不完整，保存失败", new Error("OPENID、work.workId、version.versionId 为必填项"));
        }

        if (inputVersionWorkId && inputVersionWorkId !== workId) {
            return failWith("VERSION_WORK_MISMATCH", "作品版本归属异常，保存失败");
        }

        const existingWorkResult = await works
            .where({
                ownerOpenid: OPENID,
                workId
            })
            .limit(1)
            .get();
        const existingWork = existingWorkResult.data && existingWorkResult.data[0];

        if (existingWork && existingWork.status === "deleted") {
            return failWith("WORK_ALREADY_DELETED", "作品已删除，不能继续保存");
        }

        const existingVersionResult = await workVersions
            .where({
                ownerOpenid: OPENID,
                versionId
            })
            .limit(1)
            .get();
        const existingVersion = existingVersionResult.data && existingVersionResult.data[0];

        if (existingVersion && normalizeString(existingVersion.workId) && normalizeString(existingVersion.workId) !== workId) {
            return failWith("VERSION_WORK_MISMATCH", "作品版本归属异常，保存失败");
        }

        const linkError = validateWorkVersionLink(work, versionId);
        if (linkError) {
            return failWith("VERSION_WORK_MISMATCH", linkError);
        }

        const workDoc = buildWorkDoc(work, version, OPENID, existingWork);
        const versionDoc = buildVersionDoc(version, workId, OPENID, existingVersion);

        if (existingWork) {
            await works.doc(existingWork._id).update({
                data: workDoc
            });
        } else {
            await works.add({
                data: workDoc
            });
        }

        if (existingVersion) {
            await workVersions.doc(existingVersion._id).update({
                data: versionDoc
            });
        } else {
            await workVersions.add({
                data: versionDoc
            });
        }

        return {
            ok: true,
            data: {
                workId,
                versionId,
                savedAt: workDoc.updatedAt
            }
        };
    }
    catch (error) {
        return fail(error);
    }
};
