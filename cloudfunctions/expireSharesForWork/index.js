"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const shares = db.collection("shares");

function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}

exports.main = async (event = {}) => {
    try {
        const workId = normalizeString(event.workId);

        if (!workId) {
            return {
                ok: false,
                message: "workId 为必填项"
            };
        }

        const { OPENID } = cloud.getWXContext();
        const expiredAt = new Date();
        const result = await shares
            .where({
                workId,
                ownerOpenid: OPENID,
                status: "active"
            })
            .update({
                data: {
                    status: "expired",
                    expiredAt,
                    updatedAt: expiredAt
                }
            });

        return {
            ok: true,
            data: {
                workId,
                updated: (result.stats && result.stats.updated) || 0
            }
        };
    }
    catch (error) {
        console.error("expireSharesForWork failed", error);
        return {
            ok: false,
            message: error && error.message ? error.message : "分享失效处理失败"
        };
    }
};
