# Petmate 云数据库索引人工核对清单

> 本清单是 `docs/cloud_database_indexes.md` 的人工执行入口，不维护索引字段明细。索引名称、字段顺序、排序方向和状态以 `docs/cloud_database_indexes.md` 为唯一事实源。

## 使用说明

- 本清单用于换环境、上线前、云环境重建后的人工核对。
- Codex 不能替代人工在微信云开发控制台创建索引。
- 核对前先确认 `miniprogram/config/env.generated.js` 的 `SELECTED_APP_ENV`，避免在错误云环境里创建索引。
- staging / production 如果使用不同云环境，必须分别人工核对索引；不能把 development 的检查结果直接视为 production 通过。
- 所有业务索引均按 `cloud_database_indexes.md` 中记录的“非唯一”要求创建，不要误建为唯一索引。

## 核对步骤

- [ ] 打开微信云开发控制台，确认当前云环境 ID 与小程序 `ENV_CONFIG.cloudEnvId` 一致。
- [ ] 对照 `docs/cloud_database_indexes.md` 第 16 节“当前索引汇总”，逐项核对集合、索引名称、字段顺序、排序方向和非唯一属性。
- [ ] 对照 `docs/cloud_database_indexes.md` 各集合“注意事项”，确认 `openid` 与 `ownerOpenid` 没有混用。
- [ ] 确认默认索引 `_id_` 与 `_openid_1` 存在且未被删除。
- [ ] 如新建或修正索引，在 `docs/cloud_database_indexes.md` 中更新对应云环境、日期和状态。

## 集合核对入口

- [ ] `works`
- [ ] `workVersions`
- [ ] `shares`
- [ ] `uploadAssets`
- [ ] `generationTasks`
- [ ] `optimizeQuotas`
- [ ] `optimizeQuotaGrants`
- [ ] `optimizeReservations`
- [ ] `users`
- [ ] `orders`
- [ ] `arEntitlements`
- [ ] `adRewardGrants`

## 归属字段快速检查

- [ ] `users`、`orders`、`optimize*`、`adRewardGrants` 使用 `openid`。
- [ ] `works`、`workVersions`、`uploadAssets`、`shares`、`generationTasks` 使用 `ownerOpenid`。
- [ ] `arEntitlements` 同时保存 `openid` 与 `ownerOpenid`，索引定义按 `cloud_database_indexes.md` 执行。
