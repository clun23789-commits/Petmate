"use strict";
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
        tone: {
            type: String,
            value: "default"
        },
        size: {
            type: String,
            value: "default"
        },
        align: {
            type: String,
            value: "center"
        },
        backLabel: {
            type: String,
            value: ""
        },
        customClass: {
            type: String,
            value: ""
        }
    },
    data: {
        navWrapStyle: "",
        navMainStyle: "",
        sideStyle: ""
    },
    observers: {
        showCapsule() {
            this.updateLayout();
        }
    },
    lifetimes: {
        attached() {
            this.updateLayout();
        }
    },
    methods: {
        updateLayout() {
            const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            const statusBarHeight = windowInfo.statusBarHeight || 20;
            const screenWidth = windowInfo.windowWidth || 375;
            let safeTop = statusBarHeight + 8;
            let sideWidth = 72;
            let navHeight = 44;
            try {
                const menuButton = wx.getMenuButtonBoundingClientRect();
                if (menuButton && menuButton.width) {
                    safeTop = menuButton.top || safeTop;
                    navHeight = Math.max(menuButton.height || 32, 44);
                    sideWidth = Math.max(72, Math.max(screenWidth - menuButton.left + 6, menuButton.width + 6));
                }
            }
            catch (error) {
                sideWidth = 72;
            }
            const reservedSideWidth = this.properties.showCapsule ? sideWidth : 72;
            this.setData({
                navWrapStyle: `padding-top:${safeTop}px;`,
                navMainStyle: `min-height:${navHeight}px;`,
                sideStyle: `width:${reservedSideWidth}px;min-width:${reservedSideWidth}px;`
            });
        },
        handleBack() {
            this.triggerEvent("back");
        }
    }
});
