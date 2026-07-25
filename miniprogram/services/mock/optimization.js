"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSuggestions = resolveSuggestions;
exports.isValidOptimizeFeedback = isValidOptimizeFeedback;
exports.createReservation = createReservation;
const feedback_rules_1 = require("../../mocks/fixtures/feedback-rules");
const id_1 = require("../../utils/id");
function resolveSuggestions(feedback) {
    return Object.entries(feedback)
        .filter(([, item]) => (item === null || item === void 0 ? void 0 : item.value) === "unlike")
        .map(([dimension]) => feedback_rules_1.FEEDBACK_RULES[dimension])
        .filter(Boolean);
}
function isValidOptimizeFeedback(feedback) {
    return Object.values(feedback).some((item) => (item === null || item === void 0 ? void 0 : item.value) === "unlike");
}
function createReservation(workId, source, dimensionSet) {
    return {
        reservationId: (0, id_1.createId)("reservation"),
        workId,
        taskId: "",
        source,
        status: "reserved",
        dimensionSet
    };
}
