# AGENTS.md

## Petmate 项目开发规则

Petmate 是微信小程序 AI 宠物数字形象产品。开发时必须优先遵守 docs 目录下三份文档：

1. petmate_product_direction_1.2.1.md
2. petmate_ui_design_guide_2.1.md
3. petmate_page_structure_flow_2.3.md

文档事实源归属见 `docs/CURRENT_STATUS.md`。本文件只保留开发时必须先看到的摘要，不再复制完整产品规则。

## 当前开发阶段

当前项目已经不是纯 mock scaffold。

现阶段定位：
- 小程序前端 MVP 已具备主流程页面。
- 云函数目录已存在，并已覆盖用户、作品、上传素材、生成任务、广告权益、优化次数、订单、AR 权益、分享等云端雏形。
- 真实 AI、真实广告、真实微信支付、真实 AR 尚未接入。
- 允许开发环境使用 mock / fallback，但生产环境必须禁止静默 mock / local fallback。

第一批任务目标：
- 收口 development / staging / production 环境策略。
- 修复 service mode 与 fallback 实现不一致问题。
- 补齐云函数部署、数据库索引、核心链路冒烟测试文档。
- 不接入真实 AI、真实广告、真实支付、真实 AR。

## 工程规则

- 本项目现在是纯 JavaScript 微信小程序项目。
- 微信开发者工具运行目录固定为 `miniprogram/`。
- 业务代码直接维护 `miniprogram/**/*.js`。
- 不再维护 `.ts` 文件。
- 不再需要 `typecheck`。
- 不再需要 `.ts` / `.js` 同步检查。

## 页面与路由规则

- 开发路由以页面为主。
- 页面状态不默认拆成独立路由。
- 弹窗不做独立路由。
- 支付成功 / 权益到账是支付页内部状态。
- 修改昵称、退出登录确认、删除作品确认是弹窗组件。

## Tabbar 规则

底部 tabbar 只允许出现在：
- 作品页
- 案例页
- 我的页

其他页面、状态、弹窗都不能出现底部 tabbar。

## 产品与 UI 摘要

- 不做会员订阅、商城、社区、排行、任务系统、抽卡、宠物医疗、复杂养成、英文主界面、强赛博荧光风或后台管理表格。
- AR 权益绑定当前宠物作品；已购作品可反复进入 AR，后续优化、定向补图、细节补色继续继承权益，AR 失败不引导重新支付。
- 有效优化提交后只预占次数，成功返回可用结果后才正式扣减；失败、中断、取消、仅查看建议不扣减；细节补色不消耗重新生成类优化次数。
- 正脸、侧面、全身照片是推荐素材结构，不是强制三张上传；达到最低生成标准即可继续生成。
- UI 保持温和、干净、治愈、可信、轻科技感，中文为主，信息不过密。

完整规则以 `docs/petmate_product_direction_1.2.1.md`、`docs/petmate_ui_design_guide_2.1.md` 和 `docs/petmate_page_structure_flow_2.3.md` 为准。
