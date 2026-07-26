"use strict";

const { enterArEntry } = require("../../../flows/arFlow");
const { syncArEntitlement } = require("../../../flows/arFlow");
const { openTargetedUpload, submitResultOptimization, updateFeedback } = require("../../../flows/optimizationFlow");
const { syncOptimizeQuota } = require("../../../flows/optimizeQuota");
const { prepareWorkSharePayload } = require("../../../flows/shareFlow");
const { ensureCloudWorkLoaded, retrySaveWorkToCloud } = require("../../../flows/workSyncFlow");
const { bindStore } = require("../../../store/core/bindStore");
const { selectCloudSaveStatus, selectRemainingOptimizeCount, selectWorkFeedback, selectWorkSuggestions } = require("../../../store/selectors/index");
const { NAV_FROM, buildResultReturnTo, getReturnContext, returnToSource } = require("../../../utils/navigationContext");
const { getStringParam } = require("../../../utils/query");
const { navigate, switchTab } = require("../../../utils/navigation");
const { PAGE_ROUTES } = require("../../../utils/routes");
const { showToast } = require("../../../utils/toast");

const feedbackItems = [
  { label: "毛色", dimension: "fur" },
  { label: "花纹", dimension: "pattern" },
  { label: "体型", dimension: "body" },
  { label: "脸部轮廓", dimension: "face" },
  { label: "耳朵", dimension: "ears" },
  { label: "尾巴", dimension: "tail" }
];

const DEFAULT_PET_NAME = "糖糖";
const DEFAULT_SHARE_TITLE = "我在 Petmate 生成了宠物数字形象";
const DEFAULT_SHARE_IMAGE = "/assets/mock/pet-corgi-hero.png";
const SHARE_READY_HINT = "分享卡片已准备好，请点击右上角或下方按钮发送。";
const SHARE_ERROR_TEXT = "分享准备失败，请稍后重试";

function formatPetName(work) {
  const rawName = (work && work.petName) || "";
  if (!rawName || rawName === "我的宠物作品" || rawName === "当前宠物作品") {
    return DEFAULT_PET_NAME;
  }
  return rawName;
}

function buildFeedbackCards(feedbackMap) {
  return feedbackItems.map((item) => {
    const value = (feedbackMap && feedbackMap[item.dimension] && feedbackMap[item.dimension].value) || "";
    return {
      ...item,
      value,
      likeActive: value === "like",
      unlikeActive: value === "unlike",
      statusText: value === "like" ? "你觉得比较像" : value === "unlike" ? "建议继续优化" : "还没有判断"
    };
  });
}

function buildFeedbackSummaryChips(feedbackCards) {
  const featuredDimensions = ["fur", "pattern", "ears"];
  const featuredSet = new Set(featuredDimensions);
  const featured = featuredDimensions
    .map((dimension) => feedbackCards.find((item) => item.dimension === dimension))
    .filter(Boolean)
    .map((item) => ({
      ...item,
      chipText: item.label,
      active: item.likeActive || item.unlikeActive,
      tone: item.unlikeActive ? "brand" : item.likeActive ? "soft" : "neutral"
    }));
  const remainingCards = feedbackCards.filter((item) => !featuredSet.has(item.dimension));
  const hasMoreUnlike = remainingCards.some((item) => item.unlikeActive);
  const hasMoreLike = remainingCards.some((item) => item.likeActive);
  return [
    ...featured,
    {
      dimension: "more",
      label: "更多维度",
      chipText: "+ 更多维度",
      active: hasMoreUnlike || hasMoreLike,
      tone: hasMoreUnlike ? "brand" : hasMoreLike ? "soft" : "more"
    }
  ];
}

function buildCloudSaveMeta(status, cloudError) {
  if (status === "loading") {
    return {
      show: true,
      tone: "neutral",
      title: "作品正在保存到云端",
      message: "请稍候，保存完成后重新打开小程序也能找回它。",
      canRetry: false
    };
  }

  if (status === "failed") {
    return {
      show: true,
      tone: "warning",
      title: "作品已生成，但暂时未保存到云端",
      message: cloudError || "请点击重新保存，避免关闭小程序后丢失。",
      canRetry: true
    };
  }

  return {
    show: false,
    tone: "success",
    title: "",
    message: "",
    canRetry: false
  };
}

