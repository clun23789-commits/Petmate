"use strict";

const { prepareWorkSharePayload } = require("../../../flows/shareFlow");
const { loadCloudWorks } = require("../../../flows/workSyncFlow");
const { enterArEntry } = require("../../../flows/arFlow");
const { bindStore } = require("../../../store/core/bindStore");
const { formatWorkStatus } = require("../../../utils/formatter");
const { navigate } = require("../../../utils/navigation");
const { NAV_FROM, buildGeneratedListReturnTo, withReturnContext } = require("../../../utils/navigationContext");
const { getStringParam } = require("../../../utils/query");
const { PAGE_ROUTES } = require("../../../utils/routes");
const { showToast } = require("../../../utils/toast");

const DEFAULT_DOG_COVER = "/assets/mock/pet-corgi-hero.png";
const DEFAULT_CAT_COVER = "/assets/mock/pet-cat-hero.png";
const DEFAULT_SHARE_COVER = DEFAULT_DOG_COVER;
const DEFAULT_SHARE_TITLE = "我在 Petmate 生成了宠物数字形象";
const SHARE_READY_TEXT = "分享卡片已准备好";
const SHARE_ERROR_TEXT = "分享准备失败，请稍后重试";

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "ready", label: "已生成" },
  { key: "generating", label: "生成中" },
  { key: "failed", label: "失败" }
];

