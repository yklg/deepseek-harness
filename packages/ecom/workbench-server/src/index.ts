/**
 * Host half of the ecom workbench bundle: the configuration surface the
 * workbench capabilities will read once they exist, and an empty plugin body.
 * The package owns no tool, prompt section, context contribution, or session
 * event in this skeleton.
 * @module @deepseek-ai/dsh-ecom-workbench-server
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/** Cordis plugin name for the workbench host row. */
export const name = 'ecom-workbench'

/**
 * Workbench configuration grouped by the capability that will consume it.
 * Every group is optional at the row; the resolved groups exist because each
 * nested field has a default, so a row may enable a capability with no further
 * configuration.
 */
export interface Config {
  /** Yunying operations-platform connection. */
  yunying: {
    /** Base URL of the operations platform; an empty value leaves the capability unconfigured. */
    endpoint: string
    /** Operations-platform workspace whose records the workbench reads. */
    workspaceId: string
  }
  /** Embedded browser automation. */
  browser: {
    /** Whether the workbench may drive the product browser guest. */
    enabled: boolean
    /** Whether browser automation runs without showing its window. */
    headless: boolean
  }
  /** Automation scheduling defaults. */
  automation: {
    /** Maximum concurrently running workbench automations. */
    maxConcurrentRuns: number
    /** Default per-run timeout in seconds. */
    defaultTimeoutSeconds: number
  }
  /** AI assistance used by workbench features. */
  ai: {
    /** Model id the workbench assistants request; an empty value uses the profile default. */
    model: string
    /** Sampling temperature for workbench assistant requests. */
    temperature: number
  }
  /** Policy gates applied to every workbench action. */
  policy: {
    /** Whether actions require explicit user approval before they run. */
    requireApproval: boolean
    /** Host allowlist for actions that reach the network; empty means no allowlist item. */
    allowedHosts: string[]
  }
  /** Workbench record storage. */
  storage: {
    /** Directory holding workbench records; an empty value uses the profile home. */
    root: string
    /** Retention period for stored workbench records, in days. */
    retentionDays: number
  }
}

/**
 * Deployment configuration for the workbench host row; the capability packages
 * added later validate their own group at load and fail loud on a bad value.
 */
export const Config: z<Config> = z.object({
  yunying: z.object({
    endpoint: z.string().default(''),
    workspaceId: z.string().default(''),
  }),
  browser: z.object({
    enabled: z.boolean().default(false),
    headless: z.boolean().default(true),
  }),
  automation: z.object({
    maxConcurrentRuns: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
    defaultTimeoutSeconds: z.natural().min(1).max(2_147_483_647).default(600),
  }),
  ai: z.object({
    model: z.string().default(''),
    temperature: z.number().min(0).max(2).default(0.2),
  }),
  policy: z.object({
    requireApproval: z.boolean().default(true),
    allowedHosts: z.array(z.string()).default([]),
  }),
  storage: z.object({
    root: z.string().default(''),
    retentionDays: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(30),
  }),
})

/**
 * Register the workbench host capabilities.
 * The row is a composition placeholder: it resolves and validates
 * {@link Config} so a deployment can already state its settings, and adds no
 * runtime behavior until the capability packages arrive.
 * @param _ctx - Host context the capabilities will use.
 * @param _config - resolved workbench configuration.
 */
export function apply(_ctx: Context, _config: Config): void {}
