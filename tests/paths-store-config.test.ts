import { readFileSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalTarget, isWithin, resolveInput } from '../src/paths.ts'
import { FolderStore } from '../src/store.ts'
import { defaultStoreFile, parseConfig } from '../src/config.ts'
import { MIN_INSTRUCTION_BYTES } from '../src/instructions.ts'
import { tempTree } from './helpers.ts'

describe('paths', () => {
  it('resolves typed paths: quotes, home, and relative text', () => {
    expect(resolveInput('  "/a/b c/"  ', '/base')).toBe('/a/b c')
    expect(resolveInput('~', '/base')).toBe(homedir())
    expect(resolveInput('~/notes', '/base')).toBe(join(homedir(), 'notes'))
    expect(resolveInput('../lib', '/base/app')).toBe('/base/lib')
  })

  it('judges a write target by where its existing ancestors really lead', () => {
    const tree = tempTree('granted', 'outside')
    symlinkSync(tree.path('outside'), tree.path('granted/escape'))
    expect(canonicalTarget(tree.path('granted/new/deep/file.txt'))).toBe(tree.path('granted/new/deep/file.txt'))
    expect(canonicalTarget(tree.path('granted/escape/file.txt'))).toBe(tree.path('outside/file.txt'))
  })

  it('treats containment by path segments, not string prefixes', () => {
    expect(isWithin('/a/b', '/a/b')).toBe(true)
    expect(isWithin('/a/b/c', '/a/b')).toBe(true)
    expect(isWithin('/a/bc', '/a/b')).toBe(false)
    expect(isWithin('/anything', '/')).toBe(true)
  })
})

describe('FolderStore', () => {
  it('starts empty without a file and persists each workspace list', async () => {
    const tree = tempTree()
    const file = tree.path('state/store.json')
    const store = new FolderStore(file)
    expect(store.get('/w')).toEqual([])
    await store.set('/w/', [{ path: '/x', access: 'read-only' }])
    expect(store.get('/w')).toEqual([{ path: '/x', access: 'read-only' }])
    expect(new FolderStore(file).get('/w')).toEqual([{ path: '/x', access: 'read-only' }])
    await store.set('/w', [])
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ version: 1, workspaces: {} })
  })

  it('keeps concurrent saves for different workspaces', async () => {
    const tree = tempTree()
    const file = tree.path('store.json')
    const store = new FolderStore(file)
    await Promise.all([
      store.set('/one', [{ path: '/a', access: 'read-write' }]),
      store.set('/two', [{ path: '/b', access: 'read-write' }]),
    ])
    const reloaded = new FolderStore(file)
    expect(reloaded.get('/one')).toHaveLength(1)
    expect(reloaded.get('/two')).toHaveLength(1)
  })

  it('refuses to load a malformed file instead of overwriting it later', () => {
    const tree = tempTree()
    const file = tree.path('store.json')
    writeFileSync(file, '{"version":1,"workspaces":{"/w":{"directories":[{"path":"relative","access":"read-write"}]}}}')
    expect(() => new FolderStore(file)).toThrow(/is malformed/u)
    writeFileSync(file, 'not json')
    expect(() => new FolderStore(file)).toThrow(/is malformed/u)
  })
})

describe('parseConfig', () => {
  it('applies defaults and the DSH home store location', () => {
    expect(parseConfig(undefined, { DSH_HOME: '/dsh-home' })).toEqual({
      autoApproveWrites: true,
      globalDirectories: [],
      storeFile: '/dsh-home/workspace-folders.json',
      loadInstructions: false,
      maxInstructionBytes: 32768,
    })
    expect(defaultStoreFile({})).toBe(join(homedir(), '.dsh', 'workspace-folders.json'))
  })

  it('expands and canonicalizes global directories', () => {
    const tree = tempTree('shared')
    mkdirSync(tree.path('link-target'))
    symlinkSync(tree.path('link-target'), tree.path('link'))
    const config = parseConfig({ globalDirectories: [{ path: tree.path('link'), access: 'read-only' }] })
    expect(config.globalDirectories).toEqual([{ path: tree.path('link-target'), access: 'read-only' }])
  })

  it('fails loudly on misconfiguration', () => {
    expect(() => parseConfig({ autoApprove: true })).toThrow(/unknown config key "autoApprove"/u)
    expect(() => parseConfig({ autoApproveWrites: 'yes' })).toThrow(/must be a boolean/u)
    expect(() => parseConfig({ storeFile: 'relative.json' })).toThrow(/absolute path/u)
    expect(() => parseConfig({ globalDirectories: [{ path: '/x', access: 'write' }] })).toThrow(/access must be/u)
    expect(() => parseConfig({ loadInstructions: 'yes' })).toThrow(/loadInstructions must be a boolean/u)
    for (const bad of ['4096', 1.5, -1, MIN_INSTRUCTION_BYTES - 1]) {
      expect(() => parseConfig({ maxInstructionBytes: bad })).toThrow(/maxInstructionBytes must be an integer of at least/u)
    }
    expect(parseConfig({ loadInstructions: true, maxInstructionBytes: MIN_INSTRUCTION_BYTES })).toMatchObject({
      loadInstructions: true,
      maxInstructionBytes: MIN_INSTRUCTION_BYTES,
    })
  })
})
