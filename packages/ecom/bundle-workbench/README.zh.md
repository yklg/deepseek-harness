---
description: "电商工作台 bundle：提供工作台界面的 Host 行与 Web UI 行。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-bundle-ecom-workbench

[English](README.md) | 中文

## 概述

电商工作台的组合载体。它的 `cordis.patch.yml` 向 profile 插入两行：`ecom-workbench-server` 挂载开启浏览器自动化的 Host 服务，`ecom-workbench-ui` 挂载浏览器启动页与实时控制台标签页。bundle 自身不持有行为；每一行的包持有自己的注册。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

把 bundle 安装进 profile 并启用。两行以固定 id 插入，因此 profile 补丁可按 id 修改任一行的配置或禁用它；某行若没有 profile 需要，可以保持禁用而不必卸载 bundle。

插入的 Host 行以 `browser.enabled: true` 启动，使桌面产品 profile 可以驱动浏览器 guest。没有 Electron 私有通道的 profile 仍会加载两行；Host 把自动化报告为不可用，UI 在启动页与控制台中说明这一点。

<a id="understand-the-implementation"></a>
## 理解实现

`src/index.ts` 不导出内容；本包的全部贡献是 `cordis.patch.yml`，由 `package.json` 的 `dsh.bundle.patch` 指定。它的两个 `insert` 行以 workspace 包作为 npm 依赖，因此 profile 启动时能从 bundle 清单解析两个名称。

<a id="further-exploration"></a>
## 延伸阅读

- [工作台 Host 服务](../workbench-server/README.zh.md)
- [工作台 UI](../client-ui-workbench/README.zh.md)

## 模型体验

<a id="model-experience"></a>

### 组合的工作台行

#### 模型看到什么

Host 行的三个草稿工具：`ecom_draft_product_script`、`ecom_draft_quick_replies` 与 `ecom_draft_comment_reply`。浏览器行不添加任何模型可见内容。bundle 自身不添加提示词段落、上下文贡献或会话事件。

#### Token 影响

bundle 加载时，Host 行的工具 schema 与草稿会进入请求。

#### KV Cache 影响

加载或卸载 bundle 会改变工具集，因此带它的请求前缀只有在同一组行保持加载时可复用。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- **仅桌面自动化** — 没有 Electron Host 的 profile 会加载两行，但把自动化报告为不可用。
- **只有一项配置预设** — bundle 只开启浏览器自动化；其他工作台设置保持包默认值，直到 profile 按 id 打补丁。
- **未挂载到出厂的 Web profile** — 本产品 bundle 需显式启用；上游 Web profile 不包含它。

<a id="dev-note"></a>
### 开发备注

无。