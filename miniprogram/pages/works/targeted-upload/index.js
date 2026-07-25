"use strict";

const { initUploadFlow, addUploadAsset, removeUploadAsset } = require("../../../flows/creationFlow");
const { submitTargetedOptimization } = require("../../../flows/optimizationFlow");
const { experienceFlags } = require("../../../config/experience");
const { bindStore } = require("../../../store/core/bindStore");
const { formatUploadView } = require("../../../utils/formatter");
const { switchTab } = require("../../../utils/navigation");
const { getStringParam } = require("../../../utils/query");
const { showToast } = require("../../../utils/toast");

const DEFAULT_TARGET_IMAGE = "/assets/mock/pet-corgi-hero.png";
const CAT_TARGET_IMAGE = "/assets/mock/pet-cat-hero.png";

const EXISTING_ASSETS = [
  {
    key: "front",
    label: "正脸",
    status: "已上传",
    image: "/assets/mock/upload-front.png",
    available: true
  },
  {
    key: "side",
    label: "侧面",
    status: "已上传",
    image: "/assets/mock/upload-side.png",
    available: true
  },
  {
    key: "full",
    label: "全身",
    status: "已上传",
    image: "/assets/mock/upload-full.png",
    available: true
  }
];

const DIMENSION_MAP = {
  fur: {
    label: "毛色",
    problemText: "毛色不准确",
    suggestText: "正脸清晰照片（自然光下）",
    tipText: "贴士：在自然光下拍摄，主体清晰无遮挡，将能帮助模型更好地还原毛色与细节。",
    view: "front",
    cards: [
      {
        key: "front",
        viewType: "front",
        title: "正脸（自然光）",
        helper: "建议补充",
        image: "/assets/mock/upload-front.png",
        recommended: true
      },
      {
        key: "side",
        viewType: "side",
        title: "侧面（自然光）",
        helper: "可选补充",
        image: "/assets/mock/upload-side.png"
      },
      {
        key: "full",
        viewType: "full",
        title: "全身（自然光）",
        helper: "可选补充",
        image: "/assets/mock/upload-full.png"
      },
      {
        key: "custom",
        viewType: "custom",
        title: "其他角度",
        helper: "可选补充",
        image: "/assets/mock/upload-close.png"
      }
    ]
  },
  pattern: {
    label: "花纹",
    problemText: "花纹分布不准确",
    suggestText: "背部或花纹清晰照片（自然光下）",
    tipText: "贴士：让花纹区域完整入镜，尽量减少遮挡，有助于还原花纹分布和边界细节。",
    view: "pattern",
    cards: [
      {
        key: "pattern",
        viewType: "pattern",
        title: "花纹细节（自然光）",
        helper: "建议补充",
        image: "/assets/mock/targeted-reference.png",
        recommended: true
      },
      {
        key: "side",
        viewType: "side",
        title: "侧面（自然光）",
        helper: "可选补充",
        image: "/assets/mock/upload-side.png"
      },
      {
        key: "full",
        viewType: "full",
        title: "全身（自然光）",
        helper: "可选补充",
        image: "/assets/mock/upload-full.png"
      },
      {
        key: "custom",
        viewType: "custom",
        title: "其他角度",
        helper: "可选补充",
        image: "/assets/mock/upload-close.png"
      }
    ]
  },
  body: {
    label: "体型",
    problemText: "体型或姿态不准确",
    suggestText: "全身清晰照片（自然光下）",
    tipText: "贴士：让四肢和身体比例完整入镜，站姿或坐姿清晰可见，会更利于校准体型与姿态。",
    view: "full",
    cards: [
      {
        key: "full",
        viewType: "full",
        title: "全身（自然光）",
        helper: "建议补充",
        image: "/assets/mock/upload-full.png",
        recommended: true
      },
      {
        key: "front",
        viewType: "front",
        title: "正脸（自然光）",
        helper: "可选补充",
        image: "/assets/mock/upload-front.png"
      },
      {
        key: "side",
        viewType: "side",
        title: "侧面（自然光）",
        helper: "可选补充",
        image: "/assets/mock/upload-side.png"
      },
      {
        key: "custom",
        viewType: "custom",
        title: "其他角度",
        helper: "可选补充",
        image: "/assets/mock/upload-close.png"
      }
    ]
  },
  face: {
    label: "脸部轮廓",
    problemText: "脸部轮廓不准确",
    suggestText: "正脸近景清晰照片（自然光下）",
    tipText: "贴士：面部尽量居中且五官无遮挡，自然光下的近景更有助于校准脸部轮廓和表情。",
    view: "front",
    cards: [
      {
        key: "front",
        viewType: "front",
        title: "正脸近景（自然光）",
        helper: "建议补充",
        image: "/assets/mock/upload-front.png",
        recommended: true
      },
      {
        key: "side",
        viewType: "side",
        title: "侧面（自然光）",
        helper: "可选补充",
        image: "/assets/mock/upload-side.png"
      },
      {
        key: "full",
        viewType: "full",
        title: "全身（自然光）",
        helper: "可选补充",
        image: "/assets/mock/upload-full.png"
      },
      {
        key: "custom",
        viewType: "custom",
        title: "其他角度",
        helper: "可选补充",
        image: "/assets/mock/upload-close.png"
      }
    ]
  },
  ears: {
    label: "耳朵",
    problemText: "耳朵形状不准确",
    suggestText: "耳朵无遮挡清晰照片（自然光下）",
    tipText: "贴士：尽量让耳朵边缘完整可见，避免逆光或重影，这会帮助模型更准确识别耳朵形状。",
    view: "ear",
    cards: [
      {
        key: "ear",
        viewType: "ear",
        title: "耳朵细节（自然光）",
        helper: "建议补充",
        image: "/assets/mock/targeted-reference.png",
        recommended: true
      },
      {
        key: "front",
        viewType: "front",
        title: "正脸（自然光）",
        helper: "可选补充",
        image: "/assets/mock/upload-front.png"
      },
      {
        key: "side",
        viewType: "side",
        title: "侧面（自然光）",
        helper: "可选补充",
        image: "/assets/mock/upload-side.png"
      },
      {
        key: "custom",
        viewType: "custom",
        title: "其他角度",
        helper: "可选补充",
        image: "/assets/mock/upload-close.png"
      }
    ]
  },
  tail: {
    label: "尾巴",
    problemText: "尾巴细节不准确",
    suggestText: "尾巴完整可见照片（自然光下）",
    tipText: "贴士：让尾巴完整入镜并避免运动模糊，会更利于模型补齐尾巴细节和连接位置。",
    view: "tail",
    cards: [
      {
        key: "tail",
        viewType: "tail",
        title: "尾巴细节（自然光）",
        helper: "建议补充",
        image: "/assets/mock/targeted-reference.png",
        recommended: true
      },
      {
        key: "side",
        viewType: "side",
        title: "侧面（自然光）",
        helper: "可选补充",
        image: "/assets/mock/upload-side.png"
      },
      {
        key: "full",
        viewType: "full",
        title: "全身（自然光）",
        helper: "可选补充",
        image: "/assets/mock/upload-full.png"
      },
      {
        key: "custom",
        viewType: "custom",
        title: "其他角度",
        helper: "可选补充",
        image: "/assets/mock/upload-close.png"
      }
    ]
  }
};

