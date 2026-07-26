# Petmate 云数据库结构

> 事实源归属：本文档只维护云数据库集合、字段结构和入库规则。环境开关以 `environment_strategy.md` 为准，生成失败恢复以 `error_recovery_policy.md` 为准。

## users

保存当前微信用户基础记录。

```js
{
  _id: "数据库自动生成",
  openid: "微信 openid",
  nickname: "",
  avatarUrl: "",
  status: "active",
  createdAt: Date,
  updatedAt: Date
}
```

规则：

- `openid` 是用户唯一标识，同一 `openid` 不重复创建多条记录。
- 本阶段不强制获取用户头像或昵称，没有授权信息时保持空字符串。
- 不保存手机号、真实姓名等敏感信息。

## works

保存作品主记录。前端路由继续使用 `workId`，不使用数据库 `_id`。

```js
{
  _id: "数据库自动生成",
  workId: "work-xxx",
  ownerOpenid: "微信 openid",

  petType: "cat / dog / other",
  petTypeLabel: "猫 / 狗等，可为空",
  petName: "宠物名称",
  displayName: "展示名称，可为空",

  status: "generating / ready / failed / retouched / deleted",
  currentVersionId: "version-xxx",
  versionIds: ["version-xxx"],

  previewImage: "首页或列表封面，可为空",
  source: "mock_generation",

  createdAt: Date,
  updatedAt: Date,
  deletedAt: null
}
```

规则：

- `ownerOpenid` 必须由云函数根据 `cloud.getWXContext()` 写入，前端传入值不能覆盖。
- 查询列表必须带 `ownerOpenid`，并默认排除 `status === "deleted"`。
- 删除作品只更新 `status`、`deletedAt`、`updatedAt`，不物理删除记录。
- `versionIds` 必须保留，当前 selector 和页面依赖该字段。
- `saveWork` 不允许把已删除作品重新保存为可见作品；如果云端已有 `status === "deleted"` 的同 `workId` 记录，应返回 `WORK_ALREADY_DELETED`。
- `saveWork` 必须先完成版本归属校验，再写入 `works` 和 `workVersions`。如果 `versionId` 已属于其他 `workId`，必须返回 `VERSION_WORK_MISMATCH`，且不允许产生 `works` 已更新、`workVersions` 未写入的半成功状态。
- 生成、优化、细节补色后的当前作品都应通过 `saveWork` 同步到云端；前端页面继续使用 `workId`，不使用数据库 `_id`。

## workVersions

保存作品版本记录。

```js
{
  _id: "数据库自动生成",
  versionId: "version-xxx",
  workId: "work-xxx",
  ownerOpenid: "微信 openid",

  sourceType: "initial / optimize / targeted_upload / detail_retouch",
  previewMedia: {
    cover: "当前阶段可保存 mock 图片路径",
    modelHint: "模型说明",
    colorway: "颜色说明"
  },
  feedbackSummary: {},
  editableTexture: {
    baseColor: "#c6a38a",
    notes: []
  },

  status: "active",
  createdAt: Date,
  updatedAt: Date
}
```

规则：

- 一个 `workId` 可以对应多个版本。
- 保存版本时以 `ownerOpenid + versionId` 避免重复插入。
- 云函数写入 `ownerOpenid`，前端传入值不能覆盖。
- 删除作品时不删除版本记录。
- `version.workId` 如果存在，必须与 `work.workId` 一致；不一致时 `saveWork` 应返回 `VERSION_WORK_MISMATCH`，避免版本错挂到其他作品。
- `sourceType` 当前只允许 `initial / optimize / targeted_upload / detail_retouch`。
- 用户在结果页点击“像 / 不像”后，`feedbackSummary` 会同步保存到当前 `workVersions` 记录。
- 细节补色会产生新的 `sourceType = "detail_retouch"` 版本，并将 `works.currentVersionId` 指向该新版本。

## uploadAssets

保存用户真实选择并上传到云存储的宠物照片元数据。第 4 阶段后，这些素材会作为基础作品生成输入快照进入 `generationTasks`，由 `pollGenerationTask` 读取并整理为当前作品结果。

