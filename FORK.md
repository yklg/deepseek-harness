# 产品分支：电商直播工作台（FORK）

本仓库是 DeepSeek Harness 的产品分支，基线提交为上游 master 源码导入（无上游 git 历史）。
产品目标：把 DSH 桌面端改造为「电商直播工作台」——左浏览器 / 右 AI 对话布局、内置浏览器持久登录、
直播中控自动化（目标授权 broker）、高危操作审批、净衡台（yunying）只读数据接入。

## 补丁面（上游合并时逐块回滚/重放）

| 区域 | 文件 | 改动 | 回滚点 |
|---|---|---|---|
| 产品外壳 | `packages/client/ui-layout/src/client/{AppFrame.tsx,service.ts}`、`packages/client/ui-sidebar/src/client/{index.ts,contract/slots.ts,SidebarRoot.tsx,SidebarRoot.module.css}`、`packages/ecom/client-ui-workbench/src/client/{startup.ts,index.ts,WorkbenchPage.tsx,ConsoleHost.tsx}` + tests | 启动默认工作台 + 默认收起 harness 侧栏；`ILayout.selectStartupPanel` 启动门；frame `--dsh-frame-sidebar-width` 几何变量；可选 `ctx.productNavigation` 紧凑侧栏（隐藏 harness 品牌块与 New Session 主按钮）；产品顶栏 / Hero 平台卡 / 中控窗口化 / 登录态刷新 | 按文件回滚（ui-sidebar 紧凑模式为可选服务，缺省行为不变） |
| 布局互换 | `packages/client/ui-layout/src/client/{columns.ts,AppFrame.tsx,AppFrame.module.css,stores.ts,service.ts,index.ts}` + tests | 列序 `sidebar → rightbar(浏览器/中控) → center(对话)`；列宽常量、拖拽方向、持久化；全屏时 frame 打 `data-window-drag-suppressed`；`shell.console` 常驻宿主座、`ILayout.setSidebar`/`sidebarInfo` | `git revert` 该目录提交 |
| 右栏镜像 | `packages/client/ui-sidebar-right/src/client/shell/{SidebarRight.tsx,SidebarRight.module.css}` + tests | 面板左侧锚定、滑动/隐藏方式、平台全屏规则；全屏面板打 `data-window-drag-surface` | 同上 |
| Desktop 外壳 | `apps/desktop/src/{browser-guests.ts,host-process.ts,main.ts,preload-browser.ts,ipc.ts,project-manager.ts}` + tests | persist 分区、clearStorage、AutomationBroker、profile 迁移 | 按文件回滚 |
| 浏览器小改 | `packages/client/ui-sidebar-browser/src/client/{browser,electron,view,index.ts,locales.ts,surface/BrowserSurface.ts,types.ts}`、`client/web/src/{base.css,window-drag/regions.ts}` | 内嵌网页缩放（per-tab 持久化、toolbar、快捷键、8 语言）；全屏拖拽抑制/恢复标记；`ctx.browserSurface` 服务与 `targetId`/`backgroundThrottling`；README | 按文件回滚 |
| 产品包 | `packages/ecom/*` | 新增，无上游对应 | 删除目录 |
| 品牌/打包 | `apps/desktop/scripts/electron-builder-config.mjs`、`resources/icon*`、`locale.ts`、`.env.windows` | 产品名/图标/打包配置 | 按文件回滚 |
| Web e2e | `apps/web/tests/{sidebar-right,ecom-workbench}.e2e.ts`、`apps/web/tsconfig.json` | 新布局/工作台全链路断言；host-plane 用例排除 | 按文件回滚 |

## 覆盖率口径（与上游差异）

上游 CI 要求 `packages/*/*/src` 逐文件 100% 覆盖；本产品分支**不追齐全量门禁**，执行「定向覆盖率」：
`ui-layout`、`ui-sidebar-right`、`apps/desktop`（broker 相关）、`packages/ecom/*` 的变更面必须有单测。
上游合并前需补齐或调整门禁配置，本文件即偏差声明。

## 构建/运行环境（本机开发）

