"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const works = db.collection("works");
const workVersions = db.collection("workVersions");

function fail(error) {
    console.error("listWorks failed", error);
    return {
        ok: false,
        errorCode: "LIST_WORKS_FAILED",
        message: "云端作品读取失败"
    };
}

exports.main = async () => {
    try {
        const { OPENID } = cloud.getWXContext();

        if (!OPENID) {
            return fail(new Error("OPENID is empty"));
        }

        const worksResult = await works
            .where({
                ownerOpenid: OPENID,
                status: _.neq("deleted")
            })
            .orderBy("updatedAt", "desc")
            .limit(50)
            .get();
        const workList = worksResult.data || [];
        const workIds = workList.map((work) => work.workId).filter(Boolean);

        if (!workIds.length) {
            return {
                ok: true,
                data: {
                    works: [],
                    versions: []
                }
            };
        }

        const versionsResult = await workVersions
            .where({
                ownerOpenid: OPENID,
                workId: _.in(workIds),
                status: _.neq("deleted")
            })
            .get();

        return {
            ok: true,
            data: {
                works: workList,
                versions: versionsResult.data || []
            }
        };
    }
    catch (error) {
        return fail(error);
    }
};
