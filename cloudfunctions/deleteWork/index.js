"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const works = db.collection("works");
const shares = db.collection("shares");
const arEntitlements = db.collection("arEntitlements");

function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function notFound() {
    return {
        ok: false,
        errorCode: "WORK_NOT_FOUND",
        message: "作品不存在或已删除"
    };
}

function fail(error) {
    console.error("deleteWork failed", error);
    return {
        ok: false,
        errorCode: "DELETE_WORK_FAILED",
        message: "删除失败，请稍后重试"
    };
}

exports.main = async (event = {}) => {
    try {
        const { OPENID } = cloud.getWXContext();
        const workId = normalizeString(event.workId);

        if (!OPENID || !workId) {
            return notFound();
        }

        const result = await works
            .where({
                ownerOpenid: OPENID,
                workId,
                status: _.neq("deleted")
            })
            .limit(1)
            .get();
        const work = result.data && result.data[0];

        if (!work) {
            return notFound();
        }

        const deletedAt = new Date();
        await works.doc(work._id).update({
            data: {
                status: "deleted",
                deletedAt,
                updatedAt: deletedAt
            }
        });

        let expiredShares = 0;
        let revokedEntitlements = 0;
        const cleanupWarnings = [];
        try {
            const shareResult = await shares
                .where({
                    ownerOpenid: OPENID,
                    workId,
                    status: "active"
                })
                .update({
                    data: {
                        status: "expired",
                        expiredAt: deletedAt,
                        updatedAt: deletedAt
                    }
                });
            expiredShares = (shareResult.stats && shareResult.stats.updated) || 0;
        } catch (shareError) {
            console.error("expire shares during deleteWork failed", shareError);
            cleanupWarnings.push("EXPIRE_SHARES_FAILED");
        }

        try {
            const entitlementResult = await arEntitlements
                .where({
                    openid: OPENID,
                    workId,
                    status: "active"
                })
                .update({
                    data: {
                        status: "revoked",
                        revokedAt: deletedAt,
                        revokeReason: "work_deleted",
                        updatedAt: deletedAt
                    }
                });
            revokedEntitlements = (entitlementResult.stats && entitlementResult.stats.updated) || 0;
        } catch (entitlementError) {
            console.error("revoke ar entitlements during deleteWork failed", entitlementError);
            cleanupWarnings.push("REVOKE_AR_ENTITLEMENTS_FAILED");
        }

        return {
            ok: true,
            data: {
                workId,
                deletedAt,
                expiredShares,
                revokedEntitlements,
                cleanupWarnings
            }
        };
    }
    catch (error) {
        return fail(error);
    }
};
