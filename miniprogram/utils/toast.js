"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showToast = showToast;
function showToast(title, icon = "none") {
    if (typeof wx !== "undefined" && wx.showToast) {
        wx.showToast({
            title,
            icon,
            duration: 1800
        });
    }
}
