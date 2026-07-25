"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hydrateState = hydrateState;
exports.persistState = persistState;
const storage_1 = require("../../utils/storage");
const { readPendingCloudSave } = require("../../utils/pendingCloudSaveStorage");
const PERSISTENT_KEY = "petmate:persistent";
const SESSION_KEY = "petmate:session";
const persistentSlices = [
    "userState",
    "workState",
    "trialState",
    "optimizeState",
    "paymentState",
    "arState",
    "shareState"
];
const sessionSlices = ["generationState"];
function pickSlices(state, keys) {
    const picked = {};
    keys.forEach((key) => {
        picked[key] = getPersistableSlice(key, state[key]);
    });
    return picked;
}
function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function mergeSlice(baseSlice, savedSlice) {
    if (!isPlainObject(baseSlice) || !isPlainObject(savedSlice)) {
        return savedSlice === undefined ? baseSlice : savedSlice;
    }
    return {
        ...baseSlice,
        ...savedSlice
    };
}
function mergeSavedState(baseState, savedState) {
    if (!isPlainObject(savedState)) {
        return baseState;
    }
    return Object.keys(savedState).reduce((nextState, key) => ({
        ...nextState,
        [key]: mergeSlice(baseState[key], savedState[key])
    }), baseState);
}
function getPersistableSlice(key, slice) {
    if (key !== "workState" || !isPlainObject(slice)) {
        return slice;
    }
    const nextWorkState = {
        ...slice
    };
    delete nextWorkState.pendingCloudSave;
    return nextWorkState;
}
function applyPendingCloudSaveStorage(state) {
    return {
        ...state,
        workState: {
            ...state.workState,
            pendingCloudSave: readPendingCloudSave()
        }
    };
}
function hydrateState(baseState) {
    const persisted = (0, storage_1.getStorageValue)(PERSISTENT_KEY, {});
    const session = (0, storage_1.getStorageValue)(SESSION_KEY, {});
    return applyPendingCloudSaveStorage(mergeSavedState(mergeSavedState(baseState, persisted), session));
}
function persistState(state) {
    (0, storage_1.setStorageValue)(PERSISTENT_KEY, pickSlices(state, persistentSlices));
    (0, storage_1.setStorageValue)(SESSION_KEY, pickSlices(state, sessionSlices));
}
