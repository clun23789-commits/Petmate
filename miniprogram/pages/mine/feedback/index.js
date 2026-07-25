"use strict";

const { navigate, back } = require("../../../utils/navigation");
const { getStringParam } = require("../../../utils/query");
const { showToast } = require("../../../utils/toast");

const HELP_PATH = "/pages/mine/help/index";
const MAX_CONTENT_LENGTH = 500;
const MAX_SCREENSHOT_COUNT = 3;

const FEEDBACK_TYPES = [
  { key: "ad", label: "广告问题", icon: "AD", iconClass: "type-icon-green" },
  { key: "upload", label: "上传问题", icon: "+", iconClass: "type-icon-green" },
  { key: "generate", label: "生成问题", icon: "★", iconClass: "type-icon-orange" },
  { key: "payment", label: "支付问题", icon: "▰", iconClass: "type-icon-blue" },
  { key: "ar", label: "AR 问题", icon: "◇", iconClass: "type-icon-purple" },
  { key: "other", label: "其他建议", icon: "✦", iconClass: "type-icon-yellow" }
];

function normalizeScreenshots(files) {
  return (files || [])
    .map((file) => {
      if (typeof file === "string") {
        return { path: file, size: 0 };
      }

      return {
        path: file.tempFilePath || file.path || "",
        size: file.size || 0
      };
    })
    .filter((file) => file.path);
}

Page({
  data: {
    feedbackTypes: FEEDBACK_TYPES,
    selectedType: "generate",
    type: "生成问题",
    content: "",
    contentLength: 0,
    contact: "",
    screenshots: [],
    maxScreenshotCount: MAX_SCREENSHOT_COUNT,
    submitScenario: "success",
    submitFailed: false,
    isSubmitting: false
  },

  onLoad(options) {
    this.setData({
      submitScenario: getStringParam(options, "submitScenario", "success")
    });
  },

  handleBack() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > 1) {
      back();
      return;
    }

    navigate(HELP_PATH);
  },

  handleSelectType(event) {
    const dataset = event.currentTarget.dataset || {};
    const selectedType = dataset.type || "generate";
    const type = dataset.label || "生成问题";

    this.setData({
      selectedType,
      type,
      submitFailed: false
    });
  },

  handleTypeInput(event) {
    this.setData({
      type: event.detail.value || "",
      submitFailed: false
    });
  },

  handleContentInput(event) {
    const value = (event.detail.value || "").slice(0, MAX_CONTENT_LENGTH);

    this.setData({
      content: value,
      contentLength: value.length,
      submitFailed: false
    });
  },

  handleContactInput(event) {
    this.setData({
      contact: (event.detail.value || "").slice(0, 60),
      submitFailed: false
    });
  },

  handleChooseImage() {
    const remain = this.data.maxScreenshotCount - this.data.screenshots.length;

    if (remain <= 0) {
      showToast("最多上传 3 张截图");
      return;
    }

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: remain,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        success: (res) => {
          const files = normalizeScreenshots(res.tempFiles);
          this.appendScreenshots(files);
        },
        fail: () => {}
      });
      return;
    }

    wx.chooseImage({
      count: remain,
      sourceType: ["album", "camera"],
      success: (res) => {
        const files = normalizeScreenshots(res.tempFiles && res.tempFiles.length ? res.tempFiles : res.tempFilePaths);
        this.appendScreenshots(files);
      },
      fail: () => {}
    });
  },

  appendScreenshots(files) {
    if (!files.length) {
      return;
    }

    this.setData({
      screenshots: this.data.screenshots.concat(files).slice(0, this.data.maxScreenshotCount),
      submitFailed: false
    });
  },

  handleRemoveImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const screenshots = this.data.screenshots.filter((_, itemIndex) => itemIndex !== index);

    this.setData({
      screenshots,
      submitFailed: false
    });
  },

  handleSubmit() {
    const content = (this.data.content || "").trim();

    if (!content) {
      showToast("请先描述你遇到的问题");
      return;
    }

    if (this.data.isSubmitting) {
      return;
    }

    this.setData({
      isSubmitting: true
    });

    setTimeout(() => {
      if (this.data.submitScenario === "failed") {
        this.setData({
          submitFailed: true,
          isSubmitting: false
        });
        showToast("本次提交暂未成功，请稍后重试");
        return;
      }

      this.setData({
        submitFailed: false,
        isSubmitting: false
      });
      showToast("反馈已提交，感谢你的帮助", "success");
    }, 300);
  },

  handleBackToHelp() {
    navigate(HELP_PATH);
  }
});
