"use strict";

const { applyGrantedAdReward } = require("../../../flows/creationFlow");
const { getAdRewardStatus } = require("../../../services/ad");
const { store } = require("../../../store/core/createStore");
const { navigate, replace, switchTab } = require("../../../utils/navigation");
const { sanitizeReturnTo } = require("../../../utils/navigationContext");
const { getStringParam } = require("../../../utils/query");
const { PAGE_ROUTES } = require("../../../utils/routes");
const { showToast } = require("../../../utils/toast");

function buildProblemCards(scene) {
  return [
    {
      key: "ad",
      icon: "↑",
      warn: false,
      title: "广告后权益未到账",
      description: "观看广告后，未收到上传权限或优化次数。",
      active: scene === "ad"
    },
    {
      key: "upload",
      icon: "▧",
      warn: true,
      title: "上传或素材问题",
      description: "照片上传失败、素材无法使用或质检不通过。",
      active: scene === "upload"
    },
    {
      key: "generation",
      icon: "⬡",
      warn: true,
      title: "生成过程异常",
      description: "生成中断、长时间未完成或生成结果不可用。",
      active: scene === "generation" || scene === "optimization"
    },
    {
      key: "network",
      icon: "↻",
      warn: false,
      title: "其他异常问题",
      description: "流程卡住、按钮无响应或其它无法继续的问题。",
      active: scene === "network"
    }
  ];
}

function getExceptionConfig(scene, status) {
  const adDescriptionMap = {
    rightUnknown: "广告已经结束，但当前试用权益还在确认中。你可以重新查询权益，已获得的次数不会白白扣掉。",
    skipped: "这次广告没有完整观看完成，因此不会发放试用权益。你可以返回广告说明页重新观看。",
    unavailable: "广告暂时不可用，当前没有扣减次数，也没有创建无效的试用权益。",
    error: "广告加载或播放过程异常，当前没有发放试用权益，也不会扣减优化次数。",
    granted: "已查询到本次广告试用权益，你可以继续当前创作流程。"
  };
  const configMap = {
    ad: {
      description: adDescriptionMap[status] || "广告试看没有顺利完成，这次还没有成功解锁当前创作试用。",
      helperText: "已获得的试用权益会尽量为你保留，你可以先重新查询，再继续当前流程。"
    },
    upload: {
      description:
        status === "permissionError"
          ? "当前缺少相册或相机权限，系统没有创建无效任务，也没有扣减任何优化次数。"
          : "照片上传没有成功，当前作品状态与可用次数都已保留。",
      helperText: "请检查照片权限或更换更清晰的照片，再返回上传页继续。"
    },
    generation: {
      description:
        "这次结果没有成功返回。如果你此前已有可用结果，它会继续保留；若是一次优化，本轮预占次数也不会正式扣减。",
      helperText: "系统异常不会白白扣减优化次数，你可以继续检查任务或返回结果页。"
    },
    network: {
      description:
        "当前流程可能受到网络波动影响。你可以重新检查当前状态，或返回上一步继续操作。",
      helperText: "流程暂时中断不代表权益丢失，系统会尽量为你保留当前进度。"
    },
    optimization: {
      description:
        "本次优化结果没有成功返回，系统会释放本轮预占次数，不会正式扣减你的优化机会。",
      helperText: "只有优化成功返回可用结果后才会正式扣减次数，本次异常不会白白消耗机会。"
    }
  };

  return configMap[scene] || configMap.generation;
}

function buildSceneSummary(scene, status) {
  const summaryMap = {
    ad: {
      label: "广告权益异常",
      title: status === "granted" ? "广告权益已确认" : "广告后权益需要确认",
      tone: status === "granted" ? "success" : "warning"
    },
    upload: {
      label: "上传异常",
      title: status === "permissionError" ? "需要恢复照片权限" : "照片上传没有成功",
      tone: "warning"
    },
    generation: {
      label: "生成异常",
      title: "生成结果暂未成功返回",
      tone: "danger"
    },
    optimization: {
      label: "优化异常",
      title: "本次优化没有成功返回",
      tone: "warning"
    },
    network: {
      label: "流程异常",
      title: "当前流程可能被网络中断",
      tone: "warning"
    }
  };

  return summaryMap[scene] || summaryMap.generation;
}

