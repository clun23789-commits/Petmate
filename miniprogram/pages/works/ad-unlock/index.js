"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const { unlockTrial, setTrialReturnRoute } = require("../../../flows/creationFlow");
const { experienceFlags } = require("../../../config/experience");
const { mockRights } = require("../../../mocks/data/mockRights");
const { bindStore } = require("../../../store/core/bindStore");
const { selectAdUnlockSummary, selectRemainingOptimizeCount } = require("../../../store/selectors/index");
const { navigate, replace } = require("../../../utils/navigation");
const { sanitizeReturnTo } = require("../../../utils/navigationContext");
const { getStringParam } = require("../../../utils/query");

function buildSourceItems(source) {
  return [
    { key: "first_create", icon: "★", label: "首次创作", active: source === "first_create" },
    { key: "optimize_refill", icon: "↻", label: "补充优化次数", active: source === "optimize_refill" },
    { key: "recover", icon: "盾", label: "恢复试用权益", active: source === "recover" }
  ];
}

function buildHeroDesc(source) {
  if (source === "optimize_refill") {
    return `观看激励广告后，将为当前作品补充 ${mockRights.optimizeCountPerAd} 次结果优化次数，可继续根据反馈重新优化生成结果。`;
  }

  if (source === "recover") {
    return "用于恢复已完成广告后中断的试用流程，系统会尽量保留已获得权益，避免重复观看广告。";
  }

  return `观看激励广告，即可获得上传与生成权限及 ${mockRights.optimizeCountPerAd} 次结果优化次数，体验生成属于你家宠物的数字形象。`;
}

function buildBenefitItems() {
  return [
    {
      icon: "↥",
      title: "上传与生成权限",
      desc: "解锁真实宠物照片上传及基础模型生成能力。",
      hasDivider: true
    },
    {
      icon: "✦",
      title: `${mockRights.optimizeCountPerAd} 次结果优化次数`,
      desc: "可用于结构化反馈与重新优化生成结果。",
      hasDivider: true
    },
    {
      icon: "彩",
      title: "细节补色能力",
      desc: "对已生成模型进行局部颜色修补与小瑕疵处理。",
      hasDivider: true
    },
    {
      icon: "✓",
      title: "失败不扣次数",
      desc: "系统异常或生成失败时，不会消耗优化次数。",
      hasDivider: false
    }
  ];
}

function buildUnlockSummaryItems() {
  return [
    { key: "upload", label: "上传与生成", value: "本次试用可用", tone: "success" },
    { key: "optimize", label: "结果优化", value: `${mockRights.optimizeCountPerAd} 次`, tone: "success" },
    { key: "ar", label: "AR 展示", value: "不包含", tone: "warning" }
  ];
}

function buildAdActionCopy(source) {
  if (source === "optimize_refill") {
    return {
      title: "观看广告，补充优化次数",
      subtitle: `完成后为当前作品补充 ${mockRights.optimizeCountPerAd} 次优化机会`
    };
  }

  if (source === "recover") {
    return {
      title: "重新确认试用权益",
      subtitle: "用于恢复广告完成后中断的流程"
    };
  }

  return {
    title: "观看广告，解锁试用权限",
    subtitle: "完成后即可继续上传并生成宠物形象"
  };
}

function buildRuleItems() {
  return [
    {
      key: "retention",
      icon: "传",
      title: "照片用途与保留时长",
      desc: `照片仅用于生成你的宠物数字形象，默认保留 ${mockRights.photoRetentionDays} 天，用于结果查看、再次优化与 AR 展示，过期后将自动删除。`,
      toast: `照片默认保留 ${mockRights.photoRetentionDays} 天，用于结果查看、再次优化与 AR 展示。`
    },
    {
      key: "quota",
      icon: "盾",
      title: "优化次数使用规则",
      desc: "提交优化前将预占 1 次，优化成功返回可用结果后正式扣减，失败或异常不扣减次数。",
      toast: "优化提交先预占 1 次，成功返回可用结果后才正式扣减。"
    },
    {
      key: "ar_scope",
      icon: "AR",
      title: "试用权益不包含 AR 展示",
      desc: "本次广告解锁的试用权益，不包含 AR 展示能力。满意结果后，可为当前宠物作品单独购买 AR 展示权益。",
      toast: "广告试用不包含 AR 展示，满意结果后可为当前宠物作品单独解锁。"
    },
    {
      key: "minor",
      icon: "!",
      title: "未成年人和限制说明",
      desc: "未成年人需在监护人认可下观看广告并使用本功能。",
      toast: "未成年人需在监护人认可下观看广告并使用本功能。",
      isLast: true
    }
  ];
}

