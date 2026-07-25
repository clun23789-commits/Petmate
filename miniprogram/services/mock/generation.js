"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startGenerationTask = startGenerationTask;
exports.pollGenerationTask = pollGenerationTask;
exports.clearTasksByWorkId = clearTasksByWorkId;
const generation_phases_1 = require("../../mocks/fixtures/generation-phases");
const createStore_1 = require("../../store/core/createStore");
const id_1 = require("../../utils/id");
const runtimeTaskMap = {};
function getProgressByPhase(phase) {
    const progressMap = {
        queued: 0,
        fetching_assets: 35,
        finalizing: 85,
        completed: 100,
        failed: 100,
        timeout: 100
    };
    return progressMap[phase] === undefined ? 0 : progressMap[phase];
}
function buildMockGenerationResponse(task, completedVersion) {
    return Promise.resolve({
        task,
        completedVersion: task && task.status === "success" ? completedVersion || null : null,
        work: null,
        cloudFinalized: false,
        resultSaveStatus: "idle"
    });
}
function hydrateRuntimeTask(taskId) {
    const state = createStore_1.store.getState();
    const task = state.generationState.taskMap[taskId];
    if (!task) {
        return null;
    }
    const phaseStep = generation_phases_1.GENERATION_PHASES.indexOf(task.phase);
    const reservation = task.reservationId ? state.optimizeState.reservationMap[task.reservationId] : null;
    const runtime = {
        task,
        step: Math.max(0, phaseStep),
        dimensionSet: (reservation === null || reservation === void 0 ? void 0 : reservation.dimensionSet) || [],
        simulateFailure: task.status === "failed",
        completedVersion: task.targetVersionId ? state.workState.versionMap[task.targetVersionId] || null : null
    };
    runtimeTaskMap[taskId] = runtime;
    return runtime;
}
function createPreview(operationType) {
    if (operationType === "targeted_upload") {
        return {
            cover: "/assets/mock/pet-corgi-hero.png",
            modelHint: "已根据补充照片整理出新的作品结果",
            colorway: "保留当前作品基础，并参考补图调整可见细节"
        };
    }
    if (operationType === "optimize") {
        return {
            cover: "/assets/mock/pet-cat-hero.png",
            modelHint: "已根据反馈整理出新的作品结果",
            colorway: "围绕本次反馈整理主要颜色、花纹与轮廓参考"
        };
    }
    return {
        cover: "/assets/mock/pet-cat-hero.png",
        modelHint: "已根据上传照片生成基础作品结果",
        colorway: "优先参考主图照片，并保留可继续优化的细节记录"
    };
}
async function startGenerationTask(params) {
    const taskId = (0, id_1.createId)("task");
    const task = {
        taskId,
        workId: params.workId,
        targetVersionId: "",
        operationType: params.operationType,
        phase: "queued",
        status: "pending",
        provider: "basic_generation",
        providerStatus: "queued",
        progress: 0,
        failureCode: "",
        failureCategory: "none",
        failureReason: "",
        recoverable: true,
        resultSaveStatus: "idle",
        finalizedWorkId: "",
        finalizedVersionId: "",
        reservationId: params.reservationId
    };
    runtimeTaskMap[taskId] = {
        task,
        step: 0,
        dimensionSet: params.dimensionSet || [],
        simulateFailure: Boolean(params.simulateFailure),
        completedVersion: null
    };
    return Promise.resolve(task);
}
async function pollGenerationTask(taskId) {
    const runtime = runtimeTaskMap[taskId] || hydrateRuntimeTask(taskId);
    if (!runtime) {
        return buildMockGenerationResponse(null, null);
    }
    if (runtime.task.status === "failed" || runtime.task.status === "success") {
        return buildMockGenerationResponse(runtime.task, runtime.completedVersion);
    }
    runtime.step += 1;
    const nextPhase = generation_phases_1.GENERATION_PHASES[Math.min(runtime.step, generation_phases_1.GENERATION_PHASES.length - 1)];
    runtime.task = {
        ...runtime.task,
        phase: nextPhase,
        status: nextPhase === "completed" ? "success" : "running",
        providerStatus: nextPhase === "completed" ? "succeeded" : "running",
        progress: getProgressByPhase(nextPhase)
    };
    if (runtime.simulateFailure && runtime.step >= generation_phases_1.GENERATION_PHASES.length - 2) {
        runtime.task = {
            ...runtime.task,
            phase: "failed",
            status: "failed",
            providerStatus: "failed",
            progress: 100,
            failureCode: "GENERATION_RESULT_INVALID",
            failureCategory: "result",
            failureReason: "本次结果没有成功返回，系统已保留你的当前权益与可用次数。",
            recoverable: true,
            resultSaveStatus: "idle"
        };
        return buildMockGenerationResponse(runtime.task, null);
    }
    if (nextPhase !== "completed") {
        return buildMockGenerationResponse(runtime.task, null);
    }
    const versionId = (0, id_1.createId)("version");
    const completedVersion = {
        versionId,
        workId: runtime.task.workId,
        sourceType: runtime.task.operationType === "initial" ? "initial" : runtime.task.operationType,
        previewMedia: createPreview(runtime.task.operationType),
        feedbackSummary: {},
        editableTexture: {
            baseColor: runtime.task.operationType === "optimize" ? "#d3b08f" : "#c6a38a",
            notes: runtime.dimensionSet.length
                ? runtime.dimensionSet.map((item) => `已围绕 ${item} 相关反馈整理本次作品`)
                : ["已完成本轮基础作品生成"]
        },
        createdAt: new Date().toISOString()
    };
    runtime.completedVersion = completedVersion;
    runtime.task = {
        ...runtime.task,
        targetVersionId: versionId,
        providerStatus: "succeeded",
        progress: 100,
        resultSaveStatus: "idle"
    };
    return buildMockGenerationResponse(runtime.task, completedVersion);
}
function clearTasksByWorkId(workId) {
    Object.keys(runtimeTaskMap).forEach((taskId) => {
        var _a;
        if (((_a = runtimeTaskMap[taskId]) === null || _a === void 0 ? void 0 : _a.task.workId) === workId) {
            delete runtimeTaskMap[taskId];
        }
    });
}
