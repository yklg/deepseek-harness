/** Read-only Yunying adapter: signing, paging, retries, timeout, and redaction. */
import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { WorkbenchError } from '../src/errors.ts'
import { YunyingClient } from '../src/yunying.ts'
import type { YunyingSettings } from '../src/yunying.ts'

interface Captured {
  readonly url: string
  readonly init: RequestInit
}

function recordingFetch(handler: (url: URL, init: RequestInit) => Promise<Response>): {
  readonly fetch: typeof fetch
  readonly calls: Captured[]
} {
  const calls: Captured[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const requestInit = init ?? {}
    calls.push({ url: url.href, init: requestInit })
    return await handler(url, requestInit)
  }
  return { fetch: fetchImpl, calls }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function header(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name)
}

const SETTINGS: YunyingSettings = {
  endpoint: 'https://yunying.example',
  workspaceId: 'ws-1',
  keyId: 'key-1',
  signingKeyEnv: 'YUNYING_SIGNING_KEY',
  requestTimeoutMs: 1_000,
  maxRetries: 0,
}

function client(fetchImpl: typeof fetch, overrides: Partial<YunyingSettings> = {}): YunyingClient {
  return new YunyingClient({ ...SETTINGS, ...overrides }, {
    fetch: fetchImpl,
    resolveSigningKey: async () => 'signing-secret',
    now: () => 1_700_000_000_000,
    nonce: () => 'nonce-1',
    sleep: async () => undefined,
  })
}

