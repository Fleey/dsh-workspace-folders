/** Path spelling, canonical identity, and containment for directory grants. */

import { realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'

/**
 * Turn user-typed text into an absolute path: trims whitespace and one pair of
 * surrounding quotes, expands a leading `~`, and resolves relative text
 * against `base`.
 * @param raw - path as typed by the user.
 * @param base - absolute directory relative paths resolve against.
 * @returns the absolute, lexically normalized path.
 */
export function resolveInput(raw: string, base: string): string {
  let text = raw.trim()
  if (text.length >= 2 && (text[0] === '"' || text[0] === "'") && text.at(-1) === text[0]) {
    text = text.slice(1, -1)
  }
  if (text === '~') text = homedir()
  else if (text.startsWith('~/') || text.startsWith(`~${sep}`)) text = join(homedir(), text.slice(2))
  return isAbsolute(text) ? resolve(text) : resolve(base, text)
}

/** Strip trailing separators without turning a filesystem root into an empty string. */
export function trimTrailingSeparators(path: string): string {
  const trimmed = path.replace(/[\\/]+$/u, '')
  return trimmed === '' ? path.slice(0, 1) : trimmed
}

/**
 * Canonical identity of an existing directory (symlinks resolved).
 * @param path - absolute path.
 * @returns the canonical path.
 * @throws when the path is missing or is not a directory.
 */
export function canonicalDirectory(path: string): string {
  const canonical = realpathSync.native(path)
  if (!statSync(canonical).isDirectory()) throw new Error(`not a directory: ${path}`)
  return canonical
}

/**
 * Canonical identity a write would reach: the deepest existing ancestor is
 * resolved through symlinks and the missing remainder is appended verbatim,
 * so a link that leaves a granted directory is judged by its destination.
 * @param path - absolute target path, which need not exist yet.
 * @returns the canonical target path.
 */
export function canonicalTarget(path: string): string {
  const missing: string[] = []
  let current = resolve(path)
  for (;;) {
    try {
      const real = realpathSync.native(current)
      return missing.length === 0 ? real : join(real, ...missing.reverse())
    } catch {
      // realpath failed: this component does not exist yet; try its parent.
      const parent = dirname(current)
      if (parent === current) return resolve(path)
      missing.push(basename(current))
      current = parent
    }
  }
}

/**
 * Canonical spelling of a granted root for comparisons: its realpath when it
 * exists, otherwise its lexical form (a missing root contains nothing real).
 * @param path - absolute root path.
 * @returns the comparison spelling.
 */
export function canonicalRoot(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    // realpath failed: the root is missing; compare its lexical spelling.
    return resolve(path)
  }
}

/**
 * Whether `child` is `parent` or lies beneath it. Both must already be
 * canonical absolute paths.
 * @param child - candidate path.
 * @param parent - containing directory.
 * @returns true when contained.
 */
export function isWithin(child: string, parent: string): boolean {
  if (child === parent) return true
  const prefix = parent.endsWith(sep) ? parent : parent + sep
  return child.startsWith(prefix)
}

/**
 * Whether a directory currently exists.
 * @param path - absolute path.
 * @returns true for an existing directory.
 */
export function directoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    // stat failed: missing or unreadable counts as absent.
    return false
  }
}
