"use strict";

const { searchCatalog } = require("../../../services/catalog");
const { navigate } = require("../../../utils/navigation");

const FILTERS = [
  { key: "recommended", label: "推荐案例" },
  { key: "cat", label: "猫咪" },
  { key: "dog", label: "狗狗" },
  { key: "ar", label: "AR 展示" },
  { key: "pattern", label: "花纹还原" },
  { key: "body", label: "体型参考" }
];

const COVER_CLASSES = ["cover-blush", "cover-sand", "cover-latte", "cover-warm", "cover-honey", "cover-mist"];
const IMAGE_CLASSES = ["image-center", "image-lift", "image-close", "image-right", "image-left", "image-low"];
const THUMB_CLASSES = ["thumb-focus", "thumb-wide", "thumb-soft", "thumb-focus", "thumb-wide", "thumb-soft"];
const FALLBACK_PREVIEWS = [
  "/assets/mock/upload-front.png",
  "/assets/mock/upload-side.png",
  "/assets/mock/upload-full.png",
  "/assets/mock/upload-close.png"
];

function inferPetTypeLabel(item) {
  const text = `${item.title || ""}${item.summary || ""}${(item.tags || []).join("")}`;
  return /狗|柯基|比熊|柴犬/.test(text) ? "狗狗" : "猫咪";
}

function inferPetIcon(label) {
  return label === "狗狗" ? "狗" : "猫";
}

function buildDisplayTags(item) {
  const sourceTags = Array.isArray(item.displayTags) && item.displayTags.length
    ? item.displayTags
    : (item.tags || []).filter((tag) => tag !== "猫咪" && tag !== "狗狗" && tag !== "推荐案例");

  return sourceTags.slice(0, 2);
}

function normalizeGalleryCase(item, index) {
  const petTypeLabel = item.petTypeLabel || inferPetTypeLabel(item);

  return {
    ...item,
    petTypeLabel,
    petIcon: item.petIcon || inferPetIcon(petTypeLabel),
    originalImage: item.originalImage || FALLBACK_PREVIEWS[index % FALLBACK_PREVIEWS.length],
    displayTags: buildDisplayTags(item),
    coverClass: item.coverClass || COVER_CLASSES[index % COVER_CLASSES.length],
    imageClass: item.imageClass || IMAGE_CLASSES[index % IMAGE_CLASSES.length],
    thumbClass: item.thumbClass || THUMB_CLASSES[index % THUMB_CLASSES.length]
  };
}

Page({
  data: {
    cases: [],
    videos: [],
    filters: FILTERS,
    selectedFilter: "recommended",
    displayCases: [],
    loadFailed: false
  },

  async onLoad() {
    await this.loadCatalog();
  },

  async loadCatalog() {
    try {
      const result = await searchCatalog("");
      const cases = (result.cases || []).map(normalizeGalleryCase);

      this.setData({
        cases,
        videos: result.videos || [],
        displayCases: this.filterCases(cases, this.data.selectedFilter),
        loadFailed: false
      });
    } catch (error) {
      this.setData({
        cases: [],
        videos: [],
        displayCases: [],
        loadFailed: true
      });
    }
  },

  filterCases(cases, filterKey) {
    if (filterKey === "recommended") {
      return cases;
    }

    return cases.filter((item) => {
      const text = [
        item.title || "",
        item.summary || "",
        item.petTypeLabel || "",
        (item.tags || []).join(""),
        (item.displayTags || []).join("")
      ].join("");

      if (filterKey === "cat") {
        return /猫|布偶|虎斑|英短/.test(text);
      }

      if (filterKey === "dog") {
        return /狗|柯基|比熊|柴犬/.test(text);
      }

      if (filterKey === "ar") {
        return /AR|展示|空间|摆放|预览/.test(text) || Boolean(item.videoId);
      }

      if (filterKey === "pattern") {
        return /花纹|毛色|补色|还原/.test(text);
      }

      if (filterKey === "body") {
        return /体型|体态|轮廓|脸部|耳朵|参考|尾巴/.test(text);
      }

      return true;
    });
  },

  handleSearch() {
    navigate("/pages/cases/search/index");
  },

  handleFilter(event) {
    const selectedFilter = event.currentTarget.dataset.key || "recommended";

    this.setData({
      selectedFilter,
      displayCases: this.filterCases(this.data.cases, selectedFilter)
    });
  },

  handleResetFilters() {
    this.setData({
      selectedFilter: "recommended",
      displayCases: this.filterCases(this.data.cases, "recommended")
    });
  },

  handleRetry() {
    this.loadCatalog();
  },

  handleCase(event) {
    navigate("/pages/cases/detail/index", {
      caseId: event.currentTarget.dataset.caseId
    });
  },

  handleVideo(event) {
    navigate("/pages/cases/video-detail/index", {
      videoId: event.currentTarget.dataset.videoId
    });
  },

  handleTemplate() {
    navigate("/pages/cases/template-demo/index", {
      templateId: "template-cat"
    });
  },

  handleStart() {
    navigate("/pages/works/start-create/index");
  }
});
