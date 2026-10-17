/** `/add-dir`, `/remove-dir`, and `/dirs`: workspace folder control from the composer. */

import { canonicalRoot, resolveInput } from './paths.ts'
import { describeProblem, type EffectiveFolder, type WorkspaceFolders } from './folders.ts'
import type {
  CommandInvocationLike, CommandResult, CommandsLike, FolderAccess, FolderEntry, LoggerLike, WorkingDirectoryLike,
} from './types.ts'

const READ_ONLY_FLAGS = new Set(['--read-only', '--ro'])

/**
 * Split `/add-dir` input into a path and its access. A trailing or leading
 * `--read-only` / `--ro` flag selects read-only; the rest is the path, which
 * may contain spaces.
 * @param rawInput - text after the command name.
 * @returns the path text and access.
 */
export function parseAddDirInput(rawInput: string): { readonly path: string; readonly access: FolderAccess } {
  const words = rawInput.trim().split(/\s+/u)
  let access: FolderAccess = 'read-write'
  while (words.length > 0 && READ_ONLY_FLAGS.has(words.at(-1) ?? '')) {
    words.pop()
    access = 'read-only'
  }
  while (words.length > 0 && READ_ONLY_FLAGS.has(words[0] ?? '')) {
    words.shift()
    access = 'read-only'
  }
  return { path: words.join(' ').trim(), access }
}

function describe(folder: EffectiveFolder): string {
  const notes: string[] = [folder.access]
  if (folder.source === 'global') notes.push('global')
  if (!folder.exists) notes.push('missing')
  return `${folder.path} (${notes.join(', ')})`
}

/** Dependencies of the command handlers. */
export interface CommandDeps {
  readonly folders: WorkspaceFolders
  readonly logger: LoggerLike
  readonly workingDirectory: () => WorkingDirectoryLike | undefined
  /** Called after a workspace's list changed. */
  readonly changed: (workspace: string) => void
}

/**
 * Build the three command definitions.
 * @param deps - folder rules and Host services.
 * @returns definitions ready for `ctx.commands.register`.
 */
export function folderCommands(deps: CommandDeps): Parameters<CommandsLike['register']>[0][] {
  const { folders } = deps

  const workspaceOf = (invocation: CommandInvocationLike): string | undefined => invocation.agent.session.header.cwd
  const baseOf = (invocation: CommandInvocationLike, workspace: string): string => {
    try {
      return deps.workingDirectory()?.get(invocation.agent.session) ?? workspace
    } catch {
      // The working-directory projection is unavailable; relative paths use the workspace.
      return workspace
    }
  }
  const noWorkspace: CommandResult = { kind: 'error', text: 'This session has no workspace directory.' }

  return [
    {
      name: 'add-dir',
      description: 'Add a working directory to this workspace',
      input: { hint: '<path> [--read-only]' },
      handler: async (invocation) => {
        const workspace = workspaceOf(invocation)
        if (workspace === undefined) return noWorkspace
        const { path, access } = parseAddDirInput(invocation.rawInput)
        if (path === '') return { kind: 'error', text: 'Usage: /add-dir <path> [--read-only]' }
        const requested = resolveInput(path, baseOf(invocation, workspace))
        const validation = folders.validate(workspace, [{ path: requested, access }])
        if (!validation.ok) return { kind: 'error', text: validation.errors.map(describeProblem).join('\n') }
        const [added] = validation.entries as [FolderEntry]
        const current = folders.store.get(workspace)
        const existing = current.find(entry => entry.path === added.path)
        if (existing !== undefined) {
          return {
            kind: 'error',
            text: `${describeProblem({ code: 'duplicate', path: added.path })} (${existing.access}). Remove it first to change its access.`,
          }
        }
        await folders.store.set(workspace, [...current, added])
        deps.changed(workspace)
        return { kind: 'success', text: `Added ${added.path} (${access}). It applies from the next turn.` }
      },
    },
    {
      name: 'remove-dir',
      description: 'Remove a working directory from this workspace',
      input: { hint: '<path>' },
      handler: async (invocation) => {
        const workspace = workspaceOf(invocation)
        if (workspace === undefined) return noWorkspace
        const text = invocation.rawInput.trim()
        if (text === '') return { kind: 'error', text: 'Usage: /remove-dir <path>' }
        const requested = resolveInput(text, baseOf(invocation, workspace))
        const target = canonicalRoot(requested)
        const current = folders.store.get(workspace)
        const kept = current.filter(entry => entry.path !== requested && entry.path !== target)
        if (kept.length === current.length) {
          const global = folders.config.globalDirectories.some(entry => entry.path === requested || entry.path === target)
          return {
            kind: 'error',
            text: global
              ? `${requested} comes from the plugin's globalDirectories configuration and cannot be removed per workspace.`
              : `${requested} is not an additional directory of this workspace.`,
          }
        }
        await folders.store.set(workspace, kept)
        deps.changed(workspace)
        return { kind: 'success', text: `Removed ${target}. It applies from the next turn.` }
      },
    },
    {
      name: 'dirs',
      description: 'List this workspace\'s working directories',
      handler: (invocation) => {
        const workspace = workspaceOf(invocation)
        if (workspace === undefined) return noWorkspace
        const extra = folders.effective(workspace)
        const lines = [`Workspace: ${workspace}`]
        if (extra.length === 0) lines.push('No additional directories. Add one with /add-dir <path>.')
        else lines.push('Additional directories:', ...extra.map(folder => `  ${describe(folder)}`))
        return { kind: 'success', text: lines.join('\n') }
      },
    },
  ]
}
