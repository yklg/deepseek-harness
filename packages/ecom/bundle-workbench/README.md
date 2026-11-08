---
description: "Ecom workbench bundle: the Host row and the Web UI row that provide the workbench surfaces."
kind: "package-bundle"
---

# @deepseek-ai/dsh-bundle-ecom-workbench

English | [中文](README.zh.md)

## Summary

The composition carrier for the ecom workbench. Its `cordis.patch.yml` inserts two rows into the profile: `ecom-workbench-server` mounts the Host configuration surface, and `ecom-workbench-ui` mounts the browser launcher and live-console tab. The bundle owns no behavior of its own; each row's package owns its registrations.

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

The rows are placeholders: the Host row validates configuration but registers no service, and the browser row opens placeholder surfaces. Capability packages replace them as separate rows later, keeping this bundle a pure carrier.

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

Nothing. The bundle applies `cordis.patch.yml`, which inserts the `ecom-workbench-server` Host row and the `ecom-workbench-ui` browser row; both packages own their (currently empty) contributions, so the model request is unchanged.

#### Token effect

Zero direct token effect.

#### KV Cache effect

Does not invalidate: the patch adds no request tokens, so any reusable request prefix stays reusable.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Placeholder composition** — both inserted rows are skeletons; workbench capabilities arrive as their own packages and rows, and this bundle only composes them.
- **No configuration preset** — the bundle inserts rows with their defaults; a deployment that needs workbench configuration patches a row by id.
- **Not mounted by the shipped Web profile** — this product bundle is enabled explicitly; the upstream Web profile does not include it.

<a id="dev-note"></a>
### Dev Note

None.
