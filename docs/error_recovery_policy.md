# Petmate 错误与恢复状态规则

## 文档目的

本规则用于统一第一批之后的错误语义，避免后续接入真实 AI、广告、支付、AR 时出现用户不知道次数是否扣减、权益是否保留、下一步入口在哪里的问题。

## 错误域

| 错误域 | 典型入口 | 用户需要知道什么 |
|---|---|---|
| `ad` | 广告解锁页、优化次数补充 | 广告是否完整完成；权益或次数是否发放 |
| `upload` | 上传页、定向补图页 | 照片是否已上传；是否需要重新选择 |
| `generation` | 生成页、优化生成页 | 生成是否成功；优化预占是否释放 |
| `optimization` | 结果页、优化建议页 | 次数是否预占、释放、正式扣减 |
| `payment` | 支付页 | 订单是否创建；是否支付成功；是否可重试 |
| `entitlement` | AR guide、支付成功后、AR view | 当前作品是否已有 AR 权益 |
| `ar` | AR view、AR failure | 权益是否保留；是否是设备、权限或初始化失败 |
| `share` | 分享落地页、转化页 | 分享是否 active、expired、invalid |
| `cloud` | 所有云函数 | 云端不可用时是否允许 fallback |

## 状态命名

优先复用以下状态词：

```text
idle
loading
success
failed
cancelled
unavailable
expired
invalid
pending
running
reserved
released
committed
active
revoked
```

除非已有模型中存在，不新增含义重复的状态词。

## 用户提示原则

- 广告未完整完成：不发放权益或次数，提示用户可重新观看。
- 上传失败：不进入生成，保留重新选择或重试入口。
- 生成失败：不正式扣减优化次数，如存在预占应释放。
- 页面中断：保留恢复入口，不默认扣减次数。
- 支付取消：不发放 AR 权益，订单保持可重试或取消态。
- 支付成功但权益同步失败：显示“权益确认中/可重试查询”，不要引导重复支付。
- AR 初始化失败：权益保留，不重新收费，提示检查设备、权限或稍后重试。
- 分享失效：展示失效态，不暴露已删除作品信息。
- 云端不可用：只有 development 或明确允许 fallback 的 staging 服务可以降级；production 不允许静默 mock 或 local fallback。

## 各域恢复边界

| 错误域 | 是否扣减/发放 | 是否保留权益/状态 | 下一步入口 |
|---|---|---|---|
| `ad` | 仅完整完成后发放 | 未完成不保留发放记录 | 返回广告解锁或补充次数入口 |
| `upload` | 不涉及次数扣减 | 已成功上传的云端素材保留，失败照片需重新选 | 上传页重试 |
| `generation` | 失败不正式扣减优化次数 | 已创建任务可保留为 failed 供恢复页说明 | 异常恢复页或重新生成入口 |
| `optimization` | 有效提交才预占，成功返回结果才扣减 | 失败或中断释放 reserved | 结果页、优化建议页或广告补充入口 |
| `payment` | 支付成功才进入权益发放 | pending 订单可重试，取消不发权益 | 支付页内部状态 |
| `entitlement` | 发放只绑定当前 workId | AR 权益随当前作品保留，删除作品后 revoked | AR guide 或 AR view |
| `ar` | 不产生新扣费 | 初始化失败仍保留已购权益 | AR failure 或重试 AR view |
| `share` | 不涉及扣减 | active 可预览，expired/invalid 不展示作品详情 | 分享落地页失效态或案例 tab |
| `cloud` | 按业务域规则处理 | production 不把失败伪装成成功 | 明确错误提示或允许的 fallback |

## 第一批代码要求

- 页面和 flow 层继续通过统一 service 入口，不直接引用 `services/mock/*` 或 `services/cloud/*`。
- development 默认允许 MVP 演示所需 fallback。
- production 服务矩阵不得包含 mock 或静默 fallback 模式。
- 第一批不大规模重构错误模型；如 service wrapper 需要包装错误，应给出明确可读的失败信息。
## 第 3 阶段：生成任务恢复策略

- 客户端提交前将最小恢复引用写入 `petmate.generationRequests.v1`：只保存 `clientRequestId / workId / operationType / reservationId / taskId / createdAt`，不保存作品或版本结果。
- 创建任务响应丢失或网络超时时不清理恢复引用、不释放 reservation；重试必须复用同一 `clientRequestId`，由服务端返回原任务。成功或明确不可恢复失败后才清理。
- optimize / targeted_upload 重新进入时优先复用恢复引用中的 `reservationId`，避免应用重启后再次预占并创建另一任务。
- 轮询处理者异常退出时依赖 60 秒处理锁过期恢复；旧 `processingToken` 或旧 `revision` 的写入必须被拒绝。
- `finalizing` 恢复继续使用已保存的 `resultSnapshot / targetVersionId`，不重新构造另一版本。
- 输入无效：`generationTasks.failureCategory = "input"`，前端按生成失败恢复页展示，并引导用户重新上传或补充素材。
- 任务超时：`phase = "timeout"`、`status = "failed"`、`providerStatus = "timeout"`、`failureCode = "GENERATION_TASK_TIMEOUT"`，前端按失败处理，提示稍后重试。
- 结果无效：`failureCode = "GENERATION_RESULT_INVALID"`，任务不得返回 `success`；如果关联优化预占，仍由现有前端失败路径释放 reservation。
- 结果落库失败：`works / workVersions / generationTasks` 最终事务整体回滚，任务不得返回 `success`；随后持锁失败路径写入 `resultSaveStatus = "failed"`、`failureCategory = "save"`，避免用户进入半成功结果页。
- 云端落库成功：`resultSaveStatus = "success"`、`finalizedWorkId = workId`、`finalizedVersionId = targetVersionId`，前端只同步本地 store，不再重复调用 `saveWork`。
- 旧版本的本地 upsert + `saveCurrentWorkToCloud` 兜底路径仅作为兼容历史任务的保护，不是当前推荐路径。
