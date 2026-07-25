"use strict";

const { saveDetailRetouch } = require("../../../flows/optimizationFlow");
const { bindStore } = require("../../../store/core/bindStore");
const { back, replace } = require("../../../utils/navigation");
const { getStringParam } = require("../../../utils/query");
const { showToast } = require("../../../utils/toast");

const DEFAULT_PREVIEW = "/assets/mock/pet-corgi-hero.png";
const DEFAULT_CAT_PREVIEW = "/assets/mock/pet-cat-hero.png";
const DEFAULT_BEFORE = "/assets/mock/retouch-before.png";
const DEFAULT_AFTER = "/assets/mock/retouch-after.png";

const PART_OPTIONS = [
  {
    key: "tail",
    label: "尾尖",
    desc: "尾尖白色边界和橙色过渡",
    thumb: "/assets/mock/retouch-before.png",
    beforeSrc: "/assets/mock/retouch-before.png",
    afterSrc: "/assets/mock/retouch-after.png"
  },
  {
    key: "ear",
    label: "耳缘",
    desc: "耳朵边缘的浅橙色细节",
    thumb: "/assets/mock/upload-close.png",
    beforeSrc: "/assets/mock/upload-close.png",
    afterSrc: "/assets/mock/retouch-after.png"
  },
  {
    key: "chest",
    label: "胸口毛色",
    desc: "胸口浅色毛块边缘",
    thumb: "/assets/mock/retouch-after.png",
    beforeSrc: "/assets/mock/retouch-before.png",
    afterSrc: "/assets/mock/retouch-after.png"
  },
  {
    key: "back",
    label: "背部花纹",
    desc: "背部橙白花纹过渡",
    thumb: "/assets/mock/pet-corgi-hero.png",
    beforeSrc: "/assets/mock/retouch-before.png",
    afterSrc: "/assets/mock/retouch-after.png"
  }
];

const COLOR_OPTIONS = [
  { value: "#ffffff", label: "白色" },
  { value: "#edd8bb", label: "奶油色" },
  { value: "#dac4aa", label: "浅棕" },
  { value: "#f4a45f", label: "橙色" },
  { value: "#9c5f28", label: "深橙" },
  { value: "#342719", label: "深棕" },
  { value: "#9a9a9a", label: "灰色" }
];

const TOOL_OPTIONS = [
  { key: "brush", label: "画笔", icon: "笔" },
  { key: "eraser", label: "橡皮", icon: "擦" },
  { key: "patch", label: "局部修补", icon: "补" },
  { key: "undo", label: "撤销", icon: "↶" },
  { key: "redo", label: "重做", icon: "↷" }
];

let unbind = null;
let saveTimer = null;

function getPartOption(key) {
  return PART_OPTIONS.find((item) => item.key === key) || PART_OPTIONS[0];
}

function getColorOption(value) {
  return COLOR_OPTIONS.find((item) => item.value === value) || COLOR_OPTIONS[3];
}

function resolveMainPreviewSrc(work, version) {
  if (version && version.previewMedia && version.previewMedia.cover) {
    return version.previewMedia.cover;
  }
  if (work && work.previewImage) {
    return work.previewImage;
  }
  if (work && work.petType === "cat") {
    return DEFAULT_CAT_PREVIEW;
  }
  return DEFAULT_PREVIEW;
}

