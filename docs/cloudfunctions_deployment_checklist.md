# Petmate 云函数部署施工清单

## 基本说明

- 微信开发者工具运行目录固定为 `miniprogram/`。
- 云函数目录为项目根目录下的 `cloudfunctions/`。
- 云环境 ID 当前来自 `ENV_CONFIG.cloudEnvId`，由 `miniprogram/config/env.profiles.js` 与 `miniprogram/config/env.generated.js` 组合生成。
- 部署前先确认当前环境：查看 `miniprogram/config/env.generated.js` 的 `SELECTED_APP_ENV`。
- staging 可暂时复用 MVP 云环境；production 上线前应使用独立生产云环境，且不能继续使用 placeholder、demo 或 test 类 ID。
- Codex 只能维护代码和文档，不能替代人工在微信云开发控制台创建集合、索引或部署云函数。
- 不要在本文档、代码仓库或提交记录中写入密钥、商户号私钥、支付证书、真实广告位 ID、AI API key 等敏感信息。
- 第一批仍不接入真实 AI、真实广告、真实微信支付、真实 AR；云函数用于打通 MVP 云端雏形和后续接入边界。

## 云函数清单

| 顺序 | 云函数 | 业务域 | 依赖集合 | 验收点 |
|---:|---|---|---|---|
| 1 | `syncUser` | 用户 | `users` | 启动小程序后能写入或返回当前用户 openid |
| 2 | `updateUserProfile` | 用户 | `users` | 基于当前 openid 更新昵称与头像展示字段 |
| 3 | `saveWork` | 作品 | `works`, `workVersions` | 能保存作品和版本，不能复活 deleted 作品 |
| 4 | `listWorks` | 作品 | `works`, `workVersions` | 能按当前用户读取作品列表 |
| 5 | `getWork` | 作品 | `works`, `workVersions` | 只能读取当前用户作品 |
| 6 | `deleteWork` | 作品 | `works`, `arEntitlements`, `shares` | 软删除作品并撤销或失效关联记录 |
| 7 | `createUploadAsset` | 上传 | `uploadAssets`, `works` | 上传记录归属当前用户 |
| 8 | `startGenerationTask` | 生成 | `generationTasks`, `works` | 创建基础作品生成任务，provider 固定为 `basic_generation` |
| 9 | `pollGenerationTask` | 生成 | `generationTasks`, `works`, `workVersions` | 轮询当前用户任务；provider 成功后幂等写入作品和版本 |
| 10 | `grantAdReward` | 广告权益 | `adRewardGrants`, `works` | 完整广告才发放权益 |
| 11 | `getAdRewardStatus` | 广告权益 | `adRewardGrants` | 可查询发放状态 |
| 12 | `getOptimizeQuota` | 优化次数 | `optimizeQuotas` | 返回 availableCount/remainingCount |
| 13 | `grantOptimizeQuota` | 优化次数 | `optimizeQuotas`, `optimizeQuotaGrants`, `works` | 幂等发放 3 次 |
| 14 | `reserveOptimizeQuota` | 优化次数 | `optimizeQuotas`, `optimizeReservations`, `works` | 可用次数足够才预占 |
| 15 | `releaseOptimizeQuota` | 优化次数 | `optimizeQuotas`, `optimizeReservations` | 失败或中断可释放 |
| 16 | `commitOptimizeQuota` | 优化次数 | `optimizeQuotas`, `optimizeReservations` | 成功生成后正式扣减 |
| 17 | `createPaymentOrder` | 支付订单 | `orders`, `works`, `arEntitlements` | 已有权益不重复下单 |
| 18 | `getPaymentOrder` | 支付订单 | `orders` | 只能查当前用户订单 |
| 19 | `markPaymentPaid` | 支付订单 | `orders`, `arEntitlements`, `works` | mock 支付确认后进入 paid/pending_sync |
| 20 | `grantArEntitlement` | AR 权益 | `arEntitlements`, `orders`, `works` | paid 订单才发权益 |
| 21 | `getArEntitlement` | AR 权益 | `arEntitlements`, `works` | deleted 作品不返回可用权益 |
| 22 | `createShare` | 分享 | `shares`, `works`, `workVersions` | 只允许 ready/retouched 作品分享 |
| 23 | `getShare` | 分享 | `shares`, `works` | 过期或删除作品不可预览 |
| 24 | `expireSharesForWork` | 分享 | `shares` | 删除作品后失效 active 分享 |