let unbind = null;

Page({
  data: {
    source: "first_create",
    sourceLabel: "首次创作",
    sourceItems: buildSourceItems("first_create"),
    heroDesc: buildHeroDesc("first_create"),
    unlockSummaryItems: buildUnlockSummaryItems(),
    adActionCopy: buildAdActionCopy("first_create"),
    benefitItems: buildBenefitItems(),
    ruleItems: buildRuleItems(),
    adStatus: "idle",
    adMessage: "完成一次广告试看后即可继续当前创作。",
    optimizeRemaining: 0,
    scenario: "completed",
    isUnlocking: false,
    returnTo: ""
  },

  onLoad(options) {
    const source = getStringParam(options, "source", "first_create");
    const rawScenario = getStringParam(options, "adScenario", getStringParam(options, "scenario", "completed"));
    const scenario = experienceFlags.showDevOnlyUi ? rawScenario : "completed";
    const returnTo = sanitizeReturnTo(getStringParam(options, "returnTo"));
    const sourceLabelMap = {
      first_create: "首次创作",
      optimize_refill: "补充优化次数",
      recover: "恢复试用权益"
    };

    this.setData({
      source,
      scenario,
      returnTo,
      sourceLabel: sourceLabelMap[source] || "首次创作",
      sourceItems: buildSourceItems(source),
      heroDesc: buildHeroDesc(source),
      unlockSummaryItems: buildUnlockSummaryItems(source),
      adActionCopy: buildAdActionCopy(source)
    });

    unbind = bindStore(this, (state) => {
      const adSummary = selectAdUnlockSummary(state);

      return {
        adStatus: adSummary.status,
        adMessage: adSummary.message || "完成一次广告试看后即可继续当前创作。",
        optimizeRemaining: selectRemainingOptimizeCount(state),
        isUnlocking: adSummary.status === "loading"
      };
    });
  },

  onUnload() {
    if (unbind) {
      unbind();
      unbind = null;
    }
  },

  async handleUnlock() {
    if (this.data.isUnlocking) {
      wx.showToast({
        title: "广告正在处理中，请稍候",
        icon: "none"
      });
      return;
    }

    const shouldReturn = (this.data.source === "optimize_refill" || this.data.source === "recover") && this.data.returnTo;

    if (shouldReturn) {
      setTrialReturnRoute(this.data.returnTo);
    }

    this.setData({
      isUnlocking: true
    });

    const flowSource = ["first_create", "optimize_refill", "recover"].indexOf(this.data.source) >= 0
      ? this.data.source
      : "first_create";
    await unlockTrial(flowSource, this.data.scenario);
  },

  handleCancel() {
    if (this.data.source === "optimize_refill" && this.data.returnTo) {
      replace(this.data.returnTo);
      return;
    }

    if (this.data.source === "recover" && this.data.returnTo) {
      replace(this.data.returnTo);
      return;
    }

    replace("/pages/works/start-create/index");
  },

  handleLongPressHint() {
    if (experienceFlags.showDevOnlyUi && this.data.scenario !== "completed") {
      const scenarioTitleMap = {
        skipped: "当前为广告中途关闭场景",
        unavailable: "当前为广告不可用场景",
        error: "当前为广告加载失败场景",
        rightUnknown: "当前为权益确认中场景",
        failed: "当前为旧版广告失败场景"
      };

      wx.showToast({
        title: scenarioTitleMap[this.data.scenario] || "当前为开发测试场景",
        icon: "none"
      });
    }
  },

  handleViewRetention() {
    wx.showToast({
      title: mockRights.retainedCaption,
      icon: "none",
      duration: 2200
    });
  },

  handleRuleTap(event) {
    const key = event.currentTarget.dataset.key;
    const item = this.data.ruleItems.find((rule) => rule.key === key);

    if (!item) {
      return;
    }

    wx.showToast({
      title: item.toast || item.title,
      icon: "none",
      duration: 2200
    });
  },

  handleRecoveryHint() {
    navigate("/pages/works/exception/index", {
      scene: "ad",
      status: "rightUnknown",
      source: this.data.source || "first_create",
      returnTo: this.data.returnTo
    });
  }
});
