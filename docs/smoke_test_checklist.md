# Petmate 核心链路冒烟测试清单

## 前置条件

- [ ] 已确认当前环境：查看 `miniprogram/config/env.generated.js` 的 `SELECTED_APP_ENV`。
- [ ] development 冒烟前已运行 `npm run env:development`。
- [ ] staging 云端链路冒烟前已运行 `npm run env:staging`。
- [ ] production 发布前必须运行 `npm run release:precheck`，且 `check:production-readiness` 通过；当前第 0 阶段该检查预期失败，因此不得发布 production。
- [ ] 已运行 `npm run check:structure`。
- [ ] 已运行 `npm run check:product`。
- [ ] 已运行 `npm run check:mock-boundary`。
- [ ] 已运行 `npm run check:runtime-config`。
- [ ] 已运行 `npm run build:miniprogram`。
- [ ] 微信开发者工具打开目录为 `miniprogram/`。
- [ ] 云环境 ID 与 `ENV_CONFIG.cloudEnvId` 一致；该值由 `env.profiles.js` 与 `env.generated.js` 组合生成。
- [ ] 需要测试云端链路时，26 个云函数已部署。
- [ ] 需要测试云端链路时，数据库索引已按 `docs/cloud_database_manual_checklist.md` 核对。

## S1：首页/Tab 基础进入

- [ ] 进入作品 tab。
- [ ] 进入案例 tab。
- [ ] 进入我的 tab。
- [ ] 非 tab 页面不出现底部 tabbar。
- [ ] 代码检查通过 `npm run check:page-structure`，没有 `navigateTo` / `redirectTo` 直接跳转 tabbar 页。
- [ ] 生成中、结果、支付、异常恢复、AR 失败页的顶部返回均走显式出口，不回到上传页或错误的支付前状态。

## S2：首次创作与广告解锁

- [ ] 从作品首页进入开始创作。
- [ ] 进入广告解锁页。
- [ ] 广告展示前已创建 `adRewardGrants.status = pending` 的 10 分钟会话；会话创建失败时不展示广告。
- [ ] mock 广告成功后进入上传页，响应直接带回最新 quota。
- [ ] mock 广告失败或中断时有明确提示。
- [ ] 无预创建会话调用 `grantAdReward` 返回 `AD_REWARD_SESSION_NOT_FOUND`，次数不变化。
- [ ] 同一会话重复结算 10 次、两个请求并发结算时，都只增加 3 次。
- [ ] 结算请求伪造 `count = 999`、其他 `workId` 或其他 `source` 时，仍以会话绑定数据和固定 3 次为准。
- [ ] `optimize_quota` 缺少作品、作品不属于当前用户或已删除时不能创建/结算会话。
- [ ] 过期会话、未完整观看广告不能增加次数。
- [ ] 分别模拟 `optimizeQuotaGrants`、`optimizeQuotas`、`adRewardGrants` 写失败，三个集合均无半成功记录。
- [ ] 直接调用旧 `grantOptimizeQuota` 只返回既有结算或 `OPTIMIZE_QUOTA_GRANT_NOT_SETTLED`，`grantedCount` 不变化。
- [ ] 异常页重复查询已结算权益 10 次，页面恢复为 granted，数据库次数和流水数量不变化。
- [ ] 数据中只保存白名单 `completionEvidence`，不保存完整客户端广告原始对象。

## S3：上传与生成

- [ ] 选择正脸图。
- [ ] 可选侧面图、全身图不是强制上传。
- [ ] 上传失败时可重试。
- [ ] 定向补图上传后，云端 `uploadAssets.role` 入库为 `targeted`。
- [ ] 非法 `viewType`、非法 `role`、非法 `fileType` 和超过 10MB 的图片会被 `createUploadAsset` 拒绝。
- [ ] 上传记录保存失败时会尝试清理已上传云文件。
- [ ] 没有上传照片时不能创建初始生成任务。
- [ ] 缺少正脸图时不能创建初始生成任务。
- [ ] 创建生成任务。
- [ ] 生成页阶段推进正常。
- [ ] 上传提交后进入生成等待页时，点击返回不会回到上传页。
- [ ] 生成成功进入结果页。
- [ ] 生成成功进入结果页后，顶部返回进入作品 tab，不回到上传页。
- [ ] 生成完成但云端保存失败时，重新进入作品页可重试保存。
- [ ] 生成失败进入异常恢复路径。

## S4：结果反馈与优化次数

