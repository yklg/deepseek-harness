---
description: "Web 电商工作台：平台卡产品首页、桌面端常驻中控表面、紧凑 harness 导航，以及右侧栏实时控制台标签页。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

[English](README.md) | 中文

## 概述

电商工作台的浏览器半部分，也是产品首页。它在启动时打开，为每个已上线平台（抖店、巨量百应）显示一张卡，并在常驻浏览器表面中打开该平台的官方登录页或中控；切换到其他主面板时该表面保持挂载。产品顶栏可进入 AI 会话与紧凑的 harness 导航；页面保留云营看板与一行低调的系统状态。所有界面都读取 Host 的 `workbench` Remote 命名空间，其生成贡献由本包自行挂载。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在 profile bundle 中把本行挂在 Host 行旁；`dsh-bundle-ecom-workbench` 会插入两行。本包依赖 Remote 传输、文案、插槽与布局注册表、右侧栏标签注册表、侧栏导航服务，以及 `ctx.browserSurface` 提供者，Web 与桌面 profile 均会提供。

- **工作台优先**：启动时主面板就是电商工作台，harness 侧栏默认收起。本包提供可选服务 `ctx.productNavigation = { compact: true }`，因此展开侧栏时隐藏 harness 品牌块与「新会话」按钮，但保留面板行、工作区/会话列表与设置。
- 产品顶栏包含工作台品牌、切到会话主面板的 **AI 助手** 动作，以及 harness 侧栏的 **导航** 开关。选择任意主面板后侧栏会再次收起。
- 页面为每个已上线平台显示一张 Hero 卡、一个禁用的抖音团购占位，以及 **启动时自动进入** 开关。选择结果与开关保存在本机 localStorage；开启自动进入时，启动会直接打开上次使用的平台。
- 进入平台时，在该平台的持久分区上打开登录页，或恢复上次登录态中记住的中控地址。分区键为 `platform:<platformId>:<accountId>`，因此两个平台各自保留登录态，重启后仍然有效。
- 中控座位由 frame 定位到侧栏边界；座位、顶栏与内嵌页面跟随侧栏 track 的 toggle 动效。顶栏包含平台名称、探测到的登录态、页面缩放（`−`、百分比、`+`；默认 80%，范围 50%–300%，步进 10%，点击百分比回 100%）、**刷新登录状态**、**AI 助手**、**切换平台**，以及失败后的重试。缩放只作用于内嵌页面，仅限桌面端；平台表面被替换时回到 100%，当 guest 获得焦点时，Cmd/Ctrl+=、Cmd/Ctrl+- 与 Cmd/Ctrl+0 可步进或重置页面缩放，Cmd/Ctrl+滚轮也可步进；toolbar 仍是可发现路径。切换到其他主面板时该座位保持挂载；切换控制台视图时先滑出再以 `visibility` 隐藏，产品不再渲染第二个导航开关；桌面端 guest 关闭后台节流运行。
- 只读探针通过 Host 自动化 broker 大约每 90 秒执行一次平台适配器脚本，并在窗口重新获得焦点或用户刷新登录态时立即执行。它报告 `in`、`out` 或 `unknown`；控制台不会把无法读取的页面当作已登录。
- 云营看板、实时控制台标签页与浏览器标签页保持原有行为，入口放在低调的系统状态行；快捷入口会先回到已选会话，再打开对应标签页。
- Web 端平台卡禁用并显示本地化的桌面端提示；工作台页面其余部分照常工作。
- 文案位于 `ecomWorkbench` 命名空间并合并平台字典，随包发布八种语言。

<a id="understand-the-implementation"></a>
## 理解实现

`src/client/index.ts` 先挂载生成的 `./remote` 贡献，提供紧凑产品导航服务，再创建一个长期存活的 `ConsoleController` 与一个平台偏好存储。打开平台时记住选择、读取记住的中控地址，并让控制器打开表面；登录态下到达的中控地址会写回，作为下次的恢复点。窗口聚焦与文档可见性变化会重读登录态，主面板切换会收起导航侧栏。每个注册都是 effect，因此卸载时先撤下 UI，再由控制器释放表面。

