"use strict";

const { listHelpGroups } = require("../../../services/help");
const { navigate, switchTab } = require("../../../utils/navigation");
const { showToast } = require("../../../utils/toast");

const HELP_DETAIL_PATH = "/pages/mine/help-detail/index";
const CONTACT_PATH = "/pages/mine/contact/index";
const FEEDBACK_PATH = "/pages/mine/feedback/index";
const MINE_PATH = "/pages/mine/index/index";

function normalizeText(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, "");
}

function groupMatches(group, keyword) {
  const searchText = normalizeText([
    group.title || "",
    group.summary || "",
    Array.isArray(group.keywords) ? group.keywords.join("") : "",
    Array.isArray(group.questions) ? group.questions.map((question) => question.text).join("") : ""
  ].join(""));

  return searchText.includes(keyword);
}

Page({
  data: {
    searchKeyword: "",
    helpGroups: [],
    filteredGroups: [],
    hasSearchResult: true,
    loading: true,
    loadFailed: false
  },

  async onLoad() {
    await this.loadHelpGroups();
  },

  async loadHelpGroups() {
    this.setData({
      loading: true,
      loadFailed: false
    });

    try {
      const helpGroups = await listHelpGroups();
      this.setData({
        helpGroups,
        filteredGroups: helpGroups,
        hasSearchResult: true,
        loading: false,
        loadFailed: false
      });
    } catch (error) {
      this.setData({
        helpGroups: [],
        filteredGroups: [],
        hasSearchResult: false,
        loading: false,
        loadFailed: true
      });
    }
  },

  filterHelpGroups(searchKeyword = this.data.searchKeyword) {
    const keyword = normalizeText(searchKeyword);

    if (!keyword) {
      this.setData({
        filteredGroups: this.data.helpGroups,
        hasSearchResult: true
      });
      return;
    }

    const filteredGroups = this.data.helpGroups.filter((group) => groupMatches(group, keyword));

    this.setData({
      filteredGroups,
      hasSearchResult: filteredGroups.length > 0
    });
  },

  handleSearchInput(event) {
    const searchKeyword = event.detail.value || "";

    this.setData({ searchKeyword });
    this.filterHelpGroups(searchKeyword);
  },

  handleClearSearch() {
    this.setData({
      searchKeyword: "",
      filteredGroups: this.data.helpGroups,
      hasSearchResult: true
    });
  },

  handleRetry() {
    this.loadHelpGroups();
  },

  handleGroupTap(event) {
    const articleId = event.currentTarget.dataset.articleId;
    this.openArticle(articleId);
  },

  handleQuestionTap(event) {
    const articleId = event.currentTarget.dataset.articleId;
    this.openArticle(articleId);
  },

  openArticle(articleId) {
    if (!articleId) {
      showToast("这条帮助暂时不可用");
      return;
    }

    navigate(HELP_DETAIL_PATH, { articleId });
  },

  handleSupportAction() {
    wx.showActionSheet({
      itemList: ["联系客服", "提交反馈"],
      success: (res) => {
        if (res.tapIndex === 0) {
          navigate(CONTACT_PATH);
          return;
        }

        navigate(FEEDBACK_PATH);
      }
    });
  },

  handleContact() {
    navigate(CONTACT_PATH);
  },

  handleFeedback() {
    navigate(FEEDBACK_PATH);
  },

  handleBackMine() {
    switchTab(MINE_PATH);
  }
});
