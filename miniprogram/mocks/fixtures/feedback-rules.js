"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEEDBACK_RULES = void 0;
exports.FEEDBACK_RULES = {
    fur: {
        dimension: "fur",
        title: "建议补充毛色参考",
        reason: "优先补充自然光下的正脸或近景照片，帮助系统更准确识别主毛色。",
        recommendedView: "front",
        nextAction: "targeted_upload"
    },
    pattern: {
        dimension: "pattern",
        title: "建议补充花纹细节",
        reason: "补充侧面、背部或身体花纹更清晰的照片，帮助系统还原花纹分布。",
        recommendedView: "pattern",
        nextAction: "targeted_upload"
    },
    body: {
        dimension: "body",
        title: "建议补充整体体态",
        reason: "补充站立或坐姿完整可见的全身照，帮助系统校正体型与姿态。",
        recommendedView: "full",
        nextAction: "targeted_upload"
    },
    face: {
        dimension: "face",
        title: "建议补充脸部近景",
        reason: "补充无遮挡的正脸近景照片，帮助系统识别脸部轮廓和鼻口区域。",
        recommendedView: "front",
        nextAction: "targeted_upload"
    },
    ears: {
        dimension: "ears",
        title: "建议补充耳部细节",
        reason: "补充耳朵无遮挡的清晰照片，帮助系统识别耳型与耳缘颜色。",
        recommendedView: "ear",
        nextAction: "targeted_upload"
    },
    tail: {
        dimension: "tail",
        title: "建议补充尾巴参考",
        reason: "补充尾巴完整可见的照片，帮助系统识别尾尖颜色和整体长度表现。",
        recommendedView: "tail",
        nextAction: "targeted_upload"
    }
};