```js
{
  _id: "数据库自动生成",
  assetId: "asset-xxx",
  workId: "work-xxx",
  openid: "微信 openid",
  ownerOpenid: "微信 openid",

  viewType: "front / side / full / pattern / ear / tail / custom",
  role: "initial / targeted / optimization",
  fileID: "cloud://xxx",
  cloudPath: "petmate/uploads/work-xxx/initial/front/xxx.jpg",

  status: "active",
  size: 123456,
  width: 1024,
  height: 1024,
  fileType: "jpg",
  createdAt: Date,
  updatedAt: Date
}
```

规则：

- `openid` 和 `ownerOpenid` 必须由云函数根据 `cloud.getWXContext()` 写入，前端传入值不能覆盖。
- 不保存本地 `tempFilePath`，只保存云端 `fileID` 和 `cloudPath`。
- 只有云存储上传成功后才写入记录。
- 上传记录不等同于生成结果图，作品中的生成版本仍保存在 `workVersions`。
- `viewType` 只允许 `front / side / full / pattern / ear / tail / custom`。
- `role` 只允许 `initial / targeted / optimization`；前端的 `supplement` 流程语义必须在入库前映射为 `targeted`。
- `fileType` 只允许 `jpg / jpeg / png / webp / heic`，不把 gif 作为 AI 输入素材。
- 单张上传图片最大 10MB。
- `fileID` 必须是云存储 fileID，`cloudPath` 应符合 `petmate/uploads/{workId}/{role}/{viewType}/...` 结构。
- 如果云存储上传成功但 `createUploadAsset` 写记录失败，前端应尝试删除刚上传的云文件，避免孤儿文件。

## generationTasks

保存用户每一次基础作品生成或优化生成任务。当前任务由云函数内置基础流程推进，`provider` 固定为 `basic_generation`。
```js
{
  _id: "task-xxx",
  taskId: "task-xxx",
  ownerOpenid: "微信 openid",
  workId: "work-xxx",

  operationType: "initial / optimize / targeted_upload",
  phase: "queued / fetching_assets / finalizing / completed / failed / timeout",
  status: "pending / running / success / failed",
  failureReason: "",

  reservationId: "",
  dimensionSet: ["fur", "pattern"],
  targetVersionId: "version-xxx",
  simulateFailure: false,
  pollCount: 0, // legacy compatibility only; not used as the main pollGenerationTask state machine

  provider: "basic_generation",
  providerTaskId: "",
  providerTraceId: "",
  providerStatus: "queued / running / succeeded / failed / timeout",
  providerUpdatedAt: Date,
  progress: 0,

  inputSnapshot: {
    uploadAssetIds: [],
    currentVersionId: ""
  },
  resultSnapshot: {},
  resultSaveStatus: "idle / saving / success / failed",
  resultSaveErrorCode: "",
  resultSaveErrorMessage: "",
  finalizedWorkId: "",
  finalizedVersionId: "",

  createdAt: Date,
  updatedAt: Date,
  completedAt: null,
  failedAt: null
}
```

规则：
- `ownerOpenid` 必须由云函数根据 `cloud.getWXContext()` 写入，前端传入值不能覆盖。
- 生成任务只能由当前用户查询，`pollGenerationTask` 必须校验 `ownerOpenid === OPENID`。
- 新任务的 `provider` 固定为 `basic_generation`，不读取额外生成服务环境变量。
- 生成任务提交和结果查询继续使用前端 `services/generation` 的统一入口。
- `pollGenerationTask` 会由云端幂等 finalize 到 `works` 和 `workVersions`；返回 `cloudFinalized = true` 时，前端只同步本地 store，不再调用 `saveCurrentWorkToCloud`。
- `initial` 任务必须至少存在一个归属当前用户、`status = active`、`role = initial` 的上传素材；正脸、侧面、全身是推荐结构，不是强制三张上传。
- `targeted_upload` 任务必须校验当前作品归属，并至少存在一个 `role = targeted` 的 active 上传素材。
- `optimize` 任务必须校验当前作品归属，但不强制要求本轮新增上传素材。
- `optimize / targeted_upload` 必须携带客户端本次提交预先生成的 `reservationId`；`startGenerationTask` 在同一事务内创建任务并写入 `optimizeReservations.taskId / boundAt`。
- 同一 `reservationId` 最多绑定一个任务；重复提交必须返回已绑定任务，不得创建第二个 `generationTasks` 记录。
- 不允许无素材创建初始生成任务。
- `resultSnapshot` 必须保持对象结构，不应初始化为 `null`，避免 CloudBase 更新嵌套字段时出现 `Cannot create field xxx in element null` 错误。
- 前端在生成完成、调用 `saveWork` 前会写入本地 `pendingCloudSave` 标记；保存失败时保留，后续启动或进入作品链路会自动重试，成功后清除。
- 优化任务明确失败时不正式扣减优化次数；网络查询失败不等于任务失败，不能据此释放预占。

