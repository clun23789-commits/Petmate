"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const users = db.collection("users");

function createFailure(error) {
    console.error("syncUser failed", error);
    return {
        ok: false,
        errorCode: "SYNC_USER_FAILED",
        message: "用户同步失败"
    };
}

exports.main = async () => {
    try {
        const { OPENID } = cloud.getWXContext();

        if (!OPENID) {
            return createFailure(new Error("OPENID is empty"));
        }

        const now = new Date();
        const result = await users
            .where({
                openid: OPENID
            })
            .limit(1)
            .get();
        const existingUser = result.data && result.data[0];

        if (!existingUser) {
            const user = {
                openid: OPENID,
                nickname: "",
                avatarUrl: "",
                status: "active",
                createdAt: now,
                updatedAt: now
            };
            const addResult = await users.add({
                data: user
            });

            return {
                ok: true,
                data: {
                    openid: OPENID,
                    user: {
                        _id: addResult._id,
                        ...user
                    }
                }
            };
        }

        await users.doc(existingUser._id).update({
            data: {
                updatedAt: now
            }
        });

        return {
            ok: true,
            data: {
                openid: OPENID,
                user: {
                    ...existingUser,
                    updatedAt: now
                }
            }
        };
    }
    catch (error) {
        return createFailure(error);
    }
};
