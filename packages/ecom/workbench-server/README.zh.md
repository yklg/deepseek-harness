---
description: "Host 侧电商工作台：Electron 自动化授权、云营只读接入、草稿工具，以及启动页与实时控制台背后的 Remote 表面。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ecom-workbench-server

[English](README.md) | 中文

## 概述

电商工作台的 Host 半部分。`ecom-workbench` 行解析工作台 `Config`，持有 Electron 私有通道上的自动化授权，只读访问云营运营平台，注册三个面向模型的草稿工具，并暴露启动页与实时控制台调用的 `workbench` Remote 命名空间。没有 Electron 通道时，同一行仍可加载，并将自动化报告为不可用。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

从 profile bundle（`cordis.patch.yml`）挂载本行。`dsh-bundle-ecom-workbench` 在产品 profile 中插入它并开启浏览器自动化；其余分组保持默认值。生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-ecom-workbench-server)是字段的完整来源。

### 浏览器自动化

本行依赖 `tools`，并创建 `ctx.workbench`，供后续能力消费的 Host 服务。它通过 Electron Host 的私有 IPC 通道接受 `attach`、`evaluate`、`detach` 与 `targets` 调用：

- `attach` 绑定当前来源匹配请求中精确 origin 或 `*.domain` 规则的浏览器 guest。非空的 `policy.allowedHosts` 会在 broker 收到请求前把每个请求收窄到部署允许的主机名或后缀规则。
- 同一 target 的调用严格串行；不同 target 可并行推进。
- broker 失败保留稳定错误码（`target/not-found`、`target/closed`、`script/timeout`、`result/too-large` 等自动化错误码）。缺少通道报告 `workbench/unavailable`，通道关闭报告 `workbench/disconnected`，超时报告 `workbench/timeout`。
- 目标关闭会发布到实时控制台；无法重新读取的目标数量报告 `null`，而不是陈旧数字。

### 云营只读

配置 `yunying.endpoint` 与 `yunying.workspaceId` 后，适配器向 `/api/agent/dashboard/today`、`/api/agent/products` 与 `/api/agent/comments` 发出签名 `GET` 请求。签名密钥按请求从凭据服务解析（回退到 `signingKeyEnv` 指定的环境变量），轮换无需重启。读取带单次期限、针对网络、`429` 与 `5xx` 的有界重试、响应校验和脱敏诊断：日志只记录方法、路径、尝试次数与耗时。

### 草稿工具与审批

三个工具只生成草稿，从不发送、发布或改动商品。本行还安装高风险工具名 `ecom_send_message`、`ecom_change_price`、`ecom_set_listing` 与 `ecom_set_inventory` 的审批策略：当 `policy.requireApproval` 为真时，下游工具管线允许的调用会变成 `ask` 决策，经 `dsh-user-approval` 交由用户确认。

<a id="understand-the-implementation"></a>
## 理解实现

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | Config、`workbench` 服务、Remote 方法与事件流。 |
| [`src/channel.ts`](src/channel.ts) | 私有 IPC 关联、响应/事件校验、期限与断连降级。 |
| [`src/automation.ts`](src/automation.ts) | 来源白名单、单 target 串行、运行事件与结果编码。 |
| [`src/yunying.ts`](src/yunying.ts) | 签名读取、重试、校验与脱敏日志。 |
| [`src/tools.ts`](src/tools.ts) | 草稿工具与高风险审批策略。 |
| [`src/types.ts`](src/types.ts) | 客户端安全的消息类型与失败码；不含运行时代码。 |

服务是插件的默认导出。浏览器半部分自行挂载生成的 `./remote` 贡献，因此应用组装不需要登记该命名空间。Config 在加载时校验：已配置的云营 endpoint 必须是 origin、必须带 workspace，并校验凭据名；未配置 endpoint 却设置 workspace 会直接失败。

<a id="further-exploration"></a>
## 延伸阅读

- [工作台 UI](../client-ui-workbench/README.zh.md)
- [工作台 bundle](../bundle-workbench/README.zh.md)
- [用户审批](../../interaction/user-approval/README.zh.md)

## 模型体验

<a id="model-experience"></a>

### 工作台工具

#### 模型看到什么

本行加载时出现三个工具 schema：`ecom_draft_product_script`（按商品事实生成带时间的脚本段）、`ecom_draft_quick_replies`（规范化触发词/回复草稿并拒绝重复触发词）、`ecom_draft_comment_reply`（格式化一条评论回复）。每个结果都声明 `draftOnly: true`。日志与结果不携带凭据，本行也不添加提示词段落。

##### Approval prompt

```markdown
The workbench tool "<tool>" sends a message or changes the storefront; approve this single call.
```

#### Token 影响

每次调用都会在会话中携带三个工具 schema 以及模型的参数与草稿结果。工具集存在时，schema 会增加请求 token。

#### KV Cache 影响

加载或卸载本行会改变工具集，因此带它的请求前缀只有在工具集不变时可复用。调用不会改写更早的上下文。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- **没有高风险执行器** — 发送、改价、上下架与库存变更尚未注册工具，因为云营适配器是只读的。审批策略已覆盖这些名称，供后续执行器接入。
- **云营网关契约** — 适配器校验文档化的看板、商品与评论字段；返回其他形状的部署会以 `workbench/yunying-invalid-response` 失败。
- **仅桌面自动化** — 私有通道只存在于 Electron Host。Web、headless 与 SDK profile 会加载本行，但把自动化报告为不可用。
- **暂未消费的配置** — `browser.headless`、`automation`、`ai` 与 `storage` 分组会被校验，但尚无能力读取。
- **草稿仅存在于进程** — 草稿位于工具结果与会话日志中；本包不保留独立草稿存储。

<a id="dev-note"></a>
### 开发备注

无。