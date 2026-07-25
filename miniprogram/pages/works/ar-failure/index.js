"use strict";

const { bindStore } = require("../../../store/core/bindStore");
const { enterArEntry } = require("../../../flows/arFlow");
const { navigate, switchTab } = require("../../../utils/navigation");
const { NAV_FROM, getReturnActionCopy, getReturnContext, returnToSource, withReturnContext } = require("../../../utils/navigationContext");
const { getStringParam } = require("../../../utils/query");
const { PAGE_ROUTES } = require("../../../utils/routes");
const { showToast } = require("../../../utils/toast");

const DEFAULT_COVER = "/assets/mock/pet-corgi-hero.png";

const REASON_MAP = {
  ar_unavailable: {
    title: "AR 功能暂未开放",
    description: "当前版本先提供基础作品生成结果，AR 体验会在后续版本开放。"
  },
  camera: {
    title: "相机权限未开启",
    description: "后续 AR 功能开放后，需要允许 Petmate 使用相机才能识别环境。"
  },
  lighting: {
    title: "环境光线较暗",
    description: "后续 AR 功能开放后，建议移动到光线更充足的位置再尝试。"
  },
  plane: {
    title: "暂时无法识别平面",
    description: "后续 AR 功能开放后，桌面、地面等平整区域会更容易完成识别。"
  },
  performance: {
    title: "设备性能可能不足",
    description: "后续 AR 功能开放后，建议使用兼容性更好的设备体验。"
  }
};

const REASON_ITEMS = [
  {
    key: "ar_unavailable",
    icon: "AR",
    title: "AR 功能暂未开放",
    desc: "当前可先查看基础作品结果，并继续补图优化。"
  },
  {
    key: "plane",
    icon: "平",
    title: "平面识别可能失败",
    desc: "未来开放 AR 后，环境中清晰平整的区域会更容易识别。"
  },
  {
    key: "camera",
    icon: "机",
    title: "需要相机权限",
    desc: "未来开放 AR 后，相机权限会用于识别环境。"
  },
  {
    key: "performance",
    icon: "设",
    title: "设备兼容性",
    desc: "未来开放 AR 后，设备性能会影响展示稳定性。"
  },
  {
    key: "lighting",
    icon: "光",
    title: "环境光线影响",
    desc: "未来开放 AR 后，充足光线会提升识别稳定性。"
  }
];

const SOLUTION_ITEMS = [
  {
    key: "ar_unavailable",
    icon: "AR",
    title: "先查看基础作品结果",
    desc: "当前版本为基础作品生成流程，可继续查看结果、反馈差异或补图优化。",
    actionText: "返回结果页",
    actionKey: "result"
  },
  {
    key: "plane",
    icon: "面",
    title: "后续开放时再尝试",
    desc: "AR 体验开放后，可在平整桌面或地面重新尝试。",
    actionText: "查看说明",
    actionKey: "guide"
  },
  {
    key: "camera",
    icon: "权",
    title: "后续开放时检查权限",
    desc: "AR 体验开放后，可在设置中允许 Petmate 使用相机。",
    actionText: "去设置",
    actionKey: "settings"
  },
  {
    key: "performance",
    icon: "检",
    title: "检查设备兼容性",
    desc: "建议使用 iOS 12+ / Android 8.0+ 及以上设备，并保持微信版本较新。",
    actionText: "查看要求",
    actionKey: "device"
  },
  {
    key: "lighting",
    icon: "亮",
    title: "提升环境光线",
    desc: "未来开放 AR 后，可在光线充足的位置重新尝试。",
    actionText: "我知道了",
    actionKey: "lighting"
  }
];

const PROTECTION_ITEMS = [
  {
    title: "当前可继续查看基础作品结果",
    desc: "AR 暂未开放不会影响作品结果页、反馈和补图优化。"
  },
  {
    title: "后续版本开放后再进入 AR",
    desc: "开放前不会引导购买，也不会进入不可用的展示流程。"
  }
];

let unbind = null;

function formatDateText(value) {
  if (!value) return "--";
  return String(value).slice(0, 10);
}

function getWorkCover(version) {
  return (
    (version &&
      version.previewMedia &&
      (version.previewMedia.cover || version.previewMedia.poster || version.previewMedia.url)) ||
    DEFAULT_COVER
  );
}

function normalizeReasonType(value) {
  return REASON_MAP[value] ? value : "ar_unavailable";
}

function safeDecodeText(value, fallback) {
  try {
    return decodeURIComponent(value || fallback || "");
  } catch (error) {
    return fallback || "";
  }
}

