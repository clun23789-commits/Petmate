"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialOptimizeState = void 0;
const createInitialOptimizeState = () => ({
    grantedCount: 0,
    usedCount: 0,
    reservedCount: 0,
    quotaSyncStatus: "idle",
    quotaError: "",
    lastQuotaSyncedAt: "",
    reservationMap: {},
    lastSuggestionMap: {}
});
exports.createInitialOptimizeState = createInitialOptimizeState;
