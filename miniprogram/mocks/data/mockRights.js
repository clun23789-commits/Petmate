"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackDimensionMeta = exports.mockRights = void 0;
exports.mockRights = {
    optimizeCountPerAd: 3,
    photoRetentionDays: 30,
    currentWorkArPrice: 18,
    currentWorkArCaption: "当前宠物作品 AR 权益",
    retainedCaption: "系统异常、生成失败或结果未成功返回时，已获得的试用权益会尽量为你保留，优化次数也不会被正式扣减。"
};
exports.feedbackDimensionMeta = {
    fur: {
        label: "毛色",
        suggestionTitle: "建议补充毛色参考",
        suggestionText: "优先补充自然光下的正脸或近景照片，帮助系统更准确识别主毛色。",
        requiredViewLabel: "正脸近照"
    },
    pattern: {
        label: "花纹",
        suggestionTitle: "建议补充花纹细节",
        suggestionText: "补充侧面、背部或身体花纹更清晰的照片，帮助系统还原花纹分布。",
        requiredViewLabel: "侧面或花纹细节"
    },
    body: {
        label: "体型",
        suggestionTitle: "建议补充整体体态",
        suggestionText: "补充站立或坐姿完整可见的全身照，帮助系统校正体型与姿态。",
        requiredViewLabel: "全身照"
    },
    face: {
        label: "脸部轮廓",
        suggestionTitle: "建议补充脸部近景",
        suggestionText: "补充无遮挡的正脸近景照片，帮助系统识别脸部轮廓和鼻口区域。",
        requiredViewLabel: "正脸近景"
    },
    ears: {
        label: "耳朵",
        suggestionTitle: "建议补充耳部细节",
        suggestionText: "补充耳朵无遮挡的清晰照片，帮助系统识别耳型与耳缘颜色。",
        requiredViewLabel: "耳部细节"
    },
    tail: {
        label: "尾巴",
        suggestionTitle: "建议补充尾巴参考",
        suggestionText: "补充尾巴完整可见的照片，帮助系统识别尾尖颜色和整体长度表现。",
        requiredViewLabel: "尾巴完整可见"
    }
};
