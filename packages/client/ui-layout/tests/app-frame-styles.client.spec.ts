/** Frame grid/style contracts for the swapped column order. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')

function rule(selector: string): string {
  const match = new RegExp(`(?:^|\\n)[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^{}]*)}`).exec(css)
  if (match === null) throw new Error(`missing rule: ${selector}`)
  return match[1] ?? ''
}

describe('AppFrame.module.css column order', () => {
  it('places the browser rail second and the conversation third', () => {
    expect(rule('.rightbarCol')).toMatch(/grid-column:\s*2;/)
    expect(rule('.centerCol')).toMatch(/grid-column:\s*3;/)
  })

  it('gives the rounded Windows content corner to whichever column meets the sidebar', () => {
    expect(css).toMatch(/\.frame:not\(\[data-rightbar-collapsed\]\) \.rightbarCol,/)
    expect(css).toMatch(/\.frame\[data-rightbar-collapsed\] \.centerCol\s*\{[^{}]*border-radius:/)
  })

  it('makes the browser rail column own the base background', () => {
    expect(rule('.rightbarCol')).toMatch(/background:\s*var\(--dsw-alias-bg-base\);/)
  })
})