- [ ] 点击“像”不消耗优化次数。
- [ ] 点击“不像”后可进入优化建议。
- [ ] 有效优化提交才预占次数。
- [ ] 预占记录写入 `expiresAt`；创建 optimize / targeted_upload 任务后，同一事务写入 `taskId` 与 `boundAt`。
- [ ] 同一 `reservationId` 重复 reserve 返回 `duplicated = true`，`reservedCount` 只增加一次。
- [ ] 最后一次额度被两个不同 reservation 并发争抢时，只允许一个成功，另一个返回 `OPTIMIZE_QUOTA_NOT_ENOUGH`。
- [ ] 结果页和定向补图页连续快速点击时只创建一个 reservation 和一个 generationTask，按钮显示“正在提交优化”。
- [ ] 生成明确失败后释放预占，并由服务端写入 `releaseReason = task_failed / task_timeout`。
- [ ] 任务仍为 pending / running 时调用 release 返回 `OPTIMIZE_RESERVATION_TASK_ACTIVE`，配额与 reservation 不变化。
- [ ] 任务成功时调用 release 返回 `OPTIMIZE_RESERVATION_TASK_SUCCEEDED`，随后由 commit 确认扣减。
- [ ] 轮询发生网络异常时不释放 reservation；重新进入后能继续查询同一任务。
- [ ] 生成成功、`resultSaveStatus = success` 且 `finalizedVersionId` 非空时才正式扣减；重复 commit 只影响一次。
- [ ] commit 暂时失败时保留生成结果，结果页提示“作品已生成，优化次数正在确认”，不创建新预占。
- [ ] 过期未绑定 reservation 经 `cleanupExpiredOptimizeReservations` 释放；过期成功任务自动 commit；超时运行任务标记失败后释放。
- [ ] reservation 文档可见 `expiresAt / boundAt / releaseReason` 的对应状态，且 `usedCount + reservedCount <= grantedCount`。
- [ ] 细节补色不消耗重新生成类优化次数。

### S4-A：清理函数客户端攻击测试

- [ ] 仅在开发版小程序中临时调用 `wx.cloud.callFunction({ name: "cleanupExpiredOptimizeReservations" })`。
- [ ] CloudBase 客户端权限层直接拒绝调用；若控制台规则意外失效，云函数代码仍返回 `CLEANUP_OPTIMIZE_RESERVATIONS_FORBIDDEN`。
- [ ] 拒绝发生在数据库扫描前，数据库查询次数不增加，`optimizeQuotas / optimizeReservations / generationTasks` 数据无变化。
- [ ] 响应不包含 `OPENID / reservationId / taskId / workId` 或任何扫描结果。
- [ ] 测试完成后删除临时代码，不得提交到产品代码。

### S4-B：受信任定时清理测试

- [ ] 在 development 准备一条 `status = reserved`、`expiresAt` 小于当前时间且 `taskId` 为空的测试预占。
- [ ] 通过定时触发器或受信任管理端执行 `cleanupExpiredOptimizeReservations`。
- [ ] reservation 变为 `released`，对应 quota 的 `reservedCount` 减少 1。
- [ ] 响应只含 `scanned / released / committed / timedOut / skipped / failed` 汇总数字，不含明细数组。
- [ ] 服务端日志不含原始 `openid / reservationId / taskId / workId`。

## S5：支付页与 AR 权益

- [ ] 未解锁作品进入 AR guide 后进入支付页。
- [ ] development 本地 Mock 支付仍可完成页面演示。
- [ ] staging 云端 Mock 订单明确写入 `paymentProvider=mock / paymentMode=mock`，确认后来源为 `trusted_mock_flow`。
- [ ] mock 支付成功后发放当前 workId 的 AR 权益。
- [ ] mock 支付成功后先停留支付页展示“支付成功 / 权益到账”，点击主按钮后再进入 AR 展示。
- [ ] 缺少 `PETMATE_APP_ENV` 时支付云函数返回 `SERVER_ENV_INVALID`，不会默认按 development 放行。
- [ ] production 创建或确认 Mock 订单均被拒绝；真实支付未实现时显示明确不可用状态。
- [ ] real/wechat 订单不能调用 `markPaymentPaid`，`wx.requestPayment` 成功回调不会直接把订单标记为 paid。
- [ ] 旧 paid 订单缺少可信 `paymentConfirmationSource` 时不能发放权益。
- [ ] 重复或并发发放同一作品权益后只存在一个 active 权益，订单与权益状态一致。
- [ ] 已解锁当前作品可再次进入 AR。
- [ ] 不同作品权益不互通。
- [ ] AR 初始化失败后权益保留，不引导重复支付。
- [ ] 异常恢复页不处理 AR 展示失败，AR 展示失败只进入 AR 失败页。

