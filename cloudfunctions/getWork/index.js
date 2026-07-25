"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const works = db.collection("works");
const workVersions = db.collection("workVersions");

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
    console.error("getWork failed", error);
    return {
        ok: false,
        errorCode: "GET_WORK_FAILED",
        message: "作品读取失败"
    };
}

exports.main = async (event = {}) => {
    try {
        const { OPENID } = cloud.getWXContext();
        const workId = normalizeString(event.workId);

        if (!OPENID || !workId) {
            return notFound();
        }

        const worksResult = await works
            .where({
                ownerOpenid: OPENID,
                workId,
                status: _.neq("deleted")
            })
            .limit(1)
            .get();
        const work = worksResult.data && worksResult.data[0];

        if (!work) {
            return notFound();
        }

        const versionsResult = await workVersions
            .where({
                ownerOpenid: OPENID,
                workId,
                status: _.neq("deleted")
            })
            .orderBy("createdAt", "asc")
            .get();

        return {
            ok: true,
            data: {
                work,
                versions: versionsResult.data || []
            }
        };
    }
    catch (error) {
        return fail(error);
    }
};
