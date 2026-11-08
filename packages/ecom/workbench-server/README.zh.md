---
description: "电商工作台组合包的 Host 侧配置与服务主体。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ecom-workbench-server

[English](README.md) | 中文

## 概述

电商工作台的 Host 半部分。`ecom-workbench` Cordis 行解析工作台的 `Config` 各组：运营平台、浏览器自动化、自动化限制、AI 辅助、动作策略与记录存储；目前不注册任何运行时行为，能力包接入时再消费这些配置组。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在配置档组合包（`cordis.patch.yml`）中挂载该行，并在其中填写工作台配置。所有配置组都是可选的：省略的组解析为默认值，因此只开启该行也能工作。产品配置档由 `dsh-bundle-ecom-workbench` 插入此行。

该行在加载时用 schemastery 校验取值；超出 schema 的取值会使加载失败，而不是静默回退。凭据与部署相关的端点属于配置档配置，不属于本包。

<a id="understand-the-implementation"></a>
## 理解实现

`src/index.ts` 导出函数插件形态（`name`、`Config`、`apply`）。`apply` 有意留空：该行存在的意义是让 `Config` 可以从 `cordis.yml` 到达，后续能力包在这里添加注册。本包不提供服务、工具、事件或 UI 贡献。

<a id="further-exploration"></a>
## 进一步探索

- [工作台 UI](../client-ui-workbench/README.zh.md)
- [工作台组合包](../bundle-workbench/README.zh.md)

<a id="model-experience"></a>
## 模型体验

### 工作台 Host 配置

#### 模型看到的内容

无。`ecom-workbench` 行不注册工具、提示词段、上下文贡献或会话事件，因此无论该行是否加载，模型请求都相同。

#### Token 影响

无直接 token 影响。

#### KV Cache 影响

不会失效：本包不添加请求 token，因此任何可复用的请求前缀都保持可复用。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **占位插件主体** — `apply` 尚未注册任何内容；能力包负责工作台的各项工具、配置档与副作用，此行只解析它们的配置组。
- **不处理凭据** — 配置接受端点与工作区标识，但不保存密钥；需要凭据的能力通过现有凭据服务传入。
- **能力就绪前配置未被使用** — 取值在加载时校验，但目前没有消费者读取，因此在此骨架中修改取值没有运行时效果。

<a id="dev-note"></a>
### 开发备注

无。
