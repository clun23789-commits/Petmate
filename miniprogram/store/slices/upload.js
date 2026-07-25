"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialUploadState = void 0;
const createInitialUploadState = () => ({
    assets: [],
    qualityCheckStatus: "pending",
    missingViews: [],
    supplementMode: false,
    uploadDraftWorkId: "",
    latestActionMessage: "",
    latestFailureReason: "",
    uploadSubmitStatus: "idle",
    uploadSubmitError: ""
});
exports.createInitialUploadState = createInitialUploadState;
