"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialGenerationState = void 0;
const createInitialGenerationState = () => ({
    taskMap: {},
    activeTaskId: "",
    currentPhase: "idle",
    failureReason: "",
    lastTaskSyncedAt: "",
    lastFailureCode: "",
    lastFailureCategory: "",
    progress: 0
});
exports.createInitialGenerationState = createInitialGenerationState;
