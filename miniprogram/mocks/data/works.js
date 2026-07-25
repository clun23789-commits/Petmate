"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHARE_PREVIEW = exports.mockWorks = void 0;
var mockWorks_1 = require("./mockWorks");
Object.defineProperty(exports, "mockWorks", { enumerable: true, get: function () { return mockWorks_1.mockWorks; } });
exports.SHARE_PREVIEW = {
    workId: "shared-work-demo",
    title: "糖糖的宠物数字形象",
    summary: "这是一份已完成基础生成并可继续优化的当前作品预览。",
    ownerNickname: "糖糖的主人",
    ownerAvatar: "/assets/mock/upload-front.png",
    petName: "豆豆",
    petType: "狗狗",
    generatedBy: "Petmate",
    canPreview: true,
    tags: ["作品可预览", "官方生成", "好友分享"],
    featureItems: [
        { icon: "▣", title: "猫狗数字形象", desc: "由 AI 生成" },
        { icon: "◇", title: "支持 AR 展示", desc: "带进真实空间" },
        { icon: "♡", title: "可分享与回看", desc: "记录美好时刻" }
    ],
    authorCta: "查看我的作品",
    image: "/assets/mock/pet-corgi-hero.png"
};
