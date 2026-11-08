---
description: "Host-side ecom workbench configuration and service body for the workbench bundle."
kind: "package-reference"
---

# @deepseek-ai/dsh-ecom-workbench-server

English | [中文](README.zh.md)

## Summary

The Host half of the ecom workbench. The `ecom-workbench` Cordis row resolves the workbench `Config` groups — operations platform, browser automation, automation limits, AI assistance, action policy, and record storage — and registers no runtime behavior yet; capability packages consume these groups as they arrive.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row from a profile bundle (`cordis.patch.yml`) and state any workbench configuration there. Every group is optional: an omitted group resolves to its defaults, so the row works with no configuration. `dsh-bundle-ecom-workbench` inserts this row for the product profile.

The row validates values with schemastery at load; a value outside its schema fails the load instead of silently falling back. Credentials and deployment-specific endpoints belong to the profile configuration, not to this package.

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/index.ts` exports the function-plugin shape (`name`, `Config`, `apply`). `apply` is deliberately empty: the row exists so `Config` is reachable from `cordis.yml`, and the capability packages that follow add their registrations there. There is no service, tool, event, or UI contribution in this package.

<a id="further-exploration"></a>
## Further Exploration

- [Workbench UI](../client-ui-workbench/README.md)
- [Workbench bundle](../bundle-workbench/README.md)

## Model Experience

### Workbench host configuration

#### What the model sees

Nothing. The `ecom-workbench` row registers no tool, prompt section, context contribution, or session event, so a model request is identical whether the row is loaded or absent.

#### Token effect

Zero direct token effect.

#### KV Cache effect

Does not invalidate: the package adds no request tokens, so any reusable request prefix stays reusable.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Placeholder plugin body** — `apply` registers nothing yet; capability packages own the workbench tools, profiles, and side effects, and this row only resolves their configuration groups.
- **No credentials handling** — the configuration accepts endpoint and workspace identifiers but stores no secrets; a capability that needs credentials passes them through the existing credential services.
- **Configuration is unused until capabilities arrive** — values are validated at load, but no consumer reads them yet, so a change has no runtime effect in this skeleton.

<a id="dev-note"></a>
### Dev Note

None.
