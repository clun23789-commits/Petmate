"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUserReady = ensureUserReady;
exports.initUploadFlow = initUploadFlow;
exports.unlockTrial = unlockTrial;
exports.applyGrantedAdReward = applyGrantedAdReward;
exports.setTrialReturnRoute = setTrialReturnRoute;
exports.addUploadAsset = addUploadAsset;
exports.removeUploadAsset = removeUploadAsset;
exports.startGenerationFromUpload = startGenerationFromUpload;
exports.pollActiveGeneration = pollActiveGeneration;
const ad_1 = require("../services/ad");
const auth_1 = require("../services/auth");
const generation_1 = require("../services/generation");
const upload_1 = require("../services/upload");
const experience_1 = require("../config/experience");
const mockRights_1 = require("../mocks/data/mockRights");
const createStore_1 = require("../store/core/createStore");
const id_1 = require("../utils/id");
const navigation_1 = require("../utils/navigation");
const { PAGE_ROUTES } = require("../utils/routes");
const toast_1 = require("../utils/toast");
const optimizeQuota_1 = require("./optimizeQuota");
const workSyncFlow_1 = require("./workSyncFlow");
function upsertWork(work, version) {
    createStore_1.store.setState((state) => {
        const workMap = {
            ...state.workState.workMap,
            [work.workId]: work
        };
        const versionMap = version
            ? {
                ...state.workState.versionMap,
                [version.versionId]: version
            }
            : state.workState.versionMap;
        const workOrder = state.workState.workOrder.includes(work.workId) ? state.workState.workOrder : [work.workId, ...state.workState.workOrder];
        return {
            workState: {
                ...state.workState,
                workMap,
                versionMap,
                workOrder,
                currentWorkId: work.workId,
                currentVersionId: (version === null || version === void 0 ? void 0 : version.versionId) || work.currentVersionId,
                activeWorkStatus: work.status
            }
        };
    }, "upsertWork");
}
function setUploadStatePatch(patch, label) {
    createStore_1.store.setState((state) => ({
        uploadState: {
            ...state.uploadState,
            ...patch
        }
    }), label);
}
function setTrialUnlockStatus(status, message) {
    createStore_1.store.setState((state) => ({
        trialState: {
            ...state.trialState,
            unlockStatus: status,
            latestUnlockMessage: message
        }
    }), "setTrialUnlockStatus");
}
function getRewardSceneForSource(source) {
    return source === "optimize_refill" ? "optimize_quota" : "initial_unlock";
}
function getPendingTrialReturnRoute() {
    return createStore_1.store.getState().trialState.pendingReturnRoute || "";
}
function clearTrialReturnRoute(label = "clearTrialReturnRoute") {
    createStore_1.store.setState((state) => ({
        trialState: {
            ...state.trialState,
            pendingReturnRoute: ""
        }
    }), label);
}
function withPendingTrialReturnRoute(query) {
    const returnTo = getPendingTrialReturnRoute();
    return returnTo
        ? {
            ...query,
            returnTo
        }
        : query;
}
function getCurrentAdRewardWorkId(rewardScene) {
    if (rewardScene !== "optimize_quota") {
        return "";
    }
    return createStore_1.store.getState().workState.currentWorkId || "";
}
function getAdRewardGrantKeys(rewardScene, grantResult = {}) {
    const clientRewardId = grantResult.clientRewardId || "";
    const grantId = grantResult.grantId || "";
    const keys = [];
    if (clientRewardId) {
        keys.push(`${rewardScene}:client:${clientRewardId}`, clientRewardId);
    }
    if (grantId) {
        keys.push(`${rewardScene}:grant:${grantId}`, grantId);
    }
    return Array.from(new Set(keys));
}
function hasGrantedAdReward(rewardScene, grantResult) {
    const grantKeys = getAdRewardGrantKeys(rewardScene, grantResult);
    const adRewardGrantMap = createStore_1.store.getState().trialState.adRewardGrantMap || {};
    return grantKeys.some((key) => adRewardGrantMap[key]);
}
async function applyGrantedAdReward(source, rewardScene, grantResult) {
    const grantKeys = getAdRewardGrantKeys(rewardScene, grantResult);
    const alreadyGranted = hasGrantedAdReward(rewardScene, grantResult);
    const shouldGrantInitialTrial = rewardScene === "initial_unlock";
    const successMessage = rewardScene === "optimize_quota"
        ? "广告试看完成，已为当前作品补充结果优化次数。"
        : "广告试看完成，已为当前创作链路解锁本次试用与 3 次优化机会。";
    createStore_1.store.setState((state) => {
        const adRewardGrantMap = state.trialState.adRewardGrantMap || {};
        if (grantKeys.some((key) => adRewardGrantMap[key])) {
            return {
                trialState: {
                    ...state.trialState,
                    unlockStatus: "success",
                    latestUnlockMessage: successMessage
                }
            };
        }
        const grantRecord = {
            grantId: grantResult.grantId || "",
            clientRewardId: grantResult.clientRewardId || "",
            rewardScene,
            source
        };
        const nextGrantMap = grantKeys.length
            ? grantKeys.reduce((map, key) => {
                map[key] = grantRecord;
                return map;
            }, {
                ...adRewardGrantMap
            })
            : adRewardGrantMap;
        return {
            trialState: {
                ...state.trialState,
                adGrantCount: state.trialState.adGrantCount + 1,
                uploadGranted: shouldGrantInitialTrial ? true : state.trialState.uploadGranted,
                generateGranted: shouldGrantInitialTrial ? true : state.trialState.generateGranted,
                lastGrantSource: source,
                unlockStatus: "success",
                latestUnlockMessage: successMessage,
                adRewardGrantMap: nextGrantMap
            }
        };
    }, "applyGrantedAdReward");
    if (alreadyGranted) {
        return {
            ok: true,
            duplicated: true
        };
    }
    return (0, optimizeQuota_1.grantOptimizeQuotaFromAd)({
        workId: getCurrentAdRewardWorkId(rewardScene),
        rewardScene,
        source,
        clientRewardId: grantResult.clientRewardId || "",
        adGrantId: grantResult.grantId || "",
        count: mockRights_1.mockRights.optimizeCountPerAd
    });
}
function shouldStayOnAdUnlockPage(status) {
    return status === "skipped" || status === "unavailable";
}