- Node：`/usr/local/bin/node` v24.18.0（原生 addon 需要开发头文件；`.dsh-bin/env.sh` 固定该 Node 与 pnpm）。
- 安装：`source .dsh-bin/env.sh && pnpm install --frozen-lockfile`
- 产物：`pnpm run build:artifacts`
- 桌面开发：`pnpm run dev:desktop`（隔离 home：`apps/desktop/.desktop-build/development/home`）；只改源码用 `pnpm run start:desktop` 跳过构建。
- primary runtime 缓存：`apps/desktop/.desktop-build/downloads/<sha256>`；本机已缓存 Node 与 Python 归档（Python sha256 `81a359f1cfadd4da11766534c5913791cea55f26e1bb902cacd2a531bb1e4b2b`），wheel 从 `files.pythonhosted.org` 拉取。
- Electron 缓存：`electron_config_cache=$repo/.electron-cache`；缓存键按 npmmirror URL 生成，重装/补 Electron 时带 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`，否则会回源 GitHub。
- Windows 未签名包：在 Windows x64 机器执行 `pnpm run package:desktop:win:x64:unsigned`（需 `.env.windows`，含 appId 与 mandatory-update HTTPS origin）。

## 当前进度

- [x] 源码基线提交 + `product/ecom-workbench` 分支
- [x] 布局互换（ui-layout）：列序 sidebar | browser rail | conversation，`BROWSER_MIN=420`、`CHAT_MIN=400`，手柄位置/方向，Windows 圆角归属（布局互换提交）
- [x] 列宽持久化：`createLayoutStore({ storage })` + `dsh.layout.rightbar`（布局互换提交，测试含写读同 key/损坏复位/写失败降级）
- [x] 右栏镜像（ui-sidebar-right）：push 面板贴轨道左缘（left:0，width 100%）、移除横向 slide（轨道动画驱动）、全屏改 position:fixed 贴视口右缘；CSS 契约/seat/README 已更新；apps/web/tests/sidebar-right.e2e.ts 已按新轨道与 fullscreen 行为更新（W1，2026-11-08）
- [x] Desktop broker / persist 分区（`persist:dsh-sidebar-browser-<sha256>`）/ clearStorage / Host↔Main workbench 协议（新增 `result/too-large` 错误码）；bridge 类型已补 `clearStorage`；Host 侧客户端消费已由 W1-1 完成，真实 Electron 行为验证仍需桌面运行环境
- [x] profile 迁移：product bundle 常量 + `createPluginProfile`/`ensureProfileBundles`（幂等/保留自定义/损坏 fail loud）+ `disableAllPlugins` 恢复列表保留产品 bundle；`apps/cli` 依赖声明产品 bundle
- [x] ecom 包骨架 + bundle：`packages/ecom/{workbench-server,client-ui-workbench,bundle-workbench}`（8 语言 locale、README 三件套、Host Config 六组占位、launcher 面板 + live-console tab 占位）；`tsconfig.host/client` 聚合 + `tsconfig.base.json` 手写别名；`docs/config-catalog` 重新生成。
  - 注：三包为通过 `check-workspace-constraints` 的 release-member 规则，声明 `publishConfig.access=public` + repository（不加 private）；产品发布链路不在本 fork 范围。
  - 注：desktop broker 的 Host 操作名为 `automation/attach|eval|detach|targets`，结果超限错误码 `result/too-large`（计划 v6 只列 `result/not-json`，以实现为准）。
- [x] dev:desktop 手验（2026-11-08）：Python 归档按 SHA 放入 `.desktop-build/downloads/` 后，`pnpm run start:desktop` 成功拉起 `Harness Dev.app`；runtime Office 冒烟通过，desktop profile 含产品 bundle，用户实机确认 Ecom workbench 与 live console 正常。Electron 安装器缓存键对应 npmmirror，重装时需带 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。
- [x] 运行时加载验证（web profile，临时 DSH_HOME）：bundle 两行成功加载，`@deepseek-ai/dsh-client-ui-workbench` 出现在 boot 清单并可取回 client bundle（200）；ego-browser 真实 DOM 验证：侧栏出现「电商工作台」入口，点击后 launcher 面板渲染占位文案（2026-11-08）。
- [x] W1-1 Host workbench 客户端：`channel.ts` 消费 Electron 私有通道（以 `ELECTRON_RUN_AS_NODE=1` 识别真正的 Host，测试进程不误判），`automation.ts` 封装 `attach|evaluate|detach|targets`（部署 origin 白名单、单 target 串行、错误码映射、断连/超时降级），`workbench` Remote 暴露状态、目标、评估与事件流。
- [x] W1-2 launcher + live-console 接线：launcher 显示自动化/云营/目标状态与快捷入口，live-console 订阅 Host 事件流（100 ms 节流、错误态、空态、重连）；快捷入口先回到已选会话（无已选时取最近更新会话）再打开标签页；8 语言文案；DOM 单测。
- [x] W1-3 云营只读适配器：HMAC-SHA256 签名 GET（今日看板/商品/评论）、单次超时、有界重试、响应校验、脱敏日志；凭据经 `ctx.credentials`（环境变量回退）。
- [x] W1-4 AI 草稿工具：`ecom_draft_product_script` / `ecom_draft_quick_replies` / `ecom_draft_comment_reply`，只返回草稿；`ecom_send_message`、`ecom_change_price`、`ecom_set_listing`、`ecom_set_inventory` 的 `tools/pre-execute` 审批策略已就位（当前无写执行器）。
- [x] W1-5 集成验证：`apps/web/tests/ecom-workbench.e2e.ts` 覆盖产品 bundle 的 launcher + live-console + 无桌面通道降级；`apps/web/tests/sidebar-right.e2e.ts` 按新轨道/fullscreen 行为更新（fullscreen 瞬时交接、grip 在轨道右缘、split 前加宽到 980px）。两个文件 23/23 tests PASS（2026-11-08）。
- [x] M0/M1 平台选择 + 常驻中控增量（2026-11-08）：`shell.console` 常驻宿主座、`ctx.browserSurface` 服务（含 `targetId`、per-lease `backgroundThrottling`）、平台注册表/登录探针/偏好存储、`ConsoleController`（surface 生命周期 + 生成号防竞态 + 90s 只读登录探针 + 首个探针等待 dom-ready targetId + 失败 5s 快速重试）、`ConsoleHost` 中控顶栏、`WorkbenchPage` 平台选择区、8 语言平台文案（26 key）。ecom 客户端 8 文件 / 94 tests、workbench-server 5 文件 / 48 tests PASS；定向 tsc/oxlint/i18n/export-jsdoc/依赖/文档门禁 PASS。真实扫码登录、隐藏宿主保活与节流、宿主几何、启动自动进入门未验证，见下节。
- [x] M1 工作台优先改造（2026-11-09）：默认主面板=电商工作台且 harness 侧栏默认收起（`startup.ts` + `ILayout.selectStartupPanel`）；产品顶栏（品牌 / AI 助手 / 导航）；工作台页重做为 Hero 平台卡 + 中控状态 + 今日看板 + 系统状态行；中控窗口化（`left = --dsh-frame-sidebar-width`、`right = 0`）并新增「刷新登录状态 / 导航 / AI 助手」；`ConsoleController.refreshLogin()` + 窗口 focus/visibility 刷新；侧栏自动收起；ui-sidebar 可选 `ctx.productNavigation` 紧凑模式（隐藏品牌块与 New Session 主按钮）。ecom 9 文件 / 115 tests、相关 client 32 文件 / 350 tests；`build:artifacts`、`build:check`、Web e2e 全绿；本机 dev 实例 CDP 验证启动页 / 紧凑侧栏 / 中控全宽与展开导航矩形，见下节。

## W0 验证记录（2026-11-08）

- `pnpm run build:artifacts`：8/8 gates PASS（Host bundle / client compiler / Client bundle / Web build 等）。
- `pnpm run build:check`：host + client aggregate PASS。
- `pnpm run test:gui`：745 files / 13107 passed / 1 skipped（首次失败为 `.dsh-bin/env.sh` 误导出 `DSH_CLIENT_COMMIT_HASH` 污染 fixture；已移除该导出并复跑全绿）。
- 定向测试：ui-layout 142、ui-sidebar-right 323、apps/desktop broker 115、profile 迁移 5、ecom smoke 4、ui-sidebar-browser 68，全部通过。
- 运行时加载 + DOM：临时 `DSH_HOME` 的 web profile 中加入产品 bundle 后，boot 清单含 `@deepseek-ai/dsh-client-ui-workbench/client.js`（HTTP 200），ego-browser 真实页面侧栏出现「电商工作台」，点击后 launcher 占位页渲染。
- 未完成：`dev:desktop` 实机启动（W1 后已由人工补入 Python 归档并完成，见下）；`apps/web` e2e 已在 W1 完成（见下）。

## W1 验证记录（2026-11-08）

- 构建：`pnpm run build:artifacts` 8/8 gates PASS；`pnpm run build:check` host + client aggregate PASS（最终源码复跑）。
- 定向单测：`packages/ecom` 8 个文件 / 68 tests PASS（channel 13、automation 13、yunying 11、tools 7、smoke 4、client source 7、page 7、console 6）。
- 文档门禁：`pnpm run test:docs` 21/21 gates PASS（含 markdown links、translation pairing、repository references、model experience、doc-standard）；`gen-config-catalog --check` up to date；`verify-client-ui-i18n` PASS；`verify-client-packages` / `verify-package-dependencies` PASS。
- 定向 lint：oxlint 对 `packages/ecom` 与两个 e2e 文件 0 problem。
- Electron 实机（2026-11-08）：`pnpm run start:desktop` 拉起 `Harness Dev.app`，Host 子进程加载 desktop profile（base + web-app + ecom-workbench）并监听 127.0.0.1:64476；runtime Office 冒烟通过；用户确认 Ecom workbench 状态与 live console 正常。
- Web e2e（keyless 组装浏览器）：`apps/web/tests/ecom-workbench.e2e.ts` + `apps/web/tests/sidebar-right.e2e.ts`，23/23 tests PASS。ecom 用例证明侧栏入口、Host `workbench` Remote、云营未配置态、live-console 事件流与 web profile 的「自动化不可用」降级全链路可达。本机 Playwright 1.61.1 需要的 Chromium 1228 下载在 0% 卡住，改用缓存 Chromium 1243（临时 `PLAYWRIGHT_BROWSERS_PATH` 符号链接）执行；CI 使用自身固定浏览器。

## W1 深验记录：Electron broker（2026-11-08）

- 新标签打开 `https://example.com` 拿到 lease 后：Host status `available/connected=true`；`attach` 成功返回 targetId；`evaluate document.title` → `"Example Domain"`，`21 * 2` → `42`。
- 单 target 串行：并发两次 evaluate（首个脚本延时 300ms），guest 内顺序为 `["first","second"]`，总耗时 312ms。
- 错误码：missing target → `target/not-found`；脚本返回函数 → `result/not-json`；detach 后 evaluate → `target/not-found`；`targets` → `[]`。
- 修复：`apps/desktop/src/browser-guests.ts` 将 Electron 的 “An object could not be cloned.” 拒绝映射为 `result/not-json`（此前无 code，落到 `workbench/handler-failed` → `workbench/protocol`）；`apps/desktop/tests/browser-guests.spec.ts` 新增用例，18/18 PASS。
- 恢复标签复验（2026-11-08，优雅关闭后重启）：浏览器标签恢复了直播中控地址且 lease 已存在；页面尚未加载时 `attach` 即成功，点“前往”加载后仍是同一 targetId，`evaluate document.title` → `"直播中控台"`，`targets` 列出该 target，`detach` 正常。首个实例的 `target/not-found` 未再复现，更像会话/面板切换期间的瞬时释放，不再按 lease 缺口跟踪。
- 现场：验证用的是 example.com；结束后已把该标签导航回直播中控 URL。

