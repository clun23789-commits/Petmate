"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const { continueFromArGuide, syncArEntitlement } = require("../../../flows/arFlow");
const { bindStore } = require("../../../store/core/bindStore");
const navigation_1 = require("../../../utils/navigation");
const { NAV_FROM, getReturnActionCopy, getReturnContext, returnToSource } = require("../../../utils/navigationContext");
const query_1 = require("../../../utils/query");

const RIGHTS_ITEMS = [
    {
        icon: "AR",
        title: "AR 功能暂未开放",
        desc: "当前版本先提供基础作品生成结果，AR 体验会在后续版本开放。"
    },
    {
        icon: "结",
        title: "当前可查看基础结果",
        desc: "你可以继续查看作品结果、补图优化或进行细节补色。"
    },
    {
        icon: "续",
        title: "后续优化仍会保留",
        desc: "同一作品后续优化、补图或补色会继续围绕当前作品记录进行。"
    }
];

const CONDITION_ITEMS = [
    {
        icon: "版",
        title: "后续版本开放",
        desc: "开放前不会要求购买或进入不可用的展示流程。"
    },
    {
        icon: "提",
        title: "当前建议",
        desc: "先确认基础作品结果是否满意，如有差异可继续补图优化。"
    }
];

function resolveCurrentWorkName(work) {
    const petName = (work && work.petName) || "";
    if (!petName || petName === "我的宠物作品" || petName === "当前宠物作品") {
        return "当前宠物作品";
    }
    return petName;
}

function resolveHeroImage(version) {
    return (version && version.previewMedia && version.previewMedia.cover) || "/assets/mock/pet-corgi-hero.png";
}

let unbind = null;

Page({
    data: {
        workId: "",
        from: NAV_FROM.result,
        returnTo: "",
        work: null,
        version: null,
        currentWorkName: "当前宠物作品",
        heroImage: "/assets/mock/pet-corgi-hero.png",
        statusLabel: "AR 功能暂未开放",
        workAvailable: false,
        actionText: "AR 功能暂未开放",
        actionSubtext: "后续版本开放，当前可先查看基础作品结果",
        rightsItems: RIGHTS_ITEMS,
        conditionItems: CONDITION_ITEMS,
        secondaryText: "返回结果页",
        secondarySubtext: "继续查看当前生成结果"
    },

    onLoad(options) {
        const workId = query_1.getStringParam(options, "workId");
        const returnContext = getReturnContext(options, workId ? NAV_FROM.result : NAV_FROM.works);
        const returnCopy = getReturnActionCopy(returnContext.from);
        this.setData({
            workId,
            from: returnContext.from,
            returnTo: returnContext.returnTo,
            secondaryText: returnCopy.text,
            secondarySubtext: returnCopy.subtext
        });
        unbind = bindStore(this, (state) => {
            const work = state.workState.workMap[workId];
            const version = work && work.currentVersionId ? state.workState.versionMap[work.currentVersionId] : null;
            return {
                work,
                version,
                workAvailable: Boolean(work),
                currentWorkName: resolveCurrentWorkName(work),
                heroImage: resolveHeroImage(version),
                statusLabel: "AR 功能暂未开放"
            };
        });
        syncArEntitlement(workId).catch((error) => {
            console.error("ar guide sync entitlement failed", error);
        });
    },

    onUnload() {
        if (unbind) {
            unbind();
            unbind = null;
        }
    },

    handleOpenTips() {
        wx.showToast({
            title: "AR 功能暂未开放，后续版本开放",
            icon: "none"
        });
    },

    async handleContinue() {
        await continueFromArGuide(this.data.workId, {
            from: this.data.from,
            returnTo: this.data.returnTo
        });
    },

    handleBackResult() {
        returnToSource(this.data, {
            workId: this.data.workId
        });
    },

    handleGoWorks() {
        navigation_1.switchTab("/pages/works/index/index");
    }
});
