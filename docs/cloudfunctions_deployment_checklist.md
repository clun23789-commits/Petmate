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
| 3 | `saveWork` | 作品恢复 | `generationTasks`, `works`, `workVersions` | 只接收任务/作品/版本引用，从任务白名单事务恢复，不能复活 deleted 作品 |
| 4 | `listWorks` | 作品 | `works`, `workVersions` | 能按当前用户读取作品列表 |
| 5 | `getWork` | 作品 | `works`, `workVersions` | 只能读取当前用户作品 |
| 6 | `deleteWork` | 作品 | `works`, `arEntitlements`, `shares` | 软删除作品并撤销或失效关联记录 |
| 7 | `createUploadAsset` | 上传 | `uploadAssets`, `works` | 上传记录归属当前用户 |
| 8 | `startGenerationTask` | 生成 | `generationTasks`, `works`, `uploadAssets`, `optimizeReservations` | 使用 `clientRequestId` 确定性创建任务；优化任务与 reservation 原子绑定 |
| 9 | `pollGenerationTask` | 生成 | `generationTasks`, `uploadAssets`, `works`, `workVersions` | 处理锁保护阶段推进；原子写入作品、版本和任务终态 |
| 10 | `createAdRewardSession` | 广告权益 | `adRewardGrants`, `works` | 广告展示前创建 10 分钟 pending 会话并绑定场景/作品 |
| 11 | `grantAdReward` | 广告权益/优化次数 | `adRewardGrants`, `optimizeQuotaGrants`, `optimizeQuotas`, `works` | 单事务结算并固定增加 3 次 |
| 12 | `getAdRewardStatus` | 广告权益 | `adRewardGrants`, `optimizeQuotaGrants`, `optimizeQuotas` | 只在完整结算后返回 granted 与 quota |
| 13 | `grantOptimizeQuota` | 旧版兼容查询 | `adRewardGrants`, `optimizeQuotaGrants`, `optimizeQuotas` | 只读返回已结算记录，不能增加次数 |
| 14 | `getOptimizeQuota` | 优化次数 | `optimizeQuotas` | 返回 availableCount/remainingCount |
| 15 | `reserveOptimizeQuota` | 优化次数 | `optimizeQuotas`, `optimizeReservations`, `works` | 可用次数足够才预占 |
| 16 | `releaseOptimizeQuota` | 优化次数 | `optimizeQuotas`, `optimizeReservations`, `generationTasks` | 仅未绑定或明确失败任务可释放 |
| 17 | `commitOptimizeQuota` | 优化次数 | `optimizeQuotas`, `optimizeReservations`, `generationTasks` | 成功且结果已保存后事务扣减 |
| 18 | `cleanupExpiredOptimizeReservations` | 优化次数运维 | `optimizeQuotas`, `optimizeReservations`, `generationTasks` | 定时恢复 `expiresAt` 过期预占 |
| 19 | `createPaymentOrder` | 支付订单 | `orders`, `works`, `arEntitlements` | 非 production 只创建明确 Mock 订单，production 在真实支付未接入时拒绝 |
| 20 | `getPaymentOrder` | 支付订单 | `orders` | 只能查当前用户订单 |
| 21 | `markPaymentPaid` | 支付订单 | `orders`, `works` | 仅可信 Mock 订单可进入 paid/pending_sync，production 禁止 |
| 22 | `grantArEntitlement` | AR 权益 | `arEntitlements`, `orders`, `works` | 支付来源可信才发权益，权益与订单在同一事务更新 |
| 23 | `getArEntitlement` | AR 权益 | `arEntitlements`, `works` | deleted 作品不返回可用权益 |
| 24 | `createShare` | 分享 | `shares`, `works`, `workVersions` | 只允许 ready/retouched 作品分享 |
| 25 | `getShare` | 分享 | `shares`, `works` | 过期或删除作品不可预览 |
| 26 | `expireSharesForWork` | 分享 | `shares` | 删除作品后失效 active 分享 |

## 建议部署顺序

