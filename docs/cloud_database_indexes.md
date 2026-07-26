# Petmate 云数据库索引记录

## 1. 文档目的

本文件用于记录 Petmate 小程序当前微信云开发数据库中已经手动创建或待手动创建的索引。

注意：

- 索引是在微信开发者工具 / 微信云开发控制台中手动创建的。
- 本文件只做记录，不会自动创建索引。
- 更换云环境、重建数据库、上线前检查时，需要对照本文件重新确认索引是否存在。
- 核对前先查看 `miniprogram/config/env.generated.js` 的 `SELECTED_APP_ENV`，确认正在操作的云环境。
- staging/prod 使用不同云环境时，需要分别维护和核对索引状态，不能沿用 development 的人工结论。
- Codex 只能维护本文件，不能替代人工在微信云开发后台创建索引。

---

## 2. 当前适用云环境

| 项目 | 内容 |
|---|---|
| 云环境 ID | `clun23789-2gawcmo5fbb15495` |
| 创建状态 | 已有索引已手动创建|
| 创建日期 | 2026-05-15 |
| 适用阶段 | 第三批：云端作品保存 / 读取闭环；第四批：支付订单与 AR 权益安全边界；第五批：广告权益云端确认链路；第六批：AI 生成任务云端适配层；第七批：优化次数云端配额闭环；第八批：分享链路真数据闭环；P0-02：广告会话与次数事务结算 |

说明：当前记录适用于现有 MVP 云环境。第 0 阶段新增 `development / staging / production` 环境切换后，production 上线前必须在目标生产云环境中重新核对本文件所有索引。

---

## 3. works 集合索引

`works` 集合用于保存作品主记录。

主要用途包括：

- 保存生成后的作品主信息
- 读取作品列表
- 读取作品详情
- 删除作品时修改作品状态
- 为分享、支付、AR 等后续功能提供稳定的作品 ID

| 索引名称 | 索引属性 | 字段顺序 | 用途 | 状态 |
|---|---|---|---|---|
| `idx_owner_work` | 非唯一 | `ownerOpenid` 升序；`workId` 升序 | 按当前用户和作品 ID 查询单个作品，用于详情、保存、删除 | 已创建 |
| `idx_owner_status_updated` | 非唯一 | `ownerOpenid` 升序；`status` 升序；`updatedAt` 降序 | 按用户读取作品列表，并按更新时间从新到旧排序 | 已创建 |

### 注意事项

- `ownerOpenid` 字段名大小写必须完全一致。
- `updatedAt` 必须使用降序，因为作品列表需要新作品排在前面。
- 不要把 `ownerOpenid` 写成 `_openid`、`openid`、`owneropenid` 或 `owner_openid`。

---

## 4. workVersions 集合索引

`workVersions` 集合用于保存作品版本记录。

主要用途包括：

- 保存初次生成版本
- 保存细节补色后的新版本
- 保存后续优化生成版本
- 读取某个作品下面的所有版本
- 记录用户对版本的反馈信息

| 索引名称 | 索引属性 | 字段顺序 | 用途 | 状态 |
|---|---|---|---|---|
| `idx_owner_work_status_created` | 非唯一 | `ownerOpenid` 升序；`workId` 升序；`status` 升序；`createdAt` 升序 | 读取某个作品下面的所有版本 | 已创建 |
| `idx_owner_version` | 非唯一 | `ownerOpenid` 升序；`versionId` 升序 | 按版本 ID 查询版本，避免版本错乱 | 已创建 |

### 注意事项

- `createdAt` 使用升序，因为版本记录通常按创建顺序读取。
- `versionId` 是版本 ID，不是作品 ID。
- `workId` 用来表示这个版本属于哪个作品。

---

## 5. shares 集合索引

`shares` 集合用于保存分享记录。

主要用途包括：

- 生成分享链接或分享卡片时保存分享记录
- 好友打开分享页时查询分享内容
- 删除作品后让对应分享失效

