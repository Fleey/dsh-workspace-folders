import { execFileSync } from 'node:child_process'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { EffectiveFolder } from '../src/folders.ts'
import {
  MIN_INSTRUCTION_BYTES, readFolderInstructions, renderInstructionsContext, TRUNCATION_MARKER,
} from '../src/instructions.ts'
import { makeFolders, tempTree } from './helpers.ts'

const bytes = (text: string): number => Buffer.byteLength(text, 'utf8')

function folder(path: string, access: EffectiveFolder['access'] = 'read-write', exists = true): EffectiveFolder {
  return { path, access, source: 'workspace', exists }
}

/** Instructions context for the given folders under a generous limit. */
function contextFor(folders: readonly EffectiveFolder[], maxBytes = 32768): string {
  return renderInstructionsContext(readFolderInstructions(folders, maxBytes), maxBytes)
}

describe('readFolderInstructions', () => {
  it('prefers AGENTS.md over CLAUDE.md and falls back to CLAUDE.md', () => {
    const tree = tempTree('both', 'claude-only', 'empty-agents', 'none')
    writeFileSync(tree.path('both/AGENTS.md'), '  agents rules\n\n')
    writeFileSync(tree.path('both/CLAUDE.md'), 'claude rules\n')
    writeFileSync(tree.path('claude-only/CLAUDE.md'), 'claude-only rules\n')
    writeFileSync(tree.path('empty-agents/AGENTS.md'), ' \n')
    writeFileSync(tree.path('empty-agents/CLAUDE.md'), 'shadowed by the blank AGENTS.md\n')
    expect(readFolderInstructions(
      ['both', 'claude-only', 'empty-agents', 'none'].map(name => folder(tree.path(name))),
      32768,
    )).toEqual([
      { folder: tree.path('both'), file: 'AGENTS.md', text: 'agents rules' },
      { folder: tree.path('claude-only'), file: 'CLAUDE.md', text: 'claude-only rules' },
    ])
  })

  it('includes read-only and read-write folders and skips missing ones', () => {
    const tree = tempTree('rw', 'ro')
    writeFileSync(tree.path('rw/AGENTS.md'), 'rw rules')
    writeFileSync(tree.path('ro/AGENTS.md'), 'ro rules')
    const text = contextFor([folder(tree.path('rw')), folder(tree.path('ro'), 'read-only'), folder(tree.path('gone'), 'read-write', false)])
    expect(text).toBe([
      'Instructions from additional workspace directories. Follow each one when working with files in its directory; the workspace\'s own instructions apply elsewhere. They do not override system, developer, or direct user instructions.',
      `Instructions for the additional directory ${JSON.stringify(tree.path('rw'))} (from AGENTS.md):\n\nrw rules`,
      `Instructions for the additional directory ${JSON.stringify(tree.path('ro'))} (from AGENTS.md):\n\nro rules`,
    ].join('\n\n'))
  })

  it('ignores an instruction file whose symlink leaves the folder', () => {
    const tree = tempTree('lib/docs', 'outside', 'escape-only', 'inside-link')
    writeFileSync(tree.path('outside/AGENTS.md'), 'secret from outside')
    symlinkSync(tree.path('outside/AGENTS.md'), tree.path('lib/AGENTS.md'))
    writeFileSync(tree.path('lib/CLAUDE.md'), 'lib claude rules')
    symlinkSync('../outside/AGENTS.md', tree.path('escape-only/AGENTS.md'))
    mkdirSync(tree.path('inside-link/docs'))
    writeFileSync(tree.path('inside-link/docs/AGENTS.md'), 'linked inside rules')
    symlinkSync('docs/AGENTS.md', tree.path('inside-link/AGENTS.md'))
    const text = contextFor(['lib', 'escape-only', 'inside-link'].map(name => folder(tree.path(name))))
    expect(text).not.toContain('secret from outside')
    expect(text).toContain('(from CLAUDE.md):\n\nlib claude rules')
    expect(text).not.toContain(JSON.stringify(tree.path('escape-only')))
    expect(text).toContain('(from AGENTS.md):\n\nlinked inside rules')
  })

  it('skips an AGENTS.md that is not a regular file without blocking', () => {
    const tree = tempTree('dir-named/AGENTS.md', 'fifo')
    writeFileSync(tree.path('dir-named/CLAUDE.md'), 'claude after a directory')
    if (process.platform !== 'win32') execFileSync('mkfifo', [tree.path('fifo/AGENTS.md')])
    writeFileSync(tree.path('fifo/CLAUDE.md'), 'claude after a fifo')
    expect(readFolderInstructions([folder(tree.path('dir-named')), folder(tree.path('fifo'))], 32768).map(entry => entry.text))
      .toEqual(['claude after a directory', 'claude after a fifo'])
  })
})