## optimizeQuotas

保存用户优化次数的云端汇总。第七批开始前端优先读取云端配额，云端不可用时保留本地兜底。

```js
{
  _id: "optimize_quota_xxx",
  openid: "微信 openid",

  grantedCount: 0,
  usedCount: 0,
  reservedCount: 0,
  createdAt: Date,
  updatedAt: Date
}
```

规则：
- `openid` 必须由云函数根据 `cloud.getWXContext()` 写入，前端传入值不能覆盖。
- `availableCount = grantedCount - usedCount - reservedCount`，只在响应时计算，不保存到数据库；`remainingCount` 是同值兼容别名。
- `grantedCount / usedCount / reservedCount` 必须是非负整数，且 `usedCount + reservedCount <= grantedCount`。不变量不成立时返回 `OPTIMIZE_QUOTA_INCONSISTENT`，不能用 `Math.max` 静默修正。
- 提交有效优化后只增加 `reservedCount`，生成成功并返回可用结果后才减少 `reservedCount` 并增加 `usedCount`。
- 预占、正式扣减和释放都必须使用服务端事务，同时更新 `optimizeQuotas` 与 `optimizeReservations`。
- 生成明确失败时释放预占；网络异常或页面退出只保留预占，由重新查询或过期清理恢复，不能直接释放。
- 细节补色不消耗重新生成类优化次数，不写入本集合扣减。

规则补充：
- 云函数响应中的可用次数字段统一使用 `availableCount = grantedCount - usedCount - reservedCount`；若结果小于 0，应报告数据一致性错误。
- `remainingCount` 仅作为兼容旧前端的别名保留，值必须与 `availableCount` 完全一致。
- 前端展示可用次数时必须做 Number 兜底，避免出现 `NaN` 或负数。

## optimizeQuotaGrants

保存激励广告结算产生的优化次数发放流水。该记录与广告会话、次数汇总由 `grantAdReward` 在同一个事务内写入。

```js
{
  _id: "optimize_grant_xxx",
  schemaVersion: 2,

  grantId: "quota-grant-xxx",
  openid: "微信 openid",

  adGrantId: "grant-xxx",
  adRewardDocId: "ad_reward_xxx",

  workId: "work-xxx，可为空",
  rewardScene: "initial_unlock / optimize_quota",
  clientRewardId: "前端本次广告试看生成的唯一 ID",
  idempotencyKey: "openid:adGrantId",

  count: 3,
  source: "rewarded_video_ad",
  status: "granted",
  quotaApplied: true,
  appliedAt: Date,

  createdAt: Date,
  updatedAt: Date
}
```

规则：
- `_id` 由 `openid + adGrantId` 生成确定性文档 ID；同一个广告 grant 只能存在一条流水。
- `count` 固定为 3，只能由云函数常量决定，不读取前端传入的次数。
- 只有 `grantAdReward` 的结算事务可以创建 schemaVersion 2 流水并增加 `optimizeQuotas.grantedCount`。
- `grantOptimizeQuota` 已降级为只读兼容查询，不得创建流水或修改次数汇总。
- `getAdRewardStatus` 只校验流水和汇总是否完整，不能修补或重新发放。
- 历史 schemaVersion 1 记录保留用于审计，不自动补发、不自动改写 `quotaApplied`。

## optimizeReservations

保存每一次优化提交的预占记录。该记录用于把“提交有效优化”和“生成成功扣减”分开处理。

