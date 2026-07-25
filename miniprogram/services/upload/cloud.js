"use strict";

function assertCloudReady() {
  if (
    typeof wx === "undefined" ||
    !wx.cloud ||
    typeof wx.cloud.uploadFile !== "function" ||
    typeof wx.cloud.callFunction !== "function"
  ) {
    throw new Error("上传服务暂时不可用，请稍后再试。");
  }
}

function normalizeSegment(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeUploadRole(role) {
  return role === "supplement" ? "targeted" : role || "initial";
}

function getFileExt(tempFilePath) {
  const cleanPath = String(tempFilePath || "").split("?")[0].split("#")[0];
  const match = cleanPath.match(/\.([a-zA-Z0-9]+)$/);

  if (!match || !match[1]) {
    return "jpg";
  }

  const ext = match[1].toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "heic"].indexOf(ext) === -1 ? "jpg" : ext;
}

function createRandomPart() {
  return Math.random().toString(36).slice(2, 8);
}

function buildCloudPath({ workId, viewType, role, tempFilePath }) {
  const safeWorkId = normalizeSegment(workId, "draft");
  const safeViewType = normalizeSegment(viewType, "custom");
  const safeRole = normalizeSegment(normalizeUploadRole(role), "initial");
  const ext = getFileExt(tempFilePath);
  return `petmate/uploads/${safeWorkId}/${safeRole}/${safeViewType}/${Date.now()}_${createRandomPart()}.${ext}`;
}

async function uploadImageToCloud({ cloudPath, tempFilePath }) {
  assertCloudReady();

  const result = await wx.cloud.uploadFile({
    cloudPath,
    filePath: tempFilePath
  });

  if (!result || !result.fileID) {
    throw new Error("照片上传失败，请检查网络后重试。");
  }

  return {
    fileID: result.fileID,
    cloudPath
  };
}

function unwrapCloudResult(response, functionName) {
  if (!response || typeof response !== "object" || !response.result || typeof response.result !== "object") {
    throw new Error(`${functionName} 云函数返回格式异常`);
  }

  const result = response.result;

  if (result.ok === false) {
    const error = new Error(result.message || `${functionName} 云函数调用失败`);
    error.errorCode = result.errorCode || `${functionName.toUpperCase()}_FAILED`;
    throw error;
  }

  if (result.ok !== true || !Object.prototype.hasOwnProperty.call(result, "data")) {
    throw new Error(`${functionName} 云函数返回格式异常`);
  }

  return result.data;
}

async function createUploadAssetRecord(payload) {
  assertCloudReady();

  const response = await wx.cloud.callFunction({
    name: "createUploadAsset",
    data: payload
  });

  return unwrapCloudResult(response, "createUploadAsset");
}

async function cleanupUploadedFile(fileID) {
  if (
    typeof wx === "undefined" ||
    !wx.cloud ||
    typeof wx.cloud.deleteFile !== "function" ||
    !fileID
  ) {
    return false;
  }

  try {
    await wx.cloud.deleteFile({
      fileList: [fileID]
    });
    return true;
  } catch (error) {
    console.warn("cleanup uploaded file failed", error && error.message ? error.message : error);
    return false;
  }
}

async function uploadPetImage(options = {}) {
  const normalizedRole = normalizeUploadRole(options.role);
  const cloudPath = options.cloudPath || buildCloudPath(options);
  const uploaded = await uploadImageToCloud({
    cloudPath,
    tempFilePath: options.tempFilePath
  });
  const uploadedAt = Date.now();

  try {
    const record = await createUploadAssetRecord({
      assetId: options.assetId,
      workId: options.workId,
      viewType: options.viewType,
      role: normalizedRole,
      fileID: uploaded.fileID,
      cloudPath: uploaded.cloudPath,
      size: options.size || 0,
      width: options.width || 0,
      height: options.height || 0,
      fileType: options.fileType || ""
    });

    return {
      assetId: record.assetId || options.assetId || "",
      fileID: uploaded.fileID,
      cloudPath: uploaded.cloudPath,
      workId: options.workId,
      viewType: options.viewType,
      role: record.record && record.record.role ? record.record.role : normalizedRole,
      uploadedAt: record.uploadedAt || uploadedAt,
      uploadRecord: record.record || null,
      uploadRecordId: record.recordId || ""
    };
  } catch (error) {
    const cleanupSucceeded = await cleanupUploadedFile(uploaded.fileID);
    const wrappedError = new Error("照片已上传，但上传记录保存失败，请重试。");
    wrappedError.cause = error;
    wrappedError.errorCode = error && error.errorCode ? error.errorCode : "UPLOAD_RECORD_FAILED";
    wrappedError.fileID = uploaded.fileID;
    wrappedError.cloudPath = uploaded.cloudPath;
    wrappedError.cleanupSucceeded = cleanupSucceeded;
    throw wrappedError;
  }
}

module.exports = {
  normalizeUploadRole,
  buildCloudPath,
  uploadImageToCloud,
  createUploadAssetRecord,
  uploadPetImage
};
