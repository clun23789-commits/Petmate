"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCases = listCases;
exports.listVideos = listVideos;
exports.searchCatalog = searchCatalog;
exports.getCaseById = getCaseById;
exports.getVideoById = getVideoById;
exports.getTemplateById = getTemplateById;
const cases_1 = require("../../mocks/data/cases");
const videos_1 = require("../../mocks/data/videos");
function normalizeSearchText(text) {
    return (text || "").toLowerCase().replace(/\s+/g, "");
}
function buildSearchText(item) {
    return normalizeSearchText([
        item.title || "",
        item.summary || "",
        item.description || "",
        item.meta || "",
        item.authorName || "",
        item.petName || "",
        item.petType || "",
        item.petTypeLabel || "",
        item.breed || "",
        Array.isArray(item.tags) ? item.tags.join("") : "",
        Array.isArray(item.displayTags) ? item.displayTags.join("") : ""
    ].join(""));
}
const ABOUT_ITEMS = [
    {
        icon: "▣",
        title: "真实渲染效果",
        desc: "展示 Petmate 数字形象的高清渲染效果"
    },
    {
        icon: "★",
        title: "多角度预览",
        desc: "支持旋转、缩放查看不同角度的模型效果"
    },
    {
        icon: "爪",
        title: "个性化生成",
        desc: "上传你家宠物的照片，生成专属数字形象"
    }
];
const TEMPLATES = [
    {
        templateId: "template-cat",
        title: "官方猫咪示例模型",
        noticeTitle: "官方示例模型",
        summary: "这是由 Petmate 官方生成的示例模型，用于展示数字形象效果。",
        noticeText: "这是由 Petmate 官方生成的示例模型，用于展示数字形象效果。",
        noticeWarning: "不等于真实宠物生成结果，效果因宠物而异。",
        caseId: "case-ragdoll",
        videoId: "video-ragdoll",
        heroImage: "/assets/mock/pet-cat-hero.png",
        previewTabs: [
            { key: "front", label: "正面", image: "/assets/mock/pet-cat-hero.png", type: "image" },
            { key: "side", label: "侧面", image: "/assets/mock/pet-cat-hero.png", type: "image" },
            { key: "back", label: "背面", image: "/assets/mock/pet-cat-hero.png", type: "image" },
            { key: "video", label: "视频", image: "/assets/mock/pet-cat-hero.png", type: "video", videoId: "video-ragdoll" }
        ],
        aboutItems: ABOUT_ITEMS,
        tips: "想要生成你家宠物的专属数字形象，请先解锁试用权益，再上传真实照片进行生成。",
        highlights: ["可旋转查看", "免费体验", "用于理解最终展示效果"]
    },
    {
        templateId: "template-dog",
        title: "官方狗狗示例模型",
        noticeTitle: "官方示例模型",
        summary: "这是由 Petmate 官方生成的示例模型，用于展示数字形象效果。",
        noticeText: "这是由 Petmate 官方生成的示例模型，用于展示数字形象效果。",
        noticeWarning: "不等于真实宠物生成结果，效果因宠物而异。",
        caseId: "case-corgi",
        videoId: "video-corgi",
        heroImage: "/assets/mock/pet-corgi-hero.png",
        previewTabs: [
            { key: "front", label: "正面", image: "/assets/mock/pet-corgi-hero.png", type: "image" },
            { key: "side", label: "侧面", image: "/assets/mock/pet-corgi-hero.png", type: "image" },
            { key: "back", label: "背面", image: "/assets/mock/pet-corgi-hero.png", type: "image" },
            { key: "video", label: "视频", image: "/assets/mock/pet-corgi-hero.png", type: "video", videoId: "video-corgi" }
        ],
        aboutItems: ABOUT_ITEMS,
        tips: "想要生成你家宠物的专属数字形象，请先解锁试用权益，再上传真实照片进行生成。",
        highlights: ["可缩放查看", "免费体验", "用于理解 AR 成果预期"]
    }
];
async function listCases() {
    return Promise.resolve(cases_1.CASES);
}
async function listVideos() {
    return Promise.resolve(videos_1.VIDEOS);
}
async function searchCatalog(keyword) {
    const text = normalizeSearchText((keyword || "").trim());
    if (!text) {
        return Promise.resolve({
            cases: cases_1.CASES,
            videos: videos_1.VIDEOS
        });
    }
    return Promise.resolve({
        cases: cases_1.CASES.filter((item) => buildSearchText(item).includes(text)),
        videos: videos_1.VIDEOS.filter((item) => buildSearchText(item).includes(text))
    });
}
async function getCaseById(caseId) {
    return Promise.resolve(cases_1.CASES.find((item) => item.id === caseId) || null);
}
async function getVideoById(videoId) {
    return Promise.resolve(videos_1.VIDEOS.find((item) => item.id === videoId) || null);
}
async function getTemplateById(templateId) {
    return Promise.resolve(TEMPLATES.find((item) => item.templateId === templateId) || TEMPLATES[0]);
}
