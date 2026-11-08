/**
 * Client-safe workbench vocabulary: the automation operations the Host exposes,
 * the events its live console consumes, and the read-only Yunying records.
 * Both the Host and browser faces import this module.
 */

import type {} from '@deepseek-ai/dsh-typert-protocol'

/** One Host automation operation; these names also label live-console runs. */
export type WorkbenchOperation = 'attach' | 'evaluate' | 'detach' | 'targets'

/** Failure codes the workbench reports across its own service boundary. */
export type WorkbenchFailureCode =
  | 'workbench/disabled'
  | 'workbench/unavailable'
  | 'workbench/disconnected'
  | 'workbench/timeout'
  | 'workbench/protocol'
  | 'workbench/invalid-request'
  | 'workbench/origin-denied'
  | 'workbench/result-not-json'
  | 'target/not-found'
  | 'target/ambiguous'
  | 'target/origin-denied'
  | 'target/closed'
  | 'script/too-large'
  | 'script/timeout'
  | 'result/not-json'
  | 'result/too-large'
  | 'workbench/yunying-not-configured'
  | 'workbench/yunying-credentials'
  | 'workbench/yunying-http'
  | 'workbench/yunying-unavailable'
  | 'workbench/yunying-invalid-response'

/** Diagnostic details shared by every workbench failure code. */
export interface WorkbenchFailureDetails {
  /** Operation named by the failure, when one applies. */
  readonly operation?: string | undefined
  /** Automation target named by the failure, when one applies. */
  readonly targetId?: string | undefined
  /** HTTP status reported by the Yunying gateway, when one applies. */
  readonly status?: number | undefined
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'workbench/disabled': WorkbenchFailureDetails
    'workbench/unavailable': WorkbenchFailureDetails
    'workbench/disconnected': WorkbenchFailureDetails
    'workbench/timeout': WorkbenchFailureDetails
    'workbench/protocol': WorkbenchFailureDetails
    'workbench/invalid-request': WorkbenchFailureDetails
    'workbench/origin-denied': WorkbenchFailureDetails
    'workbench/result-not-json': WorkbenchFailureDetails
    'target/not-found': WorkbenchFailureDetails
    'target/ambiguous': WorkbenchFailureDetails
    'target/origin-denied': WorkbenchFailureDetails
    'target/closed': WorkbenchFailureDetails
    'script/too-large': WorkbenchFailureDetails
    'script/timeout': WorkbenchFailureDetails
    'result/not-json': WorkbenchFailureDetails
    'result/too-large': WorkbenchFailureDetails
    'workbench/yunying-not-configured': WorkbenchFailureDetails
    'workbench/yunying-credentials': WorkbenchFailureDetails
    'workbench/yunying-http': WorkbenchFailureDetails
    'workbench/yunying-unavailable': WorkbenchFailureDetails
    'workbench/yunying-invalid-response': WorkbenchFailureDetails
  }
}

/** Automation availability reported to the launcher. */
export interface WorkbenchAutomationStatus {
  /** Whether the deployment enabled browser automation. */
  readonly enabled: boolean
  /** Whether the Host has a private channel to an automation provider. */
  readonly available: boolean
  /** Whether that channel is still attached to its parent process. */
  readonly connected: boolean
  /** Attached target count, or null while the count could not be read. */
  readonly targets: number | null
}

/** Service status the launcher reads. */
export interface WorkbenchStatus {
  /** Embedded-browser automation state. */
  readonly automation: WorkbenchAutomationStatus
  /** Yunying availability, independent of remote calls. */
  readonly yunying: { readonly configured: boolean }
}

/** One attached browser guest. */
export interface WorkbenchTarget {
  /** Opaque Electron lease identity. */
  readonly targetId: string
  /** URL the guest currently shows. */
  readonly url: string
}

/** Attach request: exact origins and `*.domain` suffix rules. */
export interface WorkbenchAttachRequest {
  /** Origins the guest may keep while the Host evaluates in it. */
  readonly allowOrigins: readonly string[]
}