## S6：分享链路

- [ ] 作品结果页或 AR 页可生成分享 payload。
- [ ] 分享路径包含 `/pages/share/landing/index?shareId=`。
- [ ] 好友打开 active 分享可看到预览。
- [ ] 过期分享显示失效态。
- [ ] 删除作品后相关分享失效。
- [ ] dev mock share ids 仍可用于演示：`share-owner`、`share-new-user`、`share-expired`。

## S7：删除作品与数据清理

- [ ] 删除作品后列表不再显示。
- [ ] 当前作品本地状态清理。
- [ ] 删除当前作品后本地 `currentWorkId` 被清理或切换到其他作品。
- [ ] 关联生成任务本地状态清理。
- [ ] 关联 pending 订单本地状态清理。
- [ ] 关联 pending cloud save 状态清理。
- [ ] 关联分享失效。
- [ ] 删除作品后原分享链接显示失效态。
- [ ] 删除作品后 active AR 权益被撤销或不可再使用。
- [ ] 已删除作品不能重新保存为可见作品。
## S9：第 3 阶段生成任务系统

- [ ] 同一 `clientRequestId` 顺序或并发提交多次只创建一个确定性 `generationTasks` 文档，并返回同一个 `taskId`；更换 `clientRequestId` 可创建新任务。
- [ ] 同一 `clientRequestId` 改变 `workId / operationType / reservationId` 时返回 `GENERATION_REQUEST_CONFLICT`。
- [ ] 模拟创建任务服务端成功但客户端超时，再次提交后返回 `duplicated = true`，本地恢复引用补写原 `taskId`。
- [ ] optimize / targeted_upload 在应用重启后复用本地恢复引用中的 `reservationId`，不重复预占优化次数。
- [ ] 对同一 pending 任务并发发起 20 次轮询，只有一个请求增加 `revision` 并推进阶段，其余请求只读返回 `GENERATION_TASK_LOCKED` 状态。
- [ ] 未过期处理锁不会被覆盖；锁过期后新 token 可恢复，旧 token 和旧 revision 都不能继续写入。
- [ ] 初始上传生成成功后，`generationTasks.status = success`，`phase = completed`，`providerStatus = succeeded`。
- [ ] 成功任务返回 `cloudFinalized = true`，且 `resultSaveStatus = success`。
- [ ] 成功任务已由云函数写入 `works.currentVersionId` 与对应 `workVersions.versionId`。
- [ ] 对同一个成功 `taskId` 重复调用 `pollGenerationTask` 不会重复创建版本，也不会重复追加相同 `versionId`。
- [ ] success / failed 任务重复轮询完全只读，不更新 `updatedAt / lastProcessedAt / revision`。
- [ ] finalizing 并发轮询只产生一个作品和一个版本；作品、版本、任务成功状态在同一事务可见。
- [ ] 分别注入版本写入、作品写入和任务成功写入失败，确认最终事务回滚且不存在半成功数据。
- [ ] 已删除作品不能被 finalizing 恢复；legacy work/version 文档仍按原 `_id` 更新。
- [ ] 生成中刷新或退出后重新进入等待页，会立即轮询一次并恢复结果。
- [ ] `simulateFailure` 能进入 `failed`，并写入非空 `failureCode / failureCategory / failureReason`。
- [ ] 构造过期 `createdAt` 或临时缩短 timeout 后，任务进入 `phase = timeout` 且 `failureCode = GENERATION_TASK_TIMEOUT`。
- [ ] optimize 任务失败后，前端仍会释放已预占的 reservation。
- [ ] development / staging 的本地 mock generation 也只模拟 `queued / fetching_assets / finalizing / completed`。
- [ ] 故意删除任务关联的上传素材记录时，任务进入 `failed`，且 `failureCode = GENERATION_INPUT_INVALID`。
- [ ] 构造缺少 `versionId / workId` 的异常结果时，任务进入 `failed`，且 `failureCode = GENERATION_RESULT_INVALID`。
- [ ] 让 `works / workVersions` 写入失败时，任务进入 `failed`，且 `resultSaveStatus = failed`、`failureCode = GENERATION_RESULT_SAVE_FAILED`。
- [ ] `workVersions.editableTexture.notes` 保留可读内容，结果页和细节优化页不会因为字段缺失报错。

## S9.1：第 4 阶段作品恢复服务端权威化

