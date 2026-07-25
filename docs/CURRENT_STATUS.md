# Petmate Current Status

当前源码包基线为 `petmate-mini1.5.0`。本说明用于同步 2026-05-20 的代码与文档认知边界。

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

若后续修改产品规则，优先更新对应主事实源，并同步本文件的状态摘要或事实源归属表，避免代码版本、产品规则和设计入口出现偏差。