```js
{
  _id: "optimize_reservation_xxx",
  openid: "微信 openid",
  reservationId: "reservation-xxx",
  workId: "work-xxx",

  source: "result / targeted_upload",
  taskId: "",
  status: "reserved / released / committed",
  dimensionSet: ["fur", "pattern"],

  expiresAt: Date,
  boundAt: null,
  releaseReason: "",
  releasedAt: null,
  committedAt: null,

  createdAt: Date,
  updatedAt: Date
}
```

规则：
- `openid` 必须由云函数根据 `cloud.getWXContext()` 写入。
- `_id` 使用 `openid + reservationId` 生成的确定性文档 ID；客户端必须在一次提交开始时生成并复用 `reservationId`。
- 预占前必须校验当前用户仍拥有该 `workId`，且作品未删除。
- 可用次数不足时返回 `OPTIMIZE_QUOTA_NOT_ENOUGH`，前端应引导用户进入广告补充说明页，不创建本地预占。
- 状态只允许 `reserved -> released` 或 `reserved -> committed`；终态重复调用必须幂等，不再次影响配额。
- `expiresAt` 是服务端写入的预占失效时间，当前为 15 分钟；`boundAt` 是任务原子绑定时间。
- `taskId` 在创建优化生成任务时写入，不在 commit 时补写；一个 reservation 最多绑定一个 task。
- `releaseReason` 只由服务端写入，可为 `task_submit_failed / task_failed / task_timeout / reservation_expired / manual_recovery`，不信任客户端内容。
- `releaseOptimizeQuota` 只允许释放未绑定任务或任务已明确失败的 reserved 记录；`pending / running / success` 任务不能由前端提前释放。
- `commitOptimizeQuota` 必须在事务内验证 `generationTasks.status = success`、`resultSaveStatus = success`、`finalizedWorkId` 和非空 `finalizedVersionId` 后再转换配额。
- `cleanupExpiredOptimizeReservations` 每次最多扫描 100 条过期 reserved 记录：未绑定/失败任务释放，已成功且保存结果的任务自动 commit，超时运行任务标记失败后释放。

## adRewardGrants

保存广告展示前由云端创建的短期奖励会话，以及会话完成后的结算状态。当前阶段默认仍使用 mock 广告；真实广告尚未启用。

```js
{
  _id: "ad_reward_xxx",
  schemaVersion: 2,

  grantId: "grant-xxx",
  openid: "微信 openid",

  rewardScene: "initial_unlock / optimize_quota",
  workId: "work-xxx，可为空",
  source: "first_create / optimize_refill / recover",

  clientRewardId: "前端本次广告试看生成的唯一 ID",
  idempotencyKey: "openid:rewardScene:clientRewardId",

  status: "pending / granted / expired / rejected",

  completionEvidence: {
    type: "wechat_client_on_close / mock",
    status: "completed",
    trustLevel: "client_reported / mock",
    receivedAt: Date
  },
  verificationStatus: "pending / client_confirmed / mock_confirmed",

  quotaCount: 3,
  quotaApplied: false,
  quotaGrantId: "",

  expiresAt: Date,
  settledAt: null,
  rejectedAt: null,
  expiredAt: null,

  createdAt: Date,
  updatedAt: Date
}
```

规则：

- `openid` 必须由云函数根据 `cloud.getWXContext()` 写入，前端传入值不能覆盖。
- `_id` 由 `openid + rewardScene + clientRewardId` 生成确定性文档 ID；会话有效期为 10 分钟。
- 状态只允许 `pending -> granted / expired / rejected`，终态不得再次转换。
- `initial_unlock` 可不绑定作品；`optimize_quota` 必须绑定当前用户未删除作品，并在创建、结算时各校验一次。
- `grantAdReward` 只读取会话中已绑定的 `rewardScene / workId / source`，不接受结算请求覆盖。
- `granted` 必须与 `optimizeQuotaGrants.status = granted / quotaApplied = true` 和合法 `optimizeQuotas` 汇总同时成立。
- 完成证据只保存白名单字段；不得保存完整客户端 `adResult.raw`。
- `completionEvidence.trustLevel = client_reported` 和 `verificationStatus = client_confirmed` 不表示服务端或密码学验证。
- 历史记录保留用于审计，不自动标记已验证、不自动补发奖励。

