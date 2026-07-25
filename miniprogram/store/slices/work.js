"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialWorkState = void 0;
const createInitialWorkState = () => ({
    workMap: {},
    versionMap: {},
    workOrder: [],
    currentWorkId: "",
    currentVersionId: "",
    activeWorkStatus: "idle",
    cloudListStatus: "idle",
    cloudDetailStatus: "idle",
    cloudSaveStatusMap: {},
    cloudDeleteStatusMap: {},
    cloudError: "",
    lastCloudSyncedAt: "",
    pendingCloudSave: null
});
exports.createInitialWorkState = createInitialWorkState;
