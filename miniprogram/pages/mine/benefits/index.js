"use strict";

const { bindStore } = require("../../../store/core/bindStore");
const { syncOptimizeQuota } = require("../../../flows/optimizeQuota");
const { selectRemainingOptimizeCount } = require("../../../store/selectors/index");
const { navigate, switchTab } = require("../../../utils/navigation");

const MINE_PATH = "/pages/mine/index/index";
const HELP_PATH = "/pages/mine/help/index";
const CONTACT_PATH = "/pages/mine/contact/index";
const PET_PREVIEW = "/assets/mock/pet-corgi-hero.png";

const INCLUDED_BENEFITS = [
  {
    id: "unlimited",
    icon: "∞",
    title: "无限次进入 AR",
    desc: "购买后，该作品可无限次进入 AR 展示",
  },
  {
    id: "placement",
    icon: "□",
    title: "自由摆放与互动",
    desc: "放大、缩小、旋转、移动，支持动作展示",
  },
  {
    id: "share",
    icon: "◎",
    title: "截图与录屏分享",
    desc: "支持截图、录屏，分享给家人朋友",
  },
  {
    id: "valid",
    icon: "✓",
    title: "权益长期有效",
    desc: "只要作品存在，AR 权益就会一直有效",
  },
];

const RIGHTS_LAYER_ITEMS = [
  {
    id: "free",
    icon: "免",
    title: "免费层",
    desc: "可浏览案例、了解效果预期，并查看基础使用说明。"
  },
  {
    id: "ad-trial",
    icon: "广",
    title: "广告试用层",
    desc: "观看广告获得试用或优化次数，按页面提示到账。"
  },
  {
    id: "paid-ar",
    icon: "AR",
    title: "AR 付费权益",
    desc: "仅为当前宠物作品开通 AR 展示，不覆盖其他作品。"
  }
];

const SCOPE_RULES = [
  {
    id: "current-work",
    icon: "人",
    title: "仅限当前宠物作品",
    desc: "本次购买仅对应当前宠物作品，不同宠物作品权益不互通。",
  },
  {
    id: "inherit",
    icon: "↻",
    title: "后续优化仍继承权益",
    desc: "同一作品后续继续优化、定向补图或细节补色，仍可使用已购 AR 权益。",
  },
  {
    id: "ar-failure",
    icon: "✓",
    title: "AR 失败权益保留",
    desc: "因环境、设备或权限导致 AR 暂时失败，权益仍会保留，后续可再次尝试。",
  },
  {
    id: "optimize-safe",
    icon: "✦",
    title: "优化失败不扣次数",
    desc: "结果优化失败、系统异常或生成不可用时，不会扣减你的优化次数。",
    isLast: true,
  },
];

const EXCLUDED_ITEMS = [
  {
    id: "not-account-wide",
    icon: "单",
    title: "不随账号共享",
    desc: "本权益只随当前作品生效，不会自动覆盖账号下其他作品。",
  },
  {
    id: "other-works",
    icon: "▱",
    title: "不覆盖其他作品",
    desc: "不包含其他宠物作品的 AR 展示权益。",
  },
  {
    id: "structure",
    icon: "⌁",
    title: "不包含结构编辑",
    desc: "仅支持贴图细节修补，不修改模型结构。",
  },
  {
    id: "refund",
    icon: "¥",
    title: "退款需核对处理",
    desc: "支付或权益异常请先联系支持，我们会按实际情况核对处理。",
  },
];

let unbind = null;

function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

Page({
  data: {
    optimizeGranted: 0,
    optimizeUsed: 0,
    optimizeReserved: 0,
    optimizeAvailable: 0,
    quotaSyncStatus: "idle",
    quotaError: "",
    showQuotaSyncNotice: false,
    petPreview: PET_PREVIEW,
    includedBenefits: INCLUDED_BENEFITS,
    rightsLayerItems: RIGHTS_LAYER_ITEMS,
    scopeRules: SCOPE_RULES,
    excludedItems: EXCLUDED_ITEMS,
  },

  onLoad() {
    syncOptimizeQuota({ silent: true });
    unbind = bindStore(this, (state) => {
      const optimizeGranted = normalizeCount(state.optimizeState.grantedCount);
      const optimizeUsed = normalizeCount(state.optimizeState.usedCount);
      const optimizeReserved = normalizeCount(state.optimizeState.reservedCount);

      return {
        optimizeGranted,
        optimizeUsed,
        optimizeReserved,
        optimizeAvailable: selectRemainingOptimizeCount(state),
        quotaSyncStatus: state.optimizeState.quotaSyncStatus,
        quotaError: state.optimizeState.quotaError || "优化次数暂时使用本地记录，稍后会自动同步。",
        showQuotaSyncNotice: state.optimizeState.quotaSyncStatus === "failed",
      };
    });
  },

  onShow() {
    syncOptimizeQuota({ silent: true });
  },

  onUnload() {
    if (unbind) {
      unbind();
      unbind = null;
    }
  },

  handleGoHelp() {
    navigate(HELP_PATH);
  },

  handleGoContact() {
    navigate(CONTACT_PATH);
  },

  handleBackMine() {
    switchTab(MINE_PATH);
  },
});
