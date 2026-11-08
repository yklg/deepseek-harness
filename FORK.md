# 产品分支：电商直播工作台（FORK）

本仓库是 DeepSeek Harness 的产品分支，基线提交为上游 master 源码导入（无上游 git 历史）。
产品目标：把 DSH 桌面端改造为「电商直播工作台」——左浏览器 / 右 AI 对话布局、内置浏览器持久登录、
直播中控自动化（目标授权 broker）、高危操作审批、净衡台（yunying）只读数据接入。

## 补丁面（上游合并时逐块回滚/重放）

| 区域 | 文件 | 改动 | 回滚点 |
|---|---|---|---|
| 布局互换 | `packages/client/ui-layout/src/client/{columns.ts,AppFrame.tsx,AppFrame.module.css,stores.ts}` + tests | 列序 `sidebar → rightbar(浏览器/中控) → center(对话)`；列宽常量、拖拽方向、持久化 | `git revert` 该目录提交 |
| 右栏镜像 | `packages/client/ui-sidebar-right/src/client/shell/SidebarRight.module.css` + tests | 面板左侧锚定、滑动/隐藏方式、平台全屏规则 | 同上 |
| Desktop 外壳 | `apps/desktop/src/{browser-guests.ts,host-process.ts,main.ts,preload-browser.ts,ipc.ts,project-manager.ts}` + tests | persist 分区、clearStorage、AutomationBroker、profile 迁移 | 按文件回滚 |
| 浏览器小改 | `packages/client/ui-sidebar-browser/README.md`（及后续 guide 清理入口） | 文档/清理入口 | 按文件回滚 |
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
- 桌面开发：`pnpm run dev:desktop`（隔离 home：`apps/desktop/.desktop-build/development/home`）
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
- [ ] dev:desktop 手验（环境阻塞：`dev.ts` 需要 primary runtime 的 Python 归档，GitHub release assets 在当前网络不可达/超时，镜像 500/403；Electron 二进制已装好。属网络限制，非代码缺陷；在有可用网络的机器上执行 `pnpm run dev:desktop` 即可完成）
- [x] 运行时加载验证（web profile，临时 DSH_HOME）：bundle 两行成功加载，`@deepseek-ai/dsh-client-ui-workbench` 出现在 boot 清单并可取回 client bundle（200）；ego-browser 真实 DOM 验证：侧栏出现「电商工作台」入口，点击后 launcher 面板渲染占位文案（2026-11-08）。
- [x] W1-1 Host workbench 客户端：`channel.ts` 消费 Electron 私有通道（以 `ELECTRON_RUN_AS_NODE=1` 识别真正的 Host，测试进程不误判），`automation.ts` 封装 `attach|evaluate|detach|targets`（部署 origin 白名单、单 target 串行、错误码映射、断连/超时降级），`workbench` Remote 暴露状态、目标、评估与事件流。
- [x] W1-2 launcher + live-console 接线：launcher 显示自动化/云营/目标状态与快捷入口，live-console 订阅 Host 事件流（100 ms 节流、错误态、空态、重连）；快捷入口先回到已选会话（无已选时取最近更新会话）再打开标签页；8 语言文案；DOM 单测。
- [x] W1-3 云营只读适配器：HMAC-SHA256 签名 GET（今日看板/商品/评论）、单次超时、有界重试、响应校验、脱敏日志；凭据经 `ctx.credentials`（环境变量回退）。
- [x] W1-4 AI 草稿工具：`ecom_draft_product_script` / `ecom_draft_quick_replies` / `ecom_draft_comment_reply`，只返回草稿；`ecom_send_message`、`ecom_change_price`、`ecom_set_listing`、`ecom_set_inventory` 的 `tools/pre-execute` 审批策略已就位（当前无写执行器）。
- [x] W1-5 集成验证：`apps/web/tests/ecom-workbench.e2e.ts` 覆盖产品 bundle 的 launcher + live-console + 无桌面通道降级；`apps/web/tests/sidebar-right.e2e.ts` 按新轨道/fullscreen 行为更新（fullscreen 瞬时交接、grip 在轨道右缘、split 前加宽到 980px）。两个文件 23/23 tests PASS（2026-11-08）。

## W0 验证记录（2026-11-08）

- `pnpm run build:artifacts`：8/8 gates PASS（Host bundle / client compiler / Client bundle / Web build 等）。
- `pnpm run build:check`：host + client aggregate PASS。
- `pnpm run test:gui`：745 files / 13107 passed / 1 skipped（首次失败为 `.dsh-bin/env.sh` 误导出 `DSH_CLIENT_COMMIT_HASH` 污染 fixture；已移除该导出并复跑全绿）。
- 定向测试：ui-layout 142、ui-sidebar-right 323、apps/desktop broker 115、profile 迁移 5、ecom smoke 4、ui-sidebar-browser 68，全部通过。
- 运行时加载 + DOM：临时 `DSH_HOME` 的 web profile 中加入产品 bundle 后，boot 清单含 `@deepseek-ai/dsh-client-ui-workbench/client.js`（HTTP 200），ego-browser 真实页面侧栏出现「电商工作台」，点击后 launcher 占位页渲染。
- 未完成：`dev:desktop` 实机启动（网络无法获取 primary runtime 的 Python 归档；Electron 二进制已装）。`apps/web` e2e 已在 W1 完成（见下）。

## W1 验证记录（2026-11-08）

- 构建：`pnpm run build:artifacts` 8/8 gates PASS；`pnpm run build:check` host + client aggregate PASS（最终源码复跑）。
- 定向单测：`packages/ecom` 8 个文件 / 68 tests PASS（channel 13、automation 13、yunying 11、tools 7、smoke 4、client source 7、page 7、console 6）。
- 文档门禁：`pnpm run test:docs` 21/21 gates PASS（含 markdown links、translation pairing、repository references、model experience、doc-standard）；`gen-config-catalog --check` up to date；`verify-client-ui-i18n` PASS；`verify-client-packages` / `verify-package-dependencies` PASS。
- 定向 lint：oxlint 对 `packages/ecom` 与两个 e2e 文件 0 problem。
- Web e2e（keyless 组装浏览器）：`apps/web/tests/ecom-workbench.e2e.ts` + `apps/web/tests/sidebar-right.e2e.ts`，23/23 tests PASS。ecom 用例证明侧栏入口、Host `workbench` Remote、云营未配置态、live-console 事件流与 web profile 的「自动化不可用」降级全链路可达。本机 Playwright 1.61.1 需要的 Chromium 1228 下载在 0% 卡住，改用缓存 Chromium 1243（临时 `PLAYWRIGHT_BROWSERS_PATH` 符号链接）执行；CI 使用自身固定浏览器。

## 下一步（W1 之后）

1. **Electron 实机**：`dev:desktop` 需要 primary runtime 的 Python 归档（当前网络不可达；Electron 二进制已装）；网络可用后在桌面进程验证私有通道、真实 broker 行为与窗口/登录持久化。
2. **高风险写执行器**：发送、改价、上下架、库存需要云营写 API；审批策略已接入，执行器落地时复用 `ecom_*` 工具名。
3. **其余 web 快照/全量 GUI**：`test:web` 全量与 `test:gui` 交给 CI；本机已跑受影响的两个 e2e 与 ecom 定向单测。
4. **产品打包/品牌**：按「补丁面」表继续维护桌面打包、图标与 Windows 未签名包。
