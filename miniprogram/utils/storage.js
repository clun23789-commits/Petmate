"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setStorageValue = setStorageValue;
exports.getStorageValue = getStorageValue;
exports.removeStorageValue = removeStorageValue;
const memoryStorage = {};
function setStorageValue(key, value) {
    if (typeof wx !== "undefined" && wx.setStorageSync) {
        wx.setStorageSync(key, value);
        return;
    }
    memoryStorage[key] = value;
}
function getStorageValue(key, fallback) {
    if (typeof wx !== "undefined" && wx.getStorageSync) {
        const stored = wx.getStorageSync(key);
        return stored === "" || stored === undefined ? fallback : stored;
    }
    return key in memoryStorage ? memoryStorage[key] : fallback;
}
function removeStorageValue(key) {
    if (typeof wx !== "undefined" && wx.removeStorageSync) {
        wx.removeStorageSync(key);
        return;
    }
    delete memoryStorage[key];
}
