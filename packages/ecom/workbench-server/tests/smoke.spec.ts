/** Smoke suite for the ecom workbench host skeleton: the Cordis plugin shape and Config validation. */
import { describe, expect, it } from 'vitest'
import * as WorkbenchServer from '../src/index.ts'

describe('ecom workbench host skeleton', () => {
  it('exports a function plugin named ecom-workbench', () => {
    expect(WorkbenchServer.name).toBe('ecom-workbench')
    expect(typeof WorkbenchServer.apply).toBe('function')
  })

  it('resolves every Config group from an empty row', () => {
    const config = WorkbenchServer.Config({})
    expect(config.yunying).toEqual({ endpoint: '', workspaceId: '' })
    expect(config.browser).toEqual({ enabled: false, headless: true })
    expect(config.automation).toEqual({ maxConcurrentRuns: 1, defaultTimeoutSeconds: 600 })
    expect(config.ai).toEqual({ model: '', temperature: 0.2 })
    expect(config.policy).toEqual({ requireApproval: true, allowedHosts: [] })
    expect(config.storage).toEqual({ root: '', retentionDays: 30 })
  })

  it('merges one configured group over its defaults', () => {
    const config = WorkbenchServer.Config({ automation: { maxConcurrentRuns: 4, defaultTimeoutSeconds: 600 } })
    expect(config.automation).toEqual({ maxConcurrentRuns: 4, defaultTimeoutSeconds: 600 })
  })

  it('rejects a configuration value outside its schema', () => {
    expect(() => WorkbenchServer.Config({ automation: { maxConcurrentRuns: 0, defaultTimeoutSeconds: 600 } })).toThrow()
  })
})
