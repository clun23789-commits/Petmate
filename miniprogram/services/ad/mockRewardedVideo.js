"use strict";

const legacyAd = require("../mock/ad");

const MOCK_AD_MESSAGES = {
  completed: "广告试看完成，已为当前创作链路解锁本次试用与 3 次优化机会。",
  skipped: "需要完整观看广告后才能继续",
  unavailable: "广告暂时不可用，请稍后再试",
  error: "广告加载失败，请稍后重试",
  rightUnknown: "广告已结束，但试用权益状态还没有确认下来。"
};

function normalizeScenario(scenario) {
  if (scenario === "success") {
    return "completed";
  }

  if (scenario === "failed") {
    return "skipped";
  }

  if (scenario === "completed" || scenario === "skipped" || scenario === "unavailable" || scenario === "error" || scenario === "rightUnknown") {
    return scenario;
  }

  return "completed";
}

async function showMockRewardedVideoAd(options = {}) {
  const rewardScene = options.rewardScene || "initial_unlock";
  const scenario = normalizeScenario(options.adScenario || options.scenario);
  const source = options.source || rewardScene;
  const legacyScenario = scenario === "completed" ? "success" : scenario === "rightUnknown" ? "rightUnknown" : "failed";
  const legacyResult = await legacyAd.watchRewardedAd(source, legacyScenario);

  if (scenario === "completed") {
    return {
      ok: true,
      status: "completed",
      rewardScene,
      message: legacyResult.message || MOCK_AD_MESSAGES.completed,
      raw: {
        mock: true,
        scenario,
        legacyResult
      },
      source: "mock"
    };
  }

  return {
    ok: false,
    status: scenario,
    rewardScene,
    message: MOCK_AD_MESSAGES[scenario] || legacyResult.message || MOCK_AD_MESSAGES.error,
    raw: {
      mock: true,
      scenario,
      legacyResult
    },
    source: "mock"
  };
}

module.exports = {
  showMockRewardedVideoAd
};
