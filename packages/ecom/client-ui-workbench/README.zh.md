---
description: "Web 电商工作台启动页与右侧栏实时控制台，以及它们的 Remote 挂载与共享存储。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

[English](README.md) | 中文

## 概述

电商工作台的浏览器半部分：Web 侧栏的 **电商工作台** 入口在主区域打开启动页，同时本包注册右侧栏的 `live-console` 页面类型。启动页显示自动化状态、云营今日看板，以及通往控制台与浏览器标签页的快捷入口。控制台流式显示自动化运行与浏览器生命周期事件。两处界面都读取 Host 的 `workbench` Remote 命名空间，其生成贡献由本包自行挂载。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在 profile bundle 中把本行挂在 Host 行旁；`dsh-bundle-ecom-workbench` 会插入两行。本包依赖 Remote 传输、文案与插槽注册表、右侧栏标签注册表，以及侧栏导航服务，Web 与桌面 profile 均会提供。

- 启动页报告自动化是否已启用、可用、已连接，已接入多少目标，云营是否已配置，以及配置后的看板指标。刷新控件会重新读取状态与看板。
- 快捷入口会先回到已选会话（没有已选会话时取最近更新的已列会话），再在该会话中打开实时控制台或浏览器标签页，因为右侧栏按会话放置标签页。没有会话时，启动页显示本地化提示。
- 控制台先重放 Host 的有界历史，再跟随实时事件流。它显示连接状态、运行开始与结束、目标关闭，以及停止的事件流与重新连接操作。
- 文案位于 `ecomWorkbench` 命名空间，随包发布八种语言。

<a id="understand-the-implementation"></a>
## 理解实现

`src/client/index.ts` 先挂载生成的 `./remote` 贡献，再注册字典、侧栏入口、启动页、控制台类型与两个 keyed 标签页座位。快捷入口从 `uiSession` 读取已选会话，经 `uiWorkspace` 回到该会话，等待右侧栏报告该会话后再打开标签页。每个注册都是 effect，因此卸载时先撤下 UI，再撤下 Remote。

`src/client/source.ts` 持有共享的状态、看板与事件存储。第一个订阅的界面会打开 Host 事件流并读取两个一元表面；最后一个订阅者离开时关闭它们。事件折叠进有界列表，并以 100 毫秒节流发布。传输重置会重新打开事件流并重读状态；手动重连会重新打开在控制台仍可见时结束的事件流。

`src/index.ts` 是 Client loader 挂载的空 Node 半部分。组件只接收框架插槽、注入的存储与 `t` 座位；没有组件携带产品文案。侧栏图标是装饰性的。

<a id="further-exploration"></a>
## 延伸阅读

- [工作台 Host 服务](../workbench-server/README.zh.md)
- [工作台 bundle](../bundle-workbench/README.zh.md)

## 模型体验

<a id="model-experience"></a>

### 工作台浏览器界面

#### 模型看到什么

无。浏览器只注册文案字典、侧栏入口、启动页与 `live-console` 标签页；不添加工具 schema、提示词段落、上下文贡献或会话事件。

#### Token 影响

无直接 token 影响。

#### KV Cache 影响

不会失效：本包不添加请求 token，因此任何可复用的请求前缀保持可复用。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- **只看状态，不做控制** — 启动页读取自动化状态并打开标签页；它不启动、暂停或取消运行。
- **标签页跟随会话** — 两个快捷入口都需要已选会话，并会先离开启动页回到该会话，再打开标签页。
- **仅进程内历史** — 控制台历史来自 Host 进程并随其重置；浏览器最多保留 200 帧。
- **没有事件上行** — 控制台只观察运行，不向 Host 事件流发回命令。

<a id="dev-note"></a>
### 开发备注

无。