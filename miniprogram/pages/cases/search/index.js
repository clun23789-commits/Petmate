"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const catalog_1 = require("../../../services/catalog");
const navigation_1 = require("../../../utils/navigation");
const query_1 = require("../../../utils/query");

const HISTORY_STORAGE_KEY = "petmate_case_search_history";
const DEFAULT_AUTHOR_AVATARS = [
  "/assets/mock/pet-cat-hero.png",
  "/assets/mock/pet-corgi-hero.png",
  "/assets/mock/upload-front.png",
  "/assets/mock/upload-full.png"
];
const DEFAULT_SEARCH_HISTORY = ["银渐层猫咪", "布偶猫", "柯基", "AR 展示效果", "花纹还原"];
const DEFAULT_HEAT_TEXTS = ["1.2k", "982", "763", "632", "586", "421", "398", "326"];
const HOT_KEYWORDS = [
  { id: "calico", text: "三花猫", icon: "猫" },
  { id: "shiba", text: "柴犬", icon: "狗" },
  { id: "golden", text: "金毛", icon: "🐕" },
  { id: "pattern", text: "花纹还原", icon: "🎨" },
  { id: "ar", text: "AR 展示", icon: "AR" }
];

function trimKeyword(keyword) {
  return (keyword || "").trim();
}

function getSearchText(item) {
  return [
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
  ].join("");
}

function inferPetAvatar(item, index) {
  const text = getSearchText(item);
  if (/狗|犬|柯基|柴犬|金毛|比熊/.test(text)) {
    return "/assets/mock/pet-corgi-hero.png";
  }
  if (/猫|布偶|三花|银渐层|虎斑|英短/.test(text)) {
    return "/assets/mock/pet-cat-hero.png";
  }
  return DEFAULT_AUTHOR_AVATARS[index % DEFAULT_AUTHOR_AVATARS.length];
}

function buildVisibleTags(item, fallbackTags) {
  const source = Array.isArray(item.displayTags) && item.displayTags.length
    ? item.displayTags
    : (Array.isArray(item.tags) ? item.tags : fallbackTags);
  const filtered = source.filter((tag) => tag && tag !== "推荐案例" && tag !== "免费层示例" && tag !== "官方示例模型");
  return filtered.slice(0, 3);
}

function normalizeCaseResult(item, index) {
  const visibleTags = buildVisibleTags(item, ["宠物案例", "AR 展示"]);
  const searchText = getSearchText(item);

  return {
    id: `case-${item.id}`,
    type: "case",
    caseId: item.id,
    videoId: item.videoId || "",
    title: item.searchTitle || item.title || "宠物数字形象案例",
    summary: item.summary || item.description || "查看宠物数字形象在模型效果与 AR 展示中的整体表现。",
    image: item.image || item.heroImage || "/assets/mock/pet-cat-hero.png",
    duration: item.duration || "00:18",
    arBadge: item.arBadge !== false && (/AR|展示|预览/.test(searchText) || Boolean(item.videoId)),
    visibleTags,
    authorName: item.authorName || item.petName || "Petmate 官方",
    authorAvatar: item.authorAvatar || inferPetAvatar(item, index),
    heatText: item.heatText || DEFAULT_HEAT_TEXTS[index % DEFAULT_HEAT_TEXTS.length]
  };
}

function normalizeVideoResult(item, index) {
  const resultIndex = index + 3;
  const visibleTags = buildVisibleTags(item, ["AR 展示", "视频预览"]);

  return {
    id: `video-${item.id}`,
    type: "video",
    caseId: item.caseId || "",
    videoId: item.id,
    title: item.title || "AR 展示视频预览",
    summary: item.summary || "用于理解宠物数字形象在真实空间中的摆放、缩放和动作展示效果。",
    image: item.image || "/assets/mock/pet-corgi-hero.png",
    duration: item.duration || "00:18",
    arBadge: true,
    visibleTags,
    authorName: item.authorName || "Petmate 官方",
    authorAvatar: item.authorAvatar || inferPetAvatar(item, resultIndex),
    heatText: item.heatText || DEFAULT_HEAT_TEXTS[resultIndex % DEFAULT_HEAT_TEXTS.length]
  };
}

function normalizeSearchResults(result) {
  const cases = Array.isArray(result.cases) ? result.cases : [];
  const videos = Array.isArray(result.videos) ? result.videos : [];

  return cases.map(normalizeCaseResult).concat(videos.map(normalizeVideoResult));
}

Page({
  data: {
    keyword: "",
    hotKeywords: HOT_KEYWORDS,
    searchHistory: [],
    results: [],
    resultCountText: "共找到 0 个案例",
    isEmpty: false,
    isLoading: false,
    loadFailed: false,
    hasSearched: false
  },

  async onLoad(options) {
    const keyword = (0, query_1.getStringParam)(options, "keyword");
    const searchHistory = this.loadSearchHistory();

    this.setData({
      keyword,
      searchHistory
    });

    await this.runSearch(keyword, {
      persistHistory: Boolean(trimKeyword(keyword))
    });
  },

  loadSearchHistory() {
    try {
      const cached = wx.getStorageSync(HISTORY_STORAGE_KEY);
      if (Array.isArray(cached)) {
        return cached.slice(0, 8);
      }
    } catch (error) {
      return DEFAULT_SEARCH_HISTORY;
    }

    return DEFAULT_SEARCH_HISTORY;
  },

  saveSearchHistory(history) {
    try {
      wx.setStorageSync(HISTORY_STORAGE_KEY, history);
    } catch (error) {
      // 搜索历史只是轻量本地增强，失败时不阻塞页面检索。
    }
  },

  buildNextHistory(keyword) {
    const cleanKeyword = trimKeyword(keyword);
    if (!cleanKeyword) {
      return this.data.searchHistory;
    }

    const nextHistory = [
      cleanKeyword,
      ...this.data.searchHistory.filter((item) => item !== cleanKeyword)
    ].slice(0, 8);

    this.saveSearchHistory(nextHistory);
    return nextHistory;
  },

  async runSearch(rawKeyword, options = {}) {
    const keyword = trimKeyword(rawKeyword);

    this.setData({
      keyword,
      isLoading: true,
      loadFailed: false,
      hasSearched: true
    });

    try {
      const result = await (0, catalog_1.searchCatalog)(keyword);
      const results = normalizeSearchResults(result);
      const searchHistory = options.persistHistory ? this.buildNextHistory(keyword) : this.data.searchHistory;

      this.setData({
        results,
        searchHistory,
        resultCountText: `共找到 ${results.length} 个案例`,
        isEmpty: results.length === 0,
        isLoading: false,
        loadFailed: false
      });
    } catch (error) {
      this.setData({
        results: [],
        resultCountText: "共找到 0 个案例",
        isEmpty: true,
        isLoading: false,
        loadFailed: true
      });
    }
  },

  handleInput(event) {
    this.setData({
      keyword: event.detail.value
    });
  },

  async handleSearch(event) {
    const inputValue = event && event.detail && typeof event.detail.value === "string"
      ? event.detail.value
      : this.data.keyword;

    await this.runSearch(inputValue, {
      persistHistory: Boolean(trimKeyword(inputValue))
    });
  },

  async handleHotKeyword(event) {
    const keyword = event.currentTarget.dataset.keyword || "";
    await this.runSearch(keyword, { persistHistory: true });
  },

  async handleHistoryKeyword(event) {
    const keyword = event.currentTarget.dataset.keyword || "";
    await this.runSearch(keyword, { persistHistory: true });
  },

  handleRemoveHistory(event) {
    const keyword = event.currentTarget.dataset.keyword || "";
    const searchHistory = this.data.searchHistory.filter((item) => item !== keyword);

    this.saveSearchHistory(searchHistory);
    this.setData({ searchHistory });
  },

  handleClearHistory() {
    this.saveSearchHistory([]);
    this.setData({ searchHistory: [] });
  },

  async handleHotCases() {
    await this.runSearch("", { persistHistory: false });
  },

  async handleRetrySearch() {
    await this.runSearch(this.data.keyword, {
      persistHistory: Boolean(trimKeyword(this.data.keyword))
    });
  },

  handleResult(event) {
    const dataset = event.currentTarget.dataset || {};
    if (dataset.type === "video" && dataset.videoId) {
      (0, navigation_1.navigate)("/pages/cases/video-detail/index", { videoId: dataset.videoId });
      return;
    }

    if (dataset.caseId) {
      (0, navigation_1.navigate)("/pages/cases/detail/index", { caseId: dataset.caseId });
    }
  },

  handleCase(event) {
    (0, navigation_1.navigate)("/pages/cases/detail/index", {
      caseId: event.currentTarget.dataset.caseId
    });
  },

  handleVideo(event) {
    (0, navigation_1.navigate)("/pages/cases/video-detail/index", {
      videoId: event.currentTarget.dataset.videoId
    });
  },

  handleBack() {
    this.safeBackToCases();
  },

  handleBackToCases() {
    this.safeBackToCases();
  },

  safeBackToCases() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }

    wx.switchTab({ url: "/pages/cases/index/index" });
  }
});
