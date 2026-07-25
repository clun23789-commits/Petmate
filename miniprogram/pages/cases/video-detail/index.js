"use strict";

const { getVideoById, listVideos } = require("../../../services/catalog");
const { navigate, replace, switchTab, back } = require("../../../utils/navigation");
const { getStringParam } = require("../../../utils/query");
const { showToast } = require("../../../utils/toast");

const DEFAULT_VIDEO_ID = "video-ragdoll";
const DEFAULT_COVER = "/assets/mock/pet-corgi-hero.png";
const CASES_PATH = "/pages/cases/index/index";
const CASE_DETAIL_PATH = "/pages/cases/detail/index";
const TEMPLATE_DEMO_PATH = "/pages/cases/template-demo/index";
const START_CREATE_PATH = "/pages/works/start-create/index";
const VIDEO_DETAIL_PATH = "/pages/cases/video-detail/index";

const FEATURE_ITEMS = [
  {
    icon: "▣",
    title: "真实空间摆放",
    desc: "在家中自由放置"
  },
  {
    icon: "⛶",
    title: "缩放与旋转",
    desc: "多角度查看效果"
  },
  {
    icon: "爪",
    title: "动作展示",
    desc: "生动有趣的互动"
  },
  {
    icon: "相",
    title: "截图 & 录屏",
    desc: "分享美好瞬间"
  }
];

function getSafeText(value, fallback) {
  return value || fallback;
}

function inferTemplateId(video) {
  const text = [
    video.title || "",
    video.summary || "",
    Array.isArray(video.tags) ? video.tags.join("") : ""
  ].join("");

  return /狗|犬|柯基|柴犬|金毛|比熊|边牧/.test(text) ? "template-dog" : "template-cat";
}

function normalizeVideo(rawVideo) {
  const image = rawVideo.image || DEFAULT_COVER;
  const duration = rawVideo.duration || "00:18";

  return {
    ...rawVideo,
    title: getSafeText(rawVideo.title, "宠物 AR 成果预览"),
    subtitle: getSafeText(rawVideo.subtitle, "AR 成果预览"),
    summary: getSafeText(rawVideo.summary, "观看宠物数字形象在真实空间中的摆放、缩放和动作展示效果。"),
    description: getSafeText(rawVideo.description, "看看你的宠物也能这样出现在现实中吧！"),
    authorName: getSafeText(rawVideo.authorName, "Petmate 官方"),
    authorAvatar: getSafeText(rawVideo.authorAvatar, image),
    publishDate: getSafeText(rawVideo.publishDate, "2024-04-12"),
    collectText: getSafeText(rawVideo.collectText || rawVideo.heatText, "1.2k"),
    image,
    previewImage: rawVideo.previewImage || image,
    duration,
    currentTime: rawVideo.currentTime || "00:02",
    progressPercent: rawVideo.progressPercent || 18,
    caseId: rawVideo.caseId || "",
    templateId: rawVideo.templateId || inferTemplateId(rawVideo),
    tags: Array.isArray(rawVideo.tags) && rawVideo.tags.length
      ? rawVideo.tags.slice(0, 4)
      : ["AR 展示", "动作展示", "客厅摆放"],
    route: rawVideo.route || `${VIDEO_DETAIL_PATH}?videoId=${rawVideo.id || DEFAULT_VIDEO_ID}`
  };
}

function normalizeRelatedVideo(rawVideo) {
  return {
    id: rawVideo.id,
    title: getSafeText(rawVideo.title, "AR 成果视频预览"),
    image: rawVideo.image || DEFAULT_COVER,
    duration: rawVideo.duration || "00:18",
    caseId: rawVideo.caseId || ""
  };
}

