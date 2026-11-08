---
description: "电商工作台组合包：提供工作台界面的 Host 行与 Web UI 行。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-bundle-ecom-workbench

[English](README.md) | 中文

## 概述

电商工作台的组合载体。它的 `cordis.patch.yml` 向配置档插入两行：`ecom-workbench-server` 挂载 Host 配置面，`ecom-workbench-ui` 挂载浏览器启动页与实时控制台标签页。组合包本身不拥有行为，各行由各自的包负责注册。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

把组合包安装到配置档并启用。两行以固定 id 插入，因此配置档补丁可以按 id 定位任意一行来修改配置或禁用它；配置档不需要的插入行可以保持禁用而无需卸载组合包。

两行目前都是占位：Host 行只校验配置，不注册服务；浏览器行打开占位界面。能力包之后会作为独立行取代它们，使本组合包保持纯载体。

<a id="understand-the-implementation"></a>
## 理解实现

`src/index.ts` 不导出任何内容；本包的全部贡献是 `cordis.patch.yml`，由 `package.json` 中的 `dsh.bundle.patch` 指定。它的两个 `insert` 行把工作区包声明为 npm 依赖，因此配置档启动时可以从组合包的清单解析这两个名称。

<a id="further-exploration"></a>
## 进一步探索

- [工作台 Host 服务](../workbench-server/README.zh.md)
- [工作台 UI](../client-ui-workbench/README.zh.md)

<a id="model-experience"></a>
## 模型体验

### 组合的工作台行

#### 模型看到的内容

无。组合包应用 `cordis.patch.yml`，插入 `ecom-workbench-server` Host 行与 `ecom-workbench-ui` 浏览器行；两者的贡献（当前为空）由各自的包拥有，因此模型请求保持不变。

#### Token 影响

无直接 token 影响。

#### KV Cache 影响

不会失效：补丁不添加请求 token，因此任何可复用的请求前缀都保持可复用。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **占位组合** — 插入的两行都是骨架；工作台能力会作为独立的包与行出现，本组合包只负责组合它们。
- **没有配置预设** — 组合包以默认值插入各行；需要工作台配置的部署按 id 打补丁。
- **未随 Web 配置档挂载** — 这是产品组合包，需要显式启用；上游 Web 配置档不包含它。

<a id="dev-note"></a>
### 开发备注

无。
