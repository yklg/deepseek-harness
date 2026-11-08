/** Workbench glyph for the sidebar's launcher row; the sidebar owns the row button and its accessible label. */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Draw the workbench mark at the size the sidebar row requests.
 * @param props - the sidebar's icon share: requested edge and selection state.
 * @returns a decorative grid glyph.
 */
export function WorkbenchIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.25" y="2.25" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <rect x="9.25" y="2.25" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <rect x="2.25" y="9.25" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M9.25 11.5h4.5M11.5 9.25v4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
