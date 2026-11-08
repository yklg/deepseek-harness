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
- [ ] 右栏镜像（ui-sidebar-right）——进行中
- [ ] Desktop broker / persist 分区 / clearStorage
- [ ] profile 迁移
- [ ] ecom 包骨架 + bundle
- [ ] dev:desktop 手验
