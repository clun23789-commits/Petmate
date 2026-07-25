"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const { openArView } = require("../../../flows/arFlow");
const { getDefaultSharePayload, prepareWorkSharePayload } = require("../../../flows/shareFlow");
const { experienceFlags } = require("../../../config/experience");
const { bindStore } = require("../../../store/core/bindStore");
const { switchTab } = require("../../../utils/navigation");
const { NAV_FROM, getReturnContext, returnToSource } = require("../../../utils/navigationContext");
const { getStringParam } = require("../../../utils/query");
const { showToast } = require("../../../utils/toast");

const DEFAULT_PREVIEW = "/assets/mock/pet-corgi-hero.png";
const DEFAULT_NAME = "当前宠物作品";
const DEFAULT_SIZE = 80;
const MIN_SIZE = 60;
const MAX_SIZE = 100;
const SHARE_READY_HINT = "可把当前宠物作品的 AR 展示预览发送给朋友。";
const SHARE_ERROR_TEXT = "分享准备失败，请稍后重试";

const ISSUE_OPTIONS = [
  { key: "camera", label: "相机权限未开启" },
  { key: "lighting", label: "光线不足" },
  { key: "plane", label: "识别平面失败" },
  { key: "performance", label: "设备性能不足" }
];

const SIDE_TOOL_CONFIG = [
  { key: "action", icon: "动", label: "动作" },
  { key: "filter", icon: "滤", label: "滤镜" },
  { key: "lighting", icon: "光", label: "光影" },
  { key: "grid", icon: "格", label: "网格" },
  { key: "capture", icon: "拍", label: "截图" },
  { key: "record", icon: "录", label: "录屏" }
];

const PET_ACTION_CONFIG = [
  { key: "idle", label: "待机" },
  { key: "walk", label: "走路" },
  { key: "sit", label: "坐下" },
  { key: "lie", label: "趴下" },
  { key: "stretch", label: "伸懒腰" }
];

const STAGE_META = {
  preparing: {
    navStageText: "初始化中",
    stageTitle: "正在准备 AR 展示",
    stageHint: "请稍候，我们正在初始化当前宠物作品。",
    planeResultText: "准备检测",
    planeStatusText: "正在初始化相机"
  },
  searching: {
    navStageText: "识别平面",
    stageTitle: "移动手机，寻找平面",
    stageHint: "建议将镜头缓慢移动到地面、地毯或桌面附近。",
    planeResultText: "正在识别",
    planeStatusText: "请缓慢移动手机"
  },
  placed: {
    navStageText: "识别成功",
    stageTitle: "已放置，可拖动调整位置",
    stageHint: "可以拖动宠物移动位置，双指缩放，双指旋转。",
    planeResultText: "识别成功",
    planeStatusText: "可在平面上放置"
  }
};

let unbind = null;
let searchingTimer = 0;
let placedTimer = 0;

function formatCaptureTime() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  const hour = `${now.getHours()}`.padStart(2, "0");
  const minute = `${now.getMinutes()}`.padStart(2, "0");

  return `${month}-${day} ${hour}:${minute}`;
}

function buildSideTools(activeToolKey, isRecording) {
  return SIDE_TOOL_CONFIG.map((item) => ({
    ...item,
    active: item.key === "record" ? isRecording : item.key === activeToolKey
  }));
}

function buildPetActions(selectedActionKey) {
  return PET_ACTION_CONFIG.map((item) => ({
    ...item,
    selected: item.key === selectedActionKey
  }));
}

function buildScaleStyles(sizePercent) {
  const percent = Math.max(MIN_SIZE, Math.min(MAX_SIZE, sizePercent));
  const modelWidth = Math.round(228 + percent * 2.4);
  const modelHeight = Math.round(modelWidth * 1.24);
  const shadowWidth = Math.round(modelWidth * 0.84);
  const shadowHeight = Math.round(modelWidth * 0.22);
  const trackPercent = ((percent - MIN_SIZE) / (MAX_SIZE - MIN_SIZE)) * 100;

  return {
    petModelStyle: `width:${modelWidth}rpx;height:${modelHeight}rpx;`,
    petShadowStyle: `width:${shadowWidth}rpx;height:${shadowHeight}rpx;`,
    sizeTrackFillStyle: `width:${trackPercent}%;`,
    sizeThumbStyle: `left:${trackPercent}%;`
  };
}

