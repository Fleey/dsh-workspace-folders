import { describe, expect, it } from 'vitest'
import { folderRoutes, type RouteDeps } from '../src/routes.ts'
import type { FetchRouteLike, SessionLike } from '../src/types.ts'
import { makeFolders, policy, tempTree } from './helpers.ts'

function routes(overrides: Partial<RouteDeps> & Pick<RouteDeps, 'folders'>) {
  const changed: string[] = []
  const list = folderRoutes({
    sessions: () => undefined,
    workspaceRegistry: () => undefined,
    sandboxPolicy: () => policy('workspace-write'),
    directoryPicker: () => undefined,
    changed: workspace => changed.push(workspace),
    ...overrides,
  })
  const call = async (path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> => {
    const url = new URL(path, 'http://127.0.0.1:3080')
    const route = list.find(entry => entry.path === url.pathname) as FetchRouteLike
    const response = await route.fetch(new Request(url, init))
    return { status: response.status, body: await response.json() as Record<string, unknown> }
  }
  return { list, call, changed }
}

const post = (body: unknown, type = 'application/json'): RequestInit => ({
  method: 'POST', headers: { 'content-type': type }, body: JSON.stringify(body),
})

describe('routes', () => {
  it('registers its exact routes below /api', () => {
    const tree = tempTree()
    expect(routes({ folders: makeFolders(tree.root) }).list.map(route => [route.path, route.methods])).toEqual([
      ['/api/workspace-folders/state', ['GET']],
      ['/api/workspace-folders/save', ['POST']],
      ['/api/workspace-folders/pick', ['POST']],
      ['/api/workspace-folders/browse', ['GET']],
      ['/api/workspace-folders/resolve', ['GET']],
    ])
  })

  it('reads and saves the folders of a live session\'s workspace', async () => {
    const tree = tempTree('ws', 'lib', 'docs')
    const folders = makeFolders(tree.root)
    const session: SessionLike = { id: 's1', header: { cwd: tree.path('ws') } }
    const { call, changed } = routes({ folders, sessions: () => ({ get: id => id === 's1' ? session : undefined }) })

    expect(await call('/api/workspace-folders/state?sessionId=s1')).toEqual({
      status: 200,
      body: { ok: true, data: { workspace: tree.path('ws'), directories: [], sandboxMode: 'workspace-write', autoApproveWrites: true, picker: null } },
    })
    const saved = await call('/api/workspace-folders/save', post({
      sessionId: 's1',
      directories: [{ path: tree.path('lib'), access: 'read-write' }, { path: '../docs', access: 'read-only' }],
    }))
    expect(saved.status).toBe(200)
    expect((saved.body.data as { directories: unknown }).directories).toEqual([
      { path: tree.path('lib'), access: 'read-write', source: 'workspace', exists: true },
      { path: tree.path('docs'), access: 'read-only', source: 'workspace', exists: true },
    ])
    expect(changed).toEqual([tree.path('ws')])
  })

  it('finds an inactive session through the workspace registry', async () => {
    const tree = tempTree('ws')
    const { call } = routes({
      folders: makeFolders(tree.root),
      workspaceRegistry: () => ({ list: () => [{ id: 'w1', path: tree.path('ws'), sessionIds: ['cold'] }] }),
    })
    const { status, body } = await call('/api/workspace-folders/state?sessionId=cold')
    expect(status).toBe(200)
    expect(body.data).toMatchObject({ workspace: tree.path('ws'), sandboxMode: null })
  })

  it('rejects bad requests with actionable errors and writes nothing', async () => {
    const tree = tempTree('ws/sub')
    const folders = makeFolders(tree.root)
    const session: SessionLike = { id: 's1', header: { cwd: tree.path('ws') } }
    const { call, changed } = routes({ folders, sessions: () => ({ get: () => session }) })
    expect(await call('/api/workspace-folders/state')).toEqual({ status: 400, body: { ok: false, error: 'sessionId is required' } })
    expect((await call('/api/workspace-folders/save', post({ sessionId: 's1', directories: [] }, 'text/plain'))).status).toBe(415)
    expect(await call('/api/workspace-folders/save', post({ sessionId: 's1', directories: [{ path: 'sub', access: 'read-write' }] }))).toEqual({
      status: 400,
      body: { ok: false, error: 'some directories are invalid', details: [{ code: 'inside-workspace', path: tree.path('ws/sub') }] },
    })
    expect((await call('/api/workspace-folders/save', post({ sessionId: 's1', directories: [{ path: '/x', access: 'all' }] }))).status).toBe(400)
    expect(changed).toEqual([])
    expect(folders.store.get(tree.path('ws'))).toEqual([])
  })

  it('answers 404 for a session without a workspace', async () => {
    const tree = tempTree()
    const { call } = routes({ folders: makeFolders(tree.root) })
    expect((await call('/api/workspace-folders/state?sessionId=nope')).status).toBe(404)
  })

  it('uses only a native directory picker', async () => {
    const tree = tempTree()
    const native = routes({
      folders: makeFolders(tree.root),
      directoryPicker: () => ({ capability: () => ({ kind: 'native', pick: async () => '/picked' }) }),
    })
    expect(await native.call('/api/workspace-folders/pick', post({}))).toEqual({ status: 200, body: { ok: true, data: { path: '/picked' } } })
    const browse = routes({ folders: makeFolders(tree.root), directoryPicker: () => ({ capability: () => ({ kind: 'browse' }) }) })
    expect((await browse.call('/api/workspace-folders/pick', post({}))).status).toBe(409)
  })

  it('reports which folder chooser the Host offers', async () => {
    const tree = tempTree('ws')
    const session: SessionLike = { id: 's1', header: { cwd: tree.path('ws') } }
    const pickerOf = async (capability: { kind: string } & Record<string, unknown>): Promise<unknown> => {
      const { call } = routes({
        folders: makeFolders(tree.root),
        sessions: () => ({ get: () => session }),
        directoryPicker: () => ({ capability: () => capability as never }),
      })
      return ((await call('/api/workspace-folders/state?sessionId=s1')).body.data as { picker: unknown }).picker
    }
    expect(await pickerOf({ kind: 'native', pick: async () => null })).toBe('native')
    expect(await pickerOf({ kind: 'browse', list: async () => ({}) })).toBe('browse')
    expect(await pickerOf({ kind: 'future' })).toBeNull()
  })

  it('browses beside the workspace first, then any absolute level', async () => {
    const tree = tempTree('ws')
    const session: SessionLike = { id: 's1', header: { cwd: tree.path('ws') } }
    const listed: (string | undefined)[] = []
    const listing = (path: string) => ({ path, home: '/home/me', crumbs: [], entries: [{ name: 'ws', path: `${path}/ws`, hidden: false }], truncated: false })
    const { call } = routes({
      folders: makeFolders(tree.root),
      sessions: () => ({ get: () => session }),
      directoryPicker: () => ({ capability: () => ({
        kind: 'browse',
        list: async (path?: string) => {
          listed.push(path)
          if (path === '/unreadable') throw new Error('directory-unreadable: /unreadable')
          return listing(path ?? '/home/me')
        },
      }) }),
    })
    expect(await call('/api/workspace-folders/browse?sessionId=s1')).toEqual({ status: 200, body: { ok: true, data: listing(tree.root) } })
    expect((await call('/api/workspace-folders/browse?path=%2Fopt')).body.data).toEqual(listing('/opt'))
    expect((await call('/api/workspace-folders/browse')).body.data).toEqual(listing('/home/me'))
    expect(await call('/api/workspace-folders/browse?path=relative')).toEqual({ status: 400, body: { ok: false, error: 'path must be absolute' } })
    expect(await call('/api/workspace-folders/browse?path=%2Funreadable')).toEqual({
      status: 400, body: { ok: false, error: 'directory-unreadable: /unreadable' },
    })
    expect(listed).toEqual([tree.root, '/opt', undefined, '/unreadable'])
  })

  it('falls back to the home directory when the workspace parent cannot be listed', async () => {
    const tree = tempTree('ws')
    const session: SessionLike = { id: 's1', header: { cwd: tree.path('ws') } }
    const { call } = routes({
      folders: makeFolders(tree.root),
      sessions: () => ({ get: () => session }),
      directoryPicker: () => ({ capability: () => ({
        kind: 'browse',
        list: async (path?: string) => {
          if (path !== undefined) throw new Error('denied')
          return { path: '/home/me', home: '/home/me', crumbs: [], entries: [], truncated: false }
        },
      }) }),
    })
    expect(((await call('/api/workspace-folders/browse?sessionId=s1')).body.data as { path: string }).path).toBe('/home/me')
  })

  it('refuses to browse without a browse-kind chooser', async () => {
    const tree = tempTree()
    const native = routes({
      folders: makeFolders(tree.root),
      directoryPicker: () => ({ capability: () => ({ kind: 'native', pick: async () => null }) }),
    })
    expect((await native.call('/api/workspace-folders/browse')).status).toBe(409)
    expect((await routes({ folders: makeFolders(tree.root) }).call('/api/workspace-folders/browse')).status).toBe(409)
  })

  it('resolves one added path to its canonical spelling or the reason it is refused', async () => {
    const tree = tempTree('ws/sub', 'lib')
    const session: SessionLike = { id: 's1', header: { cwd: tree.path('ws') } }
    const { call, changed } = routes({ folders: makeFolders(tree.root), sessions: () => ({ get: () => session }) })
    const resolve = async (path: string) => (await call(`/api/workspace-folders/resolve?sessionId=s1&path=${encodeURIComponent(path)}`)).body
    expect(await resolve(` ../lib/ `)).toEqual({ ok: true, data: { path: tree.path('lib') } })
    expect(await resolve('sub')).toEqual({ ok: true, data: { problem: { code: 'inside-workspace', path: 'sub' } } })
    expect(await resolve('/no/such/dir')).toEqual({ ok: true, data: { problem: { code: 'missing', path: '/no/such/dir' } } })
    expect((await call('/api/workspace-folders/resolve?sessionId=s1')).status).toBe(400)
    expect(changed).toEqual([])
  })

  it('rejects a save that lists one directory twice', async () => {
    const tree = tempTree('ws', 'lib')
    const folders = makeFolders(tree.root)
    const session: SessionLike = { id: 's1', header: { cwd: tree.path('ws') } }
    const { call } = routes({ folders, sessions: () => ({ get: () => session }) })
    expect(await call('/api/workspace-folders/save', post({
      sessionId: 's1',
      directories: [{ path: tree.path('lib'), access: 'read-write' }, { path: '../lib/', access: 'read-only' }],
    }))).toEqual({
      status: 400,
      body: { ok: false, error: 'some directories are invalid', details: [{ code: 'duplicate', path: tree.path('lib') }] },
    })
    expect(folders.store.get(tree.path('ws'))).toEqual([])
  })
})
