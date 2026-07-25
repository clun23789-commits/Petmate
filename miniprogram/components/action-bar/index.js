"use strict";
Component({
    properties: {
        primaryText: {
            type: String,
            value: ""
        },
        primarySubtext: {
            type: String,
            value: ""
        },
        secondaryText: {
            type: String,
            value: ""
        },
        secondarySubtext: {
            type: String,
            value: ""
        },
        primaryDisabled: {
            type: Boolean,
            value: false
        },
        secondaryDisabled: {
            type: Boolean,
            value: false
        },
        primaryLoading: {
            type: Boolean,
            value: false
        },
        secondaryLoading: {
            type: Boolean,
            value: false
        },
        fixed: {
            type: Boolean,
            value: false
        },
        safeArea: {
            type: Boolean,
            value: true
        },
        layout: {
            type: String,
            value: "vertical"
        },
        primaryTone: {
            type: String,
            value: "brand"
        },
        secondaryVariant: {
            type: String,
            value: "outline"
        },
        hint: {
            type: String,
            value: ""
        }
    },
    methods: {
        handlePrimary() {
            if (this.data.primaryDisabled || this.data.primaryLoading) {
                return;
            }
            this.triggerEvent("primary");
        },
        handleSecondary() {
            if (this.data.secondaryDisabled || this.data.secondaryLoading) {
                return;
            }
            this.triggerEvent("secondary");
        }
    }
});
