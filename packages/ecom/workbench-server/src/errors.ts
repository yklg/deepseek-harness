/** Typed failure shared by the workbench transport, automation, and Yunying reads. */

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkbenchFailureCode, WorkbenchFailureDetails } from './types.ts'

/** One workbench failure carrying a stable code across the Remote boundary. */
export class WorkbenchError extends RemoteError<WorkbenchFailureCode> {
  /**
   * @param code - stable failure code declared in {@link WorkbenchFailureDetails}.
   * @param message - human diagnostic for the caller and logs.
   * @param details - structured context; never contains credentials or response bodies.
   * @param options - standard Error options.
   */
  constructor(
    code: WorkbenchFailureCode,
    message: string,
    details: WorkbenchFailureDetails = {},
    options?: ErrorOptions,
  ) {
    super(code, message, details, options)
    this.name = 'WorkbenchError'
  }
}

/** Every failure code this package may put on the wire. */
export const WORKBENCH_FAILURE_CODES: readonly WorkbenchFailureCode[] = [
  'workbench/disabled',
  'workbench/unavailable',
  'workbench/disconnected',
  'workbench/timeout',
  'workbench/protocol',
  'workbench/invalid-request',
  'workbench/origin-denied',
  'workbench/result-not-json',
  'target/not-found',
  'target/ambiguous',
  'target/origin-denied',
  'target/closed',
  'script/too-large',
  'script/timeout',
  'result/not-json',
  'result/too-large',
  'workbench/yunying-not-configured',
  'workbench/yunying-credentials',
  'workbench/yunying-http',
  'workbench/yunying-unavailable',
  'workbench/yunying-invalid-response',
]

const FAILURE_CODES = new Set<string>(WORKBENCH_FAILURE_CODES)

/**
 * Narrow one wire failure code to this package's vocabulary.
 * @param value - code received from the private channel.
 * @returns whether the code is one this package reports.
 */
export function isWorkbenchFailureCode(value: string): value is WorkbenchFailureCode {
  return FAILURE_CODES.has(value)
}

/**
 * Name the automation failure hidden in a caught value.
 * @param error - caught value.
 * @returns its failure code, or undefined when it is not a workbench failure.
 */
export function workbenchFailureCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') return error.code
  return undefined
}