- [ ] 先运行 `npm run env:development` 或 `npm run env:staging`，确认部署目标环境。
- [ ] 先确认云环境 ID 与 `ENV_CONFIG.cloudEnvId` 一致。
- [ ] 如切换了 staging/prod 云环境，重新核对集合、索引和云函数部署状态，不要沿用另一个环境的人工检查结论。
- [ ] 确认 `users`、`works`、`workVersions`、`uploadAssets`、`generationTasks`、`adRewardGrants`、`optimizeQuotas`、`optimizeQuotaGrants`、`optimizeReservations`、`orders`、`arEntitlements`、`shares` 集合存在。
- [ ] 按用户/作品基础函数部署：`syncUser`、`updateUserProfile`、`saveWork`、`listWorks`、`getWork`、`deleteWork`。
- [ ] 部署上传/生成函数：`createUploadAsset`、`startGenerationTask`、`pollGenerationTask`。
- [ ] 严格按顺序部署广告结算函数：`createAdRewardSession`、`grantAdReward`、`getAdRewardStatus`、`grantOptimizeQuota`。
- [ ] 部署优化次数函数：`getOptimizeQuota`、`reserveOptimizeQuota`、`releaseOptimizeQuota`、`commitOptimizeQuota`、`cleanupExpiredOptimizeReservations`。
- [ ] 部署支付/权益函数：`createPaymentOrder`、`getPaymentOrder`、`markPaymentPaid`、`grantArEntitlement`、`getArEntitlement`。
- [ ] 在 `createPaymentOrder`、`markPaymentPaid`、`grantArEntitlement` 分别配置服务端 `PETMATE_APP_ENV`；development/staging/production 必须与目标云环境一致，缺失时支付会默认拒绝。
- [ ] staging 同批部署三个支付核心函数后再验证 Mock 订单；不得只部署客户端或其中一个函数，避免新旧协议混用。
- [ ] production 当前不得开放支付入口：Mock 会被拒绝，真实微信支付下单和 `wechat_server_notification` 尚未实现。
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

## P0 支付安全隔离部署提醒

- [ ] 部署前运行 `npm run test:payment-security`、`npm run check:production-readiness` 和 `npm run check`。
- [ ] `check:production-readiness` 当前应因真实微信支付未实现而非零退出；这是预期发布阻塞，不能通过改回 Mock 绕过。
- [ ] staging 新订单核对 `paymentProvider=mock`、`paymentMode=mock`、`paymentConfirmationSource=""`。
- [ ] staging Mock 确认后核对 `paymentConfirmationSource=trusted_mock_flow`、`providerTransactionId=""`、`providerConfirmedAt` 为服务端时间。
- [ ] 重复调用 `markPaymentPaid` 返回同一 paid 订单；旧 paid 订单若缺少可信来源必须被拒绝。
- [ ] 重复和并发调用 `grantArEntitlement` 只保留一个 active 权益，并且订单同步为 `entitlementStatus=active`。
- [ ] production 以 Mock 参数调用三个支付函数均应被拒绝；不要配置或提交商户密钥、证书或任何 Secret。

## 基础作品生成部署提醒

- [ ] 部署 `pollGenerationTask` 时必须包含 `lib/phase.js`，并确认废弃生成服务目录未被重新打包。
- [ ] 部署后用同一个成功 `taskId` 重复轮询，确认云函数幂等写入 `works / workVersions`，`cloudFinalized = true`，且不会重复创建版本或重复追加同一个 `versionId`。
- [ ] 使用同一 `clientRequestId` 重复和并发调用 `startGenerationTask`，确认只创建一个任务并返回 `duplicated = true`。
- [ ] 并发轮询同一任务，确认只有一个请求获得处理锁；构造过期锁后可恢复，旧 token/revision 无法覆盖新状态。
- [ ] 在测试环境分别注入版本、作品写入失败，确认 `works / workVersions / generationTasks` 最终成功状态整体回滚。
- [ ] 部署新版小程序后验证 `petmate.generationRequests.v1` 只保存请求引用，任务成功或明确失败后会清理。
- [ ] `startGenerationTask` 与 `pollGenerationTask` 需要同批部署，避免前端收到缺少 `providerStatus / resultSaveStatus` 的旧任务协议。

## P0 作品恢复服务端权威化部署提醒

- [ ] `saveWork` 部署包必须包含 `core.js`，并与新版小程序同批发布；旧版完整 `work / version` 请求会被明确拒绝。
- [ ] 部署前运行 `npm run test:save-work`、`npm run check:save-work` 和 `npm run check`。
- [ ] 用保存失败但结果完整的测试任务调用 `saveWork`，确认只传 `taskId / workId / versionId`，事务恢复后再由 `getWork` 返回权威作品。
- [ ] 验证 `petmate.pendingCloudSave.v2` 只保存引用；v1 有效引用可迁移，缺少 `taskId` 的 v1 会删除并提示刷新。
- [ ] 验证旧协议、跨用户任务、错误引用、未完成任务、无效结果和 deleted 作品均被拒绝且不产生数据库写入。
- [ ] 结构化反馈和细节补色在独立服务端命令接口完成前仅保留本地，不要把 `saveWork` 恢复为通用写接口。