| 索引名称 | 索引属性 | 字段顺序 | 用途 | 状态 |
|---|---|---|---|---|
| `idx_share_status` | 非唯一 | `shareId` 升序；`status` 升序 | 好友通过分享 ID 打开分享页时查询分享记录 | 已创建 |
| `idx_owner_work_status` | 非唯一 | `ownerOpenid` 升序；`workId` 升序；`status` 升序 | 删除作品后查找并失效相关分享 | 已创建 |
| `idx_owner_work_version_status` | 非唯一 | `ownerOpenid` 升序；`workId` 升序；`sourceVersionId` 升序；`status` 升序 | 创建分享时复用同一作品同一版本的 active 分享，避免重复创建 | 已创建 |

### 注意事项

- 删除作品后，相关分享记录应从 `active` 变为 `expired`。
- `shareId` 用于好友打开分享页。
- `ownerOpenid + workId + status` 用于查找某个作品当前还有效的分享记录。
- `ownerOpenid + workId + sourceVersionId + status` 用于复用同一作品同一版本的 active 分享记录，实际索引需要开发者在微信云开发控制台手动创建。

---

## 6. uploadAssets 集合索引

`uploadAssets` 集合用于保存用户上传素材记录。

主要用途包括：

- 记录用户上传过的宠物照片
- 记录照片对应的云存储 fileID
- 后续查询某个作品关联的上传素材

| 索引名称 | 索引属性 | 字段顺序 | 用途 | 状态 |
|---|---|---|---|---|
| `idx_owner_work_created` | 非唯一 | `ownerOpenid` 升序；`workId` 升序；`createdAt` 降序 | 查询用户某个作品相关的上传素材记录 | 已创建 |

### 注意事项

- `createdAt` 使用降序，方便后续优先读取最新上传素材。
- 如果后续上传素材先于作品正式保存，可能会出现临时 `workId`，需要注意和作品保存后的 `workId` 对齐。

---

## 7. generationTasks 集合索引

`generationTasks` 集合用于保存生成任务提交、基础生成状态、输入快照和结果保存状态。

主要用途包括：

- 创建当前用户的首次生成、优化生成或定向补图生成任务
- 按当前用户和任务 ID 查询单个生成任务
- 按当前用户、作品和任务状态恢复生成中任务或查看任务历史
- 保存基础生成任务状态、输入快照和结果保存状态，继续复用同一前端入口

| 索引名称 | 索引属性 | 字段顺序 | 用途 | 状态 |
|---|---|---|---|---|
| `idx_owner_task` | 非唯一 | `ownerOpenid` 升序；`taskId` 升序 | 当前用户查询单个生成任务 | 已创建 |
| `idx_owner_work_status_updated` | 非唯一 | `ownerOpenid` 升序；`workId` 升序；`status` 升序；`updatedAt` 降序 | 后续按作品查询生成任务历史或恢复生成中任务 | 已创建 |

### 注意事项

- `generationTasks` 集合使用字段 `ownerOpenid`，必须由云函数根据 `cloud.getWXContext()` 写入。
- `updatedAt` 使用降序，方便优先读取最新任务。
- 以上索引都是非唯一索引，不要创建为唯一索引。
- Codex 只能更新本文档，不能替代开发者在微信云开发后台创建索引。

---

## 8. optimizeQuotas 集合索引

`optimizeQuotas` 集合用于保存用户优化次数汇总。

主要用途包括：

- 小程序启动、结果页、权益页同步当前用户优化次数
- 广告发放成功后增加 `grantedCount`
- 优化预占、释放和确认扣减时更新 `reservedCount`、`usedCount`

| 索引名称 | 索引属性 | 字段顺序 | 用途 | 状态 |
|---|---|---|---|---|
| `idx_openid` | 非唯一 | `openid` 升序 | 按当前用户查询优化次数汇总 | 已创建 |

### 注意事项

- `optimizeQuotas` 集合使用字段 `openid`，不要写成 `ownerOpenid`。
- `grantedCount`、`usedCount`、`reservedCount` 必须由云函数维护。
- 以上索引是非唯一索引，不要创建为唯一索引。

