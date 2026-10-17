/**
 * Opt-in model context carrying the instruction file at the root of each
 * additional directory: `AGENTS.md`, or `CLAUDE.md` when no `AGENTS.md` is
 * usable. Files are read synchronously each time the context is assembled, so
 * edits reach the next request.
 */

import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalRoot, isWithin } from './paths.ts'
import type { EffectiveFolder } from './folders.ts'

/** Instruction file names probed at each folder root, in precedence order. */
export const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md'] as const

/** Appended when the context exceeds its byte limit; counted inside the limit. */
export const TRUNCATION_MARKER = '\n[Additional-directory instructions truncated here to fit the configured size limit.]'

/** Smallest byte limit that still holds the truncation marker. */
export const MIN_INSTRUCTION_BYTES = Buffer.byteLength(TRUNCATION_MARKER, 'utf8')

const INTRO = 'Instructions from additional workspace directories. Follow each one when working with files in its directory; '
  + 'the workspace\'s own instructions apply elsewhere. They do not override system, developer, or direct user instructions.'

// O_NONBLOCK keeps a FIFO named like an instruction file from blocking the
// synchronous read; O_NOFOLLOW refuses a final-component link swapped in after
// the realpath check. Both are absent on Windows.
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)

/** One folder's instruction file as read for one assembly. */
export interface FolderInstructions {
  /** The additional directory. */
  readonly folder: string
  /** Which candidate file supplied the text. */
  readonly file: (typeof INSTRUCTION_FILES)[number]
  /** File text: trimmed when read whole, verbatim when cut at the read limit. */
  readonly text: string
}

/**
 * Read at most `limit` bytes of a regular file inside `root`.
 * @param path - candidate file path under `root`.
 * @param root - canonical folder root the file must stay within.
 * @param limit - maximum bytes to read.
 * @returns the decoded prefix and whether it is the whole file, or undefined
 *   when the path is missing, not a regular file, unreadable, or resolves
 *   outside `root`.
 */
function readContainedFile(path: string, root: string, limit: number): { text: string; whole: boolean } | undefined {
  let real: string
  try {
    real = realpathSync.native(path)
  } catch {
    // realpath failed: the candidate is missing or a dangling link.
    return undefined
  }
  if (!isWithin(real, root)) return undefined
  let fd: number
  try {
    fd = openSync(real, OPEN_FLAGS)
  } catch {
    // open failed: unreadable, or a link swapped in after realpath.
    return undefined
  }
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) return undefined
    // One byte past the stat size tells a whole file from one that kept growing.
    const buffer = Buffer.alloc(Math.min(limit, stat.size + 1))
    let length = 0
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null)
      if (read === 0) break
      length += read
    }
    return { text: buffer.subarray(0, length).toString('utf8'), whole: length < buffer.length }
  } catch {
    // fstat or read failed mid-way: treat the file as unavailable this turn.
    return undefined
  } finally {
    closeSync(fd)
  }
}

/**
 * Read the instruction file of each existing folder. The first candidate in
 * {@link INSTRUCTION_FILES} that is a regular file whose real path stays inside
 * the folder wins; a symlink leading out of the folder counts as absent. Blank
 * files contribute nothing. Reading stops once `readLimit` bytes are gathered:
 * the rendered context, which adds an introduction and headings, cannot carry
 * more, so a file cut at the limit always ends up past the truncation point.
 * @param folders - effective folders in display order.
 * @param readLimit - total bytes worth reading across all files.
 * @returns the non-empty instruction texts in folder order.
 */
export function readFolderInstructions(folders: readonly EffectiveFolder[], readLimit: number): FolderInstructions[] {
  const found: FolderInstructions[] = []
  let total = 0
  for (const folder of folders) {
    if (!folder.exists || total >= readLimit) continue
    const root = canonicalRoot(folder.path)
    for (const file of INSTRUCTION_FILES) {
      const read = readContainedFile(join(folder.path, file), root, readLimit - total)
      if (read === undefined) continue
      // Trimming a cut file could drop the cut and with it the truncation marker.
      const text = read.whole ? read.text.trim() : read.text
      if (text !== '') {
        found.push({ folder: folder.path, file, text })
        total += Buffer.byteLength(text, 'utf8')
      }
      break
    }
  }
  return found
}

/**
 * Longest prefix of `value` that fits in `maxBytes` UTF-8 bytes without
 * splitting a code point.
 * @param value - text to cut.
 * @param maxBytes - byte budget.
 * @returns the prefix.
 */
function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.length <= maxBytes) return value
  let end = maxBytes
  // A continuation byte at the cut means the cut splits a code point; back up to its lead byte.
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1
  return bytes.subarray(0, end).toString('utf8')
}

/**
 * Model-facing instructions of the additional directories, bounded as a
 * whole: when the complete text exceeds `maxBytes`, it is cut at a code-point
 * boundary and ends with {@link TRUNCATION_MARKER}, the result never exceeding
 * `maxBytes`.
 * @param instructions - texts from {@link readFolderInstructions}.
 * @param maxBytes - byte limit of the complete text, at least {@link MIN_INSTRUCTION_BYTES}.
 * @returns the context text, or empty text when no folder has instructions.
 */
export function renderInstructionsContext(instructions: readonly FolderInstructions[], maxBytes: number): string {
  if (instructions.length === 0) return ''
  const parts = [INTRO]
  for (const { folder, file, text } of instructions) {
    parts.push(`Instructions for the additional directory ${JSON.stringify(folder)} (from ${file}):\n\n${text}`)
  }
  const full = parts.join('\n\n')
  if (Buffer.byteLength(full, 'utf8') <= maxBytes) return full
  return truncateUtf8(full, maxBytes - MIN_INSTRUCTION_BYTES) + TRUNCATION_MARKER
}
