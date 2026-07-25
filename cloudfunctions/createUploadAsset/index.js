"use strict";

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const uploadAssets = db.collection("uploadAssets");
const ALLOWED_VIEW_TYPES = new Set([
  "front",
  "side",
  "full",
  "pattern",
  "ear",
  "tail",
  "custom"
]);
const ALLOWED_ROLES = new Set([
  "initial",
  "targeted",
  "optimization"
]);
const ROLE_ALIAS_MAP = {
  supplement: "targeted"
};
const ALLOWED_FILE_TYPES = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic"
]);
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function createAssetId() {
  return `asset-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function normalizeRole(value) {
  const role = normalizeString(value) || "initial";
  return ROLE_ALIAS_MAP[role] || role;
}

function normalizeFileType(value, cloudPath = "") {
  const direct = normalizeString(value).toLowerCase().replace(/^image\//, "");
  if (direct) {
    return direct === "jpeg" ? "jpg" : direct;
  }

  const cleanPath = String(cloudPath || "").split("?")[0].split("#")[0];
  const match = cleanPath.match(/\.([a-zA-Z0-9]+)$/);
  const inferred = match && match[1] ? match[1].toLowerCase() : "";
  return inferred === "jpeg" ? "jpg" : inferred;
}

function isValidCloudPath(cloudPath, workId, role, viewType) {
  if (!cloudPath) {
    return true;
  }

  const prefix = `petmate/uploads/${workId}/${role}/${viewType}/`;
  return cloudPath.indexOf(prefix) === 0;
}

function isValidFileID(fileID) {
  return /^cloud:\/\//.test(fileID);
}

function expectedError(errorCode, message) {
  return {
    ok: false,
    errorCode,
    message
  };
}

function fail(error, message = "上传记录保存失败") {
  console.error("createUploadAsset failed", error);
  return {
    ok: false,
    errorCode: "CREATE_UPLOAD_ASSET_FAILED",
    message
  };
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const workId = normalizeString(event.workId);
    const viewType = normalizeString(event.viewType);
    const role = normalizeRole(event.role);
    const fileID = normalizeString(event.fileID);
    const cloudPath = normalizeString(event.cloudPath);
    const fileType = normalizeFileType(event.fileType, cloudPath);
    const size = normalizeNumber(event.size);

    if (!OPENID || !workId || !viewType || !fileID) {
      return expectedError("UPLOAD_ASSET_INVALID_PAYLOAD", "上传记录参数不完整");
    }

    if (!ALLOWED_VIEW_TYPES.has(viewType)) {
      return expectedError("UPLOAD_ASSET_INVALID_VIEW_TYPE", "照片视角不支持，请重新选择");
    }

    if (!ALLOWED_ROLES.has(role)) {
      return expectedError("UPLOAD_ASSET_INVALID_ROLE", "上传用途不支持，请重新选择");
    }

    if (!ALLOWED_FILE_TYPES.has(fileType)) {
      return expectedError("UPLOAD_ASSET_INVALID_FILE_TYPE", "仅支持 jpg、png、webp 或 heic 图片");
    }

    if (size > MAX_UPLOAD_SIZE) {
      return expectedError("UPLOAD_ASSET_FILE_TOO_LARGE", "图片太大，请重新选择 10MB 以内的照片");
    }

    if (!isValidFileID(fileID)) {
      return expectedError("UPLOAD_ASSET_INVALID_FILE_ID", "上传文件地址异常，请重新上传");
    }

    if (!isValidCloudPath(cloudPath, workId, role, viewType)) {
      return expectedError("UPLOAD_ASSET_INVALID_CLOUD_PATH", "上传文件路径异常，请重新上传");
    }

    const now = new Date();
    const assetId = normalizeString(event.assetId) || createAssetId();
    const record = {
      assetId,
      workId,
      openid: OPENID,
      ownerOpenid: OPENID,
      viewType,
      role,
      fileID,
      cloudPath,
      status: "active",
      size,
      width: normalizeNumber(event.width),
      height: normalizeNumber(event.height),
      fileType,
      createdAt: now,
      updatedAt: now
    };

    const addResult = await uploadAssets.add({
      data: record
    });

    return {
      ok: true,
      data: {
        assetId,
        uploadedAt: now,
        recordId: addResult._id || "",
        record
      }
    };
  } catch (error) {
    return fail(error);
  }
};
