---
description: "Web ecom workbench launcher panel and live-console right-Sidebar tab, with their Remote mount and shared stores."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

English | [中文](README.zh.md)

## Summary

The browser half of the ecom workbench: an **Ecom workbench** entry in the Web sidebar opens a launcher page in the main column, and the package registers the `live-console` page type of the right Sidebar. The launcher shows automation status, the Yunying today dashboard, and quick entries into the console and browser tabs. The console streams automation runs and browser lifecycle events. Both surfaces read the Host `workbench` Remote namespace, whose generated contribution this package mounts itself.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row beside the Host row in a profile bundle; `dsh-bundle-ecom-workbench` inserts both. The package requires the Remote transport, the locale and slot registries, the right-Sidebar tab registry, and the Sidebar navigation service, all of which the Web and desktop profiles provide.

- The launcher reports whether automation is enabled, available, and connected, how many targets are attached, whether Yunying is configured, and the dashboard metrics when it is. Refresh controls re-read status and the dashboard.
- Quick entries return to the selected conversation — or the most recently updated listed one — and open the live-console or browser tab there, because the right Sidebar places tabs per Session. With no conversation the launcher shows a localized hint instead.
- The console replays the Host's bounded history, then follows the live event stream. It shows the connection state, run starts and finishes, target closures, and a stopped stream with a reconnect action.
- Copy lives in the `ecomWorkbench` namespace and ships in eight languages.

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/client/index.ts` mounts the generated `./remote` contribution, then registers the dictionaries, sidebar entry, launcher page, console type, and both keyed tab seats. A quick entry reads the selected Session from `uiSession`, reveals it through `uiWorkspace`, waits for the right Sidebar to report that Session, and only then opens the tab. Every registration is an effect, so unloading withdraws the UI before the Remote.

`src/client/source.ts` owns the shared status, overview, and event stores. The first surface to subscribe opens the Host stream and reads both unary surfaces; the last one closes them. Events are folded into a bounded list and published on a 100 ms throttle. A transport reset reopens the stream and re-reads status; a manual reconnect reopens a stream that ended while the console was still visible.

`src/index.ts` is the empty Node half that the Client loader mounts. The components receive only the framework's slots, the injected stores, and the `t` seat; no component carries product text. The sidebar glyph is decorative.

<a id="further-exploration"></a>
## Further Exploration

- [Workbench Host service](../workbench-server/README.md)
- [Workbench bundle](../bundle-workbench/README.md)

## Model Experience

### Workbench browser surfaces

#### What the model sees

Nothing. The browser registers copy dictionaries, the sidebar launcher entry, the launcher page, and the `live-console` tab; it adds no tool schema, prompt section, context contribution, or session event.

#### Token effect

Zero direct token effect.

#### KV Cache effect

Does not invalidate: the package adds no request tokens, so any reusable request prefix stays reusable.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Status, not control** — the launcher reads automation state and opens tabs; it does not start, pause, or cancel a run.
- **Conversation-scoped tabs** — both quick entries need a selected conversation and leave the launcher to reveal it before opening the tab.
- **Process-local history** — the console's history comes from the Host process and resets with it; the browser keeps at most 200 frames.
- **No event uplink** — the console observes runs; it does not send commands back to the Host stream.

<a id="dev-note"></a>
### Dev Note

None.