import { rmSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderFoldersContext } from '../src/folders.ts'
import { makeFolders, tempTree } from './helpers.ts'

describe('WorkspaceFolders', () => {
  it('merges global and workspace folders, the workspace entry winning', async () => {
    const tree = tempTree('ws', 'shared', 'lib')
    const folders = makeFolders(tree.root, {
      globalDirectories: [{ path: tree.path('shared'), access: 'read-only' }, { path: tree.path('ws/inner'), access: 'read-only' }],
    })
    await folders.store.set(tree.path('ws'), [
      { path: tree.path('lib'), access: 'read-write' },
      { path: tree.path('shared'), access: 'read-write' },
    ])
    expect(folders.effective(tree.path('ws'))).toEqual([
      { path: tree.path('lib'), access: 'read-write', source: 'workspace', exists: true },
      { path: tree.path('shared'), access: 'read-write', source: 'workspace', exists: true },
    ])
  })

  it('validates requested folders and canonicalizes them', () => {
    const tree = tempTree('ws/sub', 'lib')
    const folders = makeFolders(tree.root)
    expect(folders.validate(tree.path('ws'), [
      { path: `${tree.path('lib')}/`, access: 'read-only' },
      { path: tree.path('lib'), access: 'read-write' },
    ])).toEqual({ ok: true, entries: [{ path: tree.path('lib'), access: 'read-write' }] })
    expect(folders.validate(tree.path('ws'), [
      { path: tree.path('missing'), access: 'read-write' },
      { path: tree.path('ws/sub'), access: 'read-write' },
    ])).toEqual({
      ok: false,
      errors: [{ code: 'missing', path: tree.path('missing') }, { code: 'inside-workspace', path: tree.path('ws/sub') }],
    })
  })

  it('keeps a stored folder whose directory is temporarily missing', () => {
    const tree = tempTree('ws')
    const folders = makeFolders(tree.root)
    const gone = { path: tree.path('usb-drive'), access: 'read-only' as const }
    expect(folders.validate(tree.path('ws'), [gone], [gone])).toEqual({ ok: true, entries: [gone] })
  })

  it('grants writes only under existing read-write folders in workspace-write mode', async () => {
    const tree = tempTree('ws', 'rw', 'ro')
    const folders = makeFolders(tree.root)
    await folders.store.set(tree.path('ws'), [
      { path: tree.path('rw'), access: 'read-write' },
      { path: tree.path('ro'), access: 'read-only' },
    ])
    const ws = tree.path('ws')
    expect(folders.writeGrant(ws, 'workspace-write', tree.path('rw/a/b.txt'))?.path).toBe(tree.path('rw'))
    expect(folders.writeGrant(ws, 'workspace-write', tree.path('ro/b.txt'))).toBeUndefined()
    expect(folders.writeGrant(ws, 'workspace-write', tree.path('rw-sibling/b.txt'))).toBeUndefined()
    expect(folders.writeGrant(ws, 'read-only', tree.path('rw/b.txt'))).toBeUndefined()
    expect(folders.writeGrant(ws, 'danger-full-access', tree.path('rw/b.txt'))).toBeUndefined()
    rmSync(tree.path('rw'), { recursive: true })
    expect(folders.writeGrant(ws, 'workspace-write', tree.path('rw/b.txt'))).toBeUndefined()
  })

  it('never grants when pre-approval is disabled', async () => {
    const tree = tempTree('ws', 'rw')
    const folders = makeFolders(tree.root, { autoApproveWrites: false })
    await folders.store.set(tree.path('ws'), [{ path: tree.path('rw'), access: 'read-write' }])
    expect(folders.writeGrant(tree.path('ws'), 'workspace-write', tree.path('rw/x'))).toBeUndefined()
  })
})

describe('renderFoldersContext', () => {
  const folders = [
    { path: '/repo/lib', access: 'read-write', source: 'workspace', exists: true },
    { path: '/docs', access: 'read-only', source: 'global', exists: true },
    { path: '/gone', access: 'read-write', source: 'workspace', exists: false },
  ] as const

  it('is empty without folders', () => {
    expect(renderFoldersContext('/repo/app', [], 'workspace-write', true)).toBe('')
  })

  it('lists folders and explains pre-approved writes under workspace-write', () => {
    expect(renderFoldersContext('/repo/app', folders, 'workspace-write', true)).toBe([
      'Additional workspace directories: the user added these directories to this session\'s workspace, alongside "/repo/app". Treat them as part of the project and refer to their files by absolute path.',
      '- "/repo/lib" (read-write)',
      '- "/docs" (read-only: do not modify files here)',
      '- "/gone" (read-write; currently missing)',
      'To create or change a file in a read-write directory with the write or edit tool, pass sandbox_permissions "danger-full-access" with a justification on that call; this workspace\'s settings approve such calls without asking the user. Other operations that modify these directories follow the normal sandbox escalation flow.',
    ].join('\n'))
  })

  it('omits the write instruction when it would not hold', () => {
    for (const [mode, auto] of [['danger-full-access', true], ['read-only', true], ['workspace-write', false], [undefined, true]] as const) {
      expect(renderFoldersContext('/repo/app', folders, mode, auto)).not.toContain('sandbox_permissions')
    }
  })
})