let unbind = null;
function showUploadBusyToast() {
  showToast("照片上传中，请稍候");
}

function getDimensionConfig(dimension) {
  return DIMENSION_MAP[dimension] || DIMENSION_MAP.fur;
}

function resolveTargetImage(work, version) {
  if (version && version.previewMedia && version.previewMedia.cover) {
    return version.previewMedia.cover;
  }
  if (work && work.previewImage) {
    return work.previewImage;
  }
  if (work && work.petType === "cat") {
    return CAT_TARGET_IMAGE;
  }
  return DEFAULT_TARGET_IMAGE;
}

Page({
  data: {
    workId: "",
    dimension: "fur",
    dimensionLabel: "毛色",
    problemText: "毛色不准确",
    suggestText: "正脸清晰照片（自然光下）",
    tipText: "贴士：在自然光下拍摄，主体清晰无遮挡，将能帮助模型更好地还原毛色与细节。",
    recommendedView: "front",
    recommendedViewLabel: "正脸近照",
    targetImage: DEFAULT_TARGET_IMAGE,
    existingAssets: EXISTING_ASSETS,
    existingAssetCount: EXISTING_ASSETS.length,
    recommendCards: getDimensionConfig("fur").cards,
    assets: [],
    qualityStatus: "empty",
    qualityHint: "先补充一张本轮建议角度的照片，再开始定向优化。",
    canContinue: false,
    submitLoading: false,
    confirmTitle: "确认并发起优化",
    confirmSubtitle: "确认后先预占 1 次优化次数",
    showDevOnlyUi: experienceFlags.showDevOnlyUi,
    workAvailable: false
  },

  onLoad(options) {
    const workId = getStringParam(options, "workId");
    const dimension = getStringParam(options, "dimension", "fur");
    const current = getDimensionConfig(dimension);

    this.setData({
      workId,
      dimension,
      dimensionLabel: current.label,
      problemText: current.problemText,
      suggestText: current.suggestText,
      tipText: current.tipText,
      recommendedView: current.view,
      recommendedViewLabel: formatUploadView(current.view),
      recommendCards: current.cards
    });

    initUploadFlow("supplement");

    unbind = bindStore(this, (state) => {
      const work = state.workState.workMap[workId];
      const version = work && work.currentVersionId ? state.workState.versionMap[work.currentVersionId] : null;
      const assets = state.uploadState.assets.map((item) => ({
        ...item,
        viewLabel: formatUploadView(item.viewType),
        uploadText: item.uploadStatus === "uploading"
          ? "上传中"
          : item.uploadStatus === "uploaded"
            ? "已上传"
            : item.uploadStatus === "failed"
              ? "上传失败，请重试"
              : "仅用于本次优化"
      }));
      const usableAssets = assets.filter((item) => item.uploadStatus !== "failed" && item.uploadStatus !== "uploading");
      const usableViewSet = new Set(usableAssets.map((item) => item.viewType));
      const submitLoading = state.uploadState.uploadSubmitStatus === "loading";
      const uploadFailed = state.uploadState.uploadSubmitStatus === "failed";

      return {
        workAvailable: Boolean(work),
        assets,
        targetImage: resolveTargetImage(work, version),
        qualityStatus: state.uploadState.qualityCheckStatus,
        qualityHint: state.uploadState.latestActionMessage,
        canContinue: usableAssets.length > 0 && usableViewSet.has(current.view) && !submitLoading && !uploadFailed,
        submitLoading,
        confirmTitle: submitLoading ? "照片上传中" : uploadFailed ? "重新上传并发起优化" : "确认并发起优化",
        confirmSubtitle: submitLoading
          ? "请稍候，不要重复点击"
          : uploadFailed
            ? state.uploadState.uploadSubmitError || "照片上传失败，请检查网络后重试"
            : "确认后先预占 1 次优化次数"
      };
    });
  },

  onUnload() {
    if (unbind) {
      unbind();
      unbind = null;
    }
  },

  async handleCameraUpload() {
    if (this.data.submitLoading) {
      showUploadBusyToast();
      return;
    }
    await addUploadAsset(this.data.recommendedView, "success", { sourceType: ["camera"], workId: this.data.workId, uploadRole: "targeted" });
  },

  async handleAlbumUpload() {
    if (this.data.submitLoading) {
      showUploadBusyToast();
      return;
    }
    await addUploadAsset(this.data.recommendedView, "success", { sourceType: ["album"], workId: this.data.workId, uploadRole: "targeted" });
  },

  async handleSelectRecommend(event) {
    if (this.data.submitLoading) {
      showUploadBusyToast();
      return;
    }
    const viewType = event.currentTarget.dataset.view;
    if (!viewType) {
      return;
    }
    await addUploadAsset(viewType, "success", { workId: this.data.workId, uploadRole: "targeted" });
  },

  handleViewAllAssets() {
    showToast("当前展示本作品已上传素材摘要");
  },

  async handleMockFailed() {
    await addUploadAsset("custom", "failed", { workId: this.data.workId, uploadRole: "targeted" });
  },

  async handlePermissionError() {
    await addUploadAsset("custom", "permissionError", { workId: this.data.workId, uploadRole: "targeted" });
  },

  async handleRemove(event) {
    await removeUploadAsset(event.currentTarget.dataset.assetId);
  },

  async handleSubmit() {
    if (this.data.submitLoading) {
      return;
    }
    await submitTargetedOptimization(this.data.workId, this.data.dimension, false);
  },

  async handleSubmitFailure() {
    await submitTargetedOptimization(this.data.workId, this.data.dimension, true);
  },

  handleGoWorks() {
    switchTab("/pages/works/index/index");
  }
});
