"use strict";
Component({
    externalClasses: ["custom-class"],
    properties: {
        text: {
            type: String,
            value: ""
        },
        subtext: {
            type: String,
            value: ""
        },
        disabled: {
            type: Boolean,
            value: false
        },
        loading: {
            type: Boolean,
            value: false
        },
        block: {
            type: Boolean,
            value: true
        },
        size: {
            type: String,
            value: "large"
        },
        tone: {
            type: String,
            value: "brand"
        },
        openType: {
            type: String,
            value: ""
        },
        formType: {
            type: String,
            value: ""
        },
        hoverClass: {
            type: String,
            value: "button-hover"
        }
    },
    methods: {
        handleTap() {
            if (this.data.disabled || this.data.loading) {
                return;
            }
            this.triggerEvent("press");
        }
    }
});
