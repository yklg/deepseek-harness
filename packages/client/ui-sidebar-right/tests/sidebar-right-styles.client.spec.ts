/** Right sidebar rail anchoring, closed-state and reveal-flash style contracts. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/shell/SidebarRight.module.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')

/** The declarations of one rule whose selector starts a line in the sheet. */
function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(String.raw`^${escaped}\s*\{([^{}]*)}`, 'm').exec(css)?.[1] ?? ''
}

describe('SidebarRight.module.css', () => {
  it('fills the rail track from the column\'s left edge so the track animation sizes the panel', () => {
    const panel = declarations('.panel')
    expect(panel).toMatch(/position: absolute;/)
    expect(panel).toMatch(/left: 0;/)
    expect(panel).toMatch(/right: auto;/)
    expect(panel).toMatch(/overflow: clip;/)
    // The width is inline (`100%`): the frame's animated track owns it.
    expect(panel).not.toMatch(/(?:^|[\s;])width:/)
  })

  it('right-anchors the fullscreen panel to the viewport beneath the native caption', () => {
    const fullscreen = declarations(".panel[data-sidebar-right-panel='fullscreen']")
    expect(fullscreen).toMatch(/position: fixed;/)
    expect(fullscreen).toMatch(/right: 0;/)
    expect(fullscreen).toMatch(/left: auto;/)
    expect(fullscreen).toMatch(/top: var\(--dsh-windows-titlebar-height, 0px\);/)
    // A fixed box is its own stacking context; 40 is the layer its content stated from the frame.
    expect(fullscreen).toMatch(/z-index: 40;/)
    expect(css).toMatch(new RegExp(
      String.raw`:global\(\[data-windows-titlebar\]\) \.panel\[data-sidebar-right-panel='fullscreen'\]\s*\{\s*`
      + String.raw`max-width: calc\(100vw - var\(--dsh-windows-sidebar-width\)\);\s*}`,
    ))
  })

  it('hides docked content while the rail is collapsed instead of sliding the panel off an edge', () => {
    const host = String.raw`:global\(\[data-dockkit-host='dock'\]\)`
    expect(css).toMatch(new RegExp(String.raw`\.panel ${host}[^{}]*\{\s*visibility: hidden;\s*transition: visibility 0s linear var\(--ds-transition-duration-slow\);`))
    expect(css).toMatch(new RegExp(String.raw`\.panel\[data-sidebar-right-open\] ${host}[^{}]*\{\s*visibility: visible;\s*transition: none;`))
    expect(css).not.toMatch(/transform: translateX/)
    expect(css).not.toMatch(/@starting-style/)
    expect(css).not.toMatch(/data-sidebar-right-opening/)
  })

  it('removes the closed-state visibility delay for reduced motion', () => {
    const host = String.raw`:global\(\[data-dockkit-host='dock'\]\)`
    expect(css).toMatch(new RegExp(String.raw`@media \(prefers-reduced-motion: reduce\)\s*\{[^{}]*`
      + String.raw`\.panel\[data-sidebar-right-open\] ${host}[^{}]*\{\s*transition: none;\s*}`))
  })

  it('draws the reveal glow inside a docked pane above sticky code banners, and outside a floating panel over its own shadow', () => {
    const pane = String.raw`\.panel :global\(\[data-dockkit-pane\]\[data-sidebar-right-flash\]\)`
    const float = String.raw`\.panel :global\(\[data-dockkit-float\]\[data-sidebar-right-flash\]\)`
    const layer = new RegExp(String.raw`${pane}::after\s*\{([^{}]*)}`).exec(css)?.[1] ?? ''
    expect(layer).toMatch(/content: '';\s*position: absolute;\s*inset: 0;\s*z-index: 7;\s*pointer-events: none;/)
    expect(layer).toMatch(/--sidebar-right-flash-from:\s*inset /)
    expect(css).toMatch(new RegExp(String.raw`${pane}\s*\{\s*position: relative;\s*}`))
    const panel = new RegExp(String.raw`${float}\s*\{(\s*--sidebar-right-flash-from[^{}]*)}`).exec(css)?.[1] ?? ''
    expect(panel).toMatch(/--sidebar-right-flash-from:\s*var\(--dsw-elevation-prominent\),/)
    expect(panel).toMatch(/--sidebar-right-flash-to:\s*var\(--dsw-elevation-prominent\),/)
  })
})
