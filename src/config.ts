/** Plugin configuration: parsed and validated once at load. */

import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { MIN_INSTRUCTION_BYTES } from './instructions.ts'
import { canonicalRoot, resolveInput } from './paths.ts'
import { parseFolderEntries } from './store.ts'
import type { FoldersConfig } from './folders.ts'

/** Raw `config` accepted from `cordis.yml`. */
export interface Config {
  /** Pre-approve write/edit escalations into read-write folders (default: true). */
  autoApproveWrites?: boolean
  /** Folders added to every workspace (default: none). `~` expands to the home directory. */
  globalDirectories?: { path: string; access: 'read-write' | 'read-only' }[]
  /** Store file (default: `$DSH_HOME/workspace-folders.json`, `$DSH_HOME` defaulting to `~/.dsh`). */
  storeFile?: string
  /** Give the model each folder's root `AGENTS.md`, or `CLAUDE.md` without one (default: false). */
  loadInstructions?: boolean
  /** UTF-8 byte limit of the complete instructions context (default: 32768). */
  maxInstructionBytes?: number
}

/** Default {@link Config.maxInstructionBytes}. */
export const DEFAULT_MAX_INSTRUCTION_BYTES = 32768

/**
 * Default store location under the DSH home directory.
 * @param env - process environment.
 * @returns the absolute store path.
 */
export function defaultStoreFile(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME?.trim()
  return join(home !== undefined && home !== '' ? home : join(homedir(), '.dsh'), 'workspace-folders.json')
}

/**
 * Validate the plugin config; misconfiguration throws at load.
 * @param raw - the `config` value from `cordis.yml`.
 * @param env - process environment.
 * @returns the validated configuration.
 */
export function parseConfig(raw: unknown, env: NodeJS.ProcessEnv = process.env): FoldersConfig {
  const value = (raw ?? {}) as Record<string, unknown>
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('workspace-folders: config must be an object')
  const known = new Set(['autoApproveWrites', 'globalDirectories', 'storeFile', 'loadInstructions', 'maxInstructionBytes'])
  for (const key of Object.keys(value)) {
    if (!known.has(key)) throw new TypeError(`workspace-folders: unknown config key "${key}"`)
  }
  const {
    autoApproveWrites = true, globalDirectories = [], storeFile,
    loadInstructions = false, maxInstructionBytes = DEFAULT_MAX_INSTRUCTION_BYTES,
  } = value
  if (typeof autoApproveWrites !== 'boolean') throw new TypeError('workspace-folders: autoApproveWrites must be a boolean')
  if (typeof loadInstructions !== 'boolean') throw new TypeError('workspace-folders: loadInstructions must be a boolean')
  if (typeof maxInstructionBytes !== 'number' || !Number.isSafeInteger(maxInstructionBytes) || maxInstructionBytes < MIN_INSTRUCTION_BYTES) {
    throw new TypeError(`workspace-folders: maxInstructionBytes must be an integer of at least ${MIN_INSTRUCTION_BYTES}`)
  }
  if (storeFile !== undefined && (typeof storeFile !== 'string' || !isAbsolute(storeFile))) {
    throw new TypeError('workspace-folders: storeFile must be an absolute path')
  }
  if (!Array.isArray(globalDirectories)) throw new TypeError('workspace-folders: globalDirectories must be an array')
  const expanded = globalDirectories.map((item: unknown) =>
    typeof item === 'object' && item !== null && typeof (item as { path?: unknown }).path === 'string'
      ? { ...item, path: canonicalRoot(resolveInput((item as { path: string }).path, homedir())) }
      : item)
  return {
    autoApproveWrites,
    globalDirectories: parseFolderEntries(expanded, 'workspace-folders: globalDirectories'),
    storeFile: storeFile ?? defaultStoreFile(env),
    loadInstructions,
    maxInstructionBytes,
  }
}
