---
description: "Web 端电商工作台启动面板与右侧栏实时控制台标签页。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

[English](README.md) | 中文

## 概述

电商工作台的浏览器半部分：Web 侧栏的**电商工作台**入口在主区域打开一个占位启动页，同时本包注册右侧栏的 `live-console` 页面类型。两处界面都是骨架，目前不提供 Host 绑定、远端调用或数据源。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在配置档组合包的 `cordis.patch.yml` 中把本行挂在 Host 行旁边；产品配置档由 `dsh-bundle-ecom-workbench` 插入这两行。组合包挂载后侧栏入口即出现，点击后打开启动页，页面说明能力仍待提供。

`live-console` 标签页类型已注册到右侧栏，但在此骨架中还没有打开入口：后续能力会从启动页或工作台动作按类型（`live-console`）打开它。它的主体和标签标题都是占位内容。

<a id="understand-the-implementation"></a>
## 理解实现

`src/index.ts` 是 Client Loader 挂载的空 Node 半部分；`src/client/index.ts` 是浏览器半部分。启动页注册到 `sidebar.panellist`（ui-sidebar 声明的列表）和键控的 `main` 座位（ui-layout），控制台类型注册到 `ctx.sidebarRightTabs`，其主体与标题分别进入键控的 `sidebar.right.pane.tab` 与 `sidebar.right.pane.tab.title` 座位。每个注册都是通过 `ctx.slots.inject` 建立的效果，因此仅在宿主座位存在时出现，并随插件一起移除。

文案位于 `ecomWorkbench` locale 命名空间：`src/client/locales.ts` 保存随包发布的八种语言字典，组件只接收框架的 `t` 座位——没有任何组件携带产品文案。SVG 图形仅作装饰，侧栏负责该行的可访问名称。

<a id="further-exploration"></a>
## 进一步探索

- [工作台 Host 服务](../workbench-server/README.zh.md)
- [工作台组合包](../bundle-workbench/README.zh.md)

<a id="model-experience"></a>
## 模型体验

### 工作台浏览器界面

#### 模型看到的内容

无。浏览器注册 `ecomWorkbench` 文案字典、侧栏启动入口与 `live-console` 标签页类型；不添加工具 schema、提示词段、上下文贡献或会话事件。

#### Token 影响

无直接 token 影响。

#### KV Cache 影响

不会失效：本包不添加请求 token，因此任何可复用的请求前缀都保持可复用。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **占位页面** — 启动页与控制台主体只显示能力待提供的文案；目前没有数据源、远端调用或工作台动作。
- **没有启动入口** — `live-console` 类型已注册，但此骨架中没有任何入口打开它；后续能力会按类型打开。
- **没有组件测试** — 在占位内容变成真实内容之前，渲染行为没有测试覆盖。

<a id="dev-note"></a>
### 开发备注

无。