Page({
  data: {
    video: null,
    loading: true,
    error: "",
    isPlaying: false,
    currentTimeText: "00:02",
    progressPercent: 18,
    featureItems: FEATURE_ITEMS,
    relatedVideos: [],
    currentVideoId: DEFAULT_VIDEO_ID,
    navWrapStyle: "",
    navMainStyle: "",
    navSideStyle: "",
    capsuleStyle: ""
  },

  async onLoad(options) {
    this.setupNavigationLayout();

    if (wx.showShareMenu) {
      wx.showShareMenu();
    }

    const videoId = getStringParam(options, "videoId", DEFAULT_VIDEO_ID);
    await this.loadVideo(videoId);
  },

  setupNavigationLayout() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const screenWidth = windowInfo.windowWidth || 375;
    let safeTop = statusBarHeight + 8;
    let navHeight = 44;
    let sideWidth = 92;
    let capsuleWidth = 88;
    let capsuleHeight = 32;

    try {
      const menuButton = wx.getMenuButtonBoundingClientRect();
      if (menuButton && menuButton.width) {
        safeTop = menuButton.top || safeTop;
        navHeight = Math.max(menuButton.height || 32, 44);
        capsuleWidth = menuButton.width;
        capsuleHeight = menuButton.height || capsuleHeight;
        sideWidth = Math.max(92, screenWidth - menuButton.left + 10, menuButton.width + 10);
      }
    } catch (error) {
      sideWidth = 92;
    }

    this.setData({
      navWrapStyle: `padding-top:${safeTop}px;`,
      navMainStyle: `min-height:${navHeight}px;`,
      navSideStyle: `width:${sideWidth}px;min-width:${sideWidth}px;`,
      capsuleStyle: `width:${capsuleWidth}px;height:${capsuleHeight}px;`
    });
  },

  async loadVideo(videoId) {
    const currentVideoId = videoId || DEFAULT_VIDEO_ID;

    this.setData({
      loading: true,
      error: "",
      video: null,
      relatedVideos: [],
      isPlaying: false,
      currentVideoId
    });

    try {
      const rawVideo = await getVideoById(currentVideoId);

      if (!rawVideo) {
        this.setData({
          loading: false,
          error: "没有找到这个 AR 成果视频"
        });
        return;
      }

      const video = normalizeVideo(rawVideo);
      const relatedVideos = await this.loadRelatedVideos(video.id);

      this.setData({
        video,
        relatedVideos,
        loading: false,
        error: "",
        currentTimeText: video.currentTime,
        progressPercent: video.progressPercent
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: "AR 成果视频暂时加载失败"
      });
    }
  },

  async loadRelatedVideos(videoId) {
    try {
      const videos = await listVideos();
      return (videos || [])
        .filter((item) => item && item.id && item.id !== videoId)
        .map(normalizeRelatedVideo)
        .slice(0, 5);
    } catch (error) {
      return [];
    }
  },

  handleBack() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > 1) {
      back();
      return;
    }

    switchTab(CASES_PATH);
  },

  handleGoCases() {
    switchTab(CASES_PATH);
  },

  handleReload() {
    this.loadVideo(this.data.currentVideoId || DEFAULT_VIDEO_ID);
  },

  handleTogglePlay() {
    if (!this.data.video) {
      showToast("内容加载中");
      return;
    }

    const isPlaying = !this.data.isPlaying;
    this.setData({ isPlaying });
    showToast(isPlaying ? "正在预览 AR 成果" : "已暂停预览");
  },

  handleFullscreen() {
    if (!this.data.video) {
      showToast("内容加载中");
      return;
    }

    showToast("当前为示例视频预览");
  },

  handleShareTap() {
    if (wx.showShareMenu) {
      wx.showShareMenu();
    }
    showToast("可以通过右上角或按钮分享");
  },

  handlePreviewModel() {
    const { video } = this.data;
    if (!video) {
      showToast("内容加载中");
      return;
    }

    if (video.caseId) {
      navigate(CASE_DETAIL_PATH, { caseId: video.caseId });
      return;
    }

    if (video.templateId) {
      navigate(TEMPLATE_DEMO_PATH, { templateId: video.templateId });
      return;
    }

    showToast("暂无可预览的数字形象");
  },

  handleCase() {
    const { video } = this.data;
    if (!video) {
      showToast("内容加载中");
      return;
    }

    if (video.caseId) {
      navigate(CASE_DETAIL_PATH, { caseId: video.caseId });
      return;
    }

    switchTab(CASES_PATH);
  },

  handleStart() {
    navigate(START_CREATE_PATH);
  },

  handleAdUnlockTip() {
    navigate(START_CREATE_PATH);
  },

  handleRelatedTap(event) {
    const videoId = event.currentTarget.dataset.videoId;
    if (!videoId) {
      showToast("这个推荐暂时不可用");
      return;
    }

    replace(VIDEO_DETAIL_PATH, { videoId });
  },

  onShareAppMessage() {
    const video = this.data.video || {};
    const videoId = video.id || DEFAULT_VIDEO_ID;

    return {
      title: video.title || "来看看这个宠物 AR 成果预览",
      path: `${VIDEO_DETAIL_PATH}?videoId=${videoId}`,
      imageUrl: video.image || DEFAULT_COVER
    };
  }
});