Page({
  data: {
    workId: "",
    versionId: "",
    work: null,
    version: null,
    mainPreviewSrc: DEFAULT_PREVIEW,
    beforeSrc: DEFAULT_BEFORE,
    afterSrc: DEFAULT_AFTER,
    partOptions: PART_OPTIONS,
    colorOptions: COLOR_OPTIONS,
    toolOptions: TOOL_OPTIONS,
    selectedPart: "tail",
    selectedPartLabel: "尾尖",
    selectedPartDesc: "尾尖白色边界和橙色过渡",
    color: "#f4a45f",
    colorLabel: "橙色",
    brushSize: 30,
    committedBrushSize: 30,
    activeTool: "brush",
    editStep: 0,
    hasEdited: false,
    saving: false,
    saveStatus: "idle",
    saveErrorText: "",
    saveSubtext: "将应用到当前模型贴图",
    workAvailable: false
  },

  onLoad(options) {
    const workId = getStringParam(options, "workId");
    const versionId = getStringParam(options, "versionId");
    const defaultPart = getPartOption("tail");
    const defaultColor = getColorOption("#f4a45f");

    this.setData({
      workId,
      versionId,
      selectedPart: defaultPart.key,
      selectedPartLabel: defaultPart.label,
      selectedPartDesc: defaultPart.desc,
      beforeSrc: defaultPart.beforeSrc,
      afterSrc: defaultPart.afterSrc,
      color: defaultColor.value,
      colorLabel: defaultColor.label
    });

    unbind = bindStore(this, (state) => {
      const work = state.workState.workMap[workId] || null;
      const resolvedVersionId = versionId || (work && work.currentVersionId) || "";
      const version = resolvedVersionId ? state.workState.versionMap[resolvedVersionId] || null : null;
      const editableReady = Boolean(version && version.editableTexture && Array.isArray(version.editableTexture.notes));

      return {
        work,
        version,
        workAvailable: Boolean(work && version),
        versionId: resolvedVersionId,
        mainPreviewSrc: resolveMainPreviewSrc(work, version),
        saveSubtext: editableReady ? "将应用到当前模型贴图" : "当前作品信息缺失，请返回结果页重试"
      };
    });
  },

  onUnload() {
    if (unbind) {
      unbind();
      unbind = null;
    }
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  },

  handlePartTap(event) {
    const key = event.currentTarget.dataset.key;
    const part = getPartOption(key);
    if (!part || part.key === this.data.selectedPart) {
      return;
    }

    this.setData({
      selectedPart: part.key,
      selectedPartLabel: part.label,
      selectedPartDesc: part.desc,
      beforeSrc: part.beforeSrc,
      afterSrc: part.afterSrc
    });
  },

  handleColorTap(event) {
    const value = event.currentTarget.dataset.color;
    if (!value || value === this.data.color) {
      return;
    }

    const color = getColorOption(value);
    this.setData({
      color: color.value,
      colorLabel: color.label,
      hasEdited: true,
      editStep: this.data.editStep + 1
    });
  },

  handleBrushChanging(event) {
    this.setData({
      brushSize: Number(event.detail.value || this.data.brushSize)
    });
  },

  handleBrushChange(event) {
    const value = Number(event.detail.value || this.data.brushSize);
    if (value === this.data.committedBrushSize) {
      return;
    }

    this.setData({
      brushSize: value,
      committedBrushSize: value,
      hasEdited: true,
      editStep: this.data.editStep + 1
    });
  },

  handleToolTap(event) {
    const key = event.currentTarget.dataset.key;
    if (!key) {
      return;
    }

    if (key === "undo") {
      this.handleUndo();
      return;
    }

    if (key === "redo") {
      this.handleRedo();
      return;
    }

    if (key === this.data.activeTool) {
      return;
    }

    this.setData({
      activeTool: key,
      hasEdited: true,
      editStep: this.data.editStep + 1
    });
  },

  handleUndo() {
    if (this.data.editStep <= 0) {
      showToast("当前没有可撤销的操作");
      return;
    }

    const nextStep = this.data.editStep - 1;
    this.setData({
      editStep: nextStep,
      hasEdited: nextStep > 0
    });
    showToast("已撤销一步");
  },

  handleRedo() {
    const nextStep = this.data.editStep + 1;
    this.setData({
      editStep: nextStep,
      hasEdited: true
    });
    showToast("已恢复一步");
  },

  handleRotatePreview() {
    showToast("当前为演示预览，旋转功能稍后开放");
  },

  handleZoomPreview() {
    showToast("可以放大后更细致地查看局部区域");
  },

  handleMoreColor() {
    showToast("当前版本暂不开放复杂调色器，可先使用推荐色块");
  },

  handleTipTap() {
    showToast("建议放大后细致涂抹，颜色过渡会更自然");
  },

  handleCancel() {
    if (this.data.saving) {
      return;
    }

    if (!this.data.hasEdited) {
      this.goBackToResult();
      return;
    }

    wx.showModal({
      title: "放弃本次补色？",
      content: "当前局部补色还没有保存，确认放弃并返回结果页吗？",
      cancelText: "继续编辑",
      confirmText: "放弃返回",
      success: (result) => {
        if (result.confirm) {
          this.goBackToResult();
        }
      }
    });
  },

  buildRetouchNote() {
    const tool = TOOL_OPTIONS.find((item) => item.key === this.data.activeTool);
    return `已对${this.data.selectedPartLabel}进行${this.data.colorLabel}补色，使用${tool ? tool.label : "画笔"}，画笔大小 ${this.data.brushSize}px`;
  },

  async handleSave() {
    if (this.data.saving) {
      return;
    }

    if (!this.data.workId || !this.data.versionId || !this.data.version || !this.data.version.editableTexture || !Array.isArray(this.data.version.editableTexture.notes)) {
      showToast("当前作品信息缺失，请返回结果页重试");
      return;
    }

    this.setData({
      saving: true,
      saveStatus: "loading",
      saveErrorText: "",
      saveSubtext: "正在保存补色结果..."
    });

    const note = this.buildRetouchNote();
    const result = await saveDetailRetouch(this.data.workId, this.data.versionId, this.data.color, note);

    if (result && result.ok === true) {
      showToast("细节补色已保存", "success");
      saveTimer = setTimeout(() => {
        replace("/pages/works/result/index", {
          workId: this.data.workId,
          versionId: result.versionId
        });
      }, 180);
      return;
    }

    const message = (result && result.message) || "补色结果暂未同步到云端，请重试。";
    this.setData({
      saving: false,
      saveStatus: "failed",
      saveErrorText: message,
      saveSubtext: "补色结果暂未同步到云端，请重试。"
    });
    showToast(message);
  },

  goBackToResult() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > 1) {
      back();
      return;
    }

    if (this.data.workId) {
      replace("/pages/works/result/index", {
        workId: this.data.workId
      });
      return;
    }

    back();
  }
});
