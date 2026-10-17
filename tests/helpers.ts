import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { WorkspaceFolders, type FoldersConfig } from '../src/folders.ts'
import { FolderStore } from '../src/store.ts'
import type { AgentLike, FolderEntry, LoggerLike, SandboxMode, SandboxPolicyLike } from '../src/types.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A canonical temporary directory tree, removed after the test. */
export function tempTree(...dirs: string[]): { root: string; path: (name: string) => string } {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wsf-')))
  roots.push(root)
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true })
  return { root, path: name => join(root, name) }
}

/** Folder rules over a store file inside `root`. */
export function makeFolders(root: string, overrides: Partial<FoldersConfig> = {}): WorkspaceFolders {
  const config: FoldersConfig = {
    autoApproveWrites: true,
    globalDirectories: [] as FolderEntry[],
    storeFile: join(root, 'store', 'workspace-folders.json'),
    loadInstructions: false,
    maxInstructionBytes: 32768,
    ...overrides,
  }
  return new WorkspaceFolders(new FolderStore(config.storeFile), config)
}

/** An Agent whose Session started in `cwd`. */
export function makeAgent(cwd: string | undefined, id = 'session-1'): AgentLike {
  return { session: { id, header: { cwd } } }
}

/** A sandbox policy with one standing mode. */
export function policy(mode: SandboxMode): SandboxPolicyLike {
  return { resolve: () => ({ mode, workspaceRoot: '/' }) }
}

/** A logger that records messages. */
export function recordingLogger(): LoggerLike & { readonly lines: string[] } {
  const lines: string[] = []
  return {
    lines,
    info: (format, ...args) => { lines.push(`info ${format} ${JSON.stringify(args)}`) },
    warn: (format, ...args) => { lines.push(`warn ${format} ${JSON.stringify(args)}`) },
  }
}
