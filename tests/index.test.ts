import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply, name } from '../src/index.ts'
import type { AssembleContextLike, CommandsLike, FetchRouteLike, PluginContext, ScopedContext, SystemPromptLike } from '../src/types.ts'
import { makeAgent, policy, recordingLogger, tempTree } from './helpers.ts'

type Listener = (...args: never[]) => unknown

/** A recording stand-in for the Cordis context with every optional service present. */
function fakeContext() {
  const contexts: Parameters<SystemPromptLike['context']>[0][] = []
  const commands: string[] = []
  const routes: FetchRouteLike[] = []
  const listeners: { name: string; prepend: boolean }[] = []
  const services: Record<string, unknown> = { sandboxPolicy: policy('workspace-write') }
  const scoped = {
    systemPrompt: {
      context: (context) => { contexts.push(context); return () => {} },
      getContextOrder: () => 110,
    } satisfies SystemPromptLike,
    commands: { register: (definition) => { commands.push(definition.name); return () => {} } } satisfies CommandsLike,
    connection: { fetch: { register: (route: FetchRouteLike) => { routes.push(route); return async () => {} } } },
  }
  const ctx = {
    logger: recordingLogger(),
    get: (service: string) => services[service],
    inject: (_deps: readonly string[], callback: (scope: ScopedContext) => void) => callback({ ...ctx, ...scoped } as unknown as ScopedContext),
    effect: () => {},
    on: (event: string, _listener: Listener, options?: { prepend: boolean }) => {
      listeners.push({ name: event, prepend: options?.prepend ?? false })
      return () => {}
    },
  } as unknown as PluginContext
  return { ctx, contexts, commands, routes, listeners }
}

describe('plugin entry', () => {
  it('wires the model context, approver, commands, and routes', async () => {
    const tree = tempTree('ws', 'lib')
    const { ctx, contexts, commands, routes, listeners } = fakeContext()
    apply(ctx, { storeFile: tree.path('store.json') })

    expect(name).toBe('dsh-workspace-folders')
    expect(listeners).toEqual([
      { name: 'tools/execute', prepend: false },
      { name: 'approval/request', prepend: true },
    ])
    expect(commands).toEqual(['add-dir', 'remove-dir', 'dirs'])
    expect(routes.map(route => route.path)).toEqual([
      '/api/workspace-folders/state', '/api/workspace-folders/save', '/api/workspace-folders/pick', '/api/workspace-folders/browse',
    ])

    expect(contexts).toHaveLength(1)
    const [context] = contexts
    expect(context).toMatchObject({ name: 'workspace-folders', order: 111, required: true, interpolate: false })
    const assembly: AssembleContextLike = { agent: makeAgent(tree.path('ws')) }
    expect(context?.text(assembly)).toBe('')
    expect(context?.text({})).toBe('')

    const response = await routes[0]?.fetch(new Request('http://h/api/workspace-folders/state?sessionId=x'))
    expect(response?.status).toBe(404)
  })

  it('describes folders added by command in the next model context', async () => {
    const tree = tempTree('ws', 'lib')
    const { ctx, contexts } = fakeContext()
    const registered: Parameters<CommandsLike['register']>[0][] = []
    const withCommands = {
      ...ctx,
      inject: (deps: readonly string[], callback: (scope: ScopedContext) => void) => ctx.inject(deps, scope => callback({
        ...scope,
        commands: { register: (definition) => { registered.push(definition); return () => {} } },
      } as ScopedContext)),
    } as PluginContext
    apply(withCommands, { storeFile: tree.path('store.json') })
    const agent = makeAgent(tree.path('ws'))
    await registered.find(command => command.name === 'add-dir')?.handler({ agent, rawInput: tree.path('lib') })
    expect(contexts[0]?.text({ agent })).toContain(`- ${JSON.stringify(tree.path('lib'))} (read-write)`)
  })

  it('adds folder instructions as a second context only when loadInstructions is set', async () => {
    const tree = tempTree('ws', 'lib', 'docs')
    writeFileSync(tree.path('lib/AGENTS.md'), 'lib agents rules')
    writeFileSync(tree.path('docs/CLAUDE.md'), 'docs claude rules')
    const { ctx, contexts } = fakeContext()
    const registered: Parameters<CommandsLike['register']>[0][] = []
    const withCommands = {
      ...ctx,
      inject: (deps: readonly string[], callback: (scope: ScopedContext) => void) => ctx.inject(deps, scope => callback({
        ...scope,
        commands: { register: (definition) => { registered.push(definition); return () => {} } },
      } as ScopedContext)),
    } as PluginContext
    apply(withCommands, { storeFile: tree.path('store.json'), loadInstructions: true })
    expect(contexts.map(({ name, order, required, interpolate }) => ({ name, order, required, interpolate }))).toEqual([
      { name: 'workspace-folders', order: 111, required: true, interpolate: false },
      { name: 'workspace-folders:instructions', order: 112, required: true, interpolate: false },
    ])
    const agent = makeAgent(tree.path('ws'))
    const instructions = contexts[1]
    expect(instructions?.text({ agent })).toBe('')
    expect(instructions?.text({})).toBe('')
    const addDir = registered.find(command => command.name === 'add-dir')
    await addDir?.handler({ agent, rawInput: tree.path('lib') })
    await addDir?.handler({ agent, rawInput: `${tree.path('docs')} --read-only` })
    const text = instructions?.text({ agent }) ?? ''
    expect(text).toContain(`${JSON.stringify(tree.path('lib'))} (from AGENTS.md):\n\nlib agents rules`)
    expect(text).toContain(`${JSON.stringify(tree.path('docs'))} (from CLAUDE.md):\n\ndocs claude rules`)
    writeFileSync(tree.path('lib/AGENTS.md'), 'edited lib rules')
    expect(instructions?.text({ agent })).toContain('edited lib rules')
  })

  it('rejects misconfiguration at load', () => {
    const { ctx } = fakeContext()
    expect(() => apply(ctx, { autoApproveWrites: 1 })).toThrow(/autoApproveWrites must be a boolean/u)
  })
})