describe('renderInstructionsContext', () => {
  it('is empty when no folder has instructions', () => {
    const tree = tempTree('bare')
    expect(contextFor([folder(tree.path('bare'))])).toBe('')
  })

  it('keeps the complete text within the byte limit, cutting multibyte text on code-point boundaries', () => {
    const tree = tempTree('a', 'b')
    writeFileSync(tree.path('a/AGENTS.md'), '规则：所有提交信息使用中文。😀 '.repeat(4))
    writeFileSync(tree.path('b/AGENTS.md'), 'second folder rules')
    const folders = [folder(tree.path('a')), folder(tree.path('b'))]
    const full = contextFor(folders)
    expect(contextFor(folders, bytes(full))).toBe(full)
    for (let limit = MIN_INSTRUCTION_BYTES; limit < bytes(full); limit += 1) {
      const text = contextFor(folders, limit)
      expect(bytes(text)).toBeLessThanOrEqual(limit)
      expect(text.endsWith(TRUNCATION_MARKER)).toBe(true)
      expect(text).not.toContain('\uFFFD')
      expect(full.startsWith(text.slice(0, -TRUNCATION_MARKER.length))).toBe(true)
    }
    expect(contextFor(folders, MIN_INSTRUCTION_BYTES)).toBe(TRUNCATION_MARKER)
  })

  it('marks truncation for files larger than the limit, even when the read stops in trailing blanks', () => {
    const tree = tempTree('big', 'blank-tail', 'later')
    writeFileSync(tree.path('big/AGENTS.md'), '长'.repeat(50_000))
    writeFileSync(tree.path('blank-tail/AGENTS.md'), `rule\n${' '.repeat(2000)}hidden rule`)
    writeFileSync(tree.path('later/AGENTS.md'), 'later rules')
    const big = contextFor([folder(tree.path('big')), folder(tree.path('later'))], 4096)
    expect(bytes(big)).toBeLessThanOrEqual(4096)
    expect(big.endsWith(TRUNCATION_MARKER)).toBe(true)
    expect(big).not.toContain('later rules')
    const blankTail = contextFor([folder(tree.path('blank-tail'))], 1024)
    expect(bytes(blankTail)).toBeLessThanOrEqual(1024)
    expect(blankTail.endsWith(TRUNCATION_MARKER)).toBe(true)
  })
})

describe('instructions through the folder rules', () => {
  it('covers global and workspace folders but not folders inside the workspace', async () => {
    const tree = tempTree('ws/inner', 'shared', 'lib')
    writeFileSync(tree.path('shared/AGENTS.md'), 'shared rules')
    writeFileSync(tree.path('lib/CLAUDE.md'), 'lib rules')
    writeFileSync(tree.path('ws/inner/AGENTS.md'), 'inner rules')
    const folders = makeFolders(tree.root, {
      globalDirectories: [{ path: tree.path('shared'), access: 'read-only' }, { path: tree.path('ws/inner'), access: 'read-only' }],
    })
    await folders.store.set(tree.path('ws'), [{ path: tree.path('lib'), access: 'read-write' }])
    const text = contextFor(folders.effective(tree.path('ws')))
    expect(text).toContain('shared rules')
    expect(text).toContain('lib rules')
    expect(text).not.toContain('inner rules')
  })
})
