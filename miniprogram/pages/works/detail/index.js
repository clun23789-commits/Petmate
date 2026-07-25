"use strict";

const { deleteWorkById } = require("../../../flows/workManagement");
const { prepareWorkSharePayload } = require("../../../flows/shareFlow");
const { ensureCloudWorkLoaded } = require("../../../flows/workSyncFlow");
const { enterArEntry, syncArEntitlement } = require("../../../flows/arFlow");
const { bindStore } = require("../../../store/core/bindStore");
const { store } = require("../../../store/core/createStore");
const { selectRemainingOptimizeCount } = require("../../../store/selectors/index");
const { formatEntitlementStatus, formatWorkStatus } = require("../../../utils/formatter");
const { navigate, replace, switchTab } = require("../../../utils/navigation");
const { NAV_FROM, buildDetailReturnTo, withReturnContext } = require("../../../utils/navigationContext");
const { getStringParam } = require("../../../utils/query");
const { PAGE_ROUTES } = require("../../../utils/routes");
const { showToast } = require("../../../utils/toast");

const DEFAULT_DOG_PREVIEW = "/assets/mock/pet-corgi-hero.png";
const DEFAULT_CAT_PREVIEW = "/assets/mock/pet-cat-hero.png";
const DEFAULT_SHARE_TITLE = "我在 Petmate 生成了宠物数字形象";
const DEFAULT_SHARE_IMAGE = DEFAULT_DOG_PREVIEW;
const SHARE_READY_HINT = "分享卡片已准备好，请点击右上角或下方按钮发送。";
const SHARE_ERROR_TEXT = "分享准备失败，请稍后重试";