`src/client/startup.ts` 负责启动决策：选中工作台主面板一次、收起 harness 侧栏，并在开启自动进入且存在上次平台时，于首帧之后打开该平台。用户抢先导航时以用户为准。

`src/client/ConsoleController.ts` 持有当前 `BrowserSurface`、它的挂载座位、探针定时器与发布的 `ConsoleSnapshot`（`view`、`phase`、`platformId`、`loginState`、`checking`、`url` 与错误）。一个 generation 计数丢弃被更新的打开或释放取代的探针与表面创建。`refreshLogin()` 在控制台重新可见或窗口获得焦点时安排一次立即探针。切换平台时先释放座位挂载再销毁上一个表面；显示平台列表时保持当前表面存活。

`src/client/platforms.ts` 声明平台注册表：登录与首页 URL、允许的 origin、只读探针脚本、存储键与登录态判定。`src/client/platform-probe.ts` 通过 Host 自动化 broker 绑定平台 origin、执行探针脚本、在 wire 边界校验返回的 JSON，并且总是释放目标。`src/client/platform-preferences.ts` 逐字段校验持久化值，以内存快照为准。

`src/client/ConsoleHost.tsx` 是 `shell.console` 座位的占位者。它按 frame 发布的侧栏宽度定位自身，从主面板选择与控制器视图派生可见性，渲染中控顶栏与单条状态行，并把表面挂载到稳定的视口元素中；该元素的寿命与表面替换无关。

`src/client/WorkbenchPage.tsx` 渲染产品首页：顶栏、平台 Hero 卡、自动进入行、中控与看板卡，以及系统状态行。`src/client/source.ts` 持有共享的状态、看板与事件存储。第一个订阅的界面会打开 Host 事件流并读取两个一元表面；最后一个订阅者离开时关闭它们。事件折叠进有界列表，并以 100 毫秒节流发布。

`src/index.ts` 是 Client loader 挂载的空 Node 半部分。组件只接收框架插槽、注入的存储与 `t` 座位；没有组件携带产品文案。侧栏图标是装饰性的。

<a id="further-exploration"></a>
## 延伸阅读

- [工作台 Host 服务](../workbench-server/README.zh.md)
- [工作台 bundle](../bundle-workbench/README.zh.md)
- [Web 浏览器表面服务](../../client/ui-sidebar-browser/README.zh.md)
- [Harness 侧栏](../../client/ui-sidebar/README.zh.md)

## 模型体验

<a id="model-experience"></a>

### 工作台浏览器界面

#### 模型看到什么

无。浏览器只注册文案字典、侧栏入口、产品首页、平台中控座位与 `live-console` 标签页；不添加工具 schema、提示词段落、上下文贡献或会话事件。

#### Token 影响

无直接 token 影响。

#### KV Cache 影响

不会失效：本包不添加请求 token，因此任何可复用的请求前缀保持可复用。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- **只看状态，不做控制** — 工作台读取自动化状态并打开中控表面；它不启动、暂停或取消运行，也从不写入平台页面。
- **AI 助手的返回路径** — 切到会话后 harness 侧栏保持收起；回到工作台需通过导航开关或 Cmd+B。
- **紧凑侧栏仅改变呈现** — 隐藏品牌块与「新会话」按钮不会移除 harness 的工作区/会话列表；macOS 侧栏完全隐藏时，窗口 chrome 控件仍可能提供「新会话」。
- **右侧浏览器轨道** — 轨道默认收起；中控使用期间打开的轨道会被中控表面覆盖，因为中控右边缘贴窗口。
- **探针按 origin 绑定** — 探针绑定平台 origin 上的唯一 guest。桌面端若另有同平台 origin 的 guest，绑定会以 ambiguous 失败，而不是按 target 身份选中中控 guest。
- **中控仅桌面端可用** — Web 端保留平台卡并把中控标记为桌面端专用；内嵌页面本身需要 Electron。
- **每平台单账号** — 存储键预留了 `accountId`，但已交付界面始终使用 `default`。
- **仅进程内历史** — 实时控制台历史来自 Host 进程并随其重置；浏览器最多保留 200 帧。
- **没有事件上行** — 实时控制台只观察运行，不向 Host 事件流发回命令。

<a id="dev-note"></a>
### 开发备注

无。