function buildRightsItems(scene, status) {
  if (scene === "ad") {
    if (status === "skipped") {
      return [
        { key: "ad", text: "广告状态：未完整观看" },
        { key: "quota", text: "优化次数：未扣减" },
        { key: "trial", text: "可返回重试" }
      ];
    }

    if (status === "unavailable") {
      return [
        { key: "ad", text: "广告状态：暂不可用" },
        { key: "quota", text: "优化次数：未扣减" },
        { key: "trial", text: "可稍后重试" }
      ];
    }

    if (status === "error") {
      return [
        { key: "ad", text: "广告状态：加载异常" },
        { key: "quota", text: "优化次数：未扣减" },
        { key: "trial", text: "可返回重试" }
      ];
    }

    if (status === "granted") {
      return [
        { key: "ad", text: "广告权益：已确认" },
        { key: "quota", text: "优化次数：已到账" },
        { key: "trial", text: "可继续流程" }
      ];
    }

    return [
      { key: "ad", text: status === "rightUnknown" ? "广告权益：确认中" : "广告权益：可恢复" },
      { key: "quota", text: "优化次数：未扣减" },
      { key: "trial", text: "可重新查询权益" }
    ];
  }

  if (scene === "upload") {
    return [
      { key: "upload", text: "上传权限：已保留" },
      { key: "quota", text: "优化次数：未扣减" },
      { key: "trial", text: "可返回上传继续" }
    ];
  }

  if (scene === "optimization") {
    return [
      { key: "draft", text: "优化反馈：已保留" },
      { key: "quota", text: "预占次数：已释放" },
      { key: "result", text: "可返回结果页" }
    ];
  }

  if (scene === "network") {
    return [
      { key: "flow", text: "当前流程：已保留" },
      { key: "quota", text: "优化次数：未扣减" },
      { key: "trial", text: "可重新检查状态" }
    ];
  }

  return [
    { key: "work", text: "当前作品：已保留" },
    { key: "quota", text: "优化次数：未扣减" },
    { key: "trial", text: "可继续使用试用权益" }
  ];
}

function buildActionItems(scene) {
  return [
    {
      key: "refresh",
      icon: "↻",
      title: scene === "ad" ? "重新查询权益状态" : "重新检查当前状态",
      description:
        scene === "ad"
          ? "系统会重新确认你的试用权益与优化次数状态。"
          : "系统会重新确认当前任务、作品或流程是否已经恢复。",
      buttonText: scene === "ad" ? "重新查询" : "重新检查"
    },
    {
      key: "recover",
      icon: "↑",
      title: "继续当前流程",
      description: "根据你当前的状态，带你回到可以继续的步骤。",
      buttonText: "继续流程"
    },
    {
      key: "feedback",
      icon: "☎",
      title: "提交反馈给我们",
      description: "如果问题仍未解决，可提交反馈，我们会尽快处理。",
      buttonText: "提交反馈"
    }
  ];
}

function buildPrimaryRecoveryAction(scene, status) {
  if (scene === "ad") {
    if (status === "granted") {
      return { key: "recover", text: "继续当前流程", subtext: "权益已确认，可以继续" };
    }
    return { key: "refresh", text: "重新查询权益", subtext: "先确认是否已经到账" };
  }

  if (scene === "upload") {
    return { key: "recover", text: "返回上传页", subtext: "重新选择或补充照片" };
  }

  if (scene === "optimization") {
    return { key: "recover", text: "返回结果页", subtext: "本次异常不正式扣减次数" };
  }

  if (scene === "network") {
    return { key: "refresh", text: "重新检查状态", subtext: "确认当前流程是否恢复" };
  }

  return { key: "recover", text: "继续当前流程", subtext: "根据任务状态返回可继续页面" };
}

function buildSecondaryActionItems(scene, primaryKey) {
  return buildActionItems(scene).filter((item) => item.key !== primaryKey);
}

