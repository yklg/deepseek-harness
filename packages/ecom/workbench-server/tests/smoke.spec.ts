/** Smoke suite for the ecom workbench host: plugin shape and Config validation. */
import { Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import WorkbenchService, { Config } from '../src/index.ts'

describe('ecom workbench host', () => {
  it('exports the service class as the default plugin', () => {
    expect(typeof WorkbenchService).toBe('function')
    expect(WorkbenchService.inject).toEqual(['tools'])
    expect(WorkbenchService.Config).toBe(Config)
    expect(typeof WorkbenchService.prototype[Service.init]).toBe('function')
  })

  it('resolves every Config group from an empty row', () => {
    const config = Config({})
    expect(config.yunying).toEqual({
      endpoint: '',
      workspaceId: '',
      keyId: '',
      signingKeyEnv: 'YUNYING_SIGNING_KEY',
      requestTimeoutMs: 5_000,
      maxRetries: 2,
    })
    expect(config.browser).toEqual({ enabled: false, headless: true })
    expect(config.automation).toEqual({ maxConcurrentRuns: 1, defaultTimeoutSeconds: 600 })
    expect(config.ai).toEqual({ model: '', temperature: 0.2 })
    expect(config.policy).toEqual({ requireApproval: true, allowedHosts: [] })
    expect(config.storage).toEqual({ root: '', retentionDays: 30 })
  })

  it('merges one configured group over its defaults', () => {
    const config = Config({ automation: { maxConcurrentRuns: 4, defaultTimeoutSeconds: 120 } })
    expect(config.automation).toEqual({ maxConcurrentRuns: 4, defaultTimeoutSeconds: 120 })
    expect(config.yunying.maxRetries).toBe(2)
  })

  it('rejects a configuration value outside its schema', () => {
    expect(() => Config({ automation: { maxConcurrentRuns: 0, defaultTimeoutSeconds: 600 } })).toThrow()
    expect(() => Config({ yunying: { maxRetries: 9 } })).toThrow()
  })
})
