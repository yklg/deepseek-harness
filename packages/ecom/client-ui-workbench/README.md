---
description: "Web ecom workbench launcher panel and live-console right-Sidebar tab."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

English | [中文](README.zh.md)

## Summary

The browser half of the ecom workbench: an **Ecom workbench** entry in the Web sidebar opens a placeholder launcher page in the main column, and the package registers the `live-console` page type of the right Sidebar. Both surfaces are skeletons; they add no Host binding, remote call, or data source yet.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row in a profile bundle's `cordis.patch.yml` beside the Host row; `dsh-bundle-ecom-workbench` inserts both rows for the product profile. The sidebar entry appears once the bundle is mounted and opens the launcher page, which states that capabilities are still pending.

The `live-console` tab type is registered with the right Sidebar but has no opener in this skeleton: a later capability opens it by kind (`live-console`) from the launcher or from a workbench action. Its body and chip title are placeholders.

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/index.ts` is the empty Node half that the Client loader mounts; `src/client/index.ts` is the browser half. The launcher registers into `sidebar.panellist` (the list ui-sidebar declares) and the keyed `main` seat (ui-layout), and the console type registers into `ctx.sidebarRightTabs` with its body and title in the keyed `sidebar.right.pane.tab` and `sidebar.right.pane.tab.title` seats. Every registration is an effect through `ctx.slots.inject`, so it appears when its host slot exists and is removed with the plugin.

Copy lives in the `ecomWorkbench` locale namespace: `src/client/locales.ts` holds the eight shipped dictionaries, and components receive only the framework's `t` seat — no component carries product text. The SVG glyph is decorative; the sidebar owns the row's accessible label.

<a id="further-exploration"></a>
## Further Exploration

- [Workbench Host service](../workbench-server/README.md)
- [Workbench bundle](../bundle-workbench/README.md)

## Model Experience

### Workbench browser surfaces

#### What the model sees

Nothing. The browser registers the `ecomWorkbench` copy dictionaries, the sidebar launcher entry, and the `live-console` tab type; it adds no tool schema, prompt section, context contribution, or session event.

#### Token effect

Zero direct token effect.

#### KV Cache effect

Does not invalidate: the package adds no request tokens, so any reusable request prefix stays reusable.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Placeholder pages** — the launcher and live-console bodies show pending-capability copy; no data source, remote call, or workbench action exists yet.
- **No launcher action** — the `live-console` type is registered but nothing opens it in this skeleton; a later capability opens it by kind.
- **No component tests** — rendering behavior is untested until the placeholder gains real content.

<a id="dev-note"></a>
### Dev Note

None.