function hasOwn(target, key) {
    return Object.prototype.hasOwnProperty.call(target, key);
}

function isLegacyProfile(value) {
    return value && typeof value === "object" && !hasOwn(value, "ok");
}

function normalizeLoginResult(result) {
    if (isLegacyProfile(result)) {
        return {
            ok: true,
            status: "logged_in",
            profile: result
        };
    }

    return result || {
        ok: false,
        status: "failed",
        message: "登录失败，请稍后重试"
    };
}

function normalizePermissionResult(result, fallbackScope) {
    if (typeof result === "string") {
        return {
            ok: true,
            status: result,
            scope: fallbackScope,
            message: ""
        };
    }

    if (result && typeof result === "object") {
        return {
            ok: result.ok !== false,
            status: result.status || "unknown",
            scope: result.scope || fallbackScope,
            message: result.message || ""
        };
    }

    return {
        ok: false,
        status: "unavailable",
        scope: fallbackScope,
        message: "授权状态检查失败，请稍后重试"
    };
}

function getFallbackUserProfile(state) {
    return state.userState.userProfile || {
        nickname: "宠爱我家",
        avatarUrl: ""
    };
}

function isPermissionBlocked(permission) {
    return !permission || permission.ok !== true || permission.status === "denied" || permission.status === "unavailable";
}

