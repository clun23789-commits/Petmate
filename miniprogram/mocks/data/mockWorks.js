"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockWorks = void 0;
exports.mockWorks = {
    petName: "糖糖",
    petTypeLabel: "柯基",
    currentWorkId: "work-corgi-sugar",
    baseVersionId: "version-corgi-base",
    retouchedVersionId: "version-corgi-retouched",
    createdAt: "2026-04-30",
    previewAssets: {
        corgiHero: "/assets/mock/pet-corgi-hero.png",
        catHero: "/assets/mock/pet-cat-hero.png",
        uploadFront: "/assets/mock/upload-front.png",
        uploadSide: "/assets/mock/upload-side.png",
        uploadFull: "/assets/mock/upload-full.png",
        uploadClose: "/assets/mock/upload-close.png",
        targetedReference: "/assets/mock/targeted-reference.png",
        retouchBefore: "/assets/mock/retouch-before.png",
        retouchAfter: "/assets/mock/retouch-after.png",
        exceptionHero: "/assets/mock/exception-hero.png"
    },
    uploadRecommendations: [
        {
            key: "front",
            label: "正脸",
            helper: "建议 1 到 3 张，面部和五官尽量清晰。",
            image: "/assets/mock/upload-front.png"
        },
        {
            key: "side",
            label: "侧面",
            helper: "建议 1 到 2 张，帮助识别身体轮廓与花纹延展。",
            image: "/assets/mock/upload-side.png"
        },
        {
            key: "full",
            label: "全身",
            helper: "建议 1 到 2 张，站姿或坐姿完整可见会更好。",
            image: "/assets/mock/upload-full.png"
        }
    ],
    quickEntries: [
        {
            title: "案例页",
            subtitle: "先看看官方案例风格",
            route: "/pages/cases/index/index"
        },
        {
            title: "帮助与权益",
            subtitle: "了解试用规则与当前权益",
            route: "/pages/mine/index/index"
        }
    ],
    homeFeaturedWork: {
        workId: "work-corgi-sunshine",
        petType: "dog",
        petTypeLabel: "柯基",
        petName: "阳光柴柴",
        displayName: "柯基 · 阳光柴柴",
        status: "ready",
        createdAt: "2024-05-18",
        previewImage: "/assets/mock/pet-corgi-hero.png"
    },
    homeWorks: [
        {
            workId: "work-corgi-sunshine",
            petType: "dog",
            petTypeLabel: "柯基",
            petName: "阳光柴柴",
            displayName: "柯基 · 阳光柴柴",
            status: "ready",
            statusText: "生成成功",
            createdAt: "2024-05-18",
            previewImage: "/assets/mock/pet-corgi-hero.png"
        },
        {
            workId: "work-ragdoll-snowball",
            petType: "cat",
            petTypeLabel: "布偶",
            petName: "小雪球",
            displayName: "布偶 · 小雪球",
            status: "ready",
            statusText: "生成成功",
            createdAt: "2024-05-11",
            previewImage: "/assets/mock/pet-cat-hero.png"
        },
        {
            workId: "work-shiba-blackbean",
            petType: "dog",
            petTypeLabel: "柴犬",
            petName: "黑豆",
            displayName: "柴犬 · 黑豆",
            status: "generating",
            statusText: "生成中 30%",
            progressValue: 30,
            createdAt: "2024-05-20",
            previewImage: "/assets/mock/pet-corgi-hero.png"
        },
        {
            workId: "work-bichon-tuantuan",
            petType: "dog",
            petTypeLabel: "比熊",
            petName: "团团",
            displayName: "比熊 · 团团",
            status: "failed",
            statusText: "生成失败",
            createdAt: "2024-05-09",
            previewImage: "/assets/mock/exception-hero.png"
        }
    ],
    homeQuickEntries: [
        {
            key: "cases",
            title: "案例页",
            subtitle: "查看成品案例",
            route: "/pages/cases/index/index",
            mode: "switchTab",
            icon: "▣",
            accent: "sage"
        },
        {
            key: "template",
            title: "官方模板体验",
            subtitle: "免费试玩模板",
            route: "/pages/cases/template-demo/index",
            mode: "navigate",
            icon: "◇",
            accent: "lavender"
        },
        {
            key: "video",
            title: "成品 AR 视频",
            subtitle: "效果视频预览",
            route: "/pages/cases/video-detail/index",
            mode: "navigate",
            icon: "▶",
            accent: "peach"
        },
        {
            key: "help",
            title: "帮助中心",
            subtitle: "上传与生成规则",
            route: "/pages/mine/help/index",
            mode: "navigate",
            icon: "?",
            accent: "blue"
        }
    ]
};
