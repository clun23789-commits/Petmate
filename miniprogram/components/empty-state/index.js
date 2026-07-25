"use strict";
Component({
    properties: {
        title: {
            type: String,
            value: ""
        },
        description: {
            type: String,
            value: ""
        },
        actionText: {
            type: String,
            value: ""
        },
        secondaryText: {
            type: String,
            value: ""
        },
        actionSubtext: {
            type: String,
            value: ""
        },
        secondarySubtext: {
            type: String,
            value: ""
        },
        image: {
            type: String,
            value: ""
        },
        iconText: {
            type: String,
            value: "宠"
        },
        tone: {
            type: String,
            value: "neutral"
        },
        compact: {
            type: Boolean,
            value: false
        }
    },
    methods: {
        handleAction() {
            this.triggerEvent("action");
        },
        handleSecondary() {
            this.triggerEvent("secondary");
        }
    }
});
