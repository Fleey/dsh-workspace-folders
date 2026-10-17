/**
 * Browser API on the authenticated `/api` channel. The connection carrier
 * applies its Host/Origin fence and owner-Peer authentication before these
 * handlers run.
 *
 *   GET  /api/workspace-folders/state?sessionId=<id>
 *   POST /api/workspace-folders/save   { sessionId, directories: [{ path, access }] }
 *   POST /api/workspace-folders/pick   {}   → { path: string | null }
 *   GET  /api/workspace-folders/browse?path=<abs>|sessionId=<id>   → one directory level
 *
 * `pick` drives a native Host chooser; `browse` lists one level through a
 * browse-kind chooser for in-app browsing. Both delegate to the composed
 * `ctx.directoryPicker`, so its listing bounds and hidden-entry flags apply.
 */

import { dirname, isAbsolute } from 'node:path'
import { isFolderAccess } from './store.ts'
import { resolveInput } from './paths.ts'
import type { EffectiveFolder, FolderProblem, WorkspaceFolders } from './folders.ts'
import type {
  BrowsePickerCapabilityLike, DirectoryListingLike, DirectoryPickerLike, FetchRouteLike, FolderAccess, NativePickerCapabilityLike,
  SandboxMode, SandboxPolicyLike, SessionLike, SessionsLike, WorkspaceRegistryLike,
} from './types.ts'

/** Route path prefix below the shared API channel. */
export const API_PREFIX = '/api/workspace-folders'

/** Workspace folder state shown by the composer dialog. */
export interface FolderStateView {
  readonly workspace: string
  readonly directories: readonly EffectiveFolder[]
  readonly sandboxMode: SandboxMode | null
  readonly autoApproveWrites: boolean
  /** Folder chooser the Host offers: an OS dialog on its display, in-app browsing, or none. */
  readonly picker: 'native' | 'browse' | null
}

/** Host services the routes read per request. */
export interface RouteDeps {
  readonly folders: WorkspaceFolders
  readonly sessions: () => SessionsLike | undefined
  readonly workspaceRegistry: () => WorkspaceRegistryLike | undefined
  readonly sandboxPolicy: () => SandboxPolicyLike | undefined
  readonly directoryPicker: () => DirectoryPickerLike | undefined
  /** Called after a workspace's list changed. */
  readonly changed: (workspace: string) => void
}

class RouteError extends Error {
  constructor(readonly status: number, message: string, readonly details?: readonly FolderProblem[]) {
    super(message)
  }
}