function getStageMeta(stage) {
  return STAGE_META[stage] || STAGE_META.preparing;
}

Page({
  data: {
    workId: "",
    from: NAV_FROM.result,
    returnTo: "",
    work: null,
    version: null,
    petNameText: DEFAULT_NAME,
    petPreviewImage: DEFAULT_PREVIEW,
    navWrapStyle: "",
    navMainStyle: "",
    sideStyle: "",
    stage: "preparing",
    navStageText: STAGE_META.preparing.navStageText,
    stageTitle: STAGE_META.preparing.stageTitle,
    stageHint: STAGE_META.preparing.stageHint,
    planeResultText: STAGE_META.preparing.planeResultText,
    planeStatusText: STAGE_META.preparing.planeStatusText,
    issueOptions: ISSUE_OPTIONS,
    showToolPanel: false,
    showDevOnlyUi: experienceFlags.showDevOnlyUi,
    activeToolKey: "",
    isRecording: false,
    sideTools: buildSideTools("", false),
    petActions: buildPetActions("idle"),
    selectedActionKey: "idle",
    placementMode: "place",
    sizePercent: DEFAULT_SIZE,
    petModelStyle: buildScaleStyles(DEFAULT_SIZE).petModelStyle,
    petShadowStyle: buildScaleStyles(DEFAULT_SIZE).petShadowStyle,
    sizeTrackFillStyle: buildScaleStyles(DEFAULT_SIZE).sizeTrackFillStyle,
    sizeThumbStyle: buildScaleStyles(DEFAULT_SIZE).sizeThumbStyle,
    operationHintVisible: false,
    scenario: "success",
    captureReady: false,
    captureTitle: "",
    captureNote: "",
    shareStatus: "idle",
    sharePayload: null,
    shareReady: false,
    shareHint: "",
    shareErrorText: "",
    workAvailable: false
  },

  async onLoad(options) {
    const workId = getStringParam(options, "workId");
    const scenario = getStringParam(options, "arScenario", "success");
    const returnContext = getReturnContext(options, workId ? NAV_FROM.result : NAV_FROM.works);

    this.setData({
      workId,
      scenario,
      from: returnContext.from,
      returnTo: returnContext.returnTo
    });

    this.updateNavLayout();

    unbind = bindStore(this, (state) => {
      const work = state.workState.workMap[workId];
      const version = work && work.currentVersionId ? state.workState.versionMap[work.currentVersionId] : null;

      return {
        work,
        version,
        workAvailable: Boolean(work && version),
        petNameText: (work && work.petName) || DEFAULT_NAME,
        petPreviewImage: (version && version.previewMedia && version.previewMedia.cover) || DEFAULT_PREVIEW
      };
    });

    if (this.data.workAvailable) {
      await this.beginSession(scenario);
    }
  },

  onUnload() {
    if (unbind) {
      unbind();
      unbind = null;
    }

    this.clearStageTimers();
  },

  onShareAppMessage() {
    const fallback = getDefaultSharePayload(this.data.work, { scene: "ar" });
    const sharePayload = this.data.sharePayload;

    return {
      title: (sharePayload && sharePayload.title) || fallback.title,
      path: (sharePayload && sharePayload.path) || fallback.path,
      imageUrl: (sharePayload && sharePayload.imageUrl) || fallback.imageUrl
    };
  },

  clearStageTimers() {
    if (searchingTimer) {
      clearTimeout(searchingTimer);
      searchingTimer = 0;
    }

    if (placedTimer) {
      clearTimeout(placedTimer);
      placedTimer = 0;
    }
  },

  updateNavLayout() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const screenWidth = windowInfo.windowWidth || 375;
    let safeTop = statusBarHeight + 8;
    let sideWidth = 72;
    let navHeight = 44;

    try {
      const menuButton = wx.getMenuButtonBoundingClientRect();

      if (menuButton && menuButton.width) {
        safeTop = menuButton.top || safeTop;
        navHeight = Math.max(menuButton.height || 32, 44);
        sideWidth = Math.max(72, Math.max(screenWidth - menuButton.left + 6, menuButton.width + 6));
      }
    } catch (error) {
      sideWidth = 72;
    }

    this.setData({
      navWrapStyle: `padding-top:${safeTop}px;`,
      navMainStyle: `min-height:${navHeight}px;`,
      sideStyle: `width:${sideWidth}px;min-width:${sideWidth}px;`
    });
  },

  applyStage(stage) {
    const meta = getStageMeta(stage);

    this.setData({
      stage,
      navStageText: meta.navStageText,
      stageTitle: meta.stageTitle,
      stageHint: meta.stageHint,
      planeResultText: meta.planeResultText,
      planeStatusText: meta.planeStatusText,
      operationHintVisible: stage === "placed"
    });
  },

  async prepareSharePayload(showNotice) {
    const work = this.data.work;

    if (this.data.shareStatus === "loading") {
      return;
    }

    if (this.data.sharePayload && this.data.sharePayload.workId === this.data.workId) {
      if (showNotice) {
        this.setData({
          shareReady: true,
          shareHint: SHARE_READY_HINT
        });
        showToast("分享卡片已准备好", "success");
      }
      return;
    }

    if (!this.data.workId || !work) {
      this.setData({
        shareStatus: "error",
        shareErrorText: SHARE_ERROR_TEXT
      });
      if (showNotice) {
        showToast(SHARE_ERROR_TEXT);
      }
      return;
    }

    this.setData({
      shareStatus: "loading",
      shareErrorText: ""
    });

    try {
      const sharePayload = await prepareWorkSharePayload(work, { scene: "ar" });

      this.setData({
        shareStatus: "ready",
        sharePayload,
        shareReady: showNotice ? true : this.data.shareReady,
        shareHint: showNotice ? SHARE_READY_HINT : this.data.shareHint,
        shareErrorText: ""
      });

      if (showNotice) {
        showToast("分享卡片已准备好", "success");
      }
    } catch (error) {
      console.error("prepare ar share failed", error);
      this.setData({
        shareStatus: "error",
        sharePayload: null,
        shareReady: false,
        shareErrorText: SHARE_ERROR_TEXT
      });
      if (showNotice) {
        showToast(SHARE_ERROR_TEXT);
      }
    }
  },

  async beginSession(mode = "success") {
    this.clearStageTimers();
    this.applyStage("preparing");

    const success = await openArView(this.data.workId, mode, {
      from: this.data.from,
      returnTo: this.data.returnTo
    });

    if (!success) {
      return;
    }

    searchingTimer = setTimeout(() => {
      this.applyStage("searching");
    }, 560);

    placedTimer = setTimeout(() => {
      this.applyStage("placed");
    }, 1680);
  },

  updateSize(sizePercent) {
    const nextSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, sizePercent));
    const styles = buildScaleStyles(nextSize);

    this.setData({
      sizePercent: nextSize,
      petModelStyle: styles.petModelStyle,
      petShadowStyle: styles.petShadowStyle,
      sizeTrackFillStyle: styles.sizeTrackFillStyle,
      sizeThumbStyle: styles.sizeThumbStyle
    });
  },

  toggleToolPanel() {
    this.setData({
      showToolPanel: !this.data.showToolPanel
    });
  },

  closeToolPanel() {
    this.setData({
      showToolPanel: false
    });
  },

  handleExit() {
    if (!this.data.workId) {
      switchTab("/pages/works/index/index");
      return;
    }

    returnToSource(this.data, {
      workId: this.data.workId
    });
  },

  handleGoWorks() {
    switchTab("/pages/works/index/index");
  },

  async handleIssue(event) {
    const reason = event.currentTarget.dataset.reason;

    this.setData({
      captureReady: false,
      shareReady: false,
      showToolPanel: false,
      activeToolKey: "",
      isRecording: false,
      sideTools: buildSideTools("", false)
    });

    await this.beginSession(reason);
  },

  handleCloseOperationHint() {
    this.setData({
      operationHintVisible: false
    });
  },

  handleCloseToast(event) {
    const kind = event.currentTarget.dataset.kind;

    if (kind === "share") {
      this.setData({
        shareReady: false,
        shareErrorText: ""
      });
      return;
    }

    this.setData({
      captureReady: false
    });
  },

  handleUndo() {
    if (this.data.selectedActionKey !== "idle") {
      this.setData({
        selectedActionKey: "idle",
        petActions: buildPetActions("idle")
      });
      showToast("已恢复默认动作");
      return;
    }

    if (this.data.sizePercent !== DEFAULT_SIZE) {
      this.updateSize(DEFAULT_SIZE);
      showToast("已恢复默认大小");
      return;
    }

    if (!this.data.operationHintVisible && this.data.stage === "placed") {
      this.setData({
        operationHintVisible: true
      });
      showToast("已恢复操作提示");
      return;
    }

    showToast("当前没有可撤销的操作");
  },

  async handleRecheck() {
    this.setData({
      activeToolKey: "",
      isRecording: false,
      sideTools: buildSideTools("", false),
      selectedActionKey: "idle",
      petActions: buildPetActions("idle"),
      placementMode: "place",
      captureReady: false,
      shareReady: false
    });

    this.updateSize(DEFAULT_SIZE);
    await this.beginSession("success");
  },

  handlePlacementMode(event) {
    const mode = event.currentTarget.dataset.mode;

    if (!mode || mode === this.data.placementMode) {
      return;
    }

    this.setData({
      placementMode: mode,
      operationHintVisible: this.data.stage === "placed"
    });

    showToast(mode === "place" ? "已切换为摆放模式" : "已切换为跟随模式", "success");
  },

  toggleToolPreview(toolKey, enabledText, disabledText) {
    const nextKey = this.data.activeToolKey === toolKey ? "" : toolKey;

    this.setData({
      activeToolKey: nextKey,
      sideTools: buildSideTools(nextKey, this.data.isRecording)
    });

    showToast(nextKey === toolKey ? enabledText : disabledText, nextKey === toolKey ? "success" : "none");
  },

  handleCapture(sourceLabel) {
    const petName = this.data.petNameText || DEFAULT_NAME;

    this.setData({
      captureReady: true,
      shareReady: false,
      captureTitle: `${petName} AR 展示预览`,
      captureNote: `${sourceLabel} · ${formatCaptureTime()}`
    });
  },

  async handleSideTool(event) {
    const toolKey = event.currentTarget.dataset.tool;

    if (toolKey === "capture") {
      this.handleCapture("截图预览已生成");
      showToast("截图预览已生成", "success");
      return;
    }

    if (toolKey === "record") {
      const isRecording = !this.data.isRecording;

      this.setData({
        isRecording,
        sideTools: buildSideTools(this.data.activeToolKey, isRecording)
      });

      showToast(isRecording ? "录屏预览已开始" : "录屏预览已结束", isRecording ? "success" : "none");
      return;
    }

    if (toolKey === "action") {
      this.toggleToolPreview("action", "可在底部切换宠物动作", "已回到默认工具视图");
      return;
    }

    if (toolKey === "filter") {
      this.toggleToolPreview("filter", "已切换滤镜预览", "已恢复默认预览");
      return;
    }

    if (toolKey === "lighting") {
      this.toggleToolPreview("lighting", "已增强当前光影预览", "已恢复默认光影");
      return;
    }

    if (toolKey === "grid") {
      this.toggleToolPreview("grid", "已开启平面参考网格", "已关闭参考网格");
    }
  },

  handleActionMore() {
    showToast("更多动作已在准备中");
  },

  handleSelectAction(event) {
    const actionKey = event.currentTarget.dataset.action;
    const action = PET_ACTION_CONFIG.find((item) => item.key === actionKey);

    if (!action) {
      return;
    }

    this.setData({
      selectedActionKey: actionKey,
      petActions: buildPetActions(actionKey)
    });

    showToast(`${action.label}动作已就绪`, "success");
  },

  handleSizeMinus() {
    this.updateSize(this.data.sizePercent - 10);
  },

  handleSizePlus() {
    this.updateSize(this.data.sizePercent + 10);
  },

  handleTutorial() {
    this.setData({
      operationHintVisible: this.data.stage === "placed"
    });

    showToast("可拖动、双指缩放并双指旋转宠物");
  },

  handleSaveAlbum() {
    this.setData({
      showToolPanel: false
    });

    this.handleCapture("已保存到相册");
    showToast("已保存到相册", "success");
  },

  async handleShareButton() {
    this.setData({
      showToolPanel: false,
      captureReady: false
    });

    await this.prepareSharePayload(true);
  }
});
