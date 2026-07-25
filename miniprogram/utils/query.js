"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildQuery = buildQuery;
exports.getStringParam = getStringParam;
function buildQuery(query = {}) {
    const parts = Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    return parts.length ? `?${parts.join("&")}` : "";
}
function getStringParam(options, key, fallback = "") {
    const value = options === null || options === void 0 ? void 0 : options[key];
    return typeof value === "string" && value.length ? value : fallback;
}
