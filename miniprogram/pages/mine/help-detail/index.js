"use strict";

const { listHelpArticles } = require("../../../services/help");
const { navigate, back } = require("../../../utils/navigation");
const { getStringParam } = require("../../../utils/query");
const { showToast } = require("../../../utils/toast");

const DEFAULT_ARTICLE_ID = "help-generation-fail-count";
const HELP_CENTER_PATH = "/pages/mine/help/index";
const FEEDBACK_PATH = "/pages/mine/feedback/index";
const DETAIL_PATH = "/pages/mine/help-detail/index";

const DEFAULT_STEPS = [
  {
    title: "查看当前页面提示",
    desc: "先确认页面给出的失败原因、权益状态或下一步建议。",
    iconText: "▤"
  },
  {
    title: "按建议重新操作",
    desc: "根据提示补充照片、刷新状态或回到对应页面重试。",
    iconText: "盾"
  },
  {
    title: "仍然失败时提交反馈",
    desc: "如果问题没有解决，可以提交反馈，并附上截图与操作步骤。",
    iconText: "↻"
  }
];

function normalizeSteps(steps = DEFAULT_STEPS) {
  const sourceSteps = Array.isArray(steps) && steps.length ? steps : DEFAULT_STEPS;

  return sourceSteps.map((step, index) => ({
    ...step,
    index: step.index || index + 1,
    isLast: index === sourceSteps.length - 1,
    iconText: step.iconText || ["▤", "盾", "↻"][index] || "✓"
  }));
}

function normalizeArticle(article) {
  const answerText = Array.isArray(article.answer) && article.answer.length
    ? article.answer
    : (Array.isArray(article.body) ? article.body : []);

  return {
    ...article,
    tag: article.tag || "常见问题",
    subtitle: article.subtitle || article.summary || "查看这个问题的说明和处理建议。",
    answerText,
    steps: normalizeSteps(article.steps)
  };
}

function toQuestion(article) {
  return {
    id: article.id,
    title: article.title || "帮助问题"
  };
}

function rotateList(list, offset) {
  if (!list.length) {
    return [];
  }

  const start = offset % list.length;
  return list.slice(start).concat(list.slice(0, start));
}

Page({
  data: {
    article: null,
    allArticles: [],
    relatedQuestions: [],
    relatedCursor: 0,
    loading: true,
    hasError: false
  },

  async onLoad(options) {
    const articleId = getStringParam(options, "articleId", DEFAULT_ARTICLE_ID);
    await this.loadArticle(articleId);
  },

  async loadArticle(articleId) {
    this.setData({
      loading: true,
      hasError: false,
      article: null,
      relatedQuestions: []
    });

    try {
      const allArticles = await listHelpArticles();
      const article = allArticles.find((item) => item.id === articleId);

      if (!article) {
        this.setData({
          allArticles,
          loading: false,
          hasError: true
        });
        return;
      }

      const normalizedArticle = normalizeArticle(article);
      const relatedQuestions = this.buildRelatedQuestions(normalizedArticle, allArticles, 0);

      this.setData({
        article: normalizedArticle,
        allArticles,
        relatedQuestions,
        relatedCursor: 0,
        loading: false,
        hasError: false
      });
    } catch (error) {
      this.setData({
        loading: false,
        hasError: true,
        article: null,
        relatedQuestions: []
      });
    }
  },

  buildRelatedQuestions(article, allArticles, cursor = 0) {
    const relatedIds = Array.isArray(article.relatedIds) ? article.relatedIds : [];
    const preferred = relatedIds
      .map((id) => allArticles.find((item) => item.id === id))
      .filter(Boolean);
    const fallback = allArticles.filter((item) => item.id !== article.id && !relatedIds.includes(item.id));
    const pool = preferred.concat(fallback).map(toQuestion);

    return rotateList(pool, cursor).slice(0, 5);
  },

  handleBack() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > 1) {
      back();
      return;
    }

    navigate(HELP_CENTER_PATH);
  },

  handleBackHelp() {
    navigate(HELP_CENTER_PATH);
  },

  handleFeedback() {
    navigate(FEEDBACK_PATH);
  },

  handleRelated(event) {
    const articleId = event.currentTarget.dataset.articleId;
    if (!articleId) {
      showToast("这条帮助暂时不可用");
      return;
    }

    wx.redirectTo({
      url: `${DETAIL_PATH}?articleId=${encodeURIComponent(articleId)}`
    });
  },

  handleRefreshRelated() {
    if (!this.data.article || this.data.allArticles.length <= 2) {
      showToast("暂时没有更多相关问题");
      return;
    }

    const nextCursor = this.data.relatedCursor + 2;
    const relatedQuestions = this.buildRelatedQuestions(this.data.article, this.data.allArticles, nextCursor);

    this.setData({
      relatedCursor: nextCursor,
      relatedQuestions
    });
    showToast("已换一批");
  },

  handleReloadDefault() {
    this.loadArticle(DEFAULT_ARTICLE_ID);
  }
});