function json(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function handle(run: () => Promise<object>): Promise<Response> {
  try {
    return json(200, { ok: true, data: await run() })
  } catch (error) {
    if (error instanceof RouteError) {
      return json(error.status, { ok: false, error: error.message, ...error.details ? { details: error.details } : {} })
    }
    return json(500, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    throw new RouteError(415, 'content type must be application/json')
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    // request.json() failed: the body is not JSON.
    throw new RouteError(400, 'invalid JSON body')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new RouteError(400, 'body must be a JSON object')
  return body as Record<string, unknown>
}

function isNative(capability: { readonly kind: string } | undefined): capability is NativePickerCapabilityLike {
  return capability?.kind === 'native' && 'pick' in capability
}

function isBrowse(capability: { readonly kind: string } | undefined): capability is BrowsePickerCapabilityLike {
  return capability?.kind === 'browse' && 'list' in capability
}

function parseRequestedDirectories(value: unknown): { path: string; access: FolderAccess }[] {
  if (!Array.isArray(value)) throw new RouteError(400, '"directories" must be an array')
  return value.map((item: unknown, index) => {
    const { path, access } = (typeof item === 'object' && item !== null ? item : {}) as { path?: unknown; access?: unknown }
    if (typeof path !== 'string' || path.trim() === '') throw new RouteError(400, `directories[${index}].path must be a non-empty string`)
    if (!isFolderAccess(access)) throw new RouteError(400, `directories[${index}].access must be "read-write" or "read-only"`)
    return { path, access }
  })
}

/**
 * Build the exact routes.
 * @param deps - folder rules and Host service accessors.
 * @returns route registrations for `ctx.connection.fetch.register`.
 */
export function folderRoutes(deps: RouteDeps): FetchRouteLike[] {
  const locate = (sessionId: unknown): { readonly workspace: string; readonly session: SessionLike | undefined } => {
    if (typeof sessionId !== 'string' || sessionId === '') throw new RouteError(400, 'sessionId is required')
    const session = deps.sessions()?.get(sessionId)
    const workspace = session?.header.cwd
      ?? deps.workspaceRegistry()?.list().find(entry => entry.sessionIds.includes(sessionId))?.path
    if (workspace === undefined) throw new RouteError(404, 'this session has no workspace directory')
    return { workspace, session }
  }

  const view = (workspace: string, session: SessionLike | undefined): FolderStateView => {
    const policy = deps.sandboxPolicy()
    return {
      workspace,
      directories: deps.folders.effective(workspace),
      sandboxMode: policy === undefined || session === undefined ? null : policy.resolve({ session }).mode,
      autoApproveWrites: deps.folders.config.autoApproveWrites,
      picker: pickerKind(),
    }
  }

  const pickerKind = (): FolderStateView['picker'] => {
    const capability = deps.directoryPicker()?.capability()
    return isNative(capability) ? 'native' : isBrowse(capability) ? 'browse' : null
  }

  const listLevel = async (
    capability: BrowsePickerCapabilityLike,
    path: string | undefined,
    signal: AbortSignal,
  ): Promise<DirectoryListingLike> => {
    try {
      return await capability.list(path, signal)
    } catch (error) {
      signal.throwIfAborted()
      throw new RouteError(400, error instanceof Error ? error.message : String(error))
    }
  }

  return [
    {
      path: `${API_PREFIX}/state`,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: request => handle(async () => {
        const { workspace, session } = locate(new URL(request.url).searchParams.get('sessionId'))
        return view(workspace, session)
      }),
    },
    {
      path: `${API_PREFIX}/save`,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: request => handle(async () => {
        const body = await readJson(request)
        const { workspace, session } = locate(body.sessionId)
        const requested = parseRequestedDirectories(body.directories)
          .map(({ path, access }) => ({ path: resolveInput(path, workspace), access }))
        const validation = deps.folders.validate(workspace, requested, deps.folders.store.get(workspace))
        if (!validation.ok) throw new RouteError(400, 'some directories are invalid', validation.errors)
        await deps.folders.store.set(workspace, validation.entries)
        deps.changed(workspace)
        return view(workspace, session)
      }),
    },
    {
      path: `${API_PREFIX}/pick`,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: request => handle(async () => {
        const capability = deps.directoryPicker()?.capability()
        if (!isNative(capability)) throw new RouteError(409, 'no native directory picker is available')
        return { path: await capability.pick(request.signal) }
      }),
    },
    {
      path: `${API_PREFIX}/browse`,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: request => handle(async () => {
        const capability = deps.directoryPicker()?.capability()
        if (!isBrowse(capability)) throw new RouteError(409, 'no directory browser is available')
        const params = new URL(request.url).searchParams
        const path = params.get('path')
        if (path !== null) {
          if (!isAbsolute(path)) throw new RouteError(400, 'path must be absolute')
          return listLevel(capability, path, request.signal)
        }
        // First open: start beside the workspace, where sibling projects live.
        const sessionId = params.get('sessionId')
        if (sessionId !== null) {
          const start = dirname(locate(sessionId).workspace)
          try {
            return await listLevel(capability, start, request.signal)
          } catch (error) {
            if (!(error instanceof RouteError)) throw error
            // The workspace parent is unreadable; fall back to the home directory.
          }
        }
        return listLevel(capability, undefined, request.signal)
      }),
    },
  ]
}
