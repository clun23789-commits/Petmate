"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createId = createId;
function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}
