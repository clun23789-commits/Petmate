"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const { pollActiveGeneration } = require("../../../flows/creationFlow");
const { GENERATION_CONFIG } = require("../../../config/generation");
const { bindStore } = require("../../../store/core/bindStore");
const { store } = require("../../../store/core/createStore");
const { selectGenerationStatusSummary } = require("../../../store/selectors/index");
const { formatGenerationPhase } = require("../../../utils/formatter");
const { getStringParam } = require("../../../utils/query");
const { navigate, replace, switchTab } = require("../../../utils/navigation");
const { PAGE_ROUTES } = require("../../../utils/routes");

let unbind = null;
let timer = 0;

function clearGenerationTimer() {
  if (timer) {
    clearInterval(timer);
    timer = 0;
  }
}

function isTerminalTask(task) {
  return !task || task.status === "success" || task.status === "failed";
}

async function pollOnce(taskId) {
  if (!taskId) {
    clearGenerationTimer();
    return null;
  }

  const task = await pollActiveGeneration(taskId, {
    autoNavigateOnFailure: false
  });
  if (isTerminalTask(task)) {
    clearGenerationTimer();
    if (task && task.status === "failed") {
      replace(PAGE_ROUTES.works.exception, {
        scene: "generation",
        taskId,
        workId: task.workId || ""
      });
    }
  }
  return task;
}

function startPolling(taskId) {
  clearGenerationTimer();
  if (!taskId) {
    return;
  }

  timer = setInterval(async () => {
    await pollOnce(taskId);
  }, GENERATION_CONFIG.pollIntervalMs);
}

function buildPhaseItems(phase) {
  const currentIndexMap = {
    queued: 0,
    fetching_assets: 0,
    finalizing: 1,
    completed: 2,
    failed: 2,
    timeout: 2
  };

  const currentIndex = currentIndexMap[phase] ?? 0;

  const steps = [
    {
      key: "fetching_assets",
      icon: "1",
      title: "正在读取照片",
      description: "确认可用素材"
    },
    {
      key: "finalizing",
      icon: "2",
      title: "正在整理作品",
      description: "生成作品版本"
    },
    {
      key: "completed",
      icon: "3",
      title: "正在生成结果",
      description: "准备进入结果页"
    }
  ];

  return steps.map((item, index) => ({
    ...item,
    active: index === currentIndex,
    done: index < currentIndex
  }));
}

function buildGenerationHeroMeta(phase, status, reason, isOptimization) {
  if (status === "failed") {
    return {
      tone: "warning",
      icon: "!",
      title: "生成遇到问题",
      desc: reason || "这次没有成功返回可用结果，不会扣减优化次数。",
      actionHint: "可以前往异常恢复页查看处理方式。"
    };
  }

  if (phase === "queued" || phase === "fetching_assets") {
    return {
      tone: "brand",
      icon: "照",
      title: "正在读取照片",
      desc: "系统正在读取已上传的宠物照片，请不要重复提交。",
      actionHint: "离开页面后任务仍会继续。"
    };
  }

  if (phase === "finalizing") {
    return {
      tone: "success",
      icon: "整",
      title: "正在整理作品",
      desc: "正在把照片素材整理为本次可查看的作品结果。",
      actionHint: isOptimization ? "本次优化成功返回后才会正式扣减次数。" : "完成后会自动进入结果页。"
    };
  }

  return {
    tone: "brand",
    icon: "果",
    title: "正在生成结果",
    desc: "预计需要一点时间，请耐心等待。",
    actionHint: "离开页面后任务仍会继续。"
  };
}

function getProgressPercent(task, phase) {
  if (task && Number.isFinite(Number(task.progress))) {
    return Math.max(8, Math.min(100, Math.floor(Number(task.progress))));
  }

  const fallbackMap = {
    queued: 8,
    fetching_assets: 35,
    finalizing: 85,
    completed: 100,
    failed: 100,
    timeout: 100
  };

  return fallbackMap[phase] || 12;
}

Page({
  data: {
    taskId: "",
    workId: "",
    phase: "queued",
    phaseLabel: "排队中",
    status: "pending",
    generationLabel: "排队中",
    reason: "",
    phaseSteps: buildPhaseItems("queued"),
    isOptimization: false,
    generationHeroMeta: buildGenerationHeroMeta("queued", "pending", "", false),
    progressPercent: 12
  },

  onLoad(options) {
    const taskId = getStringParam(options, "taskId");
    const workId = getStringParam(options, "workId");

    this.setData({ taskId, workId });

    unbind = bindStore(this, (state) => {
      const activeTaskId = taskId || state.generationState.activeTaskId;
      const task = activeTaskId ? state.generationState.taskMap[activeTaskId] : null;
      const summary = selectGenerationStatusSummary(state);
      const phase = task?.phase || "queued";
      const status = task?.status || summary.status || "pending";
      const isOptimization = task?.operationType === "optimize" || task?.operationType === "targeted_upload";

      return {
        taskId: activeTaskId,
        phase,
        phaseLabel: formatGenerationPhase(phase),
        status,
        generationLabel: summary.label,
        reason: summary.reason,
        phaseSteps: buildPhaseItems(phase),
        isOptimization,
        generationHeroMeta: buildGenerationHeroMeta(phase, status, task?.failureReason || summary.reason || "", isOptimization),
        progressPercent: getProgressPercent(task, phase)
      };
    });

    const activeTaskId = taskId || store.getState().generationState.activeTaskId;

    if (activeTaskId) {
      this.setData({ taskId: activeTaskId });
      pollOnce(activeTaskId);
      startPolling(activeTaskId);
    }
  },

  onUnload() {
    if (unbind) {
      unbind();
      unbind = null;
    }

    clearGenerationTimer();
  },

  handleBackWorks() {
    switchTab(PAGE_ROUTES.works.index);
  },

  handleGoException() {
    navigate(PAGE_ROUTES.works.exception, {
      scene: "generation",
      workId: this.data.workId || ""
    });
  }
});
