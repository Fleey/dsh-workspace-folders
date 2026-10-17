/**
 * Workspace folder rules shared by the prompt context, the write approver,
 * the slash commands, and the HTTP routes.
 */

import { canonicalDirectory, canonicalRoot, directoryExists, isWithin, trimTrailingSeparators } from './paths.ts'
import type { FolderStore } from './store.ts'
import type { FolderAccess, FolderEntry, SandboxMode } from './types.ts'

/** Validated plugin configuration. */
export interface FoldersConfig {
  /** Pre-approve write/edit escalations into read-write folders. */
  readonly autoApproveWrites: boolean
  /** Folders added to every workspace. */
  readonly globalDirectories: readonly FolderEntry[]
  /** Absolute path of the JSON store. */
  readonly storeFile: string
  /** Give the model each folder's root instruction file. */
  readonly loadInstructions: boolean
  /** UTF-8 byte limit of the complete instructions context. */
  readonly maxInstructionBytes: number
}

/** One folder in effect for a workspace. */
export interface EffectiveFolder extends FolderEntry {
  /** `global` folders come from plugin config and cannot be edited per workspace. */
  readonly source: 'workspace' | 'global'
  /** Whether the directory exists right now. */
  readonly exists: boolean
}

/** Why one requested folder was refused. */
export interface FolderProblem {
  /** `missing`: not an existing directory; `inside-workspace`: already covered by the workspace. */
  readonly code: 'missing' | 'inside-workspace'
  /** The path as requested. */
  readonly path: string
}

/** Outcome of validating a requested folder list. */
export type FolderValidation =
  | { readonly ok: true; readonly entries: readonly FolderEntry[] }
  | { readonly ok: false; readonly errors: readonly FolderProblem[] }

/**
 * English description of one refused folder, for command output.
 * @param problem - the refusal.
 * @returns one line of text.
 */
export function describeProblem(problem: FolderProblem): string {
  return problem.code === 'missing'
    ? `not an existing directory: ${problem.path}`
    : `already inside the workspace: ${problem.path}`
}

/** Tools whose escalated writes may be pre-approved; both take `file_path`. */
export const FILE_WRITE_TOOLS: ReadonlySet<string> = new Set(['write', 'edit'])

/** The only escalation target a `workspace-write` call can request. */
export const FULL_ACCESS: SandboxMode = 'danger-full-access'

/** The folder rules over one store and configuration. */
export class WorkspaceFolders {
  constructor(readonly store: FolderStore, readonly config: FoldersConfig) {}

  /**
   * Folders in effect for a workspace: configured globals first, then the
   * workspace's own list; a workspace entry overrides a global entry for the
   * same path. Folders equal to or inside the workspace are omitted because
   * the workspace already covers them.
   * @param workspace - the Session's original project directory.
   * @returns the effective folders in display order.
   */
  effective(workspace: string): EffectiveFolder[] {
    const root = canonicalRoot(workspace)
    const merged = new Map<string, EffectiveFolder>()
    for (const entry of this.config.globalDirectories) {
      merged.set(entry.path, { ...entry, source: 'global', exists: directoryExists(entry.path) })
    }
    for (const entry of this.store.get(workspace)) {
      merged.delete(entry.path)
      merged.set(entry.path, { ...entry, source: 'workspace', exists: directoryExists(entry.path) })
    }
    return [...merged.values()].filter(folder => !isWithin(canonicalRoot(folder.path), root))
  }

  /**
   * The read-write folder that contains a write target, when the write may be
   * pre-approved: pre-approval is enabled, the standing sandbox mode is
   * `workspace-write`, and the canonical target lies under an existing
   * read-write folder.
   * @param workspace - the Session's original project directory.
   * @param mode - the Session's standing sandbox mode.
   * @param target - canonical absolute target path.
   * @returns the granting folder, or undefined when the user must decide.
   */
  writeGrant(workspace: string, mode: SandboxMode, target: string): EffectiveFolder | undefined {
    if (!this.config.autoApproveWrites || mode !== 'workspace-write') return undefined
    return this.effective(workspace).find(folder =>
      folder.access === 'read-write' && folder.exists && isWithin(target, canonicalRoot(folder.path)))
  }

  /**
   * Validate a complete requested list for one workspace: every path must be
   * an existing directory outside the workspace, except that an entry already
   * stored under the same path is kept while its directory is missing. Paths
   * are canonicalized and duplicates collapse to their last access.
   * @param workspace - the workspace the list belongs to.
   * @param requested - absolute paths with their access.
   * @param stored - the workspace's current entries.
   * @returns the canonical entries, or every problem found.
   */
  validate(
    workspace: string,
    requested: readonly { readonly path: string; readonly access: FolderAccess }[],
    stored: readonly FolderEntry[] = [],
  ): FolderValidation {
    const root = canonicalRoot(workspace)
    const storedPaths = new Set(stored.map(entry => entry.path))
    const errors: FolderProblem[] = []
    const entries = new Map<string, FolderEntry>()
    for (const { path, access } of requested) {
      const spelled = trimTrailingSeparators(path)
      if (storedPaths.has(spelled) && !directoryExists(spelled)) {
        entries.delete(spelled)
        entries.set(spelled, { path: spelled, access })
        continue
      }
      let canonical: string
      try {
        canonical = canonicalDirectory(path)
      } catch {
        // canonicalDirectory failed: missing, unreadable, or a file.
        errors.push({ code: 'missing', path })
        continue
      }
      if (isWithin(canonical, root)) {
        errors.push({ code: 'inside-workspace', path })
        continue
      }
      entries.delete(canonical)
      entries.set(canonical, { path: trimTrailingSeparators(canonical), access })
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true, entries: [...entries.values()] }
  }
}

/**
 * Model-facing description of the additional folders, or empty text when the
 * workspace has none.
 * @param workspace - the Session's original project directory.
 * @param folders - effective folders for that workspace.
 * @param mode - the Session's standing sandbox mode, when a sandbox policy is composed.
 * @param autoApproveWrites - whether write/edit escalations into read-write folders are pre-approved.
 * @returns the context text.
 */
export function renderFoldersContext(
  workspace: string,
  folders: readonly EffectiveFolder[],
  mode: SandboxMode | undefined,
  autoApproveWrites: boolean,
): string {
  if (folders.length === 0) return ''
  const lines = [
    `Additional workspace directories: the user added these directories to this session's workspace, alongside ${JSON.stringify(workspace)}. Treat them as part of the project and refer to their files by absolute path.`,
  ]
  for (const folder of folders) {
    const notes = [folder.access === 'read-only' ? 'read-only: do not modify files here' : 'read-write']
    if (!folder.exists) notes.push('currently missing')
    lines.push(`- ${JSON.stringify(folder.path)} (${notes.join('; ')})`)
  }
  const writable = folders.some(folder => folder.access === 'read-write' && folder.exists)
  if (writable && autoApproveWrites && mode === 'workspace-write') {
    lines.push(`To create or change a file in a read-write directory with the write or edit tool, pass sandbox_permissions ${JSON.stringify(FULL_ACCESS)} with a justification on that call; this workspace's settings approve such calls without asking the user. Other operations that modify these directories follow the normal sandbox escalation flow.`)
  }
  return lines.join('\n')
}
