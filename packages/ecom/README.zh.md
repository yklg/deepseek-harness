---
description: "ecom 组地图：产品分支的电商工作台 Host 面、其 Web UI，以及组合两者的组合包。"
kind: "package-group"
---

# packages/ecom

[English](README.md) | 中文

## 概述

ecom 组承载产品分支的电商直播工作台。它包含一个 Host 配置面、Web 启动页与实时控制台 UI，以及一个为产品配置档组合两行的组合包。这些包相对上游基线是新增的，因此本 README 是它们唯一的地图；随着工作台成长，能力包会加入本组，而组合方式保持为补丁载体。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`workbench-server`](workbench-server/README.zh.md) | 工作台的 Host 配置面与空的插件主体 | 暂无 |
| [`client-ui-workbench`](client-ui-workbench/README.zh.md) | Web 侧栏启动页与 `live-console` 右侧栏标签页 | 注册槽位 |
| [`bundle-workbench`](bundle-workbench/README.zh.md) | 插入 Host 行与 Web UI 行的组合包补丁 | 不适用 |

-----

<a id="related-documentation"></a>
## 相关文档

- [Web 客户端子系统](../../docs/subsystems/web-client.zh.md)——这些界面注册所在的浏览器插件栈。
- [槽位参考](../../docs/subsystems/slots.zh.md)——启动页与控制台注册使用的扩展座位。
- [产品分支偏差](../../FORK.md)——本分支与上游基线不同之处。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