let unbind = null;

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(value) {
  if (!value) {
    return "最近";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 16);
  }

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function toTimeValue(value) {
  const time = new Date(value || "").getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isReadyStatus(status) {
  return status === "ready" || status === "retouched";
}

function isGeneratingStatus(status) {
  return status === "generating" || status === "uploading";
}

function resolveCover(work, version) {
  if (version && version.previewMedia && version.previewMedia.cover) {
    return version.previewMedia.cover;
  }

  if (work && work.previewImage) {
    return work.previewImage;
  }

  return work && work.petType === "cat" ? DEFAULT_CAT_COVER : DEFAULT_DOG_COVER;
}

function resolveDisplayName(work) {
  if (!work) {
    return "当前宠物作品";
  }

  const rawName = work.petName || work.displayName || "";
  if (rawName) {
    return rawName;
  }

  if (work.petTypeLabel) {
    return `${work.petTypeLabel}宠物`;
  }

  return "当前宠物作品";
}

function buildWorkItem(work, state) {
  if (!work || !work.workId) {
    return null;
  }

  const versionId = work.currentVersionId || "";
  const version = versionId ? state.workState.versionMap[versionId] || null : null;
  const entitlement = state.arState.entitlementMapByWorkId[work.workId];
  const entitlementStatus = (entitlement && entitlement.status) || "unpaid";
  const isReady = isReadyStatus(work.status);
  const isGenerating = isGeneratingStatus(work.status);
  const isFailed = work.status === "failed";
  const arOwned = entitlementStatus === "active";
  const arPending = entitlementStatus === "paid" || entitlementStatus === "pending_sync";
  const activeTaskId = state.generationState.activeTaskId || "";
  const activeTask = activeTaskId ? state.generationState.taskMap[activeTaskId] : null;

  return {
    ...work,
    versionId,
    cover: resolveCover(work, version),
    displayName: resolveDisplayName(work),
    createdAtText: formatDateTime(work.createdAt || work.updatedAt),
    statusLabel: isFailed
      ? "可恢复"
      : isGenerating
        ? "正在生成"
        : isReady
          ? work.status === "retouched" ? "已补色" : "可查看结果"
          : formatWorkStatus(work.status) || "当前不可用",
    statusTone: isFailed ? "danger" : isGenerating ? "warning" : isReady ? "success" : "neutral",
    statusIcon: isFailed ? "!" : isGenerating ? "等" : isReady ? "好" : "·",
    arOwned,
    arPending,
    arTagText: arOwned ? "已解锁 AR" : arPending ? "AR 权益确认中" : "可了解 AR",
    arTagTone: arOwned ? "owned" : arPending ? "pending" : "unpaid",
    showArBadge: isReady,
    hintText: isFailed
      ? "生成结果不可用，优化次数未消耗"
      : isGenerating
        ? "正在生成，请耐心等待，可随时回来查看进度"
        : arPending
          ? "AR 权益正在确认中，可稍后再回来查看状态"
          : "",
    canViewResult: isReady && Boolean(versionId),
    canOptimize: isReady && Boolean(versionId),
    canEnterAr: isReady && arOwned,
    canUnderstandAr: isReady && !arOwned,
    canShare: isReady,
    canRegenerate: isFailed,
    taskId: activeTask && activeTask.workId === work.workId ? activeTaskId : "",
    sortTime: toTimeValue(work.createdAt || work.updatedAt)
  };
}

function matchFilter(item, filterKey) {
  if (filterKey === "ready") {
    return isReadyStatus(item.status);
  }

  if (filterKey === "generating") {
    return isGeneratingStatus(item.status);
  }

  if (filterKey === "failed") {
    return item.status === "failed";
  }

  return true;
}

function sortWorks(works, sortMode) {
  return works
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const timeGap = (right.item.sortTime || 0) - (left.item.sortTime || 0);
      if (sortMode === "earliest") {
        if (timeGap !== 0) {
          return -timeGap;
        }
      } else if (timeGap !== 0) {
        return timeGap;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

function filterAndSortWorks(works, filterKey, sortMode) {
  return sortWorks(works.filter((item) => matchFilter(item, filterKey)), sortMode);
}

Page({
  data: {
    works: [],
    displayWorks: [],
    filters: FILTERS,
    activeFilter: "all",
    sortMode: "latest",
    sortLabel: "最新生成",
    loadFailed: false,
    sharePreparingWorkId: "",
    activeShareWorkId: "",
    activeSharePayload: null,
    shareErrorText: "",
    sharePayloadMap: {}
  },

  onLoad(options) {
    this.setData({
      loadFailed: getStringParam(options, "loadScenario", "success") === "failed"
    });

    unbind = bindStore(this, (state) => {
      const works = state.workState.workOrder
        .map((workId) => buildWorkItem(state.workState.workMap[workId], state))
        .filter(Boolean);

      return {
        works,
        displayWorks: filterAndSortWorks(works, this.data.activeFilter, this.data.sortMode)
      };
    });
    loadCloudWorks({ silent: false }).catch((error) => {
      console.error("generated-list load cloud works failed", error);
    });
  },

  onUnload() {
    if (unbind) {
      unbind();
      unbind = null;
    }
  },

  onShareAppMessage() {
    const activeSharePayload = this.data.activeSharePayload;
    if (activeSharePayload) {
      return {
        title: activeSharePayload.title,
        path: activeSharePayload.path,
        imageUrl: activeSharePayload.imageUrl
      };
    }

    return {
      title: DEFAULT_SHARE_TITLE,
      path: "/pages/works/index/index",
      imageUrl: DEFAULT_SHARE_COVER
    };
  },

  syncDisplayWorks(nextFilter = this.data.activeFilter, nextSortMode = this.data.sortMode) {
    this.setData({
      displayWorks: filterAndSortWorks(this.data.works, nextFilter, nextSortMode)
    });
  },

  findWorkById(workId) {
    return this.data.works.find((item) => item.workId === workId) || null;
  },

  handleOpenBenefits() {
    navigate("/pages/mine/benefits/index");
  },

  handleFilter(event) {
    const nextFilter = event.currentTarget.dataset.filter;
    if (!nextFilter || nextFilter === this.data.activeFilter) {
      return;
    }

    this.setData({
      activeFilter: nextFilter
    });
    this.syncDisplayWorks(nextFilter, this.data.sortMode);
  },

  handleToggleSort() {
    const nextSortMode = this.data.sortMode === "latest" ? "earliest" : "latest";
    const sortLabel = nextSortMode === "latest" ? "最新生成" : "最早生成";

    this.setData({
      sortMode: nextSortMode,
      sortLabel
    });
    this.syncDisplayWorks(this.data.activeFilter, nextSortMode);
  },

  handleListModeHint() {
    showToast("当前为列表查看模式");
  },

  handleOpen(event) {
    const workId = event.currentTarget.dataset.workId;
    if (!workId) {
      return;
    }

    navigate("/pages/works/detail/index", {
      workId
    });
  },

  handleEditName() {
    showToast("后续支持修改宠物昵称");
  },

  handleViewResult(event) {
    const workId = event.currentTarget.dataset.workId;
    const versionId = event.currentTarget.dataset.versionId;

    navigate(PAGE_ROUTES.works.result, withReturnContext({
      workId,
      versionId
    }, {
      from: NAV_FROM.generatedList,
      returnTo: buildGeneratedListReturnTo()
    }));
  },

  handleOptimize(event) {
    const workId = event.currentTarget.dataset.workId;
    const versionId = event.currentTarget.dataset.versionId;

    navigate(PAGE_ROUTES.works.result, withReturnContext({
      workId,
      versionId
    }, {
      from: NAV_FROM.generatedList,
      returnTo: buildGeneratedListReturnTo()
    }));
  },

  async handleEnterAr(event) {
    const workId = event.currentTarget.dataset.workId;
    if (!workId) {
      return;
    }

    await enterArEntry(workId, {
      from: NAV_FROM.generatedList,
      returnTo: buildGeneratedListReturnTo()
    });
  },

  handleUnderstandAr(event) {
    const workId = event.currentTarget.dataset.workId;
    if (!workId) {
      return;
    }

    navigate(PAGE_ROUTES.works.arGuide, withReturnContext({
      workId
    }, {
      from: NAV_FROM.generatedList,
      returnTo: buildGeneratedListReturnTo()
    }));
  },

  async handleShare(event) {
    const workId = event.currentTarget.dataset.workId;
    if (!workId) {
      showToast("作品不存在，无法分享");
      return;
    }

    if (this.data.sharePreparingWorkId) {
      return;
    }

    const cachedPayload = this.data.sharePayloadMap[workId];
    if (cachedPayload) {
      this.setData({
        activeShareWorkId: workId,
        activeSharePayload: cachedPayload,
        shareErrorText: ""
      });
      showToast(SHARE_READY_TEXT, "success");
      return;
    }

    const work = this.findWorkById(workId);
    if (!work) {
      showToast("作品不存在，无法分享");
      return;
    }

    this.setData({
      sharePreparingWorkId: workId,
      activeShareWorkId: "",
      activeSharePayload: null,
      shareErrorText: ""
    });

    try {
      const payload = await prepareWorkSharePayload(work);
      this.setData({
        sharePreparingWorkId: "",
        activeShareWorkId: workId,
        activeSharePayload: payload,
        shareErrorText: "",
        sharePayloadMap: {
          ...this.data.sharePayloadMap,
          [workId]: payload
        }
      });
      showToast(SHARE_READY_TEXT, "success");
    } catch (error) {
      console.error("prepare generated-list share failed", error);
      this.setData({
        sharePreparingWorkId: "",
        shareErrorText: SHARE_ERROR_TEXT
      });
      showToast(SHARE_ERROR_TEXT);
    }
  },

  handleShareSendTap() {},

  handleRegenerate() {
    navigate("/pages/works/start-create/index");
  },

  handleStart() {
    navigate("/pages/works/start-create/index");
  },

  handleRetry() {
    this.setData({ loadFailed: false });
  }
});
