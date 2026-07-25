"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindStore = bindStore;
const createStore_1 = require("./createStore");
function bindStore(page, selector) {
    const applyState = () => {
        if (!page || typeof page.setData !== "function") {
            return;
        }
        page.setData(selector(createStore_1.store.getState()));
    };
    applyState();
    const unsubscribe = createStore_1.store.subscribe(() => {
        applyState();
    });
    return unsubscribe;
}
