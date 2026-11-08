/**
 * Read-only Yunying operations-platform adapter. Every request is a signed GET
 * against `/api/agent/*`; the adapter validates responses, bounds time and
 * retries, and logs only method, path, attempt, status, and duration.
 */

import { createHmac, randomBytes } from 'node:crypto'
import { z as zod } from 'zod'
import { WorkbenchError } from './errors.ts'
import type {
  YunyingComment,
  YunyingCommentPage,
  YunyingCommentsRequest,
  YunyingDashboard,
  YunyingOverview,
  YunyingProduct,
  YunyingProductPage,
  YunyingProductsRequest,
} from './types.ts'

/** Deployment values the adapter needs. */
export interface YunyingSettings {
  /** Gateway origin; empty leaves Yunying unconfigured. */
  readonly endpoint: string
  /** Workspace identity sent with every read. */
  readonly workspaceId: string
  /** Optional signing key identity header. */
  readonly keyId: string
  /** Credential name holding the HMAC signing key. */
  readonly signingKeyEnv: string
  /** Per-attempt deadline in milliseconds. */
  readonly requestTimeoutMs: number
  /** Additional attempts after the first failure. */
  readonly maxRetries: number
}

/** Narrow logger face used for redacted adapter diagnostics. */
export interface YunyingLogger {
  /**
   * @param message - redacted diagnostic; never includes query values, headers, or bodies.
   */
  warn(message: string): void
}

/** Substitutable effects for tests. */
export interface YunyingDependencies {
  /** HTTP client; tests supply a fake. */
  readonly fetch: typeof fetch
  /** Resolve the signing key at request time, so rotation needs no restart. */
  readonly resolveSigningKey: () => Promise<string | undefined>
  /** Diagnostic sink; absent in tests that assert no logging. */
  readonly logger?: YunyingLogger | undefined
  /** Clock in milliseconds; defaults to `Date.now`. */
  readonly now?: (() => number) | undefined
  /** Nonce source; defaults to 16 random bytes. */
  readonly nonce?: (() => string) | undefined
  /** Retry delay; tests supply an immediate resolver. */
  readonly sleep?: ((milliseconds: number) => Promise<void>) | undefined
}

const metricSchema = zod.object({
  key: zod.string().min(1),
  label: zod.string(),
  value: zod.number(),
  unit: zod.string().optional(),
})
const dashboardSchema: zod.ZodType<YunyingDashboard> = zod.object({
  date: zod.string().min(1),
  metrics: zod.array(metricSchema),
})
const productSchema = zod.object({
  id: zod.string().min(1),
  name: zod.string(),
  status: zod.string(),
  price: zod.number().optional(),
  stock: zod.number().optional(),
})
const productPageSchema: zod.ZodType<YunyingProductPage> = zod.object({
  items: zod.array(productSchema),
  nextCursor: zod.string().optional(),
})
const commentSchema = zod.object({
  id: zod.string().min(1),
  text: zod.string(),
  createdAt: zod.string().min(1),
  productId: zod.string().optional(),
  author: zod.string().optional(),
})
const commentPageSchema: zod.ZodType<YunyingCommentPage> = zod.object({
  items: zod.array(commentSchema),
  nextCursor: zod.string().optional(),
})

/** Paths the read-only adapter may call. */
const DASHBOARD_PATH = '/api/agent/dashboard/today'
const PRODUCTS_PATH = '/api/agent/products'
const COMMENTS_PATH = '/api/agent/comments'

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 50
const MAX_RETRY_DELAY_MS = 2_000

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, milliseconds) })
}

function isConfigured(settings: YunyingSettings): boolean {
  return settings.endpoint.length > 0 && settings.workspaceId.length > 0
}

/**
 * Encode one query deterministically so the signature matches the URL.
 * @param entries - query values, already flat.
 * @returns the sorted encoded query string without `?`.
 */
function encodeQuery(entries: Readonly<Record<string, string | number | undefined>>): string {
  const pairs: [string, string | number][] = []
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) pairs.push([key, value])
  }
  pairs.sort(([left], [right]) => left.localeCompare(right))
  return pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')
}

function signedMessage(path: string, query: string, timestamp: string, nonce: string): string {
  return `GET\n${path}\n${query}\n${timestamp}\n${nonce}`
}

function pageSize(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)))
}

/**
 * Read-only Yunying gateway client.
 */
export class YunyingClient {
  private readonly fetch: typeof fetch
  private readonly resolveSigningKey: () => Promise<string | undefined>
  private readonly logger: YunyingLogger | undefined
  private readonly now: () => number
  private readonly nonce: () => string
  private readonly sleep: (milliseconds: number) => Promise<void>

  /**
   * @param settings - deployment values.
   * @param dependencies - HTTP, credential, clock, and retry effects.
   */
  constructor(
    private readonly settings: YunyingSettings,
    dependencies: YunyingDependencies,
  ) {
    this.fetch = dependencies.fetch
    this.resolveSigningKey = dependencies.resolveSigningKey
    this.logger = dependencies.logger
    this.now = dependencies.now ?? (() => Date.now())
    this.nonce = dependencies.nonce ?? (() => randomBytes(16).toString('hex'))
    this.sleep = dependencies.sleep ?? defaultSleep
  }

  /** Whether endpoint and workspace are configured. */
  get configured(): boolean {
    return isConfigured(this.settings)
  }

