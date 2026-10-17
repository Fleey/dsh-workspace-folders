/**
 * Durable per-workspace directory lists in one JSON file:
 *
 *   { "version": 1, "workspaces": { "<workspace path>": { "directories": [{ "path": "...", "access": "read-write" }] } } }
 *
 * Memory is authoritative after load; each write replaces the file atomically
 * (temporary file + rename) and writes are serialized in call order.
 */

import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import { trimTrailingSeparators } from './paths.ts'
import type { FolderAccess, FolderEntry } from './types.ts'

const STORE_VERSION = 1

interface StoreDocument {
  readonly version: typeof STORE_VERSION
  readonly workspaces: Readonly<Record<string, { readonly directories: readonly FolderEntry[] }>>
}

/**
 * Whether a value names a supported access mode.
 * @param value - candidate value.
 * @returns true for `read-write` or `read-only`.
 */
export function isFolderAccess(value: unknown): value is FolderAccess {
  return value === 'read-write' || value === 'read-only'
}

/**
 * Validate one directory list. Later duplicates of a path replace earlier ones.
 * @param value - candidate list.
 * @param where - location named in errors.
 * @returns the validated entries in first-appearance order.
 * @throws when an entry is not `{ path: <absolute>, access: <mode> }`.
 */
export function parseFolderEntries(value: unknown, where: string): FolderEntry[] {
  if (!Array.isArray(value)) throw new TypeError(`${where} must be an array`)
  const entries = new Map<string, FolderEntry>()
  value.forEach((item: unknown, index) => {
    const at = `${where}[${index}]`
    if (typeof item !== 'object' || item === null) throw new TypeError(`${at} must be an object`)
    const { path, access } = item as { path?: unknown; access?: unknown }
    if (typeof path !== 'string' || !isAbsolute(path)) throw new TypeError(`${at}.path must be an absolute path`)
    if (!isFolderAccess(access)) throw new TypeError(`${at}.access must be "read-write" or "read-only"`)
    const key = trimTrailingSeparators(path)
    entries.set(key, { path: key, access })
  })
  return [...entries.values()]
}

function parseDocument(raw: unknown, file: string): StoreDocument {
  if (typeof raw !== 'object' || raw === null) throw new TypeError(`${file} must contain a JSON object`)
  const { version, workspaces } = raw as { version?: unknown; workspaces?: unknown }
  if (version !== STORE_VERSION) throw new TypeError(`${file}: unsupported version ${JSON.stringify(version)}`)
  if (typeof workspaces !== 'object' || workspaces === null || Array.isArray(workspaces)) {
    throw new TypeError(`${file}: "workspaces" must be an object`)
  }
  const parsed: Record<string, { directories: FolderEntry[] }> = {}
  for (const [path, entry] of Object.entries(workspaces)) {
    if (!isAbsolute(path)) throw new TypeError(`${file}: workspace key ${JSON.stringify(path)} must be an absolute path`)
    const directories = parseFolderEntries((entry as { directories?: unknown } | null)?.directories, `${file}: workspaces[${JSON.stringify(path)}].directories`)
    if (directories.length > 0) parsed[trimTrailingSeparators(path)] = { directories }
  }
  return { version: STORE_VERSION, workspaces: parsed }
}

/** The plugin-owned directory lists, keyed by workspace path. */
export class FolderStore {
  private document: StoreDocument = { version: STORE_VERSION, workspaces: {} }
  private queue: Promise<void> = Promise.resolve()

  /**
   * Load the store file. A missing file is an empty store; an unreadable or
   * malformed file fails loudly so a later save cannot overwrite it.
   * @param file - absolute JSON file path.
   */
  constructor(readonly file: string) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw new Error(`workspace-folders: cannot read ${file}`, { cause: error })
    }
    try {
      this.document = parseDocument(JSON.parse(text) as unknown, file)
    } catch (error) {
      throw new Error(`workspace-folders: ${file} is malformed; fix or remove it, then restart`, { cause: error })
    }
  }

  /**
   * Directories configured for one workspace.
   * @param workspace - absolute workspace path.
   * @returns its entries, empty when none are configured.
   */
  get(workspace: string): readonly FolderEntry[] {
    return this.document.workspaces[trimTrailingSeparators(workspace)]?.directories ?? []
  }

  /**
   * Replace one workspace's directories and persist the whole store.
   * @param workspace - absolute workspace path.
   * @param directories - complete new list; empty removes the workspace record.
   * @returns resolution once this write is durable.
   */
  set(workspace: string, directories: readonly FolderEntry[]): Promise<void> {
    const key = trimTrailingSeparators(workspace)
    const parsed = parseFolderEntries(directories, 'directories')
    // Derive from the committed document at this write's queue slot, so
    // concurrent saves for different workspaces never drop each other.
    const commit = async (): Promise<void> => {
      const workspaces = { ...this.document.workspaces }
      if (parsed.length === 0) delete workspaces[key]
      else workspaces[key] = { directories: parsed }
      const next: StoreDocument = { version: STORE_VERSION, workspaces }
      await mkdir(dirname(this.file), { recursive: true })
      const temporary = `${this.file}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      await rename(temporary, this.file)
      this.document = next
    }
    const done = this.queue.then(commit, commit)
    this.queue = done.catch(() => {})
    return done
  }
}