## M0/M1 验证记录：平台选择 + 常驻中控（2026-11-08）

- 单测：`packages/ecom/client-ui-workbench/tests` 8 文件 / 94 tests PASS（platforms 14、platform-preferences 23、console-controller 10、platform-probe 10、console-host 11、page 13、source 7、console 6）；`packages/ecom/workbench-server/tests` 5 文件 / 48 tests PASS。
- 类型：`pnpm exec tsc -b packages/ecom/client-ui-workbench/tsconfig.json packages/ecom/workbench-server/tsconfig.json` PASS。
- 门禁：`verify-client-ui-i18n`（1288 files）、`verify-export-jsdoc`、`verify-client-packages`、`verify-package-dependencies`、`test:docs` PASS；`oxlint` 对 ecom 收改变更 0 problem。
- Web e2e（keyless，均需 `env -u ELECTRON_RUN_AS_NODE`）：`apps/web/tests/ecom-workbench.e2e.ts` 1/1 PASS，覆盖 Web 降级（平台卡禁用、团购占位禁用、desktopOnly 提示、auto-enter 开关可见）与原有 launcher/live-console/无桌面通道路径；`apps/web/tests/sidebar-right.e2e.ts` 22/22 PASS。本机环境注意：会话带有 `ELECTRON_RUN_AS_NODE=1`，否则 Host 误判为 Electron Node-mode，`status` 会等 IPC 应答 20s 后失败。
- `apps/web/tests/window-drag-coverage.e2e.ts` 全文件运行 12/13：三次运行失败点在不同探测点（折叠列 header / 全屏 strip），两个失败探测点单测运行均通过；判定为本机 e2e 环境（缓存 Chromium 1243 与 Playwright 1.61.1 期望 1228 不匹配 + 时序）导致的抖动，非产品回归，最终以 CI 固定浏览器为准。
- 未验证（不得声称闭环）：真实 Electron webview 内抖店/百应扫码登录；隐藏宿主下 webview 是否真保持活跃；`setBackgroundThrottling(false)` 在 macOS App Nap/窗口遮挡下的真实效果；broker attach 中控 guest 的 target 精确匹配（当前按平台 origin attach，同 origin 多 guest 会 `target/ambiguous`）；宿主几何与左导航自动收起；启动时自动进入的启动门；`build:artifacts` / `build:check` / Web e2e 结果见下。
- 交接文档：`HANDOFF.md` 第 3、6、7 节记录了本次落地与剩余阻塞。

