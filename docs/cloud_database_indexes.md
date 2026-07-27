# Petmate 云数据库索引规则

## 机器事实源

索引名称、集合、字段顺序、排序方向、`unique`、是否必需以及默认系统索引的唯一事实源是：

```text
config/cloud-database-indexes.json
```

本文只说明检查方式和维护边界，不再复制索引明细。修改索引要求时必须先更新 JSON，再运行离线测试；不要只修改 Markdown。

JSON 规则：

- `direction = 1` 表示升序，`direction = -1` 表示降序。
- `required = true` 表示目标环境必须存在。
- `unique` 必须与远端完全一致。
- 键按数组顺序比较，字段相同但顺序不同仍判定失败。
- `_id_` 与 `_openid_1` 是每个受管集合必需的系统索引，缺失或属性错误判定失败。
- 未在 JSON 中声明的多余索引只告警，不自动删除。

### 优化预占索引的运行语义

`optimizeReservations` 的索引定义仍以机器事实源为准。部署人员还需保留以下业务约束：

- 定时清理只扫描 `status = reserved` 且 `expiresAt` 已过期的记录。
- 生成任务绑定时间记录在 `boundAt`，用于判断预占与任务的关联阶段。
- 释放原因记录在服务端控制的 `releaseReason`，客户端不能自行指定可信释放原因。

## 只读自动检查

安装依赖后设置环境变量：

```powershell
$env:TENCENTCLOUD_SECRET_ID = "<只读子账号 SecretId>"
$env:TENCENTCLOUD_SECRET_KEY = "<只读子账号 SecretKey>"
$env:PETMATE_CLOUD_ENV_ID = "<目标 CloudBase 环境 ID>"
$env:PETMATE_APP_ENV = "development" # 可选

npm run check:cloud-indexes
```

发布检查入口：

```text
npm run check:deployment
```

脚本只显示目标环境 ID，不显示 Secret。缺少凭证、环境不存在、数据库不可用、集合或必要索引缺失、字段顺序/方向/unique 错误、索引明确处于构建中或异常状态时退出码为非 0。

第一版不会创建、修改或删除集合与索引。任何修复仍需开发者在目标 CloudBase 控制台中人工执行，执行前先备份并确认环境。

## 官方 Provider

检查器使用腾讯云官方 Node.js SDK 和 TCB API `2018-06-08`：

1. [`DescribeEnvs`](https://cloud.tencent.com/document/api/876/34820)：确认环境、地域和文档数据库实例。
2. [`DescribeTables`](https://cloud.tencent.com/document/api/876/127962)：分页读取真实集合。
3. [`DescribeTable`](https://cloud.tencent.com/document/api/876/127966)：读取每个集合的索引名称、`Keys` 顺序/方向和 `Unique`。

远端调用统一隔离在 `tools/cloud-indexes/provider.mjs`。不得通过抓取控制台页面、非官方接口或写操作替代。

### 状态限制

官方 `DescribeTable` 当前公开响应包含 `Name / Keys / Unique`，没有索引构建状态字段。因此：

- Provider 将官方缺失状态标准化为 `unknown` 并明确告警，不伪造 `ready`。
- 若未来官方响应提供状态，`ready / normal / active / available` 视为可用。
- `building / creating / pending / initializing` 或其他异常状态判定失败。
- 状态缺失不会掩盖名称、字段顺序、方向或 unique 的错误。

## 最小权限

应使用 CAM 子账号，按最小权限只授予：

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "tcb:DescribeEnvs",
        "tcb:DescribeTables",
        "tcb:DescribeTable"
      ],
      "resource": ["*"]
    }
  ]
}
```

腾讯云的 [CloudBase CAM 操作列表](https://cloud.tencent.com/document/product/598/98174) 将这些操作列为查询能力。不要使用主账号长期密钥，不要授予 `CreateTable / UpdateTable / DeleteTable / RunCommands`，也不要把凭证写入仓库或配置文件。

## 离线验证

```text
npm run test:cloud-indexes
npm run check
```

单元测试只使用固定夹具，不访问真实云环境。普通 `npm run check` 不包含真实云检查，避免在开发机或 CI 中隐式依赖凭证和网络。

## 维护流程

1. 修改 `config/cloud-database-indexes.json`。
2. 补充或更新 `tests/cloud-indexes` 的比较夹具。
3. 运行 `npm run test:cloud-indexes` 和 `npm run check`。
4. 用只读子账号对 development、staging、production 分别运行 `npm run check:cloud-indexes`。
5. 如检查失败，人工修正目标环境后重新运行；脚本不会代替人工写入。