- [ ] 使用 `taskId / workId / versionId` 恢复一个 `resultSaveStatus = failed` 且结果完整的任务，确认 `works / workVersions / generationTasks` 在同一事务成功。
- [ ] 请求附带完整 `work` 或 `version` 对象时返回 `SAVE_WORK_LEGACY_PAYLOAD_REJECTED`，数据库无写入。
- [ ] 伪造 `status / ownerOpenid / source / createdAt` 和未知字段，确认最终作品与版本只包含服务端白名单字段。
- [ ] 使用其他用户任务、缺失任务、未完成任务、错误 workId/versionId 和不完整 `resultSnapshot`，确认分别拒绝且无半成功数据。
- [ ] 已删除作品不能恢复；重复恢复同一任务只保留一个作品与一个版本；legacy work/version 按原 `_id` 更新。
- [ ] 分别注入版本和作品写入失败，确认事务整体回滚；移除故障后用同一引用可恢复成功。
- [ ] `petmate.pendingCloudSave.v2` 只含 `taskId / workId / versionId / createdAt`，不含作品、版本、媒体、贴图、归属或状态字段。
- [ ] 有完整引用的 v1 缓存迁移为 v2 且完整对象被丢弃；缺少 `taskId` 的 v1 被删除并提示重新进入作品页刷新。
- [ ] 首次恢复失败时保留 v2；再次成功后清除 v2，并通过 `getWork(workId)` 拉取云端权威内容覆盖本地旧内容。
- [ ] 任务不存在、引用不一致、结果无效或作品已删除等终态错误会清除 v2，不会在每次启动时无限重试。
- [ ] 结构化反馈和细节补色不会调用 `saveWork`；它们在独立服务端命令接口完成前保持本地状态。

## S10：基础结果与 AR 入口恢复

- [ ] development / staging mock generation 仍可完成。
- [ ] 基础结果 `previewMedia.cover` 优先使用正脸主图 fileID；没有正脸时使用第一张上传图 fileID。
- [ ] 基础结果 `previewMedia` 只包含封面、结果提示和颜色描述等轻量展示信息。
- [ ] 重复 poll 同一个 success task 不会重复创建 `workVersions`，也不会重复追加同一个 `versionId`。
- [ ] 重复保存不会覆盖基础 `previewMedia.cover / modelHint / colorway`。
- [ ] 已购 AR 权益仍绑定当前作品；基础结果暂不可进入真实 AR 时，应走现有 AR 失败说明页。

## UI 第 6 批恢复链路冒烟

### 广告解锁页

- [ ] 打开 `/pages/works/ad-unlock/index?source=first_create`，首屏能看到观看广告主按钮。
- [ ] 页面明确说明广告试用不包含 AR 展示权益。
- [ ] 点击权益未到账提示，能进入异常恢复页。
- [ ] 广告处理中不能重复点击主按钮。
- [ ] `source=optimize_refill` 时，文案表达为补充当前作品优化次数。
- [ ] `source=recover` 时，文案表达为恢复试用权益。

### 异常恢复页

- [ ] 打开 `/pages/works/exception/index?scene=ad&status=skipped`，页面说明未完整观看不会发放权益，也不会扣减优化次数。
- [ ] 打开 `/pages/works/exception/index?scene=ad&status=rightUnknown`，页面提供重新查询权益入口。
- [ ] 打开 `/pages/works/exception/index?scene=upload&status=permissionError`，页面提示权限恢复路径。
- [ ] 打开 `/pages/works/exception/index?scene=generation&taskId=mock-task&workId=mock-work`，页面说明生成失败不会白白扣减次数。
- [ ] 打开 `/pages/works/exception/index?scene=optimization&workId=mock-work`，页面说明预占次数会释放。
- [ ] 手动切换问题类型时，不出现广告状态串到上传 / 生成场景的问题。

### AR 失败页

- [ ] 打开 `/pages/works/ar-failure/index?workId=mock-work&reasonType=plane`，页面高亮平面识别失败。
- [ ] 打开 `/pages/works/ar-failure/index?workId=mock-work&reasonType=camera`，页面提示开启相机权限。
- [ ] 打开 `/pages/works/ar-failure/index?workId=mock-work&reasonType=ar_unavailable`，页面说明 AR 功能暂未开放。
- [ ] 页面明确说明当前可先查看基础作品结果，并继续补图优化。
- [ ] 点击重新进入 AR，仍跳转 `/pages/works/ar-view/index`。
- [ ] 点击返回结果页，仍跳转 `/pages/works/result/index`。
- [ ] 点击联系客服，仍跳转 `/pages/mine/contact/index`。
- [ ] 基础生成失败时，不影响已购作品的 AR 权益记录。
- [ ] production 缺少真实 AR 能力时，仍通过 AR 使用说明或失败说明页兜底，不误导用户重复支付。
- [ ] 结果页、详情页能显示基础作品结果状态。
- [ ] AR guide 能识别 `asset_not_ready / model_asset_missing / render_failed`，不直接误导进入真实 AR。

