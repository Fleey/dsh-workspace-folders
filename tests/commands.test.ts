import { describe, expect, it } from 'vitest'
import { folderCommands, parseAddDirInput } from '../src/commands.ts'
import type { WorkspaceFolders } from '../src/folders.ts'
import type { AgentLike, CommandResult } from '../src/types.ts'
import { makeAgent, makeFolders, recordingLogger, tempTree } from './helpers.ts'

function commands(folders: WorkspaceFolders, cwdOverride?: string) {
  const changed: string[] = []
  const defs = folderCommands({
    folders,
    logger: recordingLogger(),
    workingDirectory: () => cwdOverride === undefined ? undefined : { get: () => cwdOverride },
    changed: workspace => changed.push(workspace),
  })
  const run = async (name: string, agent: AgentLike, rawInput = ''): Promise<CommandResult> => {
    const def = defs.find(entry => entry.name === name)
    if (def === undefined) throw new Error(`no /${name}`)
    return await def.handler({ agent, rawInput })
  }
  return { run, changed, names: defs.map(entry => entry.name) }
}

describe('parseAddDirInput', () => {
  it('splits flags from paths that contain spaces', () => {
    expect(parseAddDirInput(' /a/my docs ')).toEqual({ path: '/a/my docs', access: 'read-write' })
    expect(parseAddDirInput(' /a/my docs --read-only')).toEqual({ path: '/a/my docs', access: 'read-only' })
    expect(parseAddDirInput('--ro ~/x')).toEqual({ path: '~/x', access: 'read-only' })
    expect(parseAddDirInput('   ')).toEqual({ path: '', access: 'read-write' })
  })
})

describe('slash commands', () => {
  it('registers /add-dir, /remove-dir, and /dirs', () => {
    const tree = tempTree('ws')
    expect(commands(makeFolders(tree.root)).names).toEqual(['add-dir', 'remove-dir', 'dirs'])
  })

  it('adds, lists, and removes folders for the session workspace', async () => {
    const tree = tempTree('ws', 'lib', 'docs')
    const folders = makeFolders(tree.root)
    const { run, changed } = commands(folders)
    const agent = makeAgent(tree.path('ws'))

    expect(await run('add-dir', agent, ` ${tree.path('lib')} `)).toEqual({
      kind: 'success', text: `Added ${tree.path('lib')} (read-write). It applies from the next turn.`,
    })
    expect(await run('add-dir', agent, `../docs --read-only`)).toMatchObject({ kind: 'success' })
    expect(folders.store.get(tree.path('ws'))).toEqual([
      { path: tree.path('lib'), access: 'read-write' },
      { path: tree.path('docs'), access: 'read-only' },
    ])
    expect(await run('dirs', agent)).toEqual({
      kind: 'success',
      text: [
        `Workspace: ${tree.path('ws')}`,
        'Additional directories:',
        `  ${tree.path('lib')} (read-write)`,
        `  ${tree.path('docs')} (read-only)`,
      ].join('\n'),
    })
    expect(await run('remove-dir', agent, tree.path('lib'))).toMatchObject({ kind: 'success' })
    expect(folders.store.get(tree.path('ws'))).toEqual([{ path: tree.path('docs'), access: 'read-only' }])
    expect(changed).toEqual([tree.path('ws'), tree.path('ws'), tree.path('ws')])
  })

  it('resolves relative paths against the current working directory', async () => {
    const tree = tempTree('ws/app', 'ws-sibling')
    const folders = makeFolders(tree.root)
    const { run } = commands(folders, tree.path('ws/app'))
    expect(await run('add-dir', makeAgent(tree.path('ws')), '../../ws-sibling')).toMatchObject({ kind: 'success' })
    expect(folders.store.get(tree.path('ws'))).toEqual([{ path: tree.path('ws-sibling'), access: 'read-write' }])
  })

  it('reports invalid requests without writing', async () => {
    const tree = tempTree('ws/sub')
    const folders = makeFolders(tree.root, { globalDirectories: [{ path: '/global-dir', access: 'read-only' }] })
    const { run, changed } = commands(folders)
    const agent = makeAgent(tree.path('ws'))
    expect(await run('add-dir', agent, '')).toEqual({ kind: 'error', text: 'Usage: /add-dir <path> [--read-only]' })
    expect(await run('add-dir', agent, 'sub')).toEqual({ kind: 'error', text: `already inside the workspace: ${tree.path('ws/sub')}` })
    expect(await run('add-dir', agent, '/definitely/missing')).toEqual({ kind: 'error', text: 'not an existing directory: /definitely/missing' })
    expect(await run('remove-dir', agent, '/elsewhere')).toEqual({ kind: 'error', text: '/elsewhere is not an additional directory of this workspace.' })
    expect(await run('remove-dir', agent, '/global-dir')).toMatchObject({ kind: 'error', text: expect.stringContaining('globalDirectories') })
    expect(await run('dirs', makeAgent(undefined))).toEqual({ kind: 'error', text: 'This session has no workspace directory.' })
    expect(changed).toEqual([])
  })
})
