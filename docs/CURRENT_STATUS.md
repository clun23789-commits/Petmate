# Petmate Current Status

当前源码包基线为 `petmate-mini1.5.0`。本说明用于同步截至 2026-07-27 的代码与文档认知边界。

当前开发仍以以下三份文档为依据：

- `petmate_product_direction_1.2.1.md`
- `petmate_ui_design_guide_2.1.md`
- `petmate_page_structure_flow_2.3.md`

以上文档文件名中的版本号是产品方向、UI 设计与页面流程文档的版本号，不等于当前代码版本号。

## 文档事实源归属

为避免同一规则在多份文档中分叉，后续维护按以下归属更新：

| 事实类型 | 主事实源 |
|---|---|
| 产品定位、服务分层、产品禁令、AR 权益、优化次数、上传规则 | `docs/petmate_product_direction_1.2.1.md` |
| 页面路由、页面状态、弹窗、tabbar、页面出口与不承载能力 | `docs/petmate_page_structure_flow_2.3.md` |
| 视觉风格、组件语言、页面状态呈现、概念图生成约束 | `docs/petmate_ui_design_guide_2.1.md` |
| UI 开发验收清单 | `docs/ui_optimization_checklist.md` |
| UI 优化历史记录 | `docs/ui_optimization_progress.md` |
| development / staging / production 环境策略与发布检查 | `docs/environment_strategy.md` |
| 云数据库字段结构 | 云数据库字段结构文档 |
| 云数据库索引定义 | `docs/cloud_database_indexes.md` |
| 基础作品生成、云端落库和恢复规则 | 云数据库字段结构文档、`docs/error_recovery_policy.md`、`docs/smoke_test_checklist.md` |

## 当前后端实现边界

当前项目已经不是纯 mock scaffold。小程序前端 MVP 已具备主流程页面，云函数目录也已覆盖用户、作品、上传素材、生成任务、广告权益、优化次数、订单、AR 权益、分享等云端雏形。

真实 AI、真实广告、真实微信支付、真实 AR 尚未接入。开发环境允许显式 mock / fallback，production 必须禁止静默 mock / local fallback。

作品生成后端当前保留基础生成流程：上传素材后创建 `generationTasks`，轮询推进到云端保存 `works / workVersions`，并返回结果页所需的基础 `previewMedia` 与 `editableTexture.notes`。真实识别、真实广告、真实微信支付、真实 AR 仍未接入。

P0-01 已在源码中完成优化次数事务化：`reserveOptimizeQuota / commitOptimizeQuota / releaseOptimizeQuota` 原子更新预占与汇总，`startGenerationTask` 原子绑定 reservation 与任务；预占记录新增 `expiresAt / boundAt / releaseReason`，并新增 `cleanupExpiredOptimizeReservations` 用于定时恢复过期记录。前端轮询网络异常不再释放次数，结果页与定向补图页具备提交锁，flow 层使用单飞保护。

清理云函数源码已增加客户端调用隔离：带普通用户 `OPENID` 的请求会在数据库扫描前被拒绝；成功响应只返回汇总数字，失败日志中的用户、预占、任务和作品标识使用 12 位哈希引用。development / staging 仍需人工部署云函数、创建 `idx_status_expires`、配置每 10 分钟清理触发器，并把 `cleanupExpiredOptimizeReservations.invoke = false` 合并到各环境当前完整的 CloudBase 函数安全规则。仓库中的示例和文档不代表云端权限或触发器已经配置完成。

若后续修改产品规则，优先更新对应主事实源，并同步本文件的状态摘要或事实源归属表，避免代码版本、产品规则和设计入口出现偏差。
