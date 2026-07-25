"use strict";

const cloudUpload = require("./cloud");
const mockUpload = require("../mock/upload");
const { getServiceMode, SERVICE_MODE_VALUE } = require("../runtime");
const { experienceFlags } = require("../../config/experience");
const { createId } = require("../../utils/id");

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["jpg", "jpeg", "png", "webp", "heic"];
const uploadMode = getServiceMode("upload");
// uploadMode is cloud-with-mock-dev-fallback by default; cloud-capable assets upload immediately after selection.

function isCancelError(error) {
  const message = (error && (error.errMsg || error.message)) || "";
  return /cancel|取消/i.test(message);
}

function inferFileType(path) {
  const cleanPath = String(path || "").split("?")[0].split("#")[0];
  const match = cleanPath.match(/\.([a-zA-Z0-9]+)$/);
  return match && match[1] ? match[1].toLowerCase() : "jpg";
}

function normalizeImageFileType(fileType, tempFilePath) {
  const raw = String(fileType || "").toLowerCase().replace(/^image\//, "");

  if (ALLOWED_IMAGE_TYPES.indexOf(raw) >= 0) {
    return raw;
  }

  const inferred = inferFileType(tempFilePath);
  return ALLOWED_IMAGE_TYPES.indexOf(inferred) >= 0 ? inferred : "jpg";
}

function normalizeChooseMediaFile(file, viewType) {
  const tempFilePath = file.tempFilePath || file.path || "";
  return {
    tempFilePath,
    localPath: tempFilePath,
    size: file.size || 0,
    width: file.width || 0,
    height: file.height || 0,
    fileType: normalizeImageFileType(file.fileType, tempFilePath),
    viewType
  };
}

function chooseMedia(options) {
  if (typeof wx === "undefined") {
    return Promise.reject(new Error("当前环境无法选择照片"));
  }

  if (typeof wx.chooseMedia === "function") {
    return wx.chooseMedia({
      count: options.count || 1,
      mediaType: ["image"],
      sourceType: options.sourceType || ["album", "camera"],
      sizeType: ["original", "compressed"]
    });
  }

  if (typeof wx.chooseImage === "function") {
    return wx.chooseImage({
      count: options.count || 1,
      sourceType: options.sourceType || ["album", "camera"],
      sizeType: ["original", "compressed"]
    });
  }

  return Promise.reject(new Error("当前环境无法选择照片"));
}

async function selectPetImage(options = {}) {
  const viewType = options.viewType || "custom";

  try {
    const result = await chooseMedia({
      count: 1,
      sourceType: options.sourceType
    });
    const file = result.tempFiles && result.tempFiles[0]
      ? result.tempFiles[0]
      : {
          tempFilePath: result.tempFilePaths && result.tempFilePaths[0],
          size: 0
        };
    const normalized = normalizeChooseMediaFile(file, viewType);

    if (!normalized.tempFilePath) {
      return {
        ok: false,
        status: "failed",
        message: "没有选择到有效照片"
      };
    }

    if (normalized.size > MAX_IMAGE_SIZE) {
      return {
        ok: false,
        status: "tooLarge",
        message: "图片太大，请重新选择一张更清晰且体积较小的照片。"
      };
    }

    return {
      ok: true,
      data: normalized
    };
  } catch (error) {
    if (isCancelError(error)) {
      return {
        ok: false,
        status: "cancelled",
        message: ""
      };
    }

    return {
      ok: false,
      status: "failed",
      message: (error && error.message) || "照片选择失败，请重试。"
    };
  }
}

function shouldUseMock(options = {}) {
  return Boolean(options.forceMock || experienceFlags.useMockUpload || uploadMode === SERVICE_MODE_VALUE.MOCK);
}

async function prepareUploadAsset(options = {}) {
  const viewType = options.viewType || "custom";
  const role = options.role || "initial";

  if (shouldUseMock(options) || options.scenario === "failed" || options.scenario === "permissionError") {
    return mockUpload.createMockAsset(viewType, role, options.scenario || "success");
  }

  const selected = await selectPetImage({
    viewType,
    sourceType: options.sourceType,
    count: 1
  });

  if (!selected.ok) {
    return selected;
  }

  return {
    ok: true,
    status: "selected",
    message: "照片已选择，正在上传。",
    asset: {
      assetId: createId("asset"),
      localPath: selected.data.localPath,
      tempFilePath: selected.data.tempFilePath,
      role,
      viewType,
      size: selected.data.size,
      width: selected.data.width,
      height: selected.data.height,
      fileType: selected.data.fileType,
      qualityStatus: "passed",
      uploadStatus: "selected",
      fileID: "",
      cloudPath: ""
    }
  };
}

async function uploadPetImage(options = {}) {
  if (!options.tempFilePath) {
    return {
      ok: false,
      errorCode: "UPLOAD_TEMP_FILE_REQUIRED",
      message: "照片上传失败，请重新选择照片。"
    };
  }

  try {
    const result = await cloudUpload.uploadPetImage({
      ...options,
      fileType: normalizeImageFileType(options.fileType, options.tempFilePath)
    });
    return {
      ok: true,
      data: result
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: error && error.fileID ? "UPLOAD_RECORD_FAILED" : "UPLOAD_IMAGE_FAILED",
      message: (error && error.message) || "照片上传失败，请检查网络后重试。",
      fileID: error && error.fileID,
      cloudPath: error && error.cloudPath,
      cleanupSucceeded: error && typeof error.cleanupSucceeded === "boolean" ? error.cleanupSucceeded : undefined
    };
  }
}

module.exports = {
  ...mockUpload,
  selectPetImage,
  uploadPetImage,
  prepareUploadAsset
};