---

## 9. optimizeQuotaGrants 集合索引

`optimizeQuotaGrants` 集合用于保存广告结算产生的优化次数发放流水。

主要用途包括：

- 按广告 grant 记录唯一的次数发放结果
- 查询已经由广告结算事务写入的流水与最新配额
- 保留 `initial_unlock` 与 `optimize_quota` 两类发放来源

| 索引名称 | 索引属性 | 字段顺序 | 用途 | 状态 |
|---|---|---|---|---|
| `idx_openid_idempotency` | 非唯一 | `openid` 升序；`idempotencyKey` 升序 | 防止同一次广告优化次数重复发放 | 已创建 |
| `idx_openid_scene_created` | 非唯一 | `openid` 升序；`rewardScene` 升序；`createdAt` 降序 | 后续查询用户广告补充次数历史 | 已创建 |

### 注意事项

- schemaVersion 2 的 `idempotencyKey` 格式为 `openid:adGrantId`；`_id` 同样根据这两个值确定性生成。
- 新流水只允许由 `grantAdReward` 事务创建；`grantOptimizeQuota` 是只读兼容查询。
- 当前阶段每条发放记录的 `count` 固定为 3，不能由前端决定。
- `quotaApplied` 用于标记该广告发放是否已经写入 `optimizeQuotas`。
- 以上索引都是非唯一索引，不要创建为唯一索引。

---

## 10. optimizeReservations 集合索引

`optimizeReservations` 集合用于保存优化次数预占、释放和确认扣减记录。

主要用途包括：

- 预占优化次数并关联当前作品
- 生成失败时释放预占
- 生成成功时根据 `reservationId` 确认扣减并关联 `taskId`
- 定时扫描 `status = reserved` 且 `expiresAt` 已过期的记录；任务绑定时间记录在 `boundAt`，释放原因记录在 `releaseReason`

| 索引名称 | 索引属性 | 字段顺序 | 用途 | 状态 |
|---|---|---|---|---|
| `idx_openid_reservation` | 非唯一 | `openid` 升序；`reservationId` 升序 | 按当前用户和预占 ID 查询单条预占记录 | 已创建 |
| `idx_openid_work_status_updated` | 非唯一 | `openid` 升序；`workId` 升序；`status` 升序；`updatedAt` 降序 | 按作品查询预占状态，用于异常恢复和排查 | 已创建 |
| `idx_status_expires` | 非唯一 | `status` 升序；`expiresAt` 升序 | `cleanupExpiredOptimizeReservations` 扫描过期预占 | 待在 development / staging 手动创建 |

### 注意事项

- `optimizeReservations` 集合使用字段 `openid`，不要写成 `ownerOpenid`。
- 只有 `status === "reserved"` 的记录可以影响释放或确认扣减。
- `idx_status_expires` 不由代码自动创建；创建前先备份并人工审查缺少 `expiresAt` 的历史 reserved 记录。
- 以上索引都是非唯一索引，不要创建为唯一索引。

---

## 11. users 集合索引

`users` 集合用于保存用户基础记录。

主要用途包括：

- 小程序启动时同步用户
- 根据 openid 查找当前用户
- 为作品、订单、权益等数据提供用户归属基础

| 索引名称 | 索引属性 | 字段顺序 | 用途 | 状态 |
|---|---|---|---|---|
| `idx_openid` | 非唯一 | `openid` 升序 | 小程序启动时按 openid 查找当前用户记录 | 已创建 |

### 注意事项

- `users` 集合使用字段 `openid`。
- 作品、版本、分享、上传素材等集合使用字段 `ownerOpenid`。
- 不要把 `users.openid` 和其他集合的 `ownerOpenid` 混淆。

---

## 12. orders 集合索引

`orders` 集合用于保存当前作品 AR 解锁订单。

主要用途包括：

- 创建当前作品 AR 解锁订单
- 查询当前用户某个订单
- 确认订单支付状态
- 发放 AR 权益前校验订单归属和支付状态
- 避免同一用户、同一作品、同一商品类型重复创建待支付订单

