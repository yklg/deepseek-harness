/**
 * Login probe over the Host automation broker: attach one guest on the
 * platform origins, evaluate the platform's read-only probe script, release
 * the guest, and validate the JSON snapshot before the console controller
 * reads a login state from it.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  WorkbenchAttachRequest, WorkbenchDetachRequest, WorkbenchEvalRequest, WorkbenchEvalResult, WorkbenchTarget,
} from '@deepseek-ai/dsh-ecom-workbench-server/types'
import type { ConsoleProbePort } from './ConsoleController.ts'
import type { PlatformProbe } from './platforms.ts'

/** The workbench Remote methods a login probe calls. */
export interface WorkbenchProbeRemote {
  /**
   * Attach a guest on the requested origins.
   * @param request - origins the guest may keep while it is evaluated.
   * @param signal - aborts the call when the platform changes or the controller disposes.
   * @returns the attached automation target.
   */
  attach(request: WorkbenchAttachRequest, signal?: AbortSignal): Promise<RemoteResult<WorkbenchTarget>>
  /**
   * Evaluate a read-only script in an attached guest.
   * @param request - attached target and the script to run.
   * @param signal - aborts the call when the platform changes or the controller disposes.
   * @returns the wire-safe script result.
   */
  evaluate(request: WorkbenchEvalRequest, signal?: AbortSignal): Promise<RemoteResult<WorkbenchEvalResult>>
  /**
   * Release an attached guest.
   * @param request - attached target to release.
   * @param signal - aborts the call; a login probe releases without one, so cancellation never retains a lease.
   * @returns a successful result once the broker released the target.
   */
  detach(request: WorkbenchDetachRequest, signal?: AbortSignal): Promise<RemoteResult<null>>
}

/** Guest text is clamped to the same 6000 characters the platform probe scripts collect. */
const MAX_PROBE_TEXT = 6000

/**
 * @param value - parsed JSON value.
 * @returns whether the value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Validate the probe JSON the broker accepted from the guest.
 * @param json - JSON text encoded by the probe script.
 * @returns the snapshot the console controller consumes.
 * @throws Error when the text is not JSON or does not carry the three string fields.
 */
function parseProbe(json: string): PlatformProbe {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    // JSON.parse is the only statement in the try; any failure means the broker accepted non-JSON text.
    throw new Error('probe result is not JSON')
  }
  if (!isRecord(parsed)) throw new Error('probe result is not an object')
  const { url, title, text } = parsed
  if (typeof url !== 'string' || typeof title !== 'string' || typeof text !== 'string') {
    throw new Error('probe result must carry string url, title, and text')
  }
  return { url, title, text: text.slice(0, MAX_PROBE_TEXT) }
}

/**
 * @param result - one Remote call result.
 * @returns the value of a successful call.
 * @throws Error naming the Remote failure code and its diagnostic message.
 */
function unwrapRemote<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(`${result.error.code}: ${result.error.message}`)
}

/**
 * Build the login probe over the Host automation broker.
 * @param remote - workbench Remote methods from the client assembly.
 * @returns a console probe port that attaches, evaluates, and always releases the guest.
 */
export function createWorkbenchProbe(remote: WorkbenchProbeRemote): ConsoleProbePort {
  return async (platform, signal) => {
    const target = unwrapRemote(await remote.attach({ allowOrigins: platform.origins }, signal))
    try {
      const result = unwrapRemote(await remote.evaluate({ targetId: target.targetId, script: platform.probeScript }, signal))
      return parseProbe(result.json)
    } finally {
      // The guest lease is this probe's, so release it on both the success and
      // failure paths. Release ignores the probe signal: cancellation must not
      // retain a target; a failed release must not replace the probe outcome.
      try {
        await remote.detach({ targetId: target.targetId })
      } catch {
        // Best effort: the broker still owns a guest that refused release.
      }
    }
  }
}