## 建议部署顺序

- [ ] 先运行 `npm run env:development` 或 `npm run env:staging`，确认部署目标环境。
- [ ] 先确认云环境 ID 与 `ENV_CONFIG.cloudEnvId` 一致。
- [ ] 如切换了 staging/prod 云环境，重新核对集合、索引和云函数部署状态，不要沿用另一个环境的人工检查结论。
- [ ] 确认 `users`、`works`、`workVersions`、`uploadAssets`、`generationTasks`、`adRewardGrants`、`optimizeQuotas`、`optimizeQuotaGrants`、`optimizeReservations`、`orders`、`arEntitlements`、`shares` 集合存在。
- [ ] 按用户/作品基础函数部署：`syncUser`、`updateUserProfile`、`saveWork`、`listWorks`、`getWork`、`deleteWork`。
- [ ] 部署上传/生成函数：`createUploadAsset`、`startGenerationTask`、`pollGenerationTask`。
- [ ] 部署广告/优化次数函数：`grantAdReward`、`getAdRewardStatus`、`getOptimizeQuota`、`grantOptimizeQuota`、`reserveOptimizeQuota`、`releaseOptimizeQuota`、`commitOptimizeQuota`。
- [ ] 部署支付/权益函数：`createPaymentOrder`、`getPaymentOrder`、`markPaymentPaid`、`grantArEntitlement`、`getArEntitlement`。
- [ ] 部署分享函数：`createShare`、`getShare`、`expireSharesForWork`。
- [ ] 使用微信开发者工具逐个上传并部署，部署方式选择云端安装依赖。
- [ ] 对照 `docs/cloud_database_manual_checklist.md` 人工核对索引。
- [ ] 运行小程序并对照 `docs/smoke_test_checklist.md` 做主链路 smoke test。

## 常见错误

- 云环境 ID 与 `ENV_CONFIG.cloudEnvId` 不一致，导致前端调用到另一个环境。
- `env.generated.js` 仍停留在上一次切换的环境，导致手工部署和本地运行目标不一致。
- staging/prod 使用不同云环境后，忘记在新环境重新创建集合或索引。
- 云函数目录存在但未上传，或上传时未选择云端安装依赖。
- 数据库集合缺失，云函数首次写入或查询失败。
- 索引未创建，导致查询慢、失败，或换环境后表现不一致。
- 云函数返回格式不符合 `{ ok, data, message }` 或 `{ ok, data }`。
- 用户归属字段混用：`users`、`orders`、`optimize*`、`adRewardGrants` 使用 `openid`；`works`、`workVersions`、`uploadAssets`、`shares`、`generationTasks` 使用 `ownerOpenid`。
- 本地默认 development 允许 fallback，但 production 配置不得依赖静默 mock 或 local fallback。
## 基础作品生成部署提醒

- [ ] 部署 `pollGenerationTask` 时必须包含 `lib/phase.js`，并确认废弃生成服务目录未被重新打包。
- [ ] 部署后用同一个成功 `taskId` 重复轮询，确认云函数幂等写入 `works / workVersions`，`cloudFinalized = true`，且不会重复创建版本或重复追加同一个 `versionId`。
- [ ] `startGenerationTask` 与 `pollGenerationTask` 需要同批部署，避免前端收到缺少 `providerStatus / resultSaveStatus` 的旧任务协议。