## 工作台优先改造验证记录（2026-11-09）

- 单测：`packages/ecom/client-ui-workbench/tests` 9 文件 / 115 tests PASS（startup 6、console-controller 14、console-host 14、page 21、platforms 14、preferences 23、probe 10、source 7、console 6）；`packages/ecom/workbench-server/tests` 48 PASS；`packages/client/ui-layout`+`ui-sidebar`+`ui-sidebar-browser`+`apps/desktop` broker 32 文件 / 350 tests PASS。
- 类型/构建：`tsc -b`（ecom）、`tsc -p tsconfig.client.json`、`build:artifacts`（8/8）、`build:check`（2/2）PASS；`verify-client-ui-i18n`（1289 files）、`verify-export-jsdoc`、`verify-package-readme-summaries`、`verify-translation-pairing` PASS。
- Web e2e（`env -u ELECTRON_RUN_AS_NODE` + 缓存 Chromium）：`apps/web/tests/ecom-workbench.e2e.ts` 1/1 PASS，断言启动即工作台、侧栏默认收起、展开为紧凑侧栏（无 DSH 品牌/New Session）、平台卡 Web 降级、live-console 路径。
- 本机 dev 实例（隔离 home/user-data）CDP 验证：启动主面板=工作台、`data-sidebar-collapsed=true`；打开导航后侧栏无品牌块/新会话按钮；中控激活时 `hostRect.left=0`（侧栏收起）与 `280`（导航展开）；产品顶栏品牌起点 x=160，避让 macOS `shell.leading` 控件（88..152）；`切换平台` 返回产品首页。截图见 `/tmp/final-3-home.png`、`/tmp/dev-new-console.png`、`/tmp/final-2-console-nav.png` 等工作区外临时文件（未入库）。
- 未验证/限制：真实扫码后登录态刷新（需要用户扫码）；`autoEnter` 冷启动自动进中控的真机复核；Windows/Web 收起 rail（56px）视觉；AI 助手返回工作台经导航（无浮动返回按钮）；右栏轨道与中控同时展开时被中控覆盖。

## W1 修复记录：全屏按钮吞点击与内嵌网页缩放（2026-11-08）

- **Bug 1（全屏右上角按钮无反应）**：根因是 Electron 的 `-webkit-app-region` 按几何 + DOM 顺序合成，不看层叠；全屏面板的三个控件被文档顺序更靠后的会话头拖拽行盖住，原生按下被当作拖窗口。修复：ui-web 发布 `SUPPRESS_MARK`/`SURFACE_MARK`；全屏时 frame 打 `data-window-drag-suppressed`，面板打 `data-window-drag-surface`；base.css 丢弃被覆盖行的 drag 盒（`initial`），并让面板自身被标记的行恢复 drag。面板 strip 仍可拖，控件保持 `no-drag`。
- **Bug 2（内嵌网页不能缩放）**：`BrowserFrameState` 增加 `zoomFactor`，`BrowserFrame` 增加可选 `BrowserZoomControl`；`ElectronWebViewImpl` 在 dom-ready / did-navigate / 重新挂载时施加 `setZoomFactor`（50–300%，10% 步进）；`BrowserTabState.zoom` 随导航检查点持久化；toolbar 增加「缩小 / 当前百分比（点击重置）/ 放大」；桌面快捷键 `browser.zoom.in|out|reset` 绑定 `primary+alt+=/-/0`（`primary+=/-` 已被应用字号占用）；8 语言文案。Web iframe 不支持页面缩放，toolbar 隐藏该组。
- 单测：`ui-sidebar-browser` 12 文件 / 55 tests；`ui-layout`、`ui-sidebar-right`、`ui-web`、`ui-theme` 定向用例全绿（app-region 门禁改为接受「基础标记 + surface 恢复」两条 drag 规则）。
- Web e2e：`window-drag-coverage.e2e.ts` 13/13 PASS（面板测试内加入全屏断言：被覆盖 header 退出合成、strip 可拖、两个面板控件与 `swallowedBoxes` 全绿）；`sidebar-right` 22、`sidebar-browser` 1、`ecom-workbench` 1，24/24 PASS。
- 构建/门禁：`build:artifacts` 8/8、`build:check` 2/2、`test:docs` 21/21、`verify-client-ui-i18n` PASS、定向 oxlint 0。
- Electron 实机（独立端口 9322 的第二实例，DSH_HOME 隔离）：toolbar 100% → 110% → 120% → 重置 100%；guest `devicePixelRatio` 2 → 2.4、`innerWidth` 576 → 480，重置后回到 2 / 576；刷新后仍保持 110%，localStorage 检查点含 `"zoom":1.1`；全屏时 frame `data-window-drag-suppressed`、面板 `data-window-drag-surface` 均为 true，会话头计算值为 `none`、面板 strip 为 `drag`、关闭/退出全屏/收起三控件为 `no-drag` 且命中测试落在控件内。
- 未验证/限制：原生物理点击三按钮已由用户实机确认（2026-11-08：全屏下「退出全屏」「收起右侧边栏」「关闭」均生效）；缩放快捷键只在宿主页面持有键盘焦点时生效（焦点在 guest 内时用 toolbar），已写入 README 已知限制。
- 顺带修复：W1 自增样式触发 ui-theme scrollbar 门禁（`LiveConsoleTab .error`、`WorkbenchPage .metric` 改用非 elevated 底色）；`window-drag-coverage` 面板落位断言原先误比 `innerWidth`，改为轨道右缘，并在折叠用例先等 header `x==0` 再取样。

## 下一步（W1 之后）

1. **高风险写执行器**：发送、改价、上下架、库存需要云营写 API；审批策略已接入，执行器落地时复用 `ecom_*` 工具名。
2. **其余 web 快照/全量 GUI**：`test:web` 全量与 `test:gui` 交给 CI；本机已跑受影响的 e2e 与 ecom 定向单测。
3. **产品打包/品牌**：按「补丁面」表继续维护桌面打包、图标与 Windows 未签名包。