function buildSolutionItems(from = NAV_FROM.result) {
  const returnCopy = getReturnActionCopy(from);
  return SOLUTION_ITEMS.map((item) => {
    if (item.actionKey !== "result") {
      return item;
    }
    return {
      ...item,
      actionText: returnCopy.text
    };
  });
}

function buildRetryActionCopy(reasonType, from = NAV_FROM.result) {
  const returnCopy = getReturnActionCopy(from);
  if (reasonType === "camera") {
    return {
      primaryText: "检查权限后再试",
      primarySubtext: "后续开放后可重新进入",
      secondaryText: returnCopy.text,
      secondarySubtext: returnCopy.subtext
    };
  }
  return {
    primaryText: "查看 AR 功能说明",
    primarySubtext: "当前功能暂未开放",
    secondaryText: returnCopy.text,
    secondarySubtext: returnCopy.subtext
  };
}

Page({
  data: {
    workId: "",
    from: NAV_FROM.result,
    returnTo: "",
    work: null,
    version: null,
    reason: "",
    reasonType: "ar_unavailable",
    reasonTitle: "AR 功能暂未开放",
    reasonDescription: "当前版本先提供基础作品生成结果，AR 体验会在后续版本开放。",
    workCover: DEFAULT_COVER,
    workDisplayName: "当前宠物作品",
    workCreatedText: "--",
    reasonItems: REASON_ITEMS,
    solutionItems: buildSolutionItems(NAV_FROM.result),
    protectionItems: PROTECTION_ITEMS,
    retryActionCopy: buildRetryActionCopy("ar_unavailable"),
    workAvailable: false
  },

  onLoad(options) {
    const workId = getStringParam(options, "workId");
    const reason = safeDecodeText(getStringParam(options, "reason"), "AR 功能暂未开放");
    const reasonType = normalizeReasonType(getStringParam(options, "reasonType", "ar_unavailable"));
    const returnContext = getReturnContext(options, workId ? NAV_FROM.result : NAV_FROM.works);
    const currentReason = REASON_MAP[reasonType] || {
      title: "AR 功能暂未开放",
      description: reason || "当前版本先提供基础作品生成结果。"
    };

    this.setData({
      workId,
      reason,
      reasonType,
      from: returnContext.from,
      returnTo: returnContext.returnTo,
      reasonTitle: currentReason.title,
      reasonDescription: currentReason.description,
      retryActionCopy: buildRetryActionCopy(reasonType, returnContext.from),
      solutionItems: buildSolutionItems(returnContext.from)
    });

    unbind = bindStore(this, (state) => {
      const work = state.workState.workMap[workId];
      const version =
        work && work.currentVersionId ? state.workState.versionMap[work.currentVersionId] : null;

      return {
        work,
        version,
        workAvailable: Boolean(work),
        workCover: getWorkCover(version),
        workDisplayName: (work && work.petName) || "当前宠物作品",
        workCreatedText: formatDateText(work && work.createdAt)
      };
    });
  },

  onUnload() {
    if (unbind) {
      unbind();
      unbind = null;
    }
  },

  async handleRetry() {
    await enterArEntry(this.data.workId, {
      mode: "replace",
      from: this.data.from,
      returnTo: this.data.returnTo
    });
  },

  handleOpenSettings() {
    if (typeof wx !== "undefined" && wx.openSetting) {
      wx.openSetting({});
    }
  },

  handleBackResult() {
    returnToSource(this.data, {
      workId: this.data.workId
    });
  },

  handleSolutionAction(event) {
    const action = event.currentTarget.dataset.action;

    if (action === "settings") {
      this.handleOpenSettings();
      return;
    }

    if (action === "guide") {
      navigate(PAGE_ROUTES.works.arGuide, withReturnContext({
        workId: this.data.workId
      }, {
        from: this.data.from,
        returnTo: this.data.returnTo
      }));
      return;
    }

    if (action === "result") {
      this.handleBackResult();
      return;
    }

    if (action === "device") {
      wx.showModal({
        title: "设备兼容建议",
        content: "建议使用 iOS 12+ / Android 8.0+ 及以上设备，并保持微信版本较新。",
        showCancel: false,
        confirmText: "知道了"
      });
      return;
    }

    if (action === "lighting") {
      showToast("AR 功能暂未开放，后续版本开放", "none");
    }
  },

  handleContactSupport() {
    navigate(PAGE_ROUTES.mine.contact);
  },

  handleGoWorks() {
    switchTab(PAGE_ROUTES.works.index);
  }
});