async function ensureUserReady() {
    const login = auth_1.login || auth_1.mockLogin;
    const requestProfilePermission = auth_1.requestProfilePermission || auth_1.mockGrantProfilePermission;
    const requestCameraPermission = auth_1.requestCameraPermission || auth_1.mockGrantCameraPermission;
    const requestAlbumPermission = auth_1.requestAlbumPermission || auth_1.mockGrantAlbumPermission;
    const loginResult = normalizeLoginResult(await login());

    if (!loginResult || loginResult.ok !== true) {
        const message = loginResult && loginResult.message ? loginResult.message : "登录失败，请稍后重试";
        (0, toast_1.showToast)(message);
        throw new Error(message);
    }

    const profilePermission = normalizePermissionResult(await requestProfilePermission(), "profile");
    const cameraPermission = normalizePermissionResult(await requestCameraPermission(), "scope.camera");
    const albumPermission = normalizePermissionResult(await requestAlbumPermission(), "album");

    if (isPermissionBlocked(cameraPermission)) {
        const message = cameraPermission.message || "请开启相机权限后再继续";
        (0, toast_1.showToast)(message);
        throw new Error(cameraPermission.status === "denied" ? "CAMERA_PERMISSION_DENIED" : message);
    }

    createStore_1.store.setState((state) => ({
        userState: {
            ...state.userState,
            loginStatus: "logged_in",
            profileAuth: profilePermission.status,
            cameraAuth: cameraPermission.status,
            albumAuth: albumPermission.status,
            userProfile: loginResult.profile || getFallbackUserProfile(state),
            cloudOpenid: loginResult.cloudOpenid || state.userState.cloudOpenid,
            cloudUser: loginResult.cloudUser || state.userState.cloudUser,
            cloudSyncStatus: loginResult.cloudUser ? "success" : state.userState.cloudSyncStatus,
            cloudSyncError: ""
        }
    }), "ensureUserReady");
}
function initUploadFlow(mode) {
    createStore_1.store.setState((state) => ({
        uploadState: {
            ...state.uploadState,
            assets: [],
            qualityCheckStatus: "pending",
            missingViews: [],
            supplementMode: mode === "supplement",
            uploadDraftWorkId: "",
            latestActionMessage: mode === "supplement" ? "请补充本轮建议角度的照片。" : "先上传一张清晰主图，达到最低标准后即可继续。",
            latestFailureReason: "",
            uploadSubmitStatus: "idle",
            uploadSubmitError: ""
        }
    }), "initUploadFlow");
}
async function unlockTrial(source, scenario = "success") {
    if (createStore_1.store.getState().trialState.unlockStatus === "loading") {
        (0, toast_1.showToast)("广告正在处理中，请稍候");
        return false;
    }
    try {
        await ensureUserReady();
    }
    catch (error) {
        const message = error && error.message && error.message !== "CAMERA_PERMISSION_DENIED"
            ? error.message
            : "请先完成登录与相机权限确认";
        setTrialUnlockStatus("failed", message);
        return false;
    }
    const rewardScene = getRewardSceneForSource(source);
    const clientRewardId = (0, id_1.createId)("ad-reward");
    setTrialUnlockStatus("loading", "正在准备激励广告，请稍候。");
    const adResult = await (0, ad_1.showRewardedAd)({
        source,
        rewardScene,
        adScenario: scenario,
        clientRewardId
    });
    if (!adResult.ok || adResult.status !== "completed") {
        const status = adResult.status || "error";
        const message = adResult.message || "广告加载失败，请稍后重试";
        setTrialUnlockStatus(status, message);
        if (shouldStayOnAdUnlockPage(status)) {
            (0, toast_1.showToast)(message);
            return false;
        }
        (0, navigation_1.replace)(PAGE_ROUTES.works.exception, withPendingTrialReturnRoute({
            scene: "ad",
            status,
            source,
            rewardScene,
            clientRewardId
        }));
        return false;
    }
    setTrialUnlockStatus("loading", "广告已完成，正在确认试用权益。");
    const grantResult = await (0, ad_1.grantAdReward)({
        workId: getCurrentAdRewardWorkId(rewardScene),
        rewardScene,
        source,
        clientRewardId,
        adResult: {
            status: adResult.status,
            raw: adResult.raw || {}
        }
    });
    if (!grantResult.ok || grantResult.status !== "granted") {
        setTrialUnlockStatus("rightUnknown", grantResult.message || "广告已结束，但试用权益状态还没有确认下来。");
        (0, navigation_1.replace)(PAGE_ROUTES.works.exception, withPendingTrialReturnRoute({
            scene: "ad",
            status: "rightUnknown",
            source,
            rewardScene,
            clientRewardId
        }));
        return false;
    }
    await applyGrantedAdReward(source, rewardScene, grantResult);
    const pendingReturnRoute = getPendingTrialReturnRoute();
    if ((source === "optimize_refill" || source === "recover") && pendingReturnRoute) {
        clearTrialReturnRoute();
        (0, navigation_1.replace)(pendingReturnRoute);
        return true;
    }
    (0, navigation_1.replace)(PAGE_ROUTES.works.upload, {
        mode: "initial"
    });
    return true;
}
function setTrialReturnRoute(route) {
    createStore_1.store.setState((state) => ({
        trialState: {
            ...state.trialState,
            pendingReturnRoute: route
        }
    }), "setTrialReturnRoute");
}
function getCurrentUploadRole() {
    return createStore_1.store.getState().uploadState.supplementMode ? "supplement" : "initial";
}
function getUsableUploadAssets(assets) {
    return (assets || []).filter((asset) => asset && asset.uploadStatus !== "failed" && asset.uploadStatus !== "uploading");
}
function shouldUploadAssetToCloud(asset) {
    return Boolean(asset && asset.tempFilePath && asset.uploadStatus !== "uploaded" && !asset.fileID);
}
function ensureUploadWorkId(workId) {
    if (workId) {
        return workId;
    }
    const existing = createStore_1.store.getState().uploadState.uploadDraftWorkId;
    if (existing) {
        return existing;
    }
    const nextWorkId = (0, id_1.createId)("work");
    setUploadStatePatch({
        uploadDraftWorkId: nextWorkId
    }, "ensureUploadDraftWorkId");
    return nextWorkId;
}
function getUploadFailureReason(status) {
    if (status === "permissionError") {
        return "permission_error";
    }
    if (status === "tooLarge") {
        return "too_large";
    }
    if (status === "cancelled") {
        return "";
    }
    return "failed";
}
function mapQualityStatus(status) {
    if (status === "permissionError") {
        return "permission_error";
    }
    if (status === "failed" || status === "tooLarge") {
        return "failed";
    }
    return "pending";
}
async function addUploadAsset(viewType, scenario = "success", options = {}) {
    if (createStore_1.store.getState().uploadState.uploadSubmitStatus === "loading") {
        (0, toast_1.showToast)("照片上传中，请稍候");
        return false;
    }
    const role = getCurrentUploadRole();
    const scenarioAllowed = experience_1.experienceFlags.showDevOnlyUi;
    const effectiveScenario = scenarioAllowed ? scenario : "success";
    const result = await (0, upload_1.prepareUploadAsset)({
        viewType,
        role,
        scenario: effectiveScenario,
        sourceType: options.sourceType,
        forceMock: scenarioAllowed && (effectiveScenario === "failed" || effectiveScenario === "permissionError")
    });
    if (!result.ok || !result.asset) {
        if (result.status === "cancelled") {
            return false;
        }
        setUploadStatePatch({
            latestActionMessage: result.message,
            latestFailureReason: getUploadFailureReason(result.status),
            qualityCheckStatus: mapQualityStatus(result.status)
        }, "addUploadAssetFailure");
        if (result.message) {
            (0, toast_1.showToast)(result.message);
        }
        return false;
    }
    const asset = {
        ...result.asset,
        uploadStatus: result.asset.uploadStatus || (shouldUploadAssetToCloud(result.asset) ? "uploading" : "selected"),
        uploadError: ""
    };
    const nextAssets = [...createStore_1.store.getState().uploadState.assets, asset];
    setUploadStatePatch({
        assets: nextAssets,
        latestActionMessage: shouldUploadAssetToCloud(asset) ? "照片上传中，请稍候。" : result.message,
        latestFailureReason: "",
        uploadSubmitStatus: shouldUploadAssetToCloud(asset) ? "loading" : "idle",
        uploadSubmitError: ""
    }, "addUploadAssetSelected");

    if (shouldUploadAssetToCloud(asset)) {
        const workId = ensureUploadWorkId(options.workId);
        const uploadRole = options.uploadRole || role;
        const uploadResult = await (0, upload_1.uploadPetImage)({
            assetId: asset.assetId,
            workId,
            viewType: asset.viewType,
            tempFilePath: asset.tempFilePath,
            role: uploadRole,
            size: asset.size,
            width: asset.width,
            height: asset.height,
            fileType: asset.fileType
        });

        if (uploadResult.ok !== true) {
            const message = uploadResult.message || "照片上传失败，请检查网络后重试。";
            patchUploadAssets((item) => item.assetId === asset.assetId
                ? {
                    ...item,
                    uploadStatus: "failed",
                    uploadError: message
                }
                : item, "markSelectedUploadFailed");
            setUploadStatePatch({
                qualityCheckStatus: "failed",
                latestActionMessage: message,
                latestFailureReason: uploadResult.errorCode === "UPLOAD_RECORD_FAILED" ? "record_failed" : "failed",
                uploadSubmitStatus: "failed",
                uploadSubmitError: message
            }, "addUploadAssetUploadFailed");
            (0, toast_1.showToast)(message);
            return false;
        }

        patchUploadAssets((item) => item.assetId === asset.assetId
            ? {
                ...item,
                ...(uploadResult.data || {}),
                role: (uploadResult.data && uploadResult.data.role) || uploadRole,
                uploadStatus: "uploaded",
                uploadError: "",
                qualityStatus: "passed"
            }
            : item, "markSelectedUploadSuccess");
    }

    const currentAssets = createStore_1.store.getState().uploadState.assets;
    const qualityAssets = getUsableUploadAssets(currentAssets);
    const qualityResult = await (0, upload_1.runQualityCheck)(qualityAssets, role);
    setUploadStatePatch({
        qualityCheckStatus: qualityResult.canContinue ? "passed" : qualityResult.status === "lowQuality" ? "rejected" : "needs_more",
        missingViews: qualityResult.missingViews,
        latestActionMessage: qualityResult.message,
        latestFailureReason: "",
        uploadSubmitStatus: shouldUploadAssetToCloud(asset) ? "success" : "idle",
        uploadSubmitError: ""
    }, "addUploadAsset");
    return true;
}
async function removeUploadAsset(assetId) {
    const nextAssets = createStore_1.store.getState().uploadState.assets.filter((item) => item.assetId !== assetId);
    const qualityResult = await (0, upload_1.runQualityCheck)(getUsableUploadAssets(nextAssets), getCurrentUploadRole());
    setUploadStatePatch({
        assets: nextAssets,
        qualityCheckStatus: qualityResult.canContinue ? "passed" : qualityResult.status === "lowQuality" ? "rejected" : "needs_more",
        missingViews: qualityResult.missingViews,
        latestActionMessage: qualityResult.message,
        latestFailureReason: "",
        uploadDraftWorkId: nextAssets.length ? createStore_1.store.getState().uploadState.uploadDraftWorkId : "",
        uploadSubmitStatus: "idle",
        uploadSubmitError: ""
    }, "removeUploadAsset");
}
function createWork(operationType, petType = "cat", draftWorkId = "") {
    const workId = draftWorkId || (0, id_1.createId)("work");
    const now = new Date().toISOString();
    const work = {
        workId,
        petType,
        petName: operationType === "initial" ? "我的宠物作品" : "当前宠物作品",
        status: "uploading",
        currentVersionId: "",
        createdAt: now,
        updatedAt: now,
        versionIds: [],
        uploadAssets: {}
    };
    upsertWork(work);
    return work;
}
function getUploadRoleForOperation(operationType) {
    if (operationType === "targeted_upload") {
        return "targeted";
    }
    if (operationType === "optimize") {
        return "optimization";
    }
    return "initial";
}
function buildUploadAssetsMap(assets) {
    return assets.reduce((result, asset) => {
        if (!asset || !asset.viewType || asset.uploadStatus !== "uploaded") {
            return result;
        }
        result[asset.viewType] = {
            assetId: asset.assetId,
            fileID: asset.fileID || "",
            cloudPath: asset.cloudPath || "",
            status: "uploaded",
            viewType: asset.viewType,
            role: asset.role || "",
            uploadedAt: asset.uploadedAt || ""
        };
        return result;
    }, {});
}
function patchUploadAssets(updater, label) {
    createStore_1.store.setState((state) => ({
        uploadState: {
            ...state.uploadState,
            assets: state.uploadState.assets.map(updater)
        }
    }), label);
}
function writeUploadAssetsToWork(workId, uploadedAssets) {
    const uploadAssets = buildUploadAssetsMap(uploadedAssets);
    if (!Object.keys(uploadAssets).length) {
        return;
    }
    createStore_1.store.setState((state) => {
        const work = state.workState.workMap[workId];
        if (!work) {
            return {};
        }
        return {
            workState: {
                ...state.workState,
                workMap: {
                    ...state.workState.workMap,
                    [workId]: {
                        ...work,
                        uploadAssets: {
                            ...(work.uploadAssets || {}),
                            ...uploadAssets
                        },
                        updatedAt: new Date().toISOString()
                    }
                }
            }
        };
    }, "writeUploadAssetsToWork");
}
async function uploadPendingAssetsForWork(workId, role) {
    const assets = createStore_1.store.getState().uploadState.assets || [];
    const pendingAssets = assets.filter((asset) => asset && asset.tempFilePath && asset.uploadStatus !== "uploaded" && asset.uploadStatus !== "failed");

    if (!pendingAssets.length) {
        writeUploadAssetsToWork(workId, assets);
        return true;
    }

    setUploadStatePatch({
        uploadSubmitStatus: "loading",
        uploadSubmitError: "",
        latestActionMessage: "正在上传照片，请稍候。"
    }, "uploadPendingAssetsStart");
    const pendingIds = new Set(pendingAssets.map((asset) => asset.assetId));
    patchUploadAssets((asset) => pendingIds.has(asset.assetId)
        ? {
            ...asset,
            uploadStatus: "uploading",
            uploadError: ""
        }
        : asset, "markUploadAssetsUploading");

    const uploadResults = await Promise.all(pendingAssets.map(async (asset) => {
        const result = await (0, upload_1.uploadPetImage)({
            assetId: asset.assetId,
            workId,
            viewType: asset.viewType,
            tempFilePath: asset.tempFilePath,
            role,
            size: asset.size,
            width: asset.width,
            height: asset.height,
            fileType: asset.fileType
        });
        return {
            asset,
            result
        };
    }));
    const failed = uploadResults.find((entry) => entry.result.ok !== true);
    const resultMap = uploadResults.reduce((map, entry) => {
        map[entry.asset.assetId] = entry.result;
        return map;
    }, {});

    patchUploadAssets((asset) => {
        const result = resultMap[asset.assetId];
        if (!result) {
            return asset;
        }
        if (result.ok !== true) {
            return {
                ...asset,
                uploadStatus: "failed",
                uploadError: result.message || "照片上传失败，请检查网络后重试。"
            };
        }
        return {
            ...asset,
            ...(result.data || {}),
            role: (result.data && result.data.role) || asset.role,
            uploadStatus: "uploaded",
            uploadError: "",
            qualityStatus: "passed"
        };
    }, "markUploadAssetsResult");

    if (failed) {
        const message = failed.result.message || "照片上传失败，请检查网络后重试。";
        setUploadStatePatch({
            uploadSubmitStatus: "failed",
            uploadSubmitError: message,
            latestActionMessage: message,
            latestFailureReason: failed.result.errorCode === "UPLOAD_RECORD_FAILED" ? "record_failed" : "failed"
        }, "uploadPendingAssetsFailed");
        (0, toast_1.showToast)(message);
        return false;
    }

    const uploadedAssets = createStore_1.store.getState().uploadState.assets || [];
    writeUploadAssetsToWork(workId, uploadedAssets);
    setUploadStatePatch({
        uploadSubmitStatus: "success",
        uploadSubmitError: "",
        latestActionMessage: "照片已上传，正在进入生成流程。",
        latestFailureReason: ""
    }, "uploadPendingAssetsSuccess");
    return true;
}
function markWorkDraftAfterUploadFailure(workId) {
    if (!workId) {
        return;
    }
    createStore_1.store.setState((state) => {
        const work = state.workState.workMap[workId];
        if (!work || work.currentVersionId) {
            return {};
        }
        return {
            workState: {
                ...state.workState,
                workMap: {
                    ...state.workState.workMap,
                    [workId]: {
                        ...work,
                        status: "draft",
                        updatedAt: new Date().toISOString()
                    }
                },
                activeWorkStatus: state.workState.currentWorkId === workId ? "draft" : state.workState.activeWorkStatus
            }
        };
    }, "markWorkDraftAfterUploadFailure");
}
function getErrorMessage(error, fallback) {
    return error && error.message ? error.message : fallback;
}
function markWorkAfterGenerationSubmitFailure(workId, operationType, failureReason) {
    if (!workId) {
        createStore_1.store.setState((state) => ({
        generationState: {
            ...state.generationState,
            activeTaskId: "",
            currentPhase: "failed",
            failureReason,
            lastTaskSyncedAt: new Date().toISOString(),
            lastFailureCode: "GENERATION_SUBMIT_FAILED",
            lastFailureCategory: "system",
            progress: 100
        }
    }), "generationSubmitFailedWithoutWork");
        return;
    }
    createStore_1.store.setState((state) => {
        const work = state.workState.workMap[workId];
        const nextStatus = work && operationType === "initial" && !work.currentVersionId ? "draft" : work === null || work === void 0 ? void 0 : work.status;
        return {
            workState: work
                ? {
                    ...state.workState,
                    workMap: {
                        ...state.workState.workMap,
                        [workId]: {
                            ...work,
                            status: nextStatus,
                            updatedAt: new Date().toISOString()
                        }
                    },
                    activeWorkStatus: state.workState.currentWorkId === workId ? nextStatus : state.workState.activeWorkStatus
                }
                : state.workState,
            generationState: {
                ...state.generationState,
                activeTaskId: "",
                currentPhase: "failed",
                failureReason,
                lastTaskSyncedAt: new Date().toISOString(),
                lastFailureCode: "GENERATION_SUBMIT_FAILED",
                lastFailureCategory: "system",
                progress: 100
            }
        };
    }, "generationSubmitFailed");
}
function markGenerationQueryFailure(taskId, failureReason) {
    createStore_1.store.setState((state) => {
        const task = state.generationState.taskMap[taskId] || null;
        return {
            generationState: {
                ...state.generationState,
                currentPhase: task && task.phase ? task.phase : state.generationState.currentPhase,
                failureReason,
                lastTaskSyncedAt: new Date().toISOString(),
                lastFailureCode: "GENERATION_TASK_QUERY_FAILED",
                lastFailureCategory: "query"
            }
        };
    }, "generationQueryFailed");
}
async function startGenerationFromUpload(params) {
    const qualityMode = params.qualityMode || (params.operationType === "initial" ? "initial" : params.operationType === "targeted_upload" ? "supplement" : "skip");
    if (qualityMode !== "skip") {
        const qualityResult = await (0, upload_1.runQualityCheck)(getUsableUploadAssets(createStore_1.store.getState().uploadState.assets), qualityMode, params.requiredViews);
        if (!qualityResult.canContinue) {
            setUploadStatePatch({
                latestActionMessage: qualityResult.message,
                missingViews: qualityResult.missingViews,
                qualityCheckStatus: qualityResult.status === "lowQuality" ? "rejected" : "needs_more"
            }, "qualityCheckBlocked");
            (0, toast_1.showToast)(qualityResult.message);
            return null;
        }
    }
    const draftWorkId = createStore_1.store.getState().uploadState.uploadDraftWorkId;
    const work = params.workId ? createStore_1.store.getState().workState.workMap[params.workId] : createWork(params.operationType, "cat", draftWorkId);
    if (!work) {
        (0, toast_1.showToast)("作品不存在，请返回后重试。");
        return null;
    }
    if (qualityMode !== "skip") {
        const uploaded = await uploadPendingAssetsForWork(work.workId, getUploadRoleForOperation(params.operationType));
        if (!uploaded) {
            markWorkDraftAfterUploadFailure(params.workId ? "" : work.workId);
            return null;
        }
    }
    const currentWork = createStore_1.store.getState().workState.workMap[work.workId] || work;
    let task = null;
    try {
        task = await (0, generation_1.startGenerationTask)({
            workId: currentWork.workId,
            operationType: params.operationType,
            reservationId: params.reservationId,
            dimensionSet: params.dimensionSet,
            simulateFailure: params.simulateFailure,
            workSnapshot: currentWork
        });
        if (!task || !task.taskId) {
            throw new Error("生成任务返回为空");
        }
    }
    catch (error) {
        const failureReason = getErrorMessage(error, "生成任务提交失败，请稍后重试");
        if (params.reservationId) {
            await (0, optimizeQuota_1.releaseOptimizationReservation)(params.reservationId);
        }
        markWorkAfterGenerationSubmitFailure(currentWork.workId, params.operationType, failureReason);
        (0, toast_1.showToast)("生成任务提交失败，请稍后重试");
        (0, navigation_1.replace)(PAGE_ROUTES.works.exception, {
            scene: "generation",
            workId: currentWork.workId
        });
        return null;
    }
    createStore_1.store.setState((state) => ({
        workState: {
            ...state.workState,
            workMap: {
                ...state.workState.workMap,
                [currentWork.workId]: {
                    ...currentWork,
                    status: "generating",
                    updatedAt: new Date().toISOString()
                }
            },
            workOrder: state.workState.workOrder.includes(currentWork.workId) ? state.workState.workOrder : [currentWork.workId, ...state.workState.workOrder],
            currentWorkId: currentWork.workId,
            activeWorkStatus: "generating"
        },
        generationState: {
            ...state.generationState,
            taskMap: {
                ...state.generationState.taskMap,
                [task.taskId]: task
            },
            activeTaskId: task.taskId,
            currentPhase: task.phase,
            failureReason: "",
            lastTaskSyncedAt: new Date().toISOString(),
            lastFailureCode: "",
            lastFailureCategory: "",
            progress: task.progress || 0
        }
    }), "startGenerationFromUpload");
    (0, navigation_1.replace)(PAGE_ROUTES.works.generating, {
        taskId: task.taskId,
        workId: currentWork.workId
    });
    return task;
}
function resolveCompletedWorkFromGenerationResult(result, localWork) {
    const completedVersion = result && result.completedVersion;
    const cloudWork = result && result.work;
    if (cloudWork && completedVersion) {
        const versionIds = Array.isArray(cloudWork.versionIds) ? cloudWork.versionIds.slice() : [];
        if (versionIds.indexOf(completedVersion.versionId) === -1) {
            versionIds.push(completedVersion.versionId);
        }
        return {
            ...cloudWork,
            status: cloudWork.status || "ready",
            currentVersionId: cloudWork.currentVersionId || completedVersion.versionId,
            versionIds,
            previewImage: cloudWork.previewImage || (completedVersion.previewMedia && completedVersion.previewMedia.cover) || "",
            cloudSynced: result.cloudFinalized === true
        };
    }
    if (!localWork || !completedVersion) {
        return null;
    }
    const versionIds = Array.isArray(localWork.versionIds) ? localWork.versionIds.slice() : [];
    if (versionIds.indexOf(completedVersion.versionId) === -1) {
        versionIds.push(completedVersion.versionId);
    }
    return {
        ...localWork,
        status: "ready",
        currentVersionId: completedVersion.versionId,
        previewImage: localWork.previewImage || (completedVersion.previewMedia && completedVersion.previewMedia.cover) || "",
        updatedAt: new Date().toISOString(),
        versionIds
    };
}
function markCloudFinalizedLocally(workId, versionId) {
    createStore_1.store.setState((state) => ({
        workState: {
            ...state.workState,
            cloudSaveStatusMap: {
                ...state.workState.cloudSaveStatusMap,
                [workId]: "success"
            },
            cloudError: "",
            lastCloudSyncedAt: new Date().toISOString()
        },
        generationState: {
            ...state.generationState,
            lastTaskSyncedAt: new Date().toISOString(),
            progress: 100
        }
    }), "markCloudFinalizedLocally");
    if (workSyncFlow_1.clearPendingCloudSave) {
        (0, workSyncFlow_1.clearPendingCloudSave)(workId, versionId, "clearPendingCloudSaveAfterCloudFinalize");
    }
}
async function pollActiveGeneration(taskId, options = {}) {
    const autoNavigateOnFailure = options.autoNavigateOnFailure !== false;
    let result = null;
    try {
        result = await (0, generation_1.pollGenerationTask)(taskId);
    }
    catch (error) {
        const task = createStore_1.store.getState().generationState.taskMap[taskId] || null;
        const failureReason = getErrorMessage(error, "生成任务查询失败，请稍后重试");
        markGenerationQueryFailure(taskId, failureReason);
        if (autoNavigateOnFailure) {
            (0, navigation_1.replace)(PAGE_ROUTES.works.exception, {
                scene: "generation",
                taskId,
                workId: task && task.workId ? task.workId : ""
            });
        }
        return null;
    }
    if (!result.task) {
        return null;
    }
    createStore_1.store.setState((state) => ({
        generationState: {
            ...state.generationState,
            taskMap: {
                ...state.generationState.taskMap,
                [taskId]: result.task
            },
            currentPhase: result.task.phase,
            failureReason: result.task.failureReason,
            lastTaskSyncedAt: new Date().toISOString(),
            lastFailureCode: result.task.failureCode || "",
            lastFailureCategory: result.task.failureCategory || "",
            progress: result.task.progress || 0
        }
    }), "pollActiveGeneration");
    if (result.task.status === "failed") {
        createStore_1.store.setState((state) => {
            const currentWork = state.workState.workMap[result.task.workId];
            const nextStatus = (currentWork === null || currentWork === void 0 ? void 0 : currentWork.currentVersionId) ? currentWork.status : "failed";
            return {
                workState: currentWork
                    ? {
                        ...state.workState,
                        workMap: {
                            ...state.workState.workMap,
                            [result.task.workId]: {
                                ...currentWork,
                                status: nextStatus,
                                updatedAt: new Date().toISOString()
                            }
                        },
                        activeWorkStatus: state.workState.currentWorkId === result.task.workId ? nextStatus : state.workState.activeWorkStatus
                    }
                    : state.workState
            };
        }, "generationFailed");
        if (result.task.reservationId) {
            await (0, optimizeQuota_1.releaseOptimizationReservation)(result.task.reservationId);
        }
        if (autoNavigateOnFailure) {
            (0, navigation_1.replace)(PAGE_ROUTES.works.exception, {
                scene: "generation",
                taskId,
                workId: result.task.workId
            });
        }
        return result.task;
    }
    if (
        result.task.status === "success" &&
        result.task.resultSaveStatus === "success" &&
        result.completedVersion
    ) {
        const currentWork = createStore_1.store.getState().workState.workMap[result.task.workId];
        const localAlreadyHasVersion = currentWork && Array.isArray(currentWork.versionIds)
            ? currentWork.versionIds.includes(result.completedVersion.versionId)
            : false;
        const nextWork = resolveCompletedWorkFromGenerationResult(result, currentWork);
        if (!nextWork) {
            markGenerationQueryFailure(taskId, "生成结果已返回，但作品信息暂时未同步，请稍后重试");
            if (autoNavigateOnFailure) {
                (0, navigation_1.replace)(PAGE_ROUTES.works.exception, {
                    scene: "generation",
                    taskId,
                    workId: result.task.workId
                });
            }
            return result.task;
        }
        if (localAlreadyHasVersion && Array.isArray(nextWork.versionIds) && nextWork.versionIds.indexOf(result.completedVersion.versionId) === -1) {
            nextWork.versionIds = [...nextWork.versionIds, result.completedVersion.versionId];
        }
        upsertWork(nextWork, result.completedVersion);
        let saveStatus = "success";
        if (result.cloudFinalized === true && result.work) {
            markCloudFinalizedLocally(nextWork.workId, result.completedVersion.versionId);
        }
        else {
            const saveResult = await (0, workSyncFlow_1.saveCurrentWorkToCloud)(nextWork, result.completedVersion, {
                taskId
            });
            saveStatus = saveResult && saveResult.ok === true ? "success" : "failed";
        }
        if (result.task.reservationId) {
            const commitResult = await (0, optimizeQuota_1.commitOptimizationReservation)(result.task.reservationId, taskId);
            if (!commitResult || commitResult.ok !== true) {
                saveStatus = saveStatus === "failed" ? saveStatus : "quota_pending";
                (0, toast_1.showToast)("作品已生成，优化次数正在确认，请稍后刷新");
                await (0, optimizeQuota_1.syncOptimizeQuota)({ silent: true });
            }
        }
        initUploadFlow("initial");
        (0, navigation_1.replace)(PAGE_ROUTES.works.result, {
            workId: nextWork.workId,
            versionId: result.completedVersion.versionId,
            saveStatus,
            quotaStatus: saveStatus === "quota_pending" ? "pending" : ""
        });
    }
    return result.task;
}
