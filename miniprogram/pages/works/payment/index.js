"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const { retryPaymentSync, startPayment } = require("../../../flows/paymentFlow");
const { enterArEntry, syncArEntitlement } = require("../../../flows/arFlow");
const { experienceFlags } = require("../../../config/experience");
const { mockRights } = require("../../../mocks/data/mockRights");
const { bindStore } = require("../../../store/core/bindStore");
const { store } = require("../../../store/core/createStore");
const { formatCurrency } = require("../../../utils/formatter");
const { navigate, replace, switchTab } = require("../../../utils/navigation");
const { NAV_FROM, getReturnActionCopy, getReturnContext, returnToSource, withReturnContext } = require("../../../utils/navigationContext");
const { getStringParam } = require("../../../utils/query");
const { PAGE_ROUTES } = require("../../../utils/routes");

const DEFAULT_AMOUNT = formatCurrency(mockRights.currentWorkArPrice);
const DEFAULT_WORK_NAME = "当前宠物作品";
const FALLBACK_COVER = "/assets/mock/pet-corgi-hero.png";
const FALLBACK_TIME = "暂未记录";

function formatPaymentDateTime(value) {
  if (!value) {
    return FALLBACK_TIME;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return FALLBACK_TIME;
  }

  const pad = (num) => String(num).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildRightsItems() {
  return [
    {
      icon: "AR",
      title: "当前作品 AR 展示",
      desc: "本次只为当前宠物作品开通"
    },
    {
      icon: "∞",
      title: "同一作品反复进入",
      desc: "后续查看当前作品不重复收费"
    },
    {
      icon: "保",
      title: "失败权益保留",
      desc: "AR 展示失败不影响已购权益"
    }
  ];
}

function isUnlockedPageStatus(pageStatus) {
  return pageStatus === "success" || pageStatus === "owned";
}

function getNavTitle(pageStatus) {
  if (pageStatus === "success") {
    return "支付成功";
  }

  if (pageStatus === "owned") {
    return "权益已解锁";
  }

  return "为当前宠物作品解锁 AR 展示权益";
}

function getUnlockedCopy(pageStatus) {
  if (pageStatus === "owned") {
    return {
      unlockedTitle: "AR 权益已解锁",
      unlockedSubtitle: "当前作品可直接进入 AR 展示",
      unlockedDescription: "你已拥有当前宠物作品的 AR 展示权益"
    };
  }

  return {
      unlockedTitle: "支付成功",
      unlockedSubtitle: "AR 权益已到账",
      unlockedDescription: "你已解锁当前宠物作品的 AR 展示权益"
  };
}

function buildUnlockedBenefits() {
  return [
    {
      text: "当前作品可无限次进入 AR 展示"
    },
    {
      text: "后续优化或补色后，权益仍然保留"
    },
    {
      text: "不同宠物作品需分别解锁"
    }
  ];
}

function buildSuccessRows(pageStatus) {
  return [
    {
      icon: "单",
      label: "订单状态",
      value: pageStatus === "owned" ? "已拥有" : "已支付",
      tone: "order",
      valueTone: "success",
      showCheck: true
    },
    {
      icon: "盾",
      label: "权益状态",
      value: "已到账",
      tone: "rights",
      valueTone: "success",
      showCheck: true
    },
    {
      icon: "宠",
      label: "生效对象",
      value: "当前宠物作品",
      tone: "target",
      valueTone: "normal",
      showCheck: false
    },
    {
      icon: "i",
      label: "权益说明",
      value: "AR 初始化失败时权益仍会保留，可稍后再次进入",
      tone: "info",
      valueTone: "normal",
      showCheck: false
    }
  ];
}

function getWorkDisplayName(work) {
  return (work && work.petName) || DEFAULT_WORK_NAME;
}

function getWorkStatusText(work) {
  return work && work.status === "retouched" ? "已补色，可继续优化" : "已生成，可继续优化";
}

function getWorkTagConfig(work) {
  if (work && work.status === "retouched") {
    return {
      text: "已补色",
      tone: "brand"
    };
  }

  return {
    text: "已生成",
    tone: "success"
  };
}

function getPrimaryText(pageStatus, amountText) {
  const textMap = {
    idle: `立即支付 ${amountText}`,
    paying: "支付处理中",
    success: "进入 AR 展示",
    confirming: "重新查询",
    failed: `重新发起支付 ${amountText}`,
    cancelled: `继续支付 ${amountText}`,
    owned: "进入 AR 展示"
  };

  return textMap[pageStatus] || `立即支付 ${amountText}`;
}

function getStatusNotice(pageStatus) {
  const noticeMap = {
    paying: {
      icon: "…",
      title: "微信支付处理中",
      description: "如果支付窗口已经弹起，请完成支付后返回；页面会继续同步当前作品的支付状态。",
      className: "status-notice-brand"
    },
    confirming: {
      icon: "✓",
      title: "正在确认当前作品权益",
      description: "支付已完成，系统正在同步当前宠物作品的 AR 展示权益。现在不需要再次支付。",
      className: "status-notice-success"
    },
    failed: {
      icon: "!",
      title: "支付未完成",
      description: "本次没有为当前宠物作品开通 AR 展示权益。确认没有成功扣款后，可重新发起支付。",
      className: "status-notice-warm"
    },
    cancelled: {
      icon: "!",
      title: "支付已取消",
      description: "本次没有为当前宠物作品开通 AR 展示权益。确认仍需使用 AR 时，可继续支付。",
      className: "status-notice-warm"
    }
  };

  return noticeMap[pageStatus] || null;
}

let unbind = null;

Page({
  data: {
    workId: "",
    from: NAV_FROM.result,
    returnTo: "",
    work: null,
    version: null,
    workCover: FALLBACK_COVER,
    workDisplayName: DEFAULT_WORK_NAME,
    workStatusText: "已生成，可继续优化",
    workTagText: "已生成",
    workTagTone: "success",
    createdAtText: FALLBACK_TIME,
    orderId: "",
    amount: DEFAULT_AMOUNT,
    pageStatus: "idle",
    navTitle: "为当前宠物作品解锁 AR 展示权益",
    isUnlockedState: false,
    pageTitle: "确认支付",
    pageDescription: "你即将为当前宠物作品解锁 AR 展示权益。该权益仅对本作品生效，不属于账号或其他作品。",
    unlockedTitle: "支付成功",
    unlockedSubtitle: "AR 权益已到账",
    unlockedDescription: "你已解锁当前宠物的无限次 AR 展示权益",
    unlockedBenefits: buildUnlockedBenefits(),
    successRows: buildSuccessRows("idle"),
    primaryText: getPrimaryText("idle", DEFAULT_AMOUNT),
    secondaryText: "返回 AR 说明",
    secondarySubtext: "继续查看当前作品 AR 权益说明",
    rightsItems: buildRightsItems(),
    statusNotice: null,
    hasAgreedPaymentProtocol: false,
    showAgreementRow: true,
    showContactLink: false,
    showSecurityRow: true,
    isLoading: false,
    scenario: "success",
    workAvailable: false
  },

  onLoad(options) {
    const workId = getStringParam(options, "workId");
    const rawScenario = getStringParam(options, "paymentScenario", "success");
    const scenario = experienceFlags.showDevOnlyUi ? rawScenario : "success";
    const returnContext = getReturnContext(options, workId ? NAV_FROM.result : NAV_FROM.works);

    this.setData({
      workId,
      scenario,
      from: returnContext.from,
      returnTo: returnContext.returnTo
    });

    unbind = bindStore(this, (state) => this.buildViewState(state));

    syncArEntitlement(workId).catch((error) => {
      console.error("payment sync ar entitlement failed", error);
    });
  },

  onUnload() {
    if (unbind) {
      unbind();
      unbind = null;
    }
  },

  buildViewState(state) {
    const { workId, isLoading } = this.data;
    const work = state.workState.workMap[workId];
    const version = work && work.currentVersionId ? state.workState.versionMap[work.currentVersionId] : null;
    const workOrders = Object.values(state.paymentState.orderMap).filter((item) => item.workId === workId);
    const currentOrder = workOrders.length ? workOrders[workOrders.length - 1] : null;
    const entitlement = state.arState.entitlementMapByWorkId[workId];
    const amount = currentOrder ? formatCurrency(currentOrder.amount) : DEFAULT_AMOUNT;
    const pageStatus = this.getPaymentStatus(currentOrder, entitlement && entitlement.status, isLoading);
    const statusConfig = this.getStatusConfig(pageStatus, amount);
    const isUnlockedState = isUnlockedPageStatus(pageStatus);
    const secondaryCopy = isUnlockedState
      ? getReturnActionCopy(this.data.from)
      : {
          text: statusConfig.secondaryText,
          subtext: "继续查看当前作品 AR 权益说明"
        };
    const unlockedCopy = getUnlockedCopy(pageStatus);
    const workTag = getWorkTagConfig(work);

    return {
      work,
      version,
      workAvailable: Boolean(work),
      workCover: (version && version.previewMedia && version.previewMedia.cover) || FALLBACK_COVER,
      workDisplayName: getWorkDisplayName(work),
      workStatusText: getWorkStatusText(work),
      workTagText: workTag.text,
      workTagTone: workTag.tone,
      createdAtText: formatPaymentDateTime((version && version.createdAt) || (work && work.createdAt)),
      orderId: (currentOrder && currentOrder.orderId) || (entitlement && entitlement.lastOrderId) || "",
      amount,
      pageStatus,
      navTitle: getNavTitle(pageStatus),
      isUnlockedState,
      pageTitle: statusConfig.title,
      pageDescription: statusConfig.description,
      ...unlockedCopy,
      unlockedBenefits: buildUnlockedBenefits(),
      successRows: buildSuccessRows(pageStatus),
      primaryText: statusConfig.primaryText,
      secondaryText: secondaryCopy.text,
      secondarySubtext: secondaryCopy.subtext,
      statusNotice: statusConfig.statusNotice,
      showAgreementRow: statusConfig.showAgreementRow,
      showContactLink: statusConfig.showContactLink,
      showSecurityRow: statusConfig.showSecurityRow
    };
  },

  syncViewState() {
    this.setData(this.buildViewState(store.getState()));
  },

  getPaymentStatus(currentOrder, entitlementStatus, isLoading = false) {
    if (isLoading) {
      return "paying";
    }

    if (entitlementStatus === "active") {
      return currentOrder ? "success" : "owned";
    }

    if (entitlementStatus === "pending_sync" || (currentOrder && currentOrder.entitlementStatus) === "pending_sync") {
      return "confirming";
    }

    if ((currentOrder && currentOrder.paymentStatus) === "failed") {
      return "failed";
    }

    if ((currentOrder && currentOrder.paymentStatus) === "cancelled") {
      return "cancelled";
    }

    if ((currentOrder && currentOrder.paymentStatus) === "pending") {
      return "paying";
    }

    return "idle";
  },

  getStatusConfig(pageStatus, amountText) {
    const configMap = {
      idle: {
        title: "确认支付",
        description: "你即将为当前宠物作品解锁 AR 展示权益。该权益仅对本作品生效，不属于账号或其他作品。"
      },
      paying: {
        title: "支付处理中",
        description: "正在调起微信支付并确认当前作品权益，请稍候，不要重复点击支付按钮。"
      },
      success: {
        title: "AR 权益已解锁",
        description: "当前宠物作品已获得 AR 展示权益，可无限次进入 AR 展示。"
      },
      confirming: {
        title: "正在确认当前作品权益",
        description: "支付已完成，系统正在同步当前作品的 AR 展示权益。现在不需要再次支付。"
      },
      failed: {
        title: "支付未完成",
        description: "本次没有为当前宠物作品开通 AR 展示权益。若未成功扣款，可重新发起支付。"
      },
      cancelled: {
        title: "支付已取消",
        description: "本次没有为当前宠物作品开通 AR 展示权益。确认需要后仍可继续支付。"
      },
      owned: {
        title: "当前作品已拥有 AR 权益",
        description: "无需重复购买，当前宠物作品可直接进入 AR 展示。"
      }
    };

    const config = configMap[pageStatus] || configMap.idle;

    return {
      title: config.title,
      description: config.description,
      primaryText: getPrimaryText(pageStatus, amountText),
      secondaryText: pageStatus === "success" || pageStatus === "owned" ? "返回结果页" : "返回 AR 说明",
      statusNotice: getStatusNotice(pageStatus),
      showAgreementRow: pageStatus === "idle" || pageStatus === "paying" || pageStatus === "failed" || pageStatus === "cancelled",
      showContactLink: pageStatus === "confirming",
      showSecurityRow: pageStatus !== "success" && pageStatus !== "owned"
    };
  },

  async handlePrimary() {
    const { pageStatus, workId, orderId, hasAgreedPaymentProtocol, scenario, from, returnTo } = this.data;

    if (!workId) {
      return;
    }

    if (pageStatus === "paying") {
      return;
    }

    if (pageStatus === "success" || pageStatus === "owned") {
      await enterArEntry(workId, {
        mode: "replace",
        from,
        returnTo
      });
      return;
    }

    if (pageStatus === "confirming") {
      if (!orderId) {
        return;
      }

      await retryPaymentSync(orderId);
      return;
    }

    if (!hasAgreedPaymentProtocol) {
      wx.showToast({
        title: "请先阅读并同意付款协议",
        icon: "none"
      });
      return;
    }

    this.setData({ isLoading: true });
    this.syncViewState();

    try {
      await new Promise((resolve) => setTimeout(resolve, 420));
      await startPayment(workId, scenario);
    } finally {
      this.setData({ isLoading: false });
      this.syncViewState();
    }
  },

  handleSecondary() {
    if (this.data.pageStatus === "success" || this.data.pageStatus === "owned") {
      returnToSource(this.data, {
        workId: this.data.workId
      });
      return;
    }

    replace(PAGE_ROUTES.works.arGuide, withReturnContext({
      workId: this.data.workId
    }, {
      from: this.data.from,
      returnTo: this.data.returnTo
    }));
  },

  handleBackPage() {
    this.handleSecondary();
  },

  handleToggleAgreement() {
    this.setData({
      hasAgreedPaymentProtocol: !this.data.hasAgreedPaymentProtocol
    });
  },

  handleProtocolTap() {
    wx.showToast({
      title: "付款协议页面后续接入",
      icon: "none"
    });
  },

  handleViewWorkDetail() {
    if (!this.data.workId) {
      return;
    }

    navigate(PAGE_ROUTES.works.detail, {
      workId: this.data.workId
    });
  },

  handleContact() {
    navigate(PAGE_ROUTES.mine.contact);
  },

  handleRightsExplanation() {
    navigate(PAGE_ROUTES.mine.benefits);
  },

  handleGoWorks() {
    switchTab(PAGE_ROUTES.works.index);
  }
});
