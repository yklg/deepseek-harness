/** Desktop profile initialization and product-bundle migration. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createPluginProfile, ensureProfileBundles } from '../src/project-manager.ts'

const PRODUCT_BUNDLE = '@deepseek-ai/dsh-bundle-ecom-workbench'
const WEB_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
const directories: string[] = []

async function profileDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-profile-bundles-'))
  directories.push(dir)
  return dir
}

async function manifest(dir: string): Promise<{ dsh?: { profile?: { bundles?: string[] } } }> {
  return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('createPluginProfile', () => {
  it('initializes the product profile with the workbench bundle layer', async () => {
    const dir = await profileDir()
    createPluginProfile(dir)
    expect((await manifest(dir)).dsh?.profile?.bundles).toEqual([...WEB_BUNDLES, PRODUCT_BUNDLE])
  })
})

describe('ensureProfileBundles', () => {
  it('migrates a legacy Web-template profile and stays idempotent', async () => {
    const dir = await profileDir()
    await writeFile(join(dir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop', private: true, dependencies: {}, dsh: { profile: { bundles: [...WEB_BUNDLES] } },
    }, undefined, 2)}\n`)

    expect(ensureProfileBundles(dir)).toBe(true)
    expect((await manifest(dir)).dsh?.profile?.bundles).toEqual([...WEB_BUNDLES, PRODUCT_BUNDLE])
    expect(ensureProfileBundles(dir)).toBe(false)
  })

  it('preserves explicitly configured bundles while appending the product layer', async () => {
    const dir = await profileDir()
    await writeFile(join(dir, 'package.json'), `${JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@example/team-bundle'] } },
    }, undefined, 2)}\n`)

    await ensureProfileBundles(dir)
    expect((await manifest(dir)).dsh?.profile?.bundles).toEqual([
      '@deepseek-ai/dsh-base', '@example/team-bundle', '@deepseek-ai/dsh-web-app', PRODUCT_BUNDLE,
    ])
  })

  it('initializes a missing profile', async () => {
    const dir = await profileDir()
    expect(ensureProfileBundles(dir)).toBe(true)
    expect((await manifest(dir)).dsh?.profile?.bundles).toEqual([...WEB_BUNDLES, PRODUCT_BUNDLE])
  })

  it('fails loud on a corrupt manifest or bundle list', async () => {
    const corrupt = await profileDir()
    await writeFile(join(corrupt, 'package.json'), '{ not json')
    expect(() => ensureProfileBundles(corrupt)).toThrow(/cannot parse/)

    const invalid = await profileDir()
    await writeFile(join(invalid, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: 'base' } } }))
    expect(() => ensureProfileBundles(invalid)).toThrow(/bundles string list/)
  })
})
