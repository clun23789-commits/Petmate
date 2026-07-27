# Petmate 环境策略与生产发布检查

## 1. 文档目的

本文件说明 Petmate 当前 `development / staging / production` 三类环境的切换方式、服务矩阵边界和生产发布前检查规则。

第 0 阶段只收口环境与发布安全，不接入真实 AI、真实广告、真实微信支付或真实 AR。

## 2. 环境配置来源

环境配置由三层组成：

| 文件 | 职责 |
|---|---|
| `miniprogram/config/env.profiles.js` | 维护固定环境 profile，包括默认云环境 ID、当前环境名、是否追踪用户 |
| `miniprogram/config/env.generated.js` | 由脚本生成当前选中的环境和覆盖项，提交一个 development 默认版本，方便微信开发者工具直接打开 `miniprogram/` |
| `miniprogram/config/env.js` | 组合 profile 与 generated，并继续导出 `APP_ENV_VALUE`、`ENV_CONFIG` |

不要在这些文件中写入密钥、支付证书、商户私钥、AI API key 或真实广告位等敏感信息。

支付相关云函数另有一项服务端必填环境变量：

```text
PETMATE_APP_ENV=development|staging|production
```

必须在 `createPaymentOrder`、`markPaymentPaid`、`grantArEntitlement` 的云函数运行环境中配置。云函数不读取、也不信任客户端请求中的 `appEnv / environment / isProduction / paymentMode` 来判断部署环境。变量缺失或值不在上述三项中时，支付链路以 `SERVER_ENV_INVALID` 默认拒绝。

| `PETMATE_APP_ENV` | 云端支付行为 |
|---|---|
| `development` | 允许明确标记为 `paymentProvider=mock / paymentMode=mock` 的 Mock 订单 |
| `staging` | 允许云端 Mock 订单和可信 Mock 确认，用于端到端验收 |
| `production` | 禁止创建或确认 Mock 订单；真实支付未接入时返回明确不可用错误 |

## 3. 环境定义

| 环境 | 用途 | 是否允许 mock | 是否允许 fallback | 是否可发布 |
|---|---|---:|---:|---:|
| `development` | 本地开发、页面演示、微信开发者工具默认打开 | 是 | 是 | 否 |
| `staging` | 云端主链路验证，重点验证上传、生成、作品、优化次数、分享、权益等云端雏形 | 部分允许 | 部分允许 | 否 |
| `production` | 正式发布目标环境 | 否 | 否 | 仅当 `npm run release:precheck` 通过后 |

当前 `staging` 暂时复用已有 MVP 云环境 ID。正式上线前建议拆分独立 staging/prod 云环境，并重新核对云函数、集合和索引。

## 4. 常用命令

```bash
npm run env:development
npm run env:staging
npm run check
npm run check:production-readiness
npm run release:precheck
```

生产环境生成必须显式提供云环境 ID：

```bash
PETMATE_CLOUD_ENV_ID=prod-xxxx npm run env:production
```

如果在 Windows PowerShell 中遇到 `npm.ps1` 执行策略限制，可使用：

```powershell
$env:PETMATE_CLOUD_ENV_ID = "prod-xxxx"
npm.cmd run env:production
```

不提供 `PETMATE_CLOUD_ENV_ID` 时，`npm run env:production` 应该失败，这是正确行为。

## 5. 服务矩阵边界

服务模式以 `miniprogram/services/runtime.js` 为准。当前策略是：

| 服务 | development | staging | production |
|---|---|---|---|
| `ad` | mock | mock | real |
| `auth` | mock | mock | cloud |
| `upload` | cloud with mock dev fallback | cloud | cloud |
| `generation` | cloud with mock dev fallback | cloud | cloud |
| `optimization` | cloud with local fallback | cloud | cloud |
| `payment` | mock | cloud（仅明确 Mock 订单） | real（尚未实现） |
| `ar` | mock | mock | real |
| `share` | cloud with mock fallback | cloud with mock fallback | cloud |
| `user` | cloud with local fallback | cloud | cloud |
| `work` | cloud with local fallback | cloud | cloud |
| `entitlement` | mock | cloud | cloud |
| `catalog` | mock | mock | cloud |
| `help` | mock | mock | cloud |

production 配置严格不等于 production 已就绪。当前真实 AR、catalog、help、广告位、微信支付参数都尚未完成，因此必须由 `npm run check:production-readiness` 阻断发布。

## 6. 当前 production 阻塞项

当前阶段 `npm run check:production-readiness` 预期失败，并至少暴露以下阻塞项：

- production cloud env id 仍为 placeholder。
- `production.ar` 配置为 real，但 AR service 非 mock 分支仍返回 `AR_SERVICE_UNAVAILABLE`。
- `production.catalog` 配置为 cloud，但 catalog service 非 mock 分支仍返回 `CATALOG_SERVICE_UNAVAILABLE`。
- `production.help` 配置为 cloud，但 help service 非 mock 分支仍返回 `HELP_SERVICE_UNAVAILABLE`。
- `production.ad` 配置为 real，但 `rewardedVideoAdUnitId` 仍为空。
- `production.payment` 配置为 real，但真实微信支付下单和服务端支付通知确认尚未实现；云函数会拒绝创建 Mock 订单，客户端也不会在 `wx.requestPayment` 成功后自行标记订单为 paid。

这类失败是第 0 阶段的目标结果，表示项目不会在真实能力缺口尚未补齐时被误发布为 production。

## 7. 发布前检查

发布前必须运行：

```bash
npm run release:precheck
```

该命令会先运行普通工程检查，再运行 production readiness。当前阶段整体应失败，失败原因必须来自 production 真实服务缺口。

不要为了让 readiness 通过而把 production 改成 `mock` 或 fallback。`tools/check-runtime-config.mjs` 和 `tools/check-production-readiness.mjs` 都会检查 production 服务矩阵。

支付上线前还必须确认三个支付相关云函数的 `PETMATE_APP_ENV=production` 已配置，并以微信支付服务端通知作为唯一真实支付确认来源。当前代码保留 `wechat_server_notification` 协议名但明确返回 `REAL_PAYMENT_CONFIRMATION_NOT_IMPLEMENTED`，不能通过伪造字段绕过。

## 8. 回滚到开发环境

如果本地被切到 staging 或 production，回到默认开发环境：

```bash
npm run env:development
npm run check
```

确认 `miniprogram/config/env.generated.js` 中 `SELECTED_APP_ENV` 为 `development`。