| 索引名称 | 索引属性 | 字段顺序 | 用途 | 状态 |
|---|---|---|---|---|
| `idx_openid_order` | 非唯一 | `openid` 升序；`orderId` 升序 | 按当前用户和订单 ID 查询订单，用于 `getPaymentOrder`、`markPaymentPaid`、`grantArEntitlement` 等云函数校验订单归属 | 已创建 |
| `idx_openid_work_product_status` | 非唯一 | `openid` 升序；`workId` 升序；`productType` 升序；`status` 升序 | 按当前用户、作品、商品类型和订单状态查询待支付订单，用于 `createPaymentOrder` 避免重复创建 pending 订单 | 已创建 |

### 注意事项

- `orders` 集合使用字段 `openid`，不要写成 `ownerOpenid`。
- `orderId`、`workId`、`productType`、`status` 字段名大小写必须完全一致。
- 以上索引都是非唯一索引，不要创建为唯一索引。

---

## 13. arEntitlements 集合索引

`arEntitlements` 集合用于保存当前作品 AR 解锁权益。

主要用途包括：

- 查询当前作品是否已有 active AR 权益
- 创建订单前避免已解锁作品重复下单
- 支付完成后发放 AR 权益
- 删除作品时撤销对应 active AR 权益

| 索引名称 | 索引属性 | 字段顺序 | 用途 | 状态 |
|---|---|---|---|---|
| `idx_openid_work_status` | 非唯一 | `openid` 升序；`workId` 升序；`status` 升序 | 按当前用户、作品和权益状态查询 AR 权益，用于 `createPaymentOrder`、`grantArEntitlement`、`getArEntitlement`、`deleteWork` 等云函数 | 已创建 |

### 注意事项

- `arEntitlements` 集合使用字段 `openid`，不要写成 `ownerOpenid`。
- `workId` 和 `status` 字段名大小写必须完全一致。
- 以上索引是非唯一索引，不要创建为唯一索引。

---

## 14. adRewardGrants 集合索引

`adRewardGrants` 集合用于保存激励广告展示前创建的短期会话及其结算状态。

主要用途包括：

- 通过确定性 `_id` 防止同一广告会话重复结算
- 异常恢复页查询 pending / granted / expired / rejected
- 后续真实广告接入时保留云端确认记录

| 索引名称 | 索引属性 | 字段顺序 | 用途 | 状态 |
|---|---|---|---|---|
| `idx_openid_idempotency` | 非唯一 | `openid` 升序；`idempotencyKey` 升序 | 防止同一次广告权益重复发放 | 已创建 |
| `idx_openid_client_scene` | 非唯一 | `openid` 升序；`clientRewardId` 升序；`rewardScene` 升序 | 异常恢复页按广告 ID 查询权益状态 | 已创建 |
| `idx_openid_scene_created` | 非唯一 | `openid` 升序；`rewardScene` 升序；`createdAt` 降序 | 后续查询广告奖励历史 | 待手动创建 |
| `idx_openid_status_expires` | 非唯一 | `openid` 升序；`status` 升序；`expiresAt` 升序 | 后续查询当前用户未完成或过期会话 | 待手动创建 |

### 注意事项

- `adRewardGrants` 集合使用字段 `openid`，不要写成 `ownerOpenid`。
- `idempotencyKey` 格式为 `openid:rewardScene:clientRewardId`。
- P0-02 核心创建、结算与状态查询使用确定性 `_id`，正确性不依赖以上复合索引。
- `idx_openid_scene_created`、`idx_openid_status_expires` 只记录待办，必须由开发者在目标云环境手动创建并确认。
- 以上索引是非唯一索引，不要创建为唯一索引。
- Codex 只记录索引要求，开发者需要在微信云开发控制台手动创建以上索引。

---

## 15. 默认索引说明

微信云数据库默认会存在以下索引。

这些索引不要删除。

