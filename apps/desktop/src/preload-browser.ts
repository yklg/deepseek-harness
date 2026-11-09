/** Lease-scoped browser operations and one main-process event subscription per window. */
import { ipcRenderer } from 'electron'
import type { DesktopBrowserLeaseId } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import { DESKTOP_IPC, type DshDesktopBrowserBridge } from './ipc.ts'

/** @returns browser operations that expose neither IPC nor Electron objects. */
export function createDesktopBrowserBridge(): DshDesktopBrowserBridge {
  const listeners = new Map<DesktopBrowserLeaseId, Set<(url: string) => void>>()
  const zoomListeners = new Map<DesktopBrowserLeaseId, Set<(factor: number) => void>>()
  ipcRenderer.on(DESKTOP_IPC.browserOpenRequested, (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null || !('lease' in request) || !('url' in request)
      || typeof request.lease !== 'string' || typeof request.url !== 'string') return
    const callbacks = listeners.get(request.lease as DesktopBrowserLeaseId)
    if (callbacks === undefined) return
    for (const callback of [...callbacks]) {
      try { callback(request.url) }
      catch (error) { console.error('Desktop browser link handler failed', error) }
    }
  })
  ipcRenderer.on(DESKTOP_IPC.browserZoomChanged, (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null || !('lease' in request) || !('factor' in request)
      || typeof request.lease !== 'string' || typeof request.factor !== 'number') return
    const callbacks = zoomListeners.get(request.lease as DesktopBrowserLeaseId)
    if (callbacks === undefined) return
    for (const callback of [...callbacks]) {
      try { callback(request.factor) }
      catch (error) { console.error('Desktop browser zoom handler failed', error) }
    }
  })
  return {
    acquire: (workspace, options) => ipcRenderer.invoke(DESKTOP_IPC.browserAcquire, workspace, options) as ReturnType<DshDesktopBrowserBridge['acquire']>,
    release: lease => ipcRenderer.invoke(DESKTOP_IPC.browserRelease, lease) as Promise<void>,
    clearStorage: workspace => ipcRenderer.invoke(DESKTOP_IPC.browserClearStorage, workspace) as Promise<void>,
    onOpenRequested(lease, listener) {
      let callbacks = listeners.get(lease)
      if (callbacks === undefined) { callbacks = new Set(); listeners.set(lease, callbacks) }
      callbacks.add(listener)
      return () => {
        callbacks.delete(listener)
        if (callbacks.size === 0 && listeners.get(lease) === callbacks) listeners.delete(lease)
      }
    },
    onZoomChanged(lease, listener) {
      let callbacks = zoomListeners.get(lease)
      if (callbacks === undefined) { callbacks = new Set(); zoomListeners.set(lease, callbacks) }
      callbacks.add(listener)
      return () => {
        callbacks.delete(listener)
        if (callbacks.size === 0 && zoomListeners.get(lease) === callbacks) zoomListeners.delete(lease)
      }
    },
  }
}