let unbind = null;

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function formatDateText(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function resolvePreviewImage(work, version) {
  if (version && version.previewMedia && version.previewMedia.cover) {
    return version.previewMedia.cover;
  }

  if (work && work.previewImage) {
    return work.previewImage;
  }

  return work && work.petType === "cat" ? DEFAULT_CAT_PREVIEW : DEFAULT_DOG_PREVIEW;
}

function resolvePetName(work) {
  const rawName = (work && (work.petName || work.displayName)) || "";
  if (!rawName || rawName === "我的宠物作品" || rawName === "当前宠物作品") {
    return "当前宠物作品";
  }

  return rawName;
}

function resolvePetTypeText(work) {
  if (work && work.petTypeLabel) {
    return work.petTypeLabel;
  }

  return work && work.petType === "cat" ? "猫" : "狗";
}

function buildVersionLabel(work, version) {
  const versionCount = Math.max(1, ((work && work.versionIds && work.versionIds.length) || 0) || (version ? 1 : 0));

  if (version && version.sourceType === "detail_retouch") {
    return `v${versionCount}.1`;
  }

  return `v${versionCount}.0`;
}

function buildDetailMetaItems(work, version) {
  return [
    {
      icon: "宠",
      label: "宠物类型",
      value: resolvePetTypeText(work)
    },
    {
      icon: "时",
      label: "创建时间",
      value: formatDateText(work && work.createdAt)
    },
    {
      icon: "版",
      label: "当前版本",
      value: buildVersionLabel(work, version)
    },
    {
      icon: "更",
      label: "最后更新",
      value: formatDateText((version && version.createdAt) || (work && work.updatedAt) || (work && work.createdAt))
    },
    {
      icon: "OK",
      label: "当前结果",
      value: "基础作品结果"
    }
  ];
}

function buildStatusSteps(work, entitlementStatus, remainingCount) {
  const versionCount = ((work && work.versionIds && work.versionIds.length) || 0) || 1;
  const optimizedCount = Math.max(0, versionCount - 1);
  const latestVersionLabel = buildVersionLabel(work, null);
  const arUnavailableStep = {
    key: "ar",
    icon: "AR",
    title: "AR 功能暂未开放",
    desc: "后续版本开放",
    tone: "muted"
  };

  if (work && work.status === "generating") {
    return {
      linePercent: 22,
      steps: [
        { key: "generated", icon: "等", title: "生成中", desc: formatDateText(work.createdAt), tone: "highlight" },
        { key: "optimized", icon: "等", title: "等待结果", desc: "可随时回来查看", tone: "muted" },
        arUnavailableStep,
        { key: "version", icon: "版", title: "最新版本", desc: latestVersionLabel, tone: "muted" }
      ]
    };
  }

  if (work && work.status === "failed") {
    return {
      linePercent: 18,
      steps: [
        { key: "generated", icon: "!", title: "生成失败", desc: formatDateText((work && work.updatedAt) || (work && work.createdAt)), tone: "danger" },
        { key: "optimized", icon: "保", title: "次数保留", desc: "权益未消耗", tone: "muted" },
        arUnavailableStep,
        { key: "version", icon: "试", title: "可重新尝试", desc: "返回继续创作", tone: "muted" }
      ]
    };
  }

  return {
    linePercent: 100,
    steps: [
      { key: "generated", icon: "好", title: "作品已生成", desc: formatDateText(work && work.createdAt), tone: "done" },
      {
        key: "optimized",
        icon: optimizedCount ? "好" : "待",
        title: optimizedCount ? "已优化" + optimizedCount + "次" : "待优化",
        desc: remainingCount > 0 ? "剩余 " + remainingCount + " 次" : "暂无可用次数",
        tone: optimizedCount ? "highlight" : "muted"
      },
      arUnavailableStep,
      {
        key: "version",
        icon: "版",
        title: "最新版本",
        desc: latestVersionLabel,
        tone: "done"
      }
    ]
  };
}

function buildRightsState(workStatus, entitlementStatus) {
  if (workStatus === "generating") {
    return {
      rightsTone: "pending",
      rightsIcon: "AR",
      rightsTitle: "AR \u529f\u80fd\u6682\u672a\u5f00\u653e",
      rightsDesc: "\u5f53\u524d\u7248\u672c\u4e3a\u57fa\u7840\u4f5c\u54c1\u7ed3\u679c\uff0c\u53ef\u67e5\u770b\u7ed3\u679c\u5e76\u7ee7\u7eed\u8865\u56fe\u4f18\u5316\u3002",
      rightsNote: "AR \u4f53\u9a8c\u5c06\u5728\u540e\u7eed\u7248\u672c\u5f00\u653e\u3002",
      rightsButtonText: "\u67e5\u770b\u540e\u7eed\u5f00\u653e\u8bf4\u660e",
      rightsActionMode: "generating"
    };
  }

  if (workStatus === "failed") {
    return {
      rightsTone: "danger",
      rightsIcon: "!",
      rightsTitle: "当前作品本轮生成未成功",
      rightsDesc: "生成失败时不会消耗优化次数，可先查看异常恢复说明。",
      rightsNote: "当前作品未生成可用结果前，暂时无法继续展示。",
      rightsButtonText: "查看异常恢复",
      rightsActionMode: "recovery"
    };
  }

  return {
    rightsTone: "muted",
    rightsIcon: "AR",
    rightsTitle: "AR 功能暂未开放",
    rightsDesc: "当前版本为基础作品结果，可查看结果并继续补图优化。",
    rightsNote: "AR 体验将在后续版本开放。",
    rightsButtonText: "查看后续开放说明",
    rightsActionMode: "guide"
  };
}

function buildStateViewModel(work, version, entitlementStatus, remainingCount) {
  const statusInfo = buildStatusSteps(work, entitlementStatus, remainingCount);
  const rightsState = buildRightsState(work && work.status, entitlementStatus);
  const isArOwned = entitlementStatus === "active";
  const isArPending = entitlementStatus === "pending_sync" || entitlementStatus === "paid";

  return {
    previewImage: resolvePreviewImage(work, version),
    petNameText: resolvePetName(work),
    detailMetaItems: buildDetailMetaItems(work, version),
    arLabel: "AR \u540e\u7eed\u5f00\u653e",
    arPillTone: "muted",
    showPrimaryActions: work && (work.status === "ready" || work.status === "retouched"),
    showGeneratingAction: work && work.status === "generating",
    showRecoveryAction: work && work.status === "failed",
    arActionTitle: "AR \u529f\u80fd\u6682\u672a\u5f00\u653e",
    arActionDesc: "\u540e\u7eed\u7248\u672c\u5f00\u653e\uff0c\u5f53\u524d\u53ef\u5148\u67e5\u770b\u57fa\u7840\u4f5c\u54c1\u7ed3\u679c",
    statusSteps: statusInfo.steps,
    statusLinePercent: statusInfo.linePercent,
    ...rightsState
  };
}

Page({
  data: {
    workId: "",
    work: null,
    version: null,
    workStatus: "",
    entitlementStatus: "\u0041\u0052 \u540e\u7eed\u5f00\u653e",
    previewImage: DEFAULT_DOG_PREVIEW,
    petNameText: "当前宠物作品",
    detailMetaItems: [],
    arLabel: "\u0041\u0052 \u540e\u7eed\u5f00\u653e",
    arPillTone: "muted",
    statusSteps: [],
    statusLinePercent: 0,
    showPrimaryActions: false,
    showGeneratingAction: false,
    showRecoveryAction: false,
    arActionTitle: "\u0041\u0052 \u529f\u80fd\u6682\u672a\u5f00\u653e",
    arActionDesc: "\u540e\u7eed\u7248\u672c\u5f00\u653e\uff0c\u5f53\u524d\u53ef\u5148\u67e5\u770b\u57fa\u7840\u4f5c\u54c1\u7ed3\u679c",
    rightsTone: "muted",
    rightsIcon: "AR",
    rightsTitle: "\u0041\u0052 \u529f\u80fd\u6682\u672a\u5f00\u653e",
    rightsDesc: "\u5f53\u524d\u7248\u672c\u4e3a\u57fa\u7840\u4f5c\u54c1\u7ed3\u679c\uff0c\u53ef\u67e5\u770b\u7ed3\u679c\u5e76\u7ee7\u7eed\u8865\u56fe\u4f18\u5316\u3002",
    rightsNote: "\u0041\u0052 \u4f53\u9a8c\u5c06\u5728\u540e\u7eed\u7248\u672c\u5f00\u653e\u3002",
    rightsButtonText: "\u67e5\u770b\u540e\u7eed\u5f00\u653e\u8bf4\u660e",
    rightsActionMode: "guide",
    shareStatus: "idle",
    sharePayload: null,
    shareErrorText: "",
    shareReady: false,
    shareHint: "",
    showDeleteConfirm: false,
    deleteSubmitting: false,
    deleteErrorText: ""
  },

  onLoad(options) {
    const workId = getStringParam(options, "workId");
    this.setData({ workId });

    unbind = bindStore(this, (state) => {
      const work = state.workState.workMap[workId];
      const version = work && work.currentVersionId ? state.workState.versionMap[work.currentVersionId] : null;
      const entitlementStatus = ((state.arState.entitlementMapByWorkId[workId] || {}).status) || "unpaid";
      const remainingCount = selectRemainingOptimizeCount(state);
      const viewModel = buildStateViewModel(work, version, entitlementStatus, remainingCount);

      return {
        work,
        version,
        workStatus: work ? formatWorkStatus(work.status) : "未找到作品",
        entitlementStatus: formatEntitlementStatus(entitlementStatus),
        ...viewModel
      };
    });
    ensureCloudWorkLoaded(workId).catch((error) => {
      console.error("detail ensure cloud work failed", error);
    });
    syncArEntitlement(workId).catch((error) => {
      console.error("detail sync ar entitlement failed", error);
    });
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
      console.error("prepare detail share failed", error);
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
      path: "/pages/works/index/index",
      imageUrl: DEFAULT_SHARE_IMAGE
    };
  },

  handlePreviewModel() {
    showToast("\u5f53\u524d\u4e3a\u57fa\u7840\u4f5c\u54c1\u9884\u89c8\uff0c\u53ef\u8fdb\u5165\u7ed3\u679c\u9875\u67e5\u770b\u7ec6\u8282");
  },

  handleZoomPreview() {
    showToast("放大预览功能后续开放");
  },

  handleEditName() {
    showToast("后续支持修改宠物昵称");
  },

  handleResult() {
    navigate(PAGE_ROUTES.works.result, withReturnContext({
      workId: this.data.workId
    }, {
      from: NAV_FROM.detail,
      returnTo: buildDetailReturnTo(this.data.workId)
    }));
  },

  async handleAr() {
    if (this.data.work && this.data.work.status === "generating") {
      this.handleGenerating();
      return;
    }

    if (this.data.work && this.data.work.status === "failed") {
      this.handleOpenRecovery();
      return;
    }

    await enterArEntry(this.data.workId, {
      from: NAV_FROM.detail,
      returnTo: buildDetailReturnTo(this.data.workId)
    });
  },

  handleRightsAction() {
    if (this.data.rightsActionMode === "generating") {
      this.handleGenerating();
      return;
    }

    if (this.data.rightsActionMode === "recovery") {
      this.handleOpenRecovery();
      return;
    }

    this.handleAr();
  },

  handleGenerating() {
    const activeTaskId = store.getState().generationState.activeTaskId;
    navigate("/pages/works/generating/index", {
      workId: this.data.workId,
      taskId: activeTaskId
    });
  },

  handleOpenRecovery() {
    const activeTaskId = store.getState().generationState.activeTaskId;
    navigate("/pages/works/exception/index", {
      scene: "generation",
      workId: this.data.workId,
      taskId: activeTaskId
    });
  },

  handleGoWorks() {
    switchTab("/pages/works/index/index");
  },

  handleBackList() {
    replace("/pages/works/generated-list/index");
  },

  handleCreateNew() {
    navigate("/pages/works/start-create/index");
  },

  async handleShare() {
    await this.prepareSharePayload(true);
  },

  handleOpenDelete() {
    this.setData({
      showDeleteConfirm: true,
      deleteSubmitting: false,
      deleteErrorText: ""
    });
  },

  handleCancelDelete() {
    if (this.data.deleteSubmitting) {
      return;
    }

    this.setData({
      showDeleteConfirm: false,
      deleteSubmitting: false,
      deleteErrorText: ""
    });
  },

  async handleConfirmDelete() {
    if (this.data.deleteSubmitting) {
      return;
    }

    if (!this.data.workId || !this.data.work) {
      this.setData({
        deleteSubmitting: false,
        deleteErrorText: "当前作品信息不可用，请返回后重试。"
      });
      return;
    }

    this.setData({
      deleteSubmitting: true,
      deleteErrorText: ""
    });

    try {
      const deleted = await deleteWorkById(this.data.workId);
      if (!deleted) {
        this.setData({
          deleteSubmitting: false,
          deleteErrorText: "删除失败，请稍后重试。"
        });
      }
    } catch (error) {
      this.setData({
        deleteSubmitting: false,
        deleteErrorText: "删除失败，请稍后重试。"
      });
    }
  }
});
