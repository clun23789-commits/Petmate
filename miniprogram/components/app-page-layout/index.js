"use strict";
const { safeBack } = require("../../utils/navigation");
Component({
    properties: {
        title: {
            type: String,
            value: ""
        },
        subtitle: {
            type: String,
            value: ""
        },
        showBack: {
            type: Boolean,
            value: false
        },
        showCapsule: {
            type: Boolean,
            value: true
        },
        safeArea: {
            type: Boolean,
            value: true
        },
        autoBack: {
            type: Boolean,
            value: true
        },
        backDelta: {
            type: Number,
            value: 1
        },
        fallbackPath: {
            type: String,
            value: "/pages/works/index/index"
        },
        fallbackMode: {
            type: String,
            value: "switchTab"
        },
        contentClass: {
            type: String,
            value: ""
        },
        layoutClass: {
            type: String,
            value: ""
        },
        navTone: {
            type: String,
            value: "default"
        },
        navSize: {
            type: String,
            value: "default"
        },
        navAlign: {
            type: String,
            value: "center"
        }
    },
    methods: {
        handleBack() {
            this.triggerEvent("back");
            if (!this.properties.autoBack) {
                return;
            }
            safeBack({
                delta: this.properties.backDelta,
                fallbackPath: this.properties.fallbackPath,
                fallbackMode: this.properties.fallbackMode
            });
        }
    }
});
