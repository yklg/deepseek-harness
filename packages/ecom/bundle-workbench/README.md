---
description: "Ecom workbench bundle: the Host row and the Web UI row that provide the workbench surfaces."
kind: "package-bundle"
---

# @deepseek-ai/dsh-bundle-ecom-workbench

English | [中文](README.zh.md)

## Summary

The composition carrier for the ecom workbench. Its `cordis.patch.yml` inserts two rows into the profile: `ecom-workbench-server` mounts the Host service with browser automation enabled, and `ecom-workbench-ui` mounts the browser launcher and live-console tab. The bundle owns no behavior of its own; each row's package owns its registrations.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Install the bundle into a profile and enable it. The two rows are inserted with fixed ids, so a profile patch can target either row by id to change its configuration or disable it; an inserted row that no profile needs can stay disabled without uninstalling the bundle.

The inserted Host row starts with `browser.enabled: true` so the desktop product profile can drive the browser guest. A profile without the Electron private channel still loads both rows; the Host reports automation as unavailable and the UI states that in the launcher and console.

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/index.ts` exports nothing; the package's entire contribution is `cordis.patch.yml`, named by `dsh.bundle.patch` in `package.json`. Its two `insert` rows use the workspace packages as npm dependencies, so a profile boot resolves both names from the bundle's manifest.

<a id="further-exploration"></a>
## Further Exploration

- [Workbench Host service](../workbench-server/README.md)
- [Workbench UI](../client-ui-workbench/README.md)

## Model Experience

### Composed workbench rows

#### What the model sees

The Host row's three draft tools: `ecom_draft_product_script`, `ecom_draft_quick_replies`, and `ecom_draft_comment_reply`. The browser row adds nothing model-visible. The bundle itself adds no prompt section, context contribution, or session event.

#### Token effect

The bundle adds the Host row's tool schemas and drafts to requests whenever it is loaded.

#### KV Cache effect

Loading or unloading the bundle changes the tool set, so a request prefix formed with it stays reusable only while the same rows remain loaded.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Desktop automation only** — profiles without the Electron Host load the rows but report automation unavailable.
- **One configuration preset** — the bundle only enables browser automation; every other workbench setting stays at its package default until a profile patches the row by id.
- **Not mounted by the shipped Web profile** — this product bundle is enabled explicitly; the upstream Web profile does not include it.

<a id="dev-note"></a>
### Dev Note

None.