# 产品分支：电商直播工作台（FORK）

本仓库是 DeepSeek Harness 的产品分支，基线提交为上游 master 源码导入（`a14755b`，无上游 git 历史）。
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
- [x] 布局互换（ui-layout）：列序 sidebar | browser rail | conversation，`BROWSER_MIN=420`、`CHAT_MIN=400`，手柄位置/方向，Windows 圆角归属（afb75c83）
- [x] 列宽持久化：`createLayoutStore({ storage })` + `dsh.layout.rightbar`（afb75c83，测试含写读同 key/损坏复位/写失败降级）
- [x] 右栏镜像（ui-sidebar-right）：push 面板贴轨道左缘（left:0，width 100%）、移除横向 slide（轨道动画驱动）、全屏改 position:fixed 贴视口右缘；CSS 契约/seat/README 已更新。注意 apps/web/tests/sidebar-right.e2e.ts 仍按旧 slide 断言，W4 随 test:web 快照一起更新
- [x] Desktop broker / persist 分区（`persist:dsh-sidebar-browser-<sha256>`）/ clearStorage / Host↔Main workbench 协议（新增 `result/too-large` 错误码）；bridge 类型已补 `clearStorage`。未做：Host 侧客户端消费、真实 Electron 行为验证
- [x] profile 迁移：product bundle 常量 + `createPluginProfile`/`ensureProfileBundles`（幂等/保留自定义/损坏 fail loud）+ `disableAllPlugins` 恢复列表保留产品 bundle；`apps/cli` 依赖声明产品 bundle
- [x] ecom 包骨架 + bundle：`packages/ecom/{workbench-server,client-ui-workbench,bundle-workbench}`（8 语言 locale、README 三件套、Host Config 六组占位、launcher 面板 + live-console tab 占位）；`tsconfig.host/client` 聚合 + `tsconfig.base.json` 手写别名；`docs/config-catalog` 重新生成。
  - 注：三包为通过 `check-workspace-constraints` 的 release-member 规则，声明 `publishConfig.access=public` + repository（不加 private）；产品发布链路不在本 fork 范围。
  - 注：desktop broker 的 Host 操作名为 `automation/attach|eval|detach|targets`，结果超限错误码 `result/too-large`（计划 v6 只列 `result/not-json`，以实现为准）。
- [ ] dev:desktop 手验（进行中：Electron 二进制下载后启动）
- [x] 运行时加载验证（web profile，临时 DSH_HOME）：bundle 两行成功加载，`@deepseek-ai/dsh-client-ui-workbench` 出现在 boot 清单并可取回 client bundle（200）；ego-browser 真实 DOM 验证：侧栏出现「电商工作台」入口，点击后 launcher 面板渲染占位文案（2026-11-08）。