Page({
  data: {
    scene: "generation",
    status: "",
    workId: "",
    taskId: "",
    source: "",
    rewardScene: "",
    clientRewardId: "",
    returnTo: "",
    sceneSummary: buildSceneSummary("generation", ""),
    description: "我们已经为你保留了试用权益与优化次数，你可以按下面的指引继续完成你的宠物创作。",
    helperText: "系统异常不会白白扣减优化次数，已获得的试用权益也会尽量为你保留。",
    rightsItems: buildRightsItems("generation", ""),
    problemCards: buildProblemCards("generation"),
    primaryRecoveryAction: buildPrimaryRecoveryAction("generation", ""),
    actionItems: buildSecondaryActionItems("generation", "recover")
  },

  onLoad(options) {
    const scene = getStringParam(options, "scene", "generation");
    const status = getStringParam(options, "status");
    const workId = getStringParam(options, "workId");
    const taskId = getStringParam(options, "taskId");
    const source = getStringParam(options, "source");
    const rewardScene = getStringParam(options, "rewardScene");
    const clientRewardId = getStringParam(options, "clientRewardId");
    const returnTo = sanitizeReturnTo(getStringParam(options, "returnTo"));

    this.applySceneState(scene, status, {
      workId,
      taskId,
      source,
      rewardScene,
      clientRewardId,
      returnTo
    });
  },

  applySceneState(scene, status, extraData = {}) {
    const config = getExceptionConfig(scene, status);
    const primaryRecoveryAction = buildPrimaryRecoveryAction(scene, status);

    this.setData({
      ...extraData,
      scene,
      status,
      sceneSummary: buildSceneSummary(scene, status),
      description: config.description,
      helperText: config.helperText,
      problemCards: buildProblemCards(scene),
      rightsItems: buildRightsItems(scene, status),
      primaryRecoveryAction,
      actionItems: buildSecondaryActionItems(scene, primaryRecoveryAction.key)
    });
  },

  handleSelectProblem(event) {
    const scene = event.currentTarget.dataset.key;
    if (!scene || scene === this.data.scene) {
      return;
    }

    const nextStatus = scene === this.data.scene ? this.data.status : "";
    this.applySceneState(scene, nextStatus);
  },

  handleActionTap(event) {
    const key = event.currentTarget.dataset.key;
    this.handleActionByKey(key);
  },

  handlePrimaryRecovery() {
    this.handleActionByKey(this.data.primaryRecoveryAction.key);
  },

  handleActionByKey(key) {
    if (key === "refresh") {
      this.handleRefreshStatus();
      return;
    }

    if (key === "recover") {
      this.handleRecover();
      return;
    }

    if (key === "feedback") {
      this.handleFeedback();
    }
  },

  async handleRefreshStatus() {
    if (this.data.scene === "ad" && this.data.clientRewardId) {
      const result = await getAdRewardStatus({
        clientRewardId: this.data.clientRewardId,
        rewardScene: this.data.rewardScene || "initial_unlock"
      });

      if (result.ok && result.status === "granted") {
        await applyGrantedAdReward(this.data.source || "first_create", result.rewardScene || this.data.rewardScene || "initial_unlock", result);
        this.applySceneState("ad", "granted", {
          rewardScene: result.rewardScene || this.data.rewardScene,
          clientRewardId: result.clientRewardId || this.data.clientRewardId,
          source: this.data.source,
          returnTo: this.data.returnTo
        });
        showToast("权益已确认，可以继续当前流程");
        return;
      }

      if (result.ok && result.status === "not_found") {
        showToast("暂未查询到本次权益，请返回广告说明页重试");
        return;
      }

      if (result.ok && result.status === "pending") {
        showToast("本次广告权益仍在等待确认，请稍后再试");
        return;
      }

      if (result.ok && result.status === "expired") {
        this.applySceneState("ad", "skipped", {
          rewardScene: result.rewardScene || this.data.rewardScene,
          clientRewardId: result.clientRewardId || this.data.clientRewardId,
          source: this.data.source,
          returnTo: this.data.returnTo
        });
        showToast("本次广告会话已过期，请重新观看广告");
        return;
      }

      if (result.ok && result.status === "rejected") {
        this.applySceneState("ad", "skipped", {
          rewardScene: result.rewardScene || this.data.rewardScene,
          clientRewardId: result.clientRewardId || this.data.clientRewardId,
          source: this.data.source,
          returnTo: this.data.returnTo
        });
        showToast("本次广告未完成，请重新观看广告");
        return;
      }

      showToast(result.message || "权益状态查询失败，请稍后重试");
      return;
    }

    const sceneMessageMap = {
      ad: "已重新查询权益状态",
      upload: "已重新检查上传状态",
      generation: "已重新检查生成状态",
      network: "已重新检查流程状态",
      optimization: "已确认本次异常不扣减次数"
    };

    showToast(sceneMessageMap[this.data.scene] || "已重新检查状态");
  },

  handleRecover() {
    if (this.data.scene === "ad") {
      if (this.data.status === "granted") {
        const currentState = store.getState();

        if (this.data.source === "optimize_refill") {
          const pendingReturnRoute = currentState.trialState.pendingReturnRoute;

          if (pendingReturnRoute) {
            store.setState((state) => ({
              trialState: {
                ...state.trialState,
                pendingReturnRoute: ""
              }
            }), "clearTrialReturnRouteFromException");
            replace(pendingReturnRoute);
            return;
          }

          if (this.data.returnTo) {
            replace(this.data.returnTo);
            return;
          }

          const workId = currentState.workState.currentWorkId;
          const work = workId ? currentState.workState.workMap[workId] : null;

          if (work && work.currentVersionId) {
            replace(PAGE_ROUTES.works.result, {
              workId,
              versionId: work.currentVersionId
            });
            return;
          }

          switchTab(PAGE_ROUTES.works.index);
          return;
        }

        if (this.data.source === "recover" && this.data.returnTo) {
          store.setState((state) => ({
            trialState: {
              ...state.trialState,
              pendingReturnRoute: ""
            }
          }), "clearTrialReturnRouteFromRecover");
          replace(this.data.returnTo);
          return;
        }

        replace(PAGE_ROUTES.works.upload, {
          mode: "initial"
        });
        return;
      }

      replace(PAGE_ROUTES.works.adUnlock, {
        source: this.data.source || "first_create",
        returnTo: this.data.returnTo
      });
      return;
    }

    if (this.data.scene === "upload") {
      replace(PAGE_ROUTES.works.upload, {
        mode: "initial"
      });
      return;
    }

    const work = this.data.workId ? store.getState().workState.workMap[this.data.workId] : null;

    if (this.data.taskId && !(work && work.currentVersionId)) {
      replace(PAGE_ROUTES.works.generating, {
        taskId: this.data.taskId,
        workId: this.data.workId
      });
      return;
    }

    if (work && work.currentVersionId) {
      replace(PAGE_ROUTES.works.result, {
        workId: this.data.workId,
        versionId: work.currentVersionId
      });
      return;
    }

    replace(PAGE_ROUTES.works.upload, {
      mode: "initial"
    });
  },

  handleRestart() {
    replace(PAGE_ROUTES.works.startCreate);
  },

  handleFeedback() {
    navigate(PAGE_ROUTES.mine.feedback);
  },

  handleBackPrevious() {
    if (this.data.scene === "ad") {
      replace(PAGE_ROUTES.works.adUnlock, {
        source: this.data.source || "first_create",
        returnTo: this.data.returnTo
      });
      return;
    }

    const work = this.data.workId ? store.getState().workState.workMap[this.data.workId] : null;
    if (work && work.currentVersionId) {
      replace(PAGE_ROUTES.works.result, {
        workId: this.data.workId,
        versionId: work.currentVersionId
      });
      return;
    }

    if (this.data.taskId) {
      replace(PAGE_ROUTES.works.generating, {
        taskId: this.data.taskId,
        workId: this.data.workId
      });
      return;
    }

    switchTab(PAGE_ROUTES.works.index);
  }
});
