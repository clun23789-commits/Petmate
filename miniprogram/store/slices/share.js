"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialShareState = void 0;
const createInitialShareState = () => ({
    entrySource: "none",
    visitorRole: "guest",
    sharedWorkId: "",
    shareStatus: "idle"
});
exports.createInitialShareState = createInitialShareState;
