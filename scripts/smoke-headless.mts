// End-to-end smoke against a real DSH composition, with no provider key.
//
//   node scripts/smoke-headless.mts <dsh bin.js> <llm-mock-server src/index.ts>
//
// Boots `dsh --profile headless` in a temporary DSH_HOME and workspace with
// this plugin inserted through a --patch overlay, and points the DeepSeek
// adapter at DSH's own Messages mock. The mock answers the first request with
// a `write` call into an additional directory (escalated to full access) and
// the second with plain text. Headless has no interactive approval channel,
// so the escalated write succeeds only when this plugin pre-approves it.
// The first run also sets `loadInstructions: true` and checks that the
// additional directories' AGENTS.md / CLAUDE.md reach the model.
// Run with Node >= 22.19 (type stripping on by default from Node 23.6); the
// `zstd` CLI decodes the multi-frame Session logs for the audit checks.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [dshBin, mockModule] = process.argv.slice(2)
if (dshBin === undefined || mockModule === undefined) {
  console.error('usage: node scripts/smoke-headless.mts <dsh bin.js> <llm-mock-server src/index.ts>')
  process.exit(2)
}
const { startMockLlmServer } = await import(pathToFileURL(mockModule).href)
const pluginEntry = new URL('../lib/index.js', import.meta.url).pathname

const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wsf-e2e-')))
const dir = (name: string): string => { mkdirSync(join(root, name), { recursive: true }); return join(root, name) }
const workspace = dir('workspace')
const readWrite = dir('extra-rw')
const readOnly = dir('extra-ro')

writeFileSync(join(readWrite, 'AGENTS.md'), 'RW-AGENTS-MARKER: use tabs in extra-rw.\n')
writeFileSync(join(readWrite, 'CLAUDE.md'), 'RW-CLAUDE-SHADOWED: AGENTS.md wins in extra-rw.\n')
writeFileSync(join(readOnly, 'CLAUDE.md'), 'RO-CLAUDE-MARKER: extra-ro is reference material.\n')

const store = JSON.stringify({
  version: 1,
  workspaces: { [workspace]: { directories: [{ path: readWrite, access: 'read-write' }, { path: readOnly, access: 'read-only' }] } },
})
const overlay = join(root, 'overlay.yml')
writeFileSync(overlay, `- insert:\n    - id: workspace-folders\n      name: ${JSON.stringify(pluginEntry)}\n`)
const instructionsOverlay = join(root, 'overlay-instructions.yml')
writeFileSync(instructionsOverlay, `- insert:\n    - id: workspace-folders\n      name: ${JSON.stringify(pluginEntry)}\n      config:\n        loadInstructions: true\n`)

interface Run {
  readonly code: number | null
  readonly stderr: string
  readonly requests: { body: unknown }[]
  /** Decompressed Session log lines of this run. */
  readonly log: string
}

/** Every Session log under one DSH home, decompressed. */
function sessionLogs(home: string): string {
  const root = join(home, 'sessions')
  if (!existsSync(root)) return ''
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter(file => file.endsWith('.jsonl.zstd'))
    .map(file => execFileSync('zstd', ['-dcq', join(root, file)], { encoding: 'utf8' }))
    .join('\n')
}

let runs = 0

