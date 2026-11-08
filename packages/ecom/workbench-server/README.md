---
description: "Host-side ecom workbench: Electron automation authority, read-only Yunying reads, draft tools, and the Remote surface behind the launcher and live console."
kind: "package-reference"
---

# @deepseek-ai/dsh-ecom-workbench-server

English | [中文](README.zh.md)

## Summary

The Host half of the ecom workbench. The `ecom-workbench` row resolves the workbench `Config`, owns the automation authority over Electron's private channel, reads the Yunying operations platform without writing to it, registers three model-facing draft tools, and exposes the `workbench` Remote namespace that the launcher and live console call. Without the Electron channel the same row still loads and reports automation as unavailable.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row from a profile bundle (`cordis.patch.yml`). `dsh-bundle-ecom-workbench` inserts it with browser automation enabled for the product profile; every other group keeps its defaults. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-ecom-workbench-server) is the exhaustive field list.

### Browser automation

The row requires `tools` and creates `ctx.workbench`, the Host service later capabilities consume. It accepts `attach`, `evaluate`, `detach`, and `targets` calls over the Electron Host's private IPC channel:

- `attach` binds one browser guest whose current origin matches the request's exact origins or `*.domain` rules. A non-empty `policy.allowedHosts` narrows every request to the deployment's hostnames or suffix rules before the broker sees it.
- Calls for one target run strictly one after another; another target proceeds independently.
- Broker failures keep their stable codes (`target/not-found`, `target/closed`, `script/timeout`, `result/too-large`, and the other automation codes). A missing channel reports `workbench/unavailable`, a closed one `workbench/disconnected`, and a slow one `workbench/timeout`.
- A target that closes is published to the live console; a count that can no longer be read reports `null` instead of a stale number.

### Yunying reads

The adapter issues signed `GET` requests to `/api/agent/dashboard/today`, `/api/agent/products`, and `/api/agent/comments` when `yunying.endpoint` and `yunying.workspaceId` are set. The signing key is resolved per request through the credential service (falling back to the environment variable named by `signingKeyEnv`), so rotation needs no restart. Reads have a per-attempt deadline, a bounded retry count for network, `429`, and `5xx` failures, response validation, and redacted diagnostics: logs name only method, path, attempt, and duration.

### Draft tools and approval

Three tools produce drafts and never send, publish, or change a listing. The row also installs the approval policy for the high-risk names `ecom_send_message`, `ecom_change_price`, `ecom_set_listing`, and `ecom_set_inventory`: when `policy.requireApproval` is true, a call that the downstream tool pipeline allows becomes an `ask` decision routed through `dsh-user-approval`.

<a id="understand-the-implementation"></a>
## Understand the implementation

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Config, the `workbench` service, Remote methods, and the event stream. |
| [`src/channel.ts`](src/channel.ts) | Private IPC correlation, response/event validation, deadlines, and disconnect degradation. |
| [`src/automation.ts`](src/automation.ts) | Origin allowlist, per-target serialization, run events, and result encoding. |
| [`src/yunying.ts`](src/yunying.ts) | Signed reads, retries, validation, and redacted logging. |
| [`src/tools.ts`](src/tools.ts) | Draft tools and the high-risk approval policy. |
| [`src/types.ts`](src/types.ts) | Client-safe wire types and failure codes; no runtime code. |

The service is the plugin's default export. The browser half mounts the generated `./remote` contribution itself, so no application assembly lists this namespace. Config is validated at load: a configured Yunying endpoint must be an origin, requires a workspace, and validates its credential name; an unset endpoint with a workspace fails loud.

<a id="further-exploration"></a>
## Further Exploration

- [Workbench UI](../client-ui-workbench/README.md)
- [Workbench bundle](../bundle-workbench/README.md)
- [User approval](../../interaction/user-approval/README.md)

## Model Experience

### Workbench tools

#### What the model sees

Three tool schemas when the row is loaded: `ecom_draft_product_script` (timed script sections from product facts), `ecom_draft_quick_replies` (normalized trigger/reply drafts with duplicate rejection), and `ecom_draft_comment_reply` (one formatted comment reply). Every result states `draftOnly: true`. Logs and results carry no credentials, and the row adds no prompt section.

##### Approval prompt

```markdown
The workbench tool "<tool>" sends a message or changes the storefront; approve this single call.
```

#### Token effect

Each call carries the three tool schemas and the model's arguments and draft results in the session. The schemas add request tokens whenever the tool set is present.

#### KV Cache effect

Loading or unloading the row changes the tool set, so a request prefix formed with it stays reusable only while the same tools are present. Calls do not rewrite earlier context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No high-risk executor** — sending, price, listing, and inventory changes have no registered tool yet, because the Yunying adapter is read-only. The approval policy already covers those names for the executor that lands next.
- **Yunying gateway contract** — the adapter validates the documented dashboard, product, and comment fields; a deployed gateway that returns another shape fails with `workbench/yunying-invalid-response`.
- **Desktop-only automation** — the private channel exists only in the Electron Host. Web, headless, and SDK profiles load the row but report automation unavailable.
- **Unconsumed configuration** — `browser.headless`, the `automation`, `ai`, and `storage` groups are validated but not read by a capability yet.
- **Process-local drafts** — drafts live in tool results and the session log; this package keeps no separate draft store.

<a id="dev-note"></a>
### Dev Note

None.