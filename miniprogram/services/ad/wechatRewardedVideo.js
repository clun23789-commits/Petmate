"use strict";

function buildResult(ok, status, rewardScene, message, raw) {
  return {
    ok,
    status,
    rewardScene,
    message,
    raw: raw || {},
    source: "wechat"
  };
}

function isUnavailableError(error) {
  const code = error && (error.errCode || error.errno);
  return code === 1004 || code === 1005 || code === 1006 || code === 1007 || code === 1008;
}

function showWechatRewardedVideoAd(options = {}) {
  const adUnitId = options.adUnitId || "";
  const rewardScene = options.rewardScene || "initial_unlock";
  const rewardTimeoutMs = Number(options.rewardTimeoutMs || options.timeoutMs) || 15000;

  return new Promise((resolve) => {
    if (typeof wx === "undefined" || typeof wx.createRewardedVideoAd !== "function" || !adUnitId) {
      resolve(buildResult(false, "unavailable", rewardScene, "广告暂时不可用，请稍后再试"));
      return;
    }

    let ad = null;
    let timeoutId = null;

    try {
      ad = wx.createRewardedVideoAd({ adUnitId });
    } catch (error) {
      resolve(buildResult(false, "error", rewardScene, "广告加载失败，请稍后重试", error));
      return;
    }

    let settled = false;

    const clearRewardTimeout = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const cleanup = () => {
      clearRewardTimeout();

      if (ad && typeof ad.offClose === "function") {
        ad.offClose(onClose);
      }

      if (ad && typeof ad.offError === "function") {
        ad.offError(onError);
      }
    };

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    };

    const onClose = (res) => {
      if (res && res.isEnded === true) {
        finish(buildResult(true, "completed", rewardScene, "广告试看完成，正在确认试用权益。", res));
        return;
      }

      finish(buildResult(false, "skipped", rewardScene, "需要完整观看广告后才能继续", res));
    };

    const onError = (error) => {
      if (isUnavailableError(error)) {
        finish(buildResult(false, "unavailable", rewardScene, "广告暂时不可用，请稍后再试", error));
        return;
      }

      finish(buildResult(false, "error", rewardScene, "广告加载失败，请稍后重试", error));
    };

    if (typeof ad.onClose === "function") {
      ad.onClose(onClose);
    }

    if (typeof ad.onError === "function") {
      ad.onError(onError);
    }

    timeoutId = setTimeout(() => {
      finish(buildResult(false, "error", rewardScene, "广告加载超时，请稍后重试", { timeoutMs: rewardTimeoutMs }));
    }, rewardTimeoutMs);

    const showAd = () => {
      try {
        return Promise.resolve(ad.show());
      } catch (error) {
        return Promise.reject(error);
      }
    };

    showAd().then(clearRewardTimeout).catch(() => {
      if (!ad || typeof ad.load !== "function") {
        onError(new Error("广告加载能力不可用"));
        return;
      }

      Promise.resolve(ad.load())
        .then(() => showAd())
        .then(clearRewardTimeout)
        .catch(onError);
    });
  });
}

module.exports = {
  showWechatRewardedVideoAd
};