## orders

保存当前作品 AR 解锁订单。当前 MVP 仍为 mock 支付参数，不接入真实微信支付。

```js
{
  _id: "order-xxx",
  orderId: "order-xxx",
  openid: "微信 openid",
  workId: "work-xxx",

  productType: "ar_unlock",
  amount: 9.9,
  currency: "CNY",

  status: "pending / paid / cancelled / failed",
  paymentStatus: "pending / paid / cancelled / failed",
  entitlementStatus: "none / pending_sync / active",
  entitlementId: "",

  paymentProvider: "wechat",
  paymentMode: "mock",
  paymentParams: {
    mode: "mock",
    timeStamp: "",
    nonceStr: "",
    package: "",
    signType: "RSA",
    paySign: ""
  },

  workSnapshot: {
    petName: "下单时作品名称",
    previewImage: "下单时作品封面",
    status: "ready / retouched"
  },

  createdAt: Date,
  updatedAt: Date,
  paidAt: Date,
  cancelledAt: Date,
  failedAt: Date
}
```

规则：

- `openid` 必须由云函数根据 `cloud.getWXContext()` 写入，前端传入值不能覆盖。
- AR 解锁订单只允许 `productType === "ar_unlock"`。
- AR 解锁金额和币种由云函数固定为 `9.9 CNY`，前端传入金额仅作兼容，不作为可信来源。
- 创建订单、确认支付、发放权益都必须校验 `ownerOpenid === OPENID`、`workId` 一致，且作品状态为 `ready` 或 `retouched`。
- 同一用户同一作品已有 active AR 权益时，不应创建重复订单。
- 同一用户同一作品已有 pending AR 解锁订单时，复用该订单，不重复创建。
- 支付确认后先进入 `entitlementStatus = "pending_sync"`，权益发放成功后更新为 `active` 并写入 `entitlementId`。

## arEntitlements

保存当前作品的 AR 解锁权益。AR 权益属于单个宠物作品，不属于账号全局权益。

```js
{
  _id: "ar_entitlement_xxx",
  entitlementId: "entitlement-xxx",
  openid: "微信 openid",
  ownerOpenid: "微信 openid",
  workId: "work-xxx",
  orderId: "order-xxx",

  productType: "ar_unlock",
  status: "active / revoked",

  activatedAt: Date,
  revokedAt: Date,
  revokeReason: "work_deleted",
  expiresAt: null,
  createdAt: Date,
  updatedAt: Date
}
```

规则：

- `openid` 和 `ownerOpenid` 必须由云函数根据 `cloud.getWXContext()` 写入，前端传入值不能覆盖。
- `grantArEntitlement` 只能基于当前用户、当前作品、`status === "paid"` 的 AR 解锁订单发放权益。
- 查询和发放权益前必须确认作品仍属于当前用户，且作品状态为 `ready` 或 `retouched`。
- 同一用户同一作品只允许存在一个 active AR 权益；重复发放应返回已有权益。
- 删除作品时，当前作品的 active AR 权益应更新为 `revoked`，并记录 `revokedAt` 和 `revokeReason = "work_deleted"`。
- 即使历史权益记录仍存在，只要作品已删除或状态不可用，`getArEntitlement` 不应返回可使用权益。

## shares

当前项目已有分享云函数，集合继续用于保存分享卡片和分享页展示快照。

```js
{
  _id: "数据库自动生成",
  shareId: "share_xxx",
  workId: "work-xxx",
  sourceVersionId: "version-xxx，可为空",
  ownerOpenid: "微信 openid",

  title: "分享标题",
  petName: "宠物名称",
  imageUrl: "分享封面",
  description: "分享描述",

  previewSnapshot: {
    title: "展示标题",
    summary: "展示描述",
    petName: "宠物名称",
    petType: "cat / dog / other",
    petTypeLabel: "猫 / 狗等，可为空",
    image: "分享封面",
    statusText: "作品可预览",
    tags: [],
    featureItems: []
  },

  conversionSnapshot: {
    heroImage: "转化页主图",
    heroSubtitleLines: [],
    questionText: "转化问题文案",
    primaryCtaText: "主按钮文案",
    secondaryCtaText: "次按钮文案",
    tipText: "提示文案",
    steps: []
  },

  status: "active / expired",
  viewCount: 0,
  lastViewedAt: Date,
  createdAt: Date,
  updatedAt: Date,
  expiredAt: Date
}
```