let unbind = null;

Page({
  data: {
    workId: "",
    versionId: "",
    from: NAV_FROM.works,
    returnTo: "",
    work: null,
    version: null,
    suggestions: [],
    remainingCount: 0,
    latestNote: "",
    feedbackCards: buildFeedbackCards({}),
    summaryFeedbackChips: buildFeedbackSummaryChips(buildFeedbackCards({})),
    unlikeCount: 0,
    showFeedbackPanel: false,
    arOwned: false,
    optimizationScenario: "success",
    shareStatus: "idle",
    sharePayload: null,
    shareErrorText: "",
    shareReady: false,
    shareHint: "",
    cloudSaveStatus: "idle",
    cloudSaveTitle: "",
    cloudSaveMessage: "",
    showCloudSaveNotice: false,
    cloudSaveNoticeTone: "neutral",
    cloudSaveCanRetry: false,
    cloudSaveRetrying: false,
    quotaSyncStatus: "idle",
    quotaSyncMessage: "",
    showQuotaSyncNotice: false,
    quotaConfirmationPending: false,
    isOptimizeSubmitting: false,
    petNameText: DEFAULT_PET_NAME,
    quotaText: "剩余 0 次优化",
    quotaEmpty: false,
    resultStatusLabel: "\u5f53\u524d\u7248\u672c\u4e3a\u57fa\u7840\u4f5c\u54c1\u7ed3\u679c",
    resultStatusTone: "muted",
    showBasicResultNotice: true,
    basicResultNoticeTitle: "\u4f5c\u54c1\u5df2\u751f\u6210",
    basicResultNoticeMessage: "\u5f53\u524d\u7248\u672c\u4e3a\u57fa\u7840\u4f5c\u54c1\u7ed3\u679c\uff0c\u53ef\u67e5\u770b\u7ed3\u679c\u5e76\u7ee7\u7eed\u8865\u56fe\u4f18\u5316\u3002",
    showArEntry: false,
    feedbackSummaryLinkText: "点击后展开完整反馈 >",
    feedbackPanelHint: "选择反馈本身不会扣次数；只有点击“提交并优化”后，才会预占 1 次。",
    optimizeButtonSubtext: "确认后进入生成等待页",
    quotaRuleSummary: "提交有效优化后会先预占 1 次；成功返回可用结果后才正式扣减，失败不扣减。",
    showSubmitOptimizeButton: false,
    showSuggestionList: false
  },

  onLoad(options) {
    const workId = getStringParam(options, "workId");
    const versionId = getStringParam(options, "versionId");
    const optimizationScenario = getStringParam(options, "optimizationScenario", "success");
    const saveStatus = getStringParam(options, "saveStatus", "");
    const quotaConfirmationPending = getStringParam(options, "quotaStatus", "") === "pending";
    const returnContext = getReturnContext(options, NAV_FROM.works);
    this.setData({
      workId,
      versionId,
      optimizationScenario,
      quotaConfirmationPending,
      from: returnContext.from,
      returnTo: returnContext.returnTo
    });

    unbind = bindStore(this, (state) => {
      const work = state.workState.workMap[workId];
      const routeVersionAvailable = versionId && state.workState.versionMap[versionId];
      const resolvedVersionId = routeVersionAvailable ? versionId : (work && work.currentVersionId) || versionId || "";
      const version = resolvedVersionId ? state.workState.versionMap[resolvedVersionId] : null;
      const feedbackCards = buildFeedbackCards(selectWorkFeedback(state, workId));
      const unlikeCount = feedbackCards.filter((item) => item.value === "unlike").length;
      const remainingCount = selectRemainingOptimizeCount(state);
      const quotaEmpty = remainingCount <= 0;
      const entitlement = state.arState.entitlementMapByWorkId[workId];
      const arOwned = entitlement && entitlement.status === "active";
      const notes = version && version.editableTexture && version.editableTexture.notes;
      const cloudSaveStatus = selectCloudSaveStatus(state, workId);
      const cloudSaveMeta = buildCloudSaveMeta(cloudSaveStatus, state.workState.cloudError);
      const quotaSyncStatus = state.optimizeState.quotaSyncStatus;
      const quotaSyncMessage = quotaConfirmationPending
        ? "作品已生成，优化次数正在确认。请稍后刷新，本次结果不会被删除，也不会重新创建预占。"
        : state.optimizeState.quotaError || "优化次数暂时使用本地记录，稍后会自动同步。";
      const suggestions = selectWorkSuggestions(state, workId);

      return {
        work,
        version,
        suggestions,
        remainingCount,
        latestNote: notes && notes.length ? notes[notes.length - 1] : "",
        feedbackCards,
        summaryFeedbackChips: buildFeedbackSummaryChips(feedbackCards),
        unlikeCount,
        arOwned,
        cloudSaveStatus,
        cloudSaveTitle: cloudSaveMeta.title,
        cloudSaveMessage: cloudSaveMeta.message,
        showCloudSaveNotice: cloudSaveMeta.show,
        cloudSaveNoticeTone: cloudSaveMeta.tone,
        cloudSaveCanRetry: cloudSaveMeta.canRetry,
        quotaSyncStatus,
        quotaSyncMessage,
        showQuotaSyncNotice: quotaConfirmationPending || quotaSyncStatus === "failed",
        petNameText: formatPetName(work),
        quotaText: quotaEmpty ? "暂无可用优化次数" : `剩余 ${remainingCount} 次优化`,
        quotaEmpty,
        resultStatusLabel: "\u5f53\u524d\u7248\u672c\u4e3a\u57fa\u7840\u4f5c\u54c1\u7ed3\u679c",
        resultStatusTone: "muted",
        showBasicResultNotice: true,
        basicResultNoticeTitle: "\u4f5c\u54c1\u5df2\u751f\u6210",
        basicResultNoticeMessage: "\u5f53\u524d\u7248\u672c\u4e3a\u57fa\u7840\u4f5c\u54c1\u7ed3\u679c\uff0c\u53ef\u67e5\u770b\u7ed3\u679c\u5e76\u7ee7\u7eed\u8865\u56fe\u4f18\u5316\u3002",
        showArEntry: false,
        feedbackSummaryLinkText: unlikeCount || this.data.showFeedbackPanel ? "点击后查看完整反馈 >" : "点击后展开完整反馈 >",
        feedbackPanelHint: unlikeCount ? "已选择需要优化的维度，确认提交后才会预占 1 次。" : "选择反馈本身不会扣次数；只有点击“提交并优化”后，才会预占 1 次。",
        optimizeButtonSubtext: quotaEmpty ? "当前次数不足，将先进入补充说明" : "确认后进入生成等待页",
        quotaRuleSummary: quotaEmpty ? "当前次数不足时会先进入补充说明，不会直接丢失这次反馈。" : "提交有效优化后会先预占 1 次；成功返回可用结果后才正式扣减，失败不扣减。",
        showSubmitOptimizeButton: unlikeCount > 0,
        showSuggestionList: unlikeCount > 0 && suggestions.length > 0
      };
    });
    if (saveStatus !== "failed") {
      ensureCloudWorkLoaded(workId).catch((error) => {
        console.error("result ensure cloud work failed", error);
      });
    }
    syncArEntitlement(workId).catch((error) => {
      console.error("result sync ar entitlement failed", error);
    });
    syncOptimizeQuota({ silent: true });
  },

  onUnload() {
    if (unbind) {
      unbind();
      unbind = null;
    }
  },

  markShareReady(showNotice) {
    if (!showNotice) {
      return;
    }
    this.setData({
      shareReady: true,
      shareHint: SHARE_READY_HINT
    });
    showToast("分享卡片已准备好", "success");
  },

  async prepareSharePayload(showNotice) {
    const work = this.data.work;
    if (this.data.shareStatus === "loading") {
      return;
    }
    if (this.data.sharePayload && this.data.sharePayload.workId === this.data.workId) {
      this.markShareReady(showNotice);
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
      const sharePayload = await prepareWorkSharePayload(work);
      this.setData({
        shareStatus: "ready",
        sharePayload,
        shareErrorText: ""
      });
      this.markShareReady(showNotice);
    } catch (error) {
      console.error("prepare result share failed", error);
      this.setData({
        shareStatus: "error",
        sharePayload: null,
        shareErrorText: SHARE_ERROR_TEXT
      });
      if (showNotice) {
        showToast(SHARE_ERROR_TEXT);
      }
    }
  },

  onShareAppMessage() {
    const sharePayload = this.data.sharePayload;
    if (sharePayload) {
      return {
        title: sharePayload.title,
        path: sharePayload.path,
        imageUrl: sharePayload.imageUrl
      };
    }

    return {
      title: DEFAULT_SHARE_TITLE,
      path: PAGE_ROUTES.works.index,
      imageUrl: DEFAULT_SHARE_IMAGE
    };
  },

  handleBackWorks() {
    returnToSource(this.data, {
      workId: this.data.workId,
      versionId: this.data.versionId
    });
  },

  handleOpenFeedback() {
    this.setData({
      showFeedbackPanel: true,
      feedbackSummaryLinkText: "点击后查看完整反馈 >"
    });
  },

  async handleLike(event) {
    const dimension = event.currentTarget.dataset.dimension;
    this.setData({
      showFeedbackPanel: true,
      feedbackSummaryLinkText: "点击后查看完整反馈 >"
    });
    const result = await updateFeedback(this.data.workId, dimension, "like");
    if (result && result.ok === false) {
      showToast(result.message || "反馈暂未同步，请稍后重试");
    }
  },

  async handleUnlike(event) {
    const dimension = event.currentTarget.dataset.dimension;
    this.setData({
      showFeedbackPanel: true,
      feedbackSummaryLinkText: "点击后查看完整反馈 >"
    });
    const result = await updateFeedback(this.data.workId, dimension, "unlike");
    if (result && result.ok === false) {
      showToast(result.message || "反馈暂未同步，请稍后重试");
    }
  },

  async handleRetryCloudSave() {
    if (this.data.cloudSaveRetrying || this.data.cloudSaveStatus === "loading") {
      return;
    }

    this.setData({
      cloudSaveRetrying: true
    });

    const result = await retrySaveWorkToCloud(this.data.workId);

    this.setData({
      cloudSaveRetrying: false
    });

    if (result.ok === true) {
      showToast("作品已保存", "success");
      return;
    }

    showToast(result.message || "保存失败，请稍后重试");
  },

  async handleOptimize() {
    if (this.data.isOptimizeSubmitting) {
      return;
    }
    if (!this.data.unlikeCount) {
      showToast("请先选择至少一个“不太像”的维度");
      return;
    }
    this.setData({
      isOptimizeSubmitting: true
    });
    try {
      await submitResultOptimization(this.data.workId, this.data.optimizationScenario === "failed");
    } finally {
      this.setData({
        isOptimizeSubmitting: false
      });
    }
  },

  handleRetouch() {
    if (!this.data.version) {
      return;
    }
    navigate(PAGE_ROUTES.works.detailRetouch, {
      workId: this.data.workId,
      versionId: this.data.version.versionId
    });
  },

  async handleEnterAr() {
    await enterArEntry(this.data.workId, {
      from: NAV_FROM.result,
      returnTo: buildResultReturnTo(this.data.workId, this.data.versionId)
    });
  },

  handleSuggestionAction(event) {
    openTargetedUpload(this.data.workId, event.currentTarget.dataset.dimension);
  },

  async handleShare() {
    await this.prepareSharePayload(true);
  }
});