/** Evaluate request. */
export interface WorkbenchEvalRequest {
  /** Attached target identity. */
  readonly targetId: string
  /** Script evaluated in the guest. */
  readonly script: string
  /** Broker deadline in milliseconds; the broker clamps it to its own maximum. */
  readonly timeoutMs?: number | undefined
}

/** Detach request. */
export interface WorkbenchDetachRequest {
  /** Attached target identity. */
  readonly targetId: string
}

/** Wire-safe automation result: the JSON text the broker accepted. */
export interface WorkbenchEvalResult {
  /** JSON encoding of the script result. */
  readonly json: string
  /** UTF-8 byte length of {@link json}. */
  readonly bytes: number
}

/** One automation lifecycle notification shown by the live console. */
export type WorkbenchEvent =
  | {
    readonly type: 'channel'
    readonly at: number
    readonly available: boolean
    readonly connected: boolean
  }
  | {
    readonly type: 'run-started'
    readonly at: number
    readonly runId: string
    readonly operation: WorkbenchOperation
    readonly targetId?: string | undefined
  }
  | {
    readonly type: 'run-finished'
    readonly at: number
    readonly runId: string
    readonly operation: WorkbenchOperation
    readonly ok: boolean
    readonly durationMs: number
    readonly targetId?: string | undefined
    readonly code?: string | undefined
  }
  | {
    readonly type: 'target-closed'
    readonly at: number
    readonly targetId: string
    readonly reason: 'closed' | 'crashed'
  }

/** One metric on the Yunying today dashboard. */
export interface YunyingMetric {
  /** Stable metric key. */
  readonly key: string
  /** Display label supplied by the gateway. */
  readonly label: string
  /** Numeric value; the gateway owns its unit. */
  readonly value: number
  /** Unit suffix, when the gateway supplies one. */
  readonly unit?: string | undefined
}

/** Today's dashboard as the gateway reports it. */
export interface YunyingDashboard {
  /** Business date the metrics describe. */
  readonly date: string
  /** Metrics in gateway order. */
  readonly metrics: readonly YunyingMetric[]
}

/** Today's dashboard result, including whether the deployment configured Yunying. */
export interface YunyingOverview {
  /** Whether endpoint and workspace are configured. */
  readonly configured: boolean
  /** Dashboard data; null while Yunying is unconfigured or a caller has not read it yet. */
  readonly dashboard: YunyingDashboard | null
}

/** One product record. */
export interface YunyingProduct {
  /** Gateway product identity. */
  readonly id: string
  /** Product name. */
  readonly name: string
  /** Gateway lifecycle status, for example `on-sale`. */
  readonly status: string
  /** Current price, when the gateway reports one. */
  readonly price?: number | undefined
  /** Current stock, when the gateway reports it. */
  readonly stock?: number | undefined
}

/** One viewer comment. */
export interface YunyingComment {
  /** Gateway comment identity. */
  readonly id: string
  /** Comment text. */
  readonly text: string
  /** ISO timestamp supplied by the gateway. */
  readonly createdAt: string
  /** Product the comment belongs to, when the gateway reports it. */
  readonly productId?: string | undefined
  /** Commenter display name, when the gateway reports it. */
  readonly author?: string | undefined
}

/** Paged product read. */
export interface YunyingProductPage {
  /** Products in gateway order. */
  readonly items: readonly YunyingProduct[]
  /** Cursor for the next page, when one exists. */
  readonly nextCursor?: string | undefined
}

/** Paged comment read. */
export interface YunyingCommentPage {
  /** Comments in gateway order. */
  readonly items: readonly YunyingComment[]
  /** Cursor for the next page, when one exists. */
  readonly nextCursor?: string | undefined
}

/** Product read request. */
export interface YunyingProductsRequest {
  /** Cursor returned by a previous read. */
  readonly cursor?: string | undefined
  /** Page size; the client clamps it to the gateway's accepted range. */
  readonly limit?: number | undefined
}

/** Comment read request. */
export interface YunyingCommentsRequest {
  /** Cursor returned by a previous read. */
  readonly cursor?: string | undefined
  /** Page size; the client clamps it to the gateway's accepted range. */
  readonly limit?: number | undefined
}
