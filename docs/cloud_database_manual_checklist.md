# Petmate 云数据库索引人工核对清单

> 本清单用于处理自动检查发现的问题，不维护索引字段明细。索引名称、字段顺序、排序方向、unique 和必需状态以 `config/cloud-database-indexes.json` 为唯一事实源。

## 使用说明

- 本清单用于换环境、上线前、云环境重建后或自动检查失败后的人工修正。
- 自动脚本只读；Codex 不能替代人工在微信云开发控制台创建、修改或删除索引。
- 操作前同时核对 `PETMATE_CLOUD_ENV_ID`、`PETMATE_APP_ENV` 和控制台环境，避免修正错误环境。
- development / staging / production 必须分别运行真实检查，不能复用另一个环境的结论。
- 所有索引按机器 JSON 中的 `unique` 和有序 `keys` 创建，不要仅凭字段集合判断。

## 核对步骤

- [ ] 使用只读 CAM 子账号设置 `TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY / PETMATE_CLOUD_ENV_ID`。
- [ ] 运行 `npm run check:cloud-indexes`，保存缺失、错误和告警清单；不要保存或转发 Secret。
- [ ] 打开 CloudBase 控制台，确认当前环境 ID 与命令输出完全一致。
- [ ] 对照 `config/cloud-database-indexes.json` 逐项修正集合、索引名称、字段顺序、排序方向和 unique。
- [ ] 确认默认索引 `_id_` 与 `_openid_1` 存在且属性正确。
- [ ] 修正完成后重新运行 `npm run check:cloud-indexes`；必要索引必须全部通过，多余索引需人工判断是否保留。
- [ ] 不在本流程中修改 JSON 来迁就错误的远端状态；确需变更产品索引要求时单独评审机器事实源。

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
- [ ] `arEntitlements` 同时保存 `openid` 与 `ownerOpenid`，索引定义按机器 JSON 执行。
