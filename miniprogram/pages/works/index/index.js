"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockWorks_1 = require("../../../mocks/data/mockWorks");
const generation_1 = require("../../../config/generation");
const bindStore_1 = require("../../../store/core/bindStore");
const createStore_1 = require("../../../store/core/createStore");
const index_1 = require("../../../store/selectors/index");
const navigation_1 = require("../../../utils/navigation");
const query_1 = require("../../../utils/query");
const toast_1 = require("../../../utils/toast");
const workSyncFlow_1 = require("../../../flows/workSyncFlow");
let unbind = null;
const SCENARIO_SET = ["auto", "withWorks", "empty", "generating", "failed"];
const HOME_STATUS_META = {
    idle: {
        label: "待生成",
        tone: "neutral"
    },
    draft: {
        label: "待完善",
        tone: "neutral"
    },
    uploading: {
        label: "上传中",
        tone: "progress"
    },
    generating: {
        label: "生成中",
        tone: "progress"
    },
    ready: {
        label: "可查看结果",
        tone: "success"
    },
    retouched: {
        label: "已补色",
        tone: "success"
    },
    failed: {
        label: "可恢复",
        tone: "danger"
    }
};
const GENERATION_PROGRESS_MAP = generation_1.GENERATION_CONFIG.phaseProgress;
function resolveScenario(value) {
    return SCENARIO_SET.indexOf(value) > -1 ? value : "auto";
}
function getPetTypeLabel(petType) {
    if (petType === "dog") {
        return "狗狗";
    }
    if (petType === "cat") {
        return "猫咪";
    }
    return "宠物";
}
function formatDateText(value) {
    if (!value) {
        return mockWorks_1.mockWorks.createdAt;
    }
    return String(value).slice(0, 10);
}
function buildDisplayName(work) {
    if (work.displayName) {
        return work.displayName;
    }
    const petTypeLabel = work.petTypeLabel || getPetTypeLabel(work.petType);
    const petName = work.petName || "当前宠物作品";
    return petName.indexOf("·") > -1 ? petName : `${petTypeLabel} · ${petName}`;
}
function getPreviewImage(work, version) {
    if (work.previewImage) {
        return work.previewImage;
    }
    if (version && version.previewMedia && version.previewMedia.cover) {
        return version.previewMedia.cover;
    }
    if (work.status === "failed") {
        return mockWorks_1.mockWorks.previewAssets.exceptionHero;
    }
    return work.petType === "dog" ? mockWorks_1.mockWorks.previewAssets.corgiHero : mockWorks_1.mockWorks.previewAssets.catHero;
}
function getProgressValue(state, work) {
    const activeTaskId = state.generationState.activeTaskId;
    const activeTask = activeTaskId ? state.generationState.taskMap[activeTaskId] : null;
    if (activeTask && activeTask.workId === work.workId) {
        return GENERATION_PROGRESS_MAP[activeTask.phase] || 30;
    }
    if (state.generationState.currentPhase !== "idle") {
        return GENERATION_PROGRESS_MAP[state.generationState.currentPhase] || 30;
    }
    return 30;
}
function createHomeWorkItem(work, options = {}) {
    const statusMeta = HOME_STATUS_META[work.status] || HOME_STATUS_META.idle;
    const progressValue = work.status === "generating" ? options.progressValue || work.progressValue || 30 : 0;
    return {
        workId: work.workId,
        petType: work.petType || "cat",
        petTypeLabel: work.petTypeLabel || getPetTypeLabel(work.petType),
        petName: work.petName || "当前宠物作品",
        displayName: buildDisplayName(work),
        status: work.status || "idle",
        statusTone: statusMeta.tone,
        heroStatusText: statusMeta.label,
        statusText: work.status === "generating" ? `生成中 ${progressValue}%` : work.statusText || statusMeta.label,
        progressValue,
        progressText: work.status === "generating" ? `${progressValue}%` : "",
        createdAtText: formatDateText(work.createdAt),
        previewImage: getPreviewImage(work, options.version),
        currentVersionId: work.currentVersionId || (options.version && options.version.versionId) || "",
        selected: Boolean(work.selected)
    };
}
function buildMockHomeState(scenario) {
    const sourceWorks = mockWorks_1.mockWorks.homeWorks.map((item) => createHomeWorkItem(item));
    let currentHomeWork = null;
    if (scenario === "withWorks") {
        currentHomeWork = createHomeWorkItem(mockWorks_1.mockWorks.homeFeaturedWork);
    }
    if (scenario === "generating") {
        currentHomeWork = createHomeWorkItem(mockWorks_1.mockWorks.homeWorks[2], {
            progressValue: mockWorks_1.mockWorks.homeWorks[2].progressValue
        });
    }
    if (scenario === "failed") {
        currentHomeWork = createHomeWorkItem(mockWorks_1.mockWorks.homeWorks[3]);
    }
    const selectedWorkId = currentHomeWork ? currentHomeWork.workId : sourceWorks.length ? sourceWorks[0].workId : "";
    return {
        hasWork: Boolean(currentHomeWork),
        currentHomeWork,
        currentWork: currentHomeWork,
        currentVersion: null,
        homeWorks: scenario === "empty"
            ? []
            : sourceWorks.map((item) => ({
                ...item,
                selected: item.workId === selectedWorkId
            })),
        homeQuickEntries: mockWorks_1.mockWorks.homeQuickEntries,
        quickEntries: mockWorks_1.mockWorks.homeQuickEntries,
        optimizeRemaining: 2,
        activeStatus: currentHomeWork ? currentHomeWork.heroStatusText : "还没有作品",
        workCount: scenario === "empty" ? 0 : sourceWorks.length
    };
}
function buildAutoHomeState(state) {
    const works = state.workState.workOrder.map((workId) => state.workState.workMap[workId]).filter(Boolean);
    const currentWork = state.workState.currentWorkId ? state.workState.workMap[state.workState.currentWorkId] : works[0] || null;
    const currentVersion = currentWork && currentWork.currentVersionId
        ? state.workState.versionMap[currentWork.currentVersionId] || null
        : (0, index_1.selectCurrentVersion)(state);
    const orderedWorks = works.slice().sort((left, right) => {
        if (!currentWork) {
            return 0;
        }
        if (left.workId === currentWork.workId) {
            return -1;
        }
        if (right.workId === currentWork.workId) {
            return 1;
        }
        return 0;
    });
    const currentHomeWork = currentWork
        ? createHomeWorkItem(currentWork, {
            version: currentVersion,
            progressValue: currentWork.status === "generating" ? getProgressValue(state, currentWork) : 0
        })
        : null;
    const homeWorks = orderedWorks.slice(0, 6).map((work) => {
        const version = work.currentVersionId ? state.workState.versionMap[work.currentVersionId] || null : null;
        return {
            ...createHomeWorkItem(work, {
                version,
                progressValue: work.status === "generating" ? getProgressValue(state, work) : 0
            }),
            selected: currentHomeWork ? work.workId === currentHomeWork.workId : false
        };
    });
    return {
        hasWork: Boolean(currentHomeWork),
        currentHomeWork,
        currentWork,
        currentVersion,
        homeWorks,
        homeQuickEntries: mockWorks_1.mockWorks.homeQuickEntries,
        quickEntries: mockWorks_1.mockWorks.homeQuickEntries,
        optimizeRemaining: (0, index_1.selectRemainingOptimizeCount)(state),
        activeStatus: currentHomeWork ? currentHomeWork.heroStatusText : "还没有作品",
        workCount: works.length
    };
}
function buildHomeViewState(state, uiScenario) {
    if (uiScenario !== "auto") {
        return buildMockHomeState(uiScenario);
    }
    return buildAutoHomeState(state);
}
Page({
    data: {
        uiScenario: "auto",
        hasWork: false,
        currentWork: null,
        currentVersion: null,
        currentHomeWork: null,
        homeWorks: [],
        homeQuickEntries: mockWorks_1.mockWorks.homeQuickEntries,
        optimizeRemaining: 0,
        activeStatus: "还没有作品",
        quickEntries: mockWorks_1.mockWorks.homeQuickEntries,
        workCount: 0,
        loadFailed: false,
        headerTopPadding: 20,
        headerRightWidth: 96,
        headerNavHeight: 44
    },
    onLoad(options) {
        const uiScenario = resolveScenario((0, query_1.getStringParam)(options, "uiScenario", "auto"));
        this.setData({
            uiScenario,
            loadFailed: (0, query_1.getStringParam)(options, "loadScenario", "success") === "failed"
        });
        this.updateHeaderMetrics();
        unbind = (0, bindStore_1.bindStore)(this, (state) => buildHomeViewState(state, uiScenario));
    },
    onShow() {
        this.updateHeaderMetrics();
        if (this.data.uiScenario === "auto") {
            (0, workSyncFlow_1.loadCloudWorks)({ silent: true }).catch((error) => {
                console.error("home load cloud works failed", error);
            });
        }
    },
    onUnload() {
        if (unbind) {
            unbind();
            unbind = null;
        }
    },
    updateHeaderMetrics() {
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const statusBarHeight = windowInfo.statusBarHeight || 20;
        const screenWidth = windowInfo.windowWidth || 375;
        let safeTop = statusBarHeight + 10;
        let navHeight = 44;
        let sideWidth = 96;
        try {
            const menuButton = wx.getMenuButtonBoundingClientRect();
            if (menuButton && menuButton.width) {
                safeTop = menuButton.top || safeTop;
                navHeight = Math.max(menuButton.height || 32, 44);
                sideWidth = Math.max(96, Math.max(screenWidth - menuButton.left + 6, menuButton.width + 6));
            }
        }
        catch (error) {
            sideWidth = 96;
        }
        this.setData({
            headerTopPadding: safeTop,
            headerNavHeight: navHeight,
            headerRightWidth: sideWidth
        });
    },
    handleCreate() {
        (0, navigation_1.navigate)("/pages/works/start-create/index");
    },
    handleOpenCases() {
        (0, navigation_1.switchTab)("/pages/cases/index/index");
    },
    handleOpenGeneratedList() {
        (0, navigation_1.navigate)("/pages/works/generated-list/index");
    },
    handleOpenBenefits() {
        (0, navigation_1.navigate)("/pages/mine/help/index");
    },
    handleOpenHelp() {
        (0, navigation_1.navigate)("/pages/mine/help/index");
    },
    handlePreviewHint() {
        (0, toast_1.showToast)("进入详情页可继续查看");
    },
    handleOpenCurrent() {
        if (!this.data.currentHomeWork) {
            return;
        }
        this.openWorkByState(this.data.currentHomeWork);
    },
    handleOpenWorkCard(event) {
        const workId = event.currentTarget.dataset.workId;
        const work = this.data.homeWorks.find((item) => item.workId === workId);
        if (!work) {
            return;
        }
        this.openWorkByState(work);
    },
    openWorkByState(work) {
        if (!work || !work.workId) {
            return;
        }
        if (work.status === "generating") {
            const taskId = createStore_1.store.getState().generationState.activeTaskId;
            (0, navigation_1.navigate)("/pages/works/generating/index", {
                workId: work.workId,
                taskId
            });
            return;
        }
        if (work.status === "failed") {
            (0, navigation_1.navigate)("/pages/works/exception/index", {
                workId: work.workId
            });
            return;
        }
        (0, navigation_1.navigate)("/pages/works/detail/index", {
            workId: work.workId
        });
    },
    handleQuickEntry(event) {
        const route = event.currentTarget.dataset.route;
        const mode = event.currentTarget.dataset.mode;
        if (!route) {
            return;
        }
        if (mode === "switchTab" || route.indexOf("/pages/cases/index/index") === 0) {
            (0, navigation_1.switchTab)(route);
            return;
        }
        (0, navigation_1.navigate)(route);
    },
    handleRetry() {
        this.setData({ loadFailed: false });
    }
});
