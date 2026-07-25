"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchRewardedAd = watchRewardedAd;
const AD_MESSAGE_MAP = {
    success: "广告试看完成，已为当前创作链路解锁本次试用与 3 次优化机会。",
    failed: "广告播放未完成，本次试用还没有解锁成功。",
    rightUnknown: "广告已结束，但试用权益状态还没有确认下来。"
};
async function watchRewardedAd(source, scenario = "success") {
    return Promise.resolve({
        success: scenario === "success",
        source,
        status: scenario,
        message: AD_MESSAGE_MAP[scenario]
    });
}