规则：

- 分享归属字段统一使用 `ownerOpenid`，且必须由云函数根据 `cloud.getWXContext()` 写入，前端不能传入覆盖。
- `createShare` 必须校验作品归属和作品状态，只允许当前用户名下 `ready / retouched` 作品创建分享。
- `createShare` 应优先用 `works + workVersions` 生成分享快照，不应完全信任前端传入的标题、宠物名、封面和描述。
- 同一 `ownerOpenid + workId + sourceVersionId + active` 分享应优先复用，避免重复点击分享创建大量记录。
- `getShare` 必须确认分享未过期、作品未删除、作品状态仍可分享。
- 分享页展示优先使用 `previewSnapshot` 和 `conversionSnapshot`，没有快照字段时再使用默认兜底。
- 删除作品时，相关 active 分享应标记为 `expired`。
- 分享失效不影响作品版本历史记录。
- 删除作品由云函数软删除 `works` 并将对应 active 分享标记为 `expired`，前端只清理本地缓存和页面状态。
- 分享快照只保存展示所需信息，不保存手机号、真实姓名、地理位置等隐私。
## Basic generation task addendum

The current generation task does not call external recognition or generation services. The cloud function advances tasks through the basic flow:

1. `queued`
2. `fetching_assets`
3. `finalizing`
4. `completed`

`generationTasks` should keep the following task context fields:

```js
{
  taskId: "task-xxx",
  ownerOpenid: "openid",
  workId: "work-xxx",
  operationType: "initial / optimize / targeted_upload",
  phase: "queued / fetching_assets / finalizing / completed / failed / timeout",
  status: "pending / running / success / failed",
  provider: "basic_generation",
  providerTaskId: "",
  providerTraceId: "",
  providerStatus: "queued / running / succeeded / failed / timeout",
  providerUpdatedAt: Date,
  progress: 0,
  failureCode: "",
  failureReason: "",
  failureCategory: "input / result / timeout / save / system / none",
  recoverable: true,
  reservationId: "",
  dimensionSet: [],
  targetVersionId: "version-xxx",
  inputSnapshot: {
    uploadAssetIds: [],
    currentVersionId: "",
    views: [],
    workSnapshot: {}
  },
  resultSnapshot: {},
  resultSaveStatus: "idle / saving / success / failed",
  resultSaveErrorCode: "",
  resultSaveErrorMessage: "",
  finalizedWorkId: "",
  finalizedVersionId: "",
  simulateFailure: false,
  pollCount: 0, // legacy compatibility only; not used as the main state machine
  createdAt: Date,
  updatedAt: Date,
  completedAt: null,
  failedAt: null,
  timeoutAt: null,
  finalizedAt: null
}
```

`targetVersionId` is created by `startGenerationTask` and must remain stable when the result is saved. `pollCount` is retained only for historical compatibility and must not drive the main `pollGenerationTask` state machine.

After success, `pollGenerationTask` finalizes `works / workVersions` idempotently in the cloud. `resultSaveStatus === "success"` means the work and version have been persisted. Repeated polling of a successful task should return `cloudFinalized = true` without creating duplicate versions or appending duplicate `works.versionIds`.

A basic completed version includes at least:

```js
{
  versionId: "version-xxx",
  workId: "work-xxx",
  sourceType: "initial / optimize / targeted_upload",
  previewMedia: {
    cover: "cloud://xxx/uploads/...",
    modelHint: "basic generated work result",
    colorway: "based on uploaded photos and still editable later"
  },
  feedbackSummary: {},
  editableTexture: {
    baseColor: "#C6A38A",
    notes: ["basic generation completed"]
  },
  createdAt: Date
}
```

`previewMedia.cover` prefers the front image fileID; if no front image exists, it uses the first uploaded image fileID; if there is still no usable image, it may fall back to the local mock image. `editableTexture.notes` stays because result and detail retouch pages still read it.