## UI 第 7 批 AR 购买 / 支付链路冒烟

- [ ] `/pages/works/ar-guide/index?workId=mock-work` 未购状态说明“当前作品 AR 展示权益”。
- [ ] AR guide 已购状态显示可直接进入 AR 展示。
- [ ] AR guide 确认中状态提示不要重复支付。
- [ ] `/pages/works/payment/index?workId=mock-work` 显示当前作品卡和购买内容。
- [ ] payment idle / paying / confirming / success / owned / failed / cancelled 状态文案不冲突。
- [ ] 支付完成但确认中时，页面不引导重复支付。
- [ ] 已拥有当前作品 AR 权益时，可进入 AR 展示。

## UI 第 8 批 AR 展示页冒烟

- [ ] `/pages/works/ar-view/index?workId=mock-work` 默认底部只显示教程、截图、分享、更多。
- [ ] 点击更多后展示动作、滤镜、光影、网格、录屏、撤销、重置识别、摆放 / 跟随和大小调节。
- [ ] 截图按钮可生成截图预览。
- [ ] 分享按钮可准备分享卡片。
- [ ] 开发开关关闭时，不显示问题模拟入口。
- [ ] 开发开关开启时，更多面板中可模拟 camera / lighting / plane / performance。
- [ ] 返回按钮仍回到结果页。

## UI 第 9 批作品 / 案例 / 分享链路冒烟

- [ ] 作品首页可进入生成列表。
- [ ] 生成列表筛选与排序状态正常。
- [ ] 作品详情可进入结果页、AR guide / AR view。
- [ ] 作品删除确认仍可弹出，并提示作品及对应 AR 权益将不可继续使用。
- [ ] 案例页筛选、搜索、详情、视频、官方示例入口正常。
- [ ] 视频详情不出现社交互动或内容流元素。
- [ ] 分享落地页 active / expired 状态正常。
- [ ] 分享转化页能返回案例或作品首页。

## UI 第 10 批我的 / 权益 / 帮助 / 反馈冒烟

- [ ] 我的页进入个人信息、权益说明、帮助中心。
- [ ] 权益说明页未出现账户套餐化表达，AR 付费权益绑定当前作品。
- [ ] 帮助中心搜索、清空、分类、问题详情正常。
- [ ] 帮助详情相关问题跳转正常。
- [ ] 联系我们复制单项和复制全部正常。
- [ ] 反馈页选择类型、输入、上传 / 删除截图、提交成功 / 失败提示正常。
- [ ] 反馈提交中有 loading，内容为空时按钮禁用。
- [ ] 个人信息修改昵称和退出登录弹窗正常。

## UI 第 11 批资源冒烟

- [ ] 作品首页 mock 宠物图正常显示，无明显失真。
- [ ] 结果页、AR guide、AR view 中 mock 宠物图正常显示。
- [ ] 案例页和案例详情中的 mock 图正常显示。
- [ ] 分享落地页和转化页 mock 图正常显示。
- [ ] 我的页、帮助页、反馈页插图正常显示。
- [ ] tabbar 图标正常显示，未被误删。

## UI 第 12 批最终回归清单

- [ ] 作品 tab 首页。
- [ ] 案例 tab 首页。
- [ ] 我的 tab 首页。
- [ ] 开始创作。
- [ ] 广告解锁。
- [ ] 上传页无图 / 有图。
- [ ] 生成等待页。
- [ ] 结果页反馈与优化。
- [ ] 定向补图。
- [ ] 细节补色。
- [ ] AR guide 未购 / 已购 / 确认中。
- [ ] 支付页 idle / success / owned / failed / cancelled / confirming。
- [ ] AR view success / camera / plane / lighting / performance。
- [ ] AR failure。
- [ ] 异常恢复 ad / upload / generation / optimization。
- [ ] 作品列表。
- [ ] 作品详情。
- [ ] 案例详情。
- [ ] 视频详情。
- [ ] 官方示例。
- [ ] 分享 landing active / expired。
- [ ] 分享 conversion。
- [ ] 权益说明。
- [ ] 帮助中心。
- [ ] 帮助详情。
- [ ] 联系我们。
- [ ] 反馈页。
- [ ] 个人信息。