  /**
   * Read today's dashboard.
   * @param signal - caller cancellation.
   * @returns the configured state and dashboard.
   */
  async overview(signal?: AbortSignal): Promise<YunyingOverview> {
    this.assertConfigured()
    const dashboard = await this.get(DASHBOARD_PATH, { workspaceId: this.settings.workspaceId }, dashboardSchema, signal)
    return { configured: true, dashboard }
  }

  /**
   * Read one page of products.
   * @param request - cursor and page size.
   * @param signal - caller cancellation.
   * @returns the product page.
   */
  async products(request: YunyingProductsRequest, signal?: AbortSignal): Promise<YunyingProductPage> {
    this.assertConfigured()
    const page = await this.get(PRODUCTS_PATH, {
      workspaceId: this.settings.workspaceId,
      cursor: request.cursor,
      limit: pageSize(request.limit),
    }, productPageSchema, signal)
    return page
  }

  /**
   * Read one page of comments.
   * @param request - cursor and page size.
   * @param signal - caller cancellation.
   * @returns the comment page.
   */
  async comments(request: YunyingCommentsRequest, signal?: AbortSignal): Promise<YunyingCommentPage> {
    this.assertConfigured()
    const page = await this.get(COMMENTS_PATH, {
      workspaceId: this.settings.workspaceId,
      cursor: request.cursor,
      limit: pageSize(request.limit),
    }, commentPageSchema, signal)
    return page
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new WorkbenchError('workbench/yunying-not-configured',
        'Yunying is not configured; set the endpoint and workspace in the ecom workbench row')
    }
  }

  private async get<T>(
    path: string,
    queryValues: Readonly<Record<string, string | number | undefined>>,
    schema: zod.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const key = await this.resolveSigningKey()
    if (key === undefined || key.length === 0) {
      throw new WorkbenchError('workbench/yunying-credentials',
        `Yunying signing key ${this.settings.signingKeyEnv} is not configured`)
    }
    const query = encodeQuery(queryValues)
    let lastError: unknown
    for (let attempt = 0; attempt <= this.settings.maxRetries; attempt += 1) {
      signal?.throwIfAborted()
      const response = await this.requestOnce(path, query, key, attempt, signal).catch((error: unknown) => {
        lastError = error
        return undefined
      })
      if (response === undefined) {
        signal?.throwIfAborted()
        if (attempt === this.settings.maxRetries) {
          throw new WorkbenchError('workbench/yunying-unavailable',
            `Yunying request ${path} failed after ${String(attempt + 1)} attempt(s): ${describe(lastError)}`)
        }
        await this.sleep(Math.min(MAX_RETRY_DELAY_MS, 200 * 2 ** attempt))
        continue
      }
      if (response.ok) return await this.decode(path, response, schema)
      const retryable = response.status === 429 || response.status >= 500
      if (retryable && attempt < this.settings.maxRetries) {
        this.logger?.warn(`ecom-workbench: yunying GET ${path} status ${String(response.status)}; retrying`)
        void response.body?.cancel().catch(() => undefined)
        await this.sleep(Math.min(MAX_RETRY_DELAY_MS, 200 * 2 ** attempt))
        continue
      }
      void response.body?.cancel().catch(() => undefined)
      throw new WorkbenchError('workbench/yunying-http',
        `Yunying request ${path} failed with HTTP ${String(response.status)}`, { status: response.status })
    }
    throw new WorkbenchError('workbench/yunying-unavailable', `Yunying request ${path} exhausted its retries`)
  }

  private async requestOnce(
    path: string,
    query: string,
    key: string,
    attempt: number,
    signal?: AbortSignal,
  ): Promise<Response> {
    const timestamp = String(Math.floor(this.now() / 1000))
    const nonce = this.nonce()
    const signature = createHmac('sha256', key).update(signedMessage(path, query, timestamp, nonce)).digest('hex')
    const url = `${this.settings.endpoint.replace(/\/+$/u, '')}${path}${query === '' ? '' : `?${query}`}`
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort(new WorkbenchError('workbench/yunying-unavailable',
        `Yunying request ${path} exceeded ${String(this.settings.requestTimeoutMs)} ms`))
    }, this.settings.requestTimeoutMs)
    const merged = signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal])
    const startedAt = this.now()
    try {
      return await this.fetch(url, {
        method: 'GET',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          'x-yunying-workspace': this.settings.workspaceId,
          ...this.settings.keyId === '' ? {} : { 'x-yunying-key-id': this.settings.keyId },
          'x-yunying-timestamp': timestamp,
          'x-yunying-nonce': nonce,
          'x-yunying-signature': signature,
        },
        signal: merged,
      })
    } catch (error) {
      this.logger?.warn(`ecom-workbench: yunying GET ${path} attempt ${String(attempt + 1)} failed after ${
        String(Math.max(0, this.now() - startedAt))} ms (${describe(error)})`)
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  private async decode<T>(path: string, response: Response, schema: zod.ZodType<T>): Promise<T> {
    let body: unknown
    try { body = await response.json() } catch (_error) {
      throw new WorkbenchError('workbench/yunying-invalid-response', `Yunying response for ${path} is not JSON`)
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      throw new WorkbenchError('workbench/yunying-invalid-response',
        `Yunying response for ${path} does not match the adapter contract`)
    }
    return parsed.data
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Re-export the response types this adapter returns, for Host consumers. */
export type { YunyingComment, YunyingCommentPage, YunyingDashboard, YunyingProduct, YunyingProductPage }
