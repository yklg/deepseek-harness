---
description: "Web ecom workbench: the product home with platform cards, a persistent desktop console surface, compact harness navigation, and the live-console right-Sidebar tab."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

English | [中文](README.zh.md)

## Summary

The browser half of the ecom workbench and the product's home surface. It opens at startup, shows one card per shipped platform (抖店 or 巨量百应), and opens that platform's official login page or console in a persistent browser surface that stays mounted while another main panel is selected. The product top bar reaches the AI conversation and the compact harness navigation; the page keeps the Yunying dashboard and a low-key system status row. All surfaces read the Host `workbench` Remote namespace, whose generated contribution this package mounts.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row beside the Host row in a profile bundle; `dsh-bundle-ecom-workbench` inserts both. The package requires the Remote transport, the locale, slot, and layout registries, the right-Sidebar tab registry, the Sidebar navigation service, and the `ctx.browserSurface` provider, all of which the Web and desktop profiles provide.

- **Workbench first.** The workbench main panel opens at startup and the harness sidebar starts collapsed. This package provides the optional `ctx.productNavigation = { compact: true }` service, so an opened sidebar hides the harness brand block and the New Session button while keeping panel rows, the workspace/session list, and settings.
- The floating AI window hosts the embedded Conversation in a flex-filled body, so its composer stack stays at the window floor; the embedded card uses the shared compact density and the blank Hero leaves free space above instead of centering the input.
- The product top bar carries the workbench brand, an **AI assistant** action that switches to the conversation main panel, and a **navigation** toggle for the harness sidebar. Selecting any main panel collapses the sidebar again.
- The page shows one hero card per shipped platform, a disabled 抖音团购 placeholder, and a **startup auto-enter** switch. The choice and the switch persist in this browser's localStorage; a launch with auto-enter enabled opens the remembered platform directly.
- Entering a platform opens its login page, or the console address remembered from the previous signed-in session, in a browser surface on that platform's persistent partition. The partition key is `platform:<platformId>:<accountId>`, so the two platforms keep separate login state and survive a restart.
- The frame positions the console seat at the sidebar boundary; the seat, its top bar, and the embedded page follow the sidebar track through the frame's toggle motion. Its top bar carries the platform name, probed login state, page zoom (`−`, percentage, `+`; defaults to 80%, 50–300% in 10% steps, click the percentage to reset to 100%), **refresh sign-in**, **AI assistant**, **switch platform**, and a retry action after a failure. Zoom affects only the embedded page, is Desktop-only, resets to 100% when the platform surface is replaced, and while the guest has focus Cmd/Ctrl+=, Cmd/Ctrl+- and Cmd/Ctrl+0 step or reset the page zoom; Cmd/Ctrl+wheel also steps it. The toolbar remains the discoverable path. The seat stays mounted while another main panel is selected; switching the console view slides it out before `visibility` hides it, and the product does not render a second navigation toggle, and the desktop guest runs with background throttling disabled.
- A read-only probe evaluates the platform adapter's script through the Host automation broker about every 90 seconds, and immediately when the window regains focus or the user refreshes the sign-in state. It reports `in`, `out`, or `unknown`; the console never treats an unreadable page as signed in.
- The Yunying dashboard, the live-console tab, and the browser tab keep their previous behavior. Their entry points sit in the low-key system status row, and quick entries return to the selected conversation before opening their tab.
- On the Web the platform cards are disabled with a localized desktop-only notice; the rest of the page keeps working.
- Copy lives in the `ecomWorkbench` namespace, merges the platform dictionaries, and ships in eight languages.

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/client/index.ts` mounts the generated `./remote` contribution, provides the compact product-navigation service, then creates one long-lived `ConsoleController` and one platform-preferences store. Opening a platform remembers the selection, reads the remembered console address, and asks the controller to open the surface; a console address reached while signed in is written back as the next restore point. Window focus and document visibility re-read the sign-in state, and a main-panel change collapses the navigation sidebar. Every registration is an effect, so unloading withdraws the UI before the controller releases the surface.

`src/client/startup.ts` owns the launch decision: select the workbench main panel once, collapse the harness sidebar, and — when auto-enter is enabled and a platform is remembered — open that platform after the first paint. A user navigation that lands first wins over the startup selection.

`src/client/ConsoleController.ts` owns the active `BrowserSurface`, its mount seat, the probe timer, and the published `ConsoleSnapshot` (`view`, `phase`, `platformId`, `loginState`, `checking`, `url`, errors). One generation counter discards a probe or surface creation that a newer open or a disposal superseded. `refreshLogin()` schedules an immediate probe when the console becomes visible or the window regains focus. Switching platforms disposes the previous surface after releasing its host mount; showing the platform list keeps the current surface alive.

`src/client/platforms.ts` declares the platform registry: login and home URLs, allowed origins, the read-only probe script, the storage key, and the login-state decision. `src/client/platform-probe.ts` attaches the platform origin through the Host automation broker, evaluates the probe script, validates the returned JSON at the wire boundary, and always releases the target. `src/client/platform-preferences.ts` validates the persisted preference value field by field and keeps the in-memory snapshot authoritative.

`src/client/ConsoleHost.tsx` is the occupant of the `shell.console` seat. It places itself against the frame's published sidebar width, derives visibility from the selected main panel and the controller view, renders the console top bar and its single status line, and attaches the surface into a stable viewport element whose lifetime is independent of surface replacements.

`src/client/WorkbenchPage.tsx` renders the product home: top bar, platform hero cards, auto-enter row, console and dashboard cards, and the system status strip. `src/client/source.ts` owns the shared status, overview, and event stores. The first surface to subscribe opens the Host stream and reads both unary surfaces; the last one closes them. Events are folded into a bounded list and published on a 100 ms throttle.

`src/index.ts` is the empty Node half that the Client loader mounts. The components receive only the framework's slots, the injected stores, and the `t` seat; no component carries product text. The sidebar glyph is decorative.

<a id="further-exploration"></a>
## Further Exploration

- [Workbench Host service](../workbench-server/README.md)
- [Workbench bundle](../bundle-workbench/README.md)
- [Web browser surface service](../../client/ui-sidebar-browser/README.md)
- [Harness sidebar](../../client/ui-sidebar/README.md)

## Model Experience

### Workbench browser surfaces

#### What the model sees

Nothing. The browser registers copy dictionaries, the sidebar launcher entry, the product home page, the platform console seat, and the `live-console` tab; it adds no tool schema, prompt section, context contribution, or session event.

#### Token effect

Zero direct token effect.

#### KV Cache effect

Does not invalidate: the package adds no request tokens, so any reusable request prefix stays reusable.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Status, not control** — the workbench reads automation state and opens console surfaces; it does not start, pause, or cancel a run, and it never writes to a platform page.
- **AI assistant return path** — switching to the conversation leaves the harness sidebar collapsed; returning to the workbench goes through the navigation toggle or Cmd+B.
- **Compact sidebar is presentation-only** — hiding the brand block and New Session button does not remove the harness workspace/session list, and macOS window-chrome controls can still offer New Session while the sidebar is fully hidden.
- **Right browser rail** — the rail starts collapsed; an opened rail during console use is covered by the console surface, which ends at the window edge.
- **Origin-scoped probe attach** — the probe attaches the unique guest on the platform origins. A second desktop guest on the same platform origin makes the attach fail as ambiguous instead of selecting the console guest by target identity.
- **Desktop-only console** — the Web shell keeps the platform cards and reports the console as desktop-only; the embedded page itself needs Electron.
- **Single account per platform** — the storage key reserves `accountId`, but the shipped UI always uses `default`.
- **Process-local history** — the live-console history comes from the Host process and resets with it; the browser keeps at most 200 frames.
- **No event uplink** — the live console observes runs; it does not send commands back to the Host stream.

<a id="dev-note"></a>
### Dev Note

None.
