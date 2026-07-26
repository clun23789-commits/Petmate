# Petmate 广告奖励安全边界

## 当前结算模型

P0-02 将广告奖励改为服务端会话和事务结算：

```text
createAdRewardSession
  -> 客户端展示激励视频
  -> 客户端 onClose/isEnded === true
  -> grantAdReward 单事务写入广告记录、次数流水和次数汇总
  -> getAdRewardStatus 只读查询完整结算结果
```

会话绑定当前微信用户、奖励场景、来源和作品，十分钟后过期。`optimize_quota` 必须绑定当前用户未删除的作品。每个会话最多结算一次，每次固定增加 3 次优化机会；请求中的 `count / workId / source / adGrantId` 不能覆盖会话数据。

## 能力边界

- 微信客户端的 `isEnded` 关闭回调不是密码学证明，也不是微信服务端广告回调。
- 数据中的 `completionEvidence.trustLevel = client_reported` 仅表示客户端报告完成。
- `verificationStatus = client_confirmed` 不等于 `server_verified`，不得对外宣传为服务端验证。
- 当前安全收益来自短期服务端会话、用户/场景/作品绑定、确定性幂等 ID 和跨三个集合的原子事务。
- `getAdRewardStatus` 不补发奖励；旧 `grantOptimizeQuota` 只读，不能增加次数。
- 不保存完整客户端广告原始对象，只保存白名单化完成证据。

## 当前未启用能力

- production 尚未启用真实激励广告。
- 仓库中的真实广告位 ID 继续保持为空。
- 尚不存在平台签名票据或服务端回调级验证。

如果微信后续提供可验证的签名票据或服务端广告完成回调，应替换完成证据模块，同时保留现有会话、幂等和事务边界。

## 密钥与日志

- AppSecret、广告平台密钥和其他敏感配置不得保存在小程序前端、仓库、文档或日志中。
- 日志不得输出完整 OPENID、用户照片地址或完整客户端广告对象。
- 用户和业务 ID 只记录哈希或截断引用。