| 索引名称 | 说明 |
|---|---|
| `_id_` | 数据库默认主键索引，不要删除 |
| `_openid_1` | 云开发默认 openid 索引，不要删除 |

---

## 16. 当前索引汇总

| 集合 | 索引名称 | 索引属性 | 字段顺序 | 状态 |
|---|---|---|---|---|
| `works` | `idx_owner_work` | 非唯一 | `ownerOpenid` 升序；`workId` 升序 | 已创建 |
| `works` | `idx_owner_status_updated` | 非唯一 | `ownerOpenid` 升序；`status` 升序；`updatedAt` 降序 | 已创建 |
| `workVersions` | `idx_owner_work_status_created` | 非唯一 | `ownerOpenid` 升序；`workId` 升序；`status` 升序；`createdAt` 升序 | 已创建 |
| `workVersions` | `idx_owner_version` | 非唯一 | `ownerOpenid` 升序；`versionId` 升序 | 已创建 |
| `shares` | `idx_share_status` | 非唯一 | `shareId` 升序；`status` 升序 | 已创建 |
| `shares` | `idx_owner_work_status` | 非唯一 | `ownerOpenid` 升序；`workId` 升序；`status` 升序 | 已创建 |
| `shares` | `idx_owner_work_version_status` | 非唯一 | `ownerOpenid` 升序；`workId` 升序；`sourceVersionId` 升序；`status` 升序 | 已创建 |
| `uploadAssets` | `idx_owner_work_created` | 非唯一 | `ownerOpenid` 升序；`workId` 升序；`createdAt` 降序 | 已创建 |
| `generationTasks` | `idx_owner_task` | 非唯一 | `ownerOpenid` 升序；`taskId` 升序 | 已创建 |
| `generationTasks` | `idx_owner_work_status_updated` | 非唯一 | `ownerOpenid` 升序；`workId` 升序；`status` 升序；`updatedAt` 降序 | 已创建 |
| `optimizeQuotas` | `idx_openid` | 非唯一 | `openid` 升序 | 已创建 |
| `optimizeQuotaGrants` | `idx_openid_idempotency` | 非唯一 | `openid` 升序；`idempotencyKey` 升序 | 已创建 |
| `optimizeQuotaGrants` | `idx_openid_scene_created` | 非唯一 | `openid` 升序；`rewardScene` 升序；`createdAt` 降序 | 已创建 |
| `optimizeReservations` | `idx_openid_reservation` | 非唯一 | `openid` 升序；`reservationId` 升序 | 已创建 |
| `optimizeReservations` | `idx_openid_work_status_updated` | 非唯一 | `openid` 升序；`workId` 升序；`status` 升序；`updatedAt` 降序 | 已创建 |
| `optimizeReservations` | `idx_status_expires` | 非唯一 | `status` 升序；`expiresAt` 升序 | 待在 development / staging 手动创建 |
| `users` | `idx_openid` | 非唯一 | `openid` 升序 | 已创建 |
| `orders` | `idx_openid_order` | 非唯一 | `openid` 升序；`orderId` 升序 | 已创建 |
| `orders` | `idx_openid_work_product_status` | 非唯一 | `openid` 升序；`workId` 升序；`productType` 升序；`status` 升序 | 已创建 |
| `arEntitlements` | `idx_openid_work_status` | 非唯一 | `openid` 升序；`workId` 升序；`status` 升序 | 已创建 |
| `adRewardGrants` | `idx_openid_idempotency` | 非唯一 | `openid` 升序；`idempotencyKey` 升序 | 已创建 |
| `adRewardGrants` | `idx_openid_client_scene` | 非唯一 | `openid` 升序；`clientRewardId` 升序；`rewardScene` 升序 | 已创建 |
| `adRewardGrants` | `idx_openid_scene_created` | 非唯一 | `openid` 升序；`rewardScene` 升序；`createdAt` 降序 | 待手动创建 |
| `adRewardGrants` | `idx_openid_status_expires` | 非唯一 | `openid` 升序；`status` 升序；`expiresAt` 升序 | 待手动创建 |

---
