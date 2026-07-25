"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialPaymentState = void 0;
const createInitialPaymentState = () => ({
    orderMap: {},
    currentOrderId: "",
    paymentStatus: "idle",
    entitlementSyncStatus: "none"
});
exports.createInitialPaymentState = createInitialPaymentState;