/** Run one headless task; `patch` is the plugin overlay, or undefined to run without the plugin. */
async function run(target: string, patch: string | undefined): Promise<Run> {
  const home = dir(`home-${++runs}`)
  writeFileSync(join(home, 'workspace-folders.json'), store)
  const mock = await startMockLlmServer({
    apiKey: 'mock-key',
    sequence: ['tool_call_success', 'success'],
    repeatLast: true,
    toolName: 'write',
    toolArguments: JSON.stringify({
      file_path: target,
      content: 'hello from dsh-workspace-folders\n',
      sandbox_permissions: 'danger-full-access',
      justification: 'Write the smoke-test file into the additional directory.',
    }),
    successText: 'done',
  })
  try {
    const args = [dshBin, '--profile', 'headless', ...patch !== undefined ? ['--patch', patch] : [], 'write the smoke file']
    const child = spawn(process.execPath, args, {
      cwd: workspace,
      env: {
        ...process.env,
        DSH_HOME: home,
        DEEPSEEK_BASE_URL: `${mock.baseURL}/v1`,
        DEEPSEEK_API_KEY: 'mock-key',
        DSH_PERMISSION_MODE: 'workspace-write',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.stdout.resume()
    const code = await new Promise<number | null>(resolve => child.on('close', resolve))
    return { code, stderr, requests: [...mock.requests] as { body: unknown }[], log: sessionLogs(home) }
  } finally {
    await mock.close()
  }
}

/** Outcomes of the audited approval decisions in one run's Session logs. */
function approvalOutcomes(log: string): string[] {
  return [...log.matchAll(/"type":"approval\/decided"[^}]*"outcome":"([a-z-]+)"/gu)].map(match => match[1] as string)
}

const failures: string[] = []
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failures.push(label)
}

// 1. With the plugin and loadInstructions: the model sees the folders and
// their instructions, and the write is pre-approved.
const granted = join(readWrite, 'notes', 'hello.txt')
const withPlugin = await run(granted, instructionsOverlay)
const firstBody = JSON.stringify(withPlugin.requests[0]?.body ?? null)
check(withPlugin.code === 0, `dsh exited 0 with the plugin (got ${withPlugin.code})`)
check(firstBody.includes('Additional workspace directories'), 'first model request carries the folder context')
check(firstBody.includes(JSON.stringify(readWrite).slice(1, -1)) && firstBody.includes('read-only: do not modify files here'), 'context lists both folders with their access')
check(firstBody.includes('sandbox_permissions \\"danger-full-access\\"'), 'context explains the pre-approved write path')
check(withPlugin.log.includes('Additional workspace directories'), 'the folder context is logged in the Session (replayable)')
check(existsSync(granted) && readFileSync(granted, 'utf8') === 'hello from dsh-workspace-folders\n', 'escalated write into the read-write folder succeeded')
check(JSON.stringify(approvalOutcomes(withPlugin.log)) === '["allowed-once"]', `Session log audits one allowed-once decision (got ${JSON.stringify(approvalOutcomes(withPlugin.log))})`)
const foldersAt = firstBody.indexOf('Additional workspace directories')
check(foldersAt >= 0 && firstBody.indexOf('Instructions from additional workspace directories') > foldersAt, 'first model request carries the instructions context after the folder list')
check(firstBody.includes('RW-AGENTS-MARKER') && firstBody.includes('RO-CLAUDE-MARKER'), 'instructions of the read-write and read-only folders both reach the model')
check(!firstBody.includes('RW-CLAUDE-SHADOWED'), 'AGENTS.md is preferred over CLAUDE.md in the same folder')
check(withPlugin.log.includes('RW-AGENTS-MARKER'), 'the instructions context is logged in the Session (replayable)')

// 2. Without the plugin: the same escalation has no approval channel and fails.
const control = join(readWrite, 'control.txt')
const withoutPlugin = await run(control, undefined)
check(!existsSync(control), 'without the plugin the escalated write is not approved')
check(JSON.stringify(approvalOutcomes(withoutPlugin.log)) === '["unavailable"]', `without the plugin the audit shows unavailable (got ${JSON.stringify(approvalOutcomes(withoutPlugin.log))})`)
const controlBody = JSON.stringify(withoutPlugin.requests[0]?.body ?? null)
check(!controlBody.includes('Additional workspace directories'), 'without the plugin no folder context is sent')
check(!controlBody.includes('RW-AGENTS-MARKER'), 'without the plugin DSH does not read the additional directories\' instructions')

// 3. With the plugin at its defaults, a read-only folder is not pre-approved
// and no instructions are loaded.
const denied = join(readOnly, 'blocked.txt')
const readOnlyRun = await run(denied, overlay)
check(!existsSync(denied), 'write into the read-only folder is not pre-approved')
check(JSON.stringify(approvalOutcomes(readOnlyRun.log)) === '["unavailable"]', `read-only folder falls through to the user (audit: ${JSON.stringify(approvalOutcomes(readOnlyRun.log))})`)
check(readOnlyRun.code === 0 && withoutPlugin.code === 0, 'the denied runs still finish normally')
const defaultBody = JSON.stringify(readOnlyRun.requests[0]?.body ?? null)
check(defaultBody.includes('Additional workspace directories') && !defaultBody.includes('RW-AGENTS-MARKER'), 'instructions stay out of the model request by default')

console.log(failures.length === 0 ? `\nall checks passed (${root})` : `\n${failures.length} check(s) failed (${root})`)
if (failures.length > 0) {
  console.log('--- stderr (with plugin) ---\n' + withPlugin.stderr.slice(-4000))
  process.exit(1)
}
