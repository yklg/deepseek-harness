---
description: "The ecom group map: the product-branch ecommerce workbench host surface, its Web UI, and the bundle that composes both."
kind: "package-group"
---

# packages/ecom

English | [中文](README.zh.md)

## Summary

The ecom group carries the product branch's ecommerce live-streaming workbench. It holds a Host configuration surface, the Web launcher and live-console UI, and one bundle that composes both rows for the product profile. These packages are new relative to the upstream baseline, so this README is their only map; capability packages arrive here as the workbench grows, and the composition stays a patch carrier.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`workbench-server`](workbench-server/README.md) | Host configuration surface and an empty plugin body for the workbench | none yet |
| [`client-ui-workbench`](client-ui-workbench/README.md) | Web sidebar launcher page and the `live-console` right-Sidebar tab | registers slots |
| [`bundle-workbench`](bundle-workbench/README.md) | Bundle patch inserting the Host row and the Web UI row | n/a |

-----

<a id="related-documentation"></a>
## Related documentation

- [Web client subsystem](../../docs/subsystems/web-client.md) — the browser plugin stack these surfaces register into.
- [Slots reference](../../docs/subsystems/slots.md) — the extension seats the launcher and console registrations use.
- [Product branch deviations](../../FORK.md) — where this branch differs from the upstream baseline.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
