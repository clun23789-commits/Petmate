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
        primaryText: {
            type: String,
            value: ""
        },
        secondaryText: {
            type: String,
            value: ""
        },
        primarySubtext: {
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
            value: "!"
        },
        tone: {
            type: String,
            value: "danger"
        },
        compact: {
            type: Boolean,
            value: false
        }
    },
    methods: {
        handlePrimary() {
            this.triggerEvent("primary");
        },
        handleSecondary() {
            this.triggerEvent("secondary");
        }
    }
});