## P0-01 优化预占事务化部署提醒

- [ ] 部署前备份 `optimizeQuotas`、`optimizeReservations`、`generationTasks`。
- [ ] 人工审查历史 `status = reserved` 记录；缺少 `expiresAt` 的记录不能直接批量清零。根据 task 状态逐条 commit、release 或标记超时。
- [ ] 在 development 与 staging 手动创建 `optimizeReservations.idx_status_expires`：`status` 升序、`expiresAt` 升序。仓库只记录索引要求，不代表云端已经创建。
- [ ] 同批部署 `reserveOptimizeQuota`、`startGenerationTask`、`commitOptimizeQuota`、`releaseOptimizeQuota` 与 `cleanupExpiredOptimizeReservations`，避免新旧事务协议混用。
- [ ] 为 `cleanupExpiredOptimizeReservations` 配置定时触发器：每 10 分钟执行一次，每批最多 100 条；该函数不在小程序 service 层暴露普通调用入口。
- [ ] 验证 reservation 新字段：`expiresAt` 为服务端时间、`boundAt` 在任务绑定时写入、`releaseReason` 仅由服务端写入。
- [ ] 对测试用户核对 `optimizeQuotas.reservedCount` 等于同 openid 下 `optimizeReservations.status = reserved` 的记录数。

## P0-02 广告奖励事务结算部署提醒

- [ ] 部署前备份 `adRewardGrants`、`optimizeQuotaGrants`、`optimizeQuotas`；历史记录只保留审计，不批量改状态、不自动补发。
- [ ] 先运行 `npm run test:optimize-quota`、`npm run test:ad-reward`、`npm run check:ad-reward-settlement` 与 `npm run check`。
- [ ] 确认 `adRewardGrants`、`optimizeQuotaGrants`、`optimizeQuotas`、`works` 四个集合存在。
- [ ] 按 `createAdRewardSession -> grantAdReward -> getAdRewardStatus -> grantOptimizeQuota` 顺序同批部署，随后再上传新版小程序。
- [ ] 在 development / staging 手动创建 `adRewardGrants.idx_openid_scene_created` 与 `adRewardGrants.idx_openid_status_expires`；核心事务使用确定性 `_id`，不依赖这两个索引才能正确运行。
- [ ] 验证无会话结算被拒绝、同一会话重复/并发结算只增加 3 次、任意事务写失败全部回滚、异常页重复查询不增加次数。
- [ ] 验证直接调用 `grantOptimizeQuota` 只返回既有结算，`optimizeQuotas.grantedCount` 不变化。
- [ ] 真实广告位 ID 继续保持为空；本阶段不启用 production，不写入 AppSecret 或其他敏感配置。
- [ ] 微信客户端 `isEnded` 仍只是 `client_reported` 完成证据，不能对外称为服务端验证；详见 `docs/ad_reward_security_boundary.md`。

## cleanupExpiredOptimizeReservations 安全部署

`docs/cloud_function_security_rules.example.json` 仅是人工配置参考，不会自动部署到 CloudBase。函数代码部署不会自动完成安全规则配置。部署人员必须把专用函数条目合并到环境当前完整规则，保留并核对现有 `*` 通配规则，不得用示例文件覆盖控制台中的其他函数权限。

需要人工合并的参考结构：

```json
{
  "*": {
    "invoke": "auth != null"
  },
  "cleanupExpiredOptimizeReservations": {
    "invoke": false
  }
}
```

其中 `*` 的内容必须以目标环境当前真实配置为准；具体函数名配置优先于通配配置。

- [ ] 部署更新后的 `cleanupExpiredOptimizeReservations` 云函数代码。
- [ ] 部署或更新每 10 分钟执行一次的定时触发器。
- [ ] 打开 CloudBase 控制台，进入“云函数 → 权限控制”。
- [ ] 将 `"cleanupExpiredOptimizeReservations": { "invoke": false }` 合并到环境现有完整安全规则并保存。
- [ ] 从开发版小程序调用该函数，确认客户端权限层拒绝、数据库查询次数不增加且数据无变化。
- [ ] 从定时触发器或受信任管理端执行，确认清理仍可正常扫描、释放或提交。
- [ ] 确认成功响应只含 `scanned / released / committed / timedOut / skipped / failed` 汇总数字。
- [ ] 确认服务端日志只含哈希引用，不含原始 `openid / reservationId / taskId / workId`。
- [ ] development 验证完成后，在 staging 环境重复合并规则、部署触发器和执行验证。
- [ ] production 环境建立后重复相同步骤；未实际完成前不得标记为已配置。