describe('Yunying read-only adapter', () => {
  it('signs a canonical GET and parses the dashboard', async () => {
    const recorded = recordingFetch(async () => json({
      date: '2026-11-08',
      metrics: [{ key: 'viewers', label: 'Viewers', value: 1200, unit: 'people' }],
    }))
    await expect(client(recorded.fetch).overview()).resolves.toEqual({
      configured: true,
      dashboard: { date: '2026-11-08', metrics: [{ key: 'viewers', label: 'Viewers', value: 1200, unit: 'people' }] },
    })
    const call = recorded.calls[0]
    if (call === undefined) throw new Error('expected one request')
    expect(call.url).toBe('https://yunying.example/api/agent/dashboard/today?workspaceId=ws-1')
    expect(header(call.init, 'x-yunying-workspace')).toBe('ws-1')
    expect(header(call.init, 'x-yunying-key-id')).toBe('key-1')
    expect(header(call.init, 'x-yunying-timestamp')).toBe('1700000000')
    expect(header(call.init, 'x-yunying-nonce')).toBe('nonce-1')
    const expected = createHmac('sha256', 'signing-secret')
      .update('GET\n/api/agent/dashboard/today\nworkspaceId=ws-1\n1700000000\nnonce-1')
      .digest('hex')
    expect(header(call.init, 'x-yunying-signature')).toBe(expected)
  })

  it('sorts query fields and clamps a requested page size', async () => {
    const recorded = recordingFetch(async () => json({ items: [] }))
    await client(recorded.fetch).products({ cursor: 'next page', limit: 500 })
    const call = recorded.calls[0]
    if (call === undefined) throw new Error('expected one request')
    expect(call.url).toBe('https://yunying.example/api/agent/products?cursor=next%20page&limit=100&workspaceId=ws-1')
  })

  it('parses product and comment pages', async () => {
    const products = recordingFetch(async () => json({
      items: [{ id: 'p1', name: 'Live bundle', status: 'on-sale', price: 99, stock: 12 }],
      nextCursor: 'c2',
    }))
    await expect(client(products.fetch).products({})).resolves.toEqual({
      items: [{ id: 'p1', name: 'Live bundle', status: 'on-sale', price: 99, stock: 12 }], nextCursor: 'c2',
    })
    const comments = recordingFetch(async () => json({
      items: [{ id: 'c1', text: 'When is restock?', createdAt: '2026-11-08T10:00:00Z', author: 'viewer' }],
    }))
    await expect(client(comments.fetch).comments({ limit: 0 })).resolves.toMatchObject({ items: [{ id: 'c1' }] })
  })

  it('rejects a response that is not JSON or not the adapter contract', async () => {
    const notJson = recordingFetch(async () => new Response('nope', { status: 200 }))
    await expect(client(notJson.fetch).overview()).rejects.toMatchObject({ code: 'workbench/yunying-invalid-response' })
    const wrongShape = recordingFetch(async () => json({ date: '2026-11-08', metrics: 'many' }))
    await expect(client(wrongShape.fetch).overview()).rejects.toMatchObject({ code: 'workbench/yunying-invalid-response' })
  })

  it('does not retry a client failure', async () => {
    const recorded = recordingFetch(async () => json({ error: 'unauthorized' }, 401))
    await expect(client(recorded.fetch, { maxRetries: 2 }).overview()).rejects.toMatchObject({
      code: 'workbench/yunying-http', details: { status: 401 },
    })
    expect(recorded.calls).toHaveLength(1)
  })

  it('retries a server failure up to the configured cap', async () => {
    const recorded = recordingFetch(async () => json({ error: 'busy' }, 500))
    await expect(client(recorded.fetch, { maxRetries: 1 }).overview()).rejects.toMatchObject({
      code: 'workbench/yunying-http', details: { status: 500 },
    })
    expect(recorded.calls).toHaveLength(2)
  })

  it('turns exhausted network failures into one unavailable failure', async () => {
    const recorded = recordingFetch(async () => { throw new Error('ECONNREFUSED') })
    const sleep = vi.fn(async () => undefined)
    const subject = new YunyingClient({ ...SETTINGS, maxRetries: 2 }, {
      fetch: recorded.fetch,
      resolveSigningKey: async () => 'signing-secret',
      sleep,
    })
    await expect(subject.overview()).rejects.toMatchObject({ code: 'workbench/yunying-unavailable' })
    expect(recorded.calls).toHaveLength(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('fails one attempt at the request deadline', async () => {
    const recorded = recordingFetch(async (_url, init) => await new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => { reject(new Error('aborted by deadline')) }, { once: true })
    }))
    await expect(client(recorded.fetch, { requestTimeoutMs: 5 }).overview())
      .rejects.toMatchObject({ code: 'workbench/yunying-unavailable' })
    expect(recorded.calls).toHaveLength(1)
  })

  it('fails closed when the signing key is absent', async () => {
    const recorded = recordingFetch(async () => json({}))
    const subject = new YunyingClient(SETTINGS, {
      fetch: recorded.fetch,
      resolveSigningKey: async () => undefined,
    })
    await expect(subject.overview()).rejects.toMatchObject({ code: 'workbench/yunying-credentials' })
    expect(recorded.calls).toEqual([])
  })

  it('refuses reads while unconfigured', async () => {
    const recorded = recordingFetch(async () => json({}))
    await expect(client(recorded.fetch, { endpoint: '' }).overview())
      .rejects.toMatchObject({ code: 'workbench/yunying-not-configured' })
    expect(recorded.calls).toEqual([])
  })

  it('logs only method, path, attempt, and duration', async () => {
    const recorded = recordingFetch(async () => { throw new Error('ECONNRESET') })
    const warnings: string[] = []
    const subject = new YunyingClient(SETTINGS, {
      fetch: recorded.fetch,
      resolveSigningKey: async () => 'signing-secret',
      logger: { warn: (message) => { warnings.push(message) } },
    })
    await expect(subject.products({ cursor: 'private-cursor' })).rejects.toBeInstanceOf(WorkbenchError)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('GET /api/agent/products')
    expect(warnings[0]).not.toContain('private-cursor')
    expect(warnings[0]).not.toContain('signing-secret')
    expect(warnings[0]).not.toContain('workspaceId')
  })
})
