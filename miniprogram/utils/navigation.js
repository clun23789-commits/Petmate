"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toUrl = toUrl;
exports.navigate = navigate;
exports.replace = replace;
exports.relaunch = relaunch;
exports.switchTab = switchTab;
exports.back = back;
exports.safeBack = safeBack;
const query_1 = require("./query");
const { isTabRoute, normalizeRoute, normalizeUrl } = require("./routes");
function toUrl(path, query) {
    const url = normalizeUrl(path);
    const queryText = (0, query_1.buildQuery)(query);
    if (!queryText) {
        return url;
    }
    return url.indexOf("?") >= 0 ? `${url}&${queryText.slice(1)}` : `${url}${queryText}`;
}
function navigate(path, query) {
    const url = toUrl(path, query);
    if (isTabRoute(url)) {
        wx.switchTab({ url: normalizeRoute(url) });
        return;
    }
    wx.navigateTo({ url });
}
function replace(path, query) {
    const url = toUrl(path, query);
    if (isTabRoute(url)) {
        wx.switchTab({ url: normalizeRoute(url) });
        return;
    }
    wx.redirectTo({ url });
}
function relaunch(path, query) {
    const url = toUrl(path, query);
    if (isTabRoute(url)) {
        wx.switchTab({ url: normalizeRoute(url) });
        return;
    }
    wx.reLaunch({ url });
}
function switchTab(path) {
    wx.switchTab({ url: normalizeRoute(path) });
}
function back(delta = 1) {
    wx.navigateBack({ delta });
}
function safeBack(options = {}) {
    const delta = Math.max(Number(options.delta) || 1, 1);
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > delta) {
        wx.navigateBack({ delta });
        return;
    }
    const fallbackPath = options.fallbackPath || "/pages/works/index/index";
    if (isTabRoute(fallbackPath)) {
        wx.switchTab({ url: normalizeRoute(fallbackPath) });
        return;
    }
    const fallbackMode = options.fallbackMode || "switchTab";
    if (fallbackMode === "redirectTo") {
        wx.redirectTo({ url: fallbackPath });
        return;
    }
    if (fallbackMode === "navigateTo") {
        wx.navigateTo({ url: fallbackPath });
        return;
    }
    if (fallbackMode === "reLaunch") {
        wx.reLaunch({ url: fallbackPath });
        return;
    }
    wx.switchTab({ url: fallbackPath });
}
