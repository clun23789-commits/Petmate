"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.store = void 0;
exports.createInitialRootState = createInitialRootState;
const ar_1 = require("../slices/ar");
const generation_1 = require("../slices/generation");
const optimize_1 = require("../slices/optimize");
const payment_1 = require("../slices/payment");
const share_1 = require("../slices/share");
const trial_1 = require("../slices/trial");
const upload_1 = require("../slices/upload");
const user_1 = require("../slices/user");
const work_1 = require("../slices/work");
function createInitialRootState() {
    return {
        userState: (0, user_1.createInitialUserState)(),
        workState: (0, work_1.createInitialWorkState)(),
        trialState: (0, trial_1.createInitialTrialState)(),
        optimizeState: (0, optimize_1.createInitialOptimizeState)(),
        uploadState: (0, upload_1.createInitialUploadState)(),
        generationState: (0, generation_1.createInitialGenerationState)(),
        paymentState: (0, payment_1.createInitialPaymentState)(),
        arState: (0, ar_1.createInitialArState)(),
        shareState: (0, share_1.createInitialShareState)()
    };
}
class AppStore {
    constructor() {
        this.state = createInitialRootState();
        this.listeners = new Set();
    }
    getState() {
        return this.state;
    }
    replaceState(nextState, label = "replace") {
        const previousState = this.state;
        this.state = nextState;
        this.listeners.forEach((listener) => listener(this.state, previousState, label));
    }
    setState(updater, label = "setState") {
        const patch = typeof updater === "function" ? updater(this.state) : updater;
        this.replaceState({
            ...this.state,
            ...patch
        }, label);
    }
    dispatch(action) {
        if (typeof action === "function") {
            this.replaceState(action(this.state), "dispatch");
            return;
        }
        this.replaceState(action.reducer(this.state), action.type);
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}
exports.store = new AppStore();
