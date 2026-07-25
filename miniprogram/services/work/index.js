"use strict";

const cloudWork = require("../cloud/work");
const { getServiceMode } = require("../runtime");

const workMode = getServiceMode("work");
// workMode is cloud-with-local-fallback by default; keep pages/flows on this unified entry.

function getErrorMessage(error, fallback) {
    return error && error.message ? error.message : fallback;
}

async function saveWorkBundle(payload) {
    try {
        return await cloudWork.saveWorkBundle(payload);
    } catch (error) {
        console.error("saveWorkBundle service failed", error);
        return {
            ok: false,
            errorCode: "SAVE_WORK_UNAVAILABLE",
            message: getErrorMessage(error, "作品保存失败")
        };
    }
}

async function listWorks() {
    try {
        return await cloudWork.listWorks();
    } catch (error) {
        console.error("listWorks service failed", error);
        return {
            ok: false,
            errorCode: "LIST_WORKS_UNAVAILABLE",
            message: getErrorMessage(error, "云端作品读取失败")
        };
    }
}

async function getWork(workId) {
    try {
        return await cloudWork.getWork(workId);
    } catch (error) {
        console.error("getWork service failed", error);
        return {
            ok: false,
            errorCode: "GET_WORK_UNAVAILABLE",
            message: getErrorMessage(error, "作品读取失败")
        };
    }
}

async function deleteWork(workId) {
    try {
        return await cloudWork.deleteWork(workId);
    } catch (error) {
        console.error("deleteWork service failed", error);
        return {
            ok: false,
            errorCode: "DELETE_WORK_UNAVAILABLE",
            message: getErrorMessage(error, "删除失败，请稍后重试")
        };
    }
}

module.exports = {
    saveWorkBundle,
    listWorks,
    getWork,
    deleteWork
};
