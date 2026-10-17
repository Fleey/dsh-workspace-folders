import { symlinkSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WriteApprover } from '../src/approval.ts'
import type { AgentLike, ApprovalOutcome, SandboxMode, ToolExecutionLike } from '../src/types.ts'
import { makeAgent, makeFolders, policy, recordingLogger, tempTree } from './helpers.ts'

const REASON = 'escalate sandbox to danger-full-access: update the shared library'

async function setup(mode: SandboxMode = 'workspace-write', workingDirectory?: string) {
  const tree = tempTree('ws', 'rw', 'ro', 'outside')
  const cwd = workingDirectory === undefined ? undefined : tree.path(workingDirectory)
  const folders = makeFolders(tree.root)
  await folders.store.set(tree.path('ws'), [
    { path: tree.path('rw'), access: 'read-write' },
    { path: tree.path('ro'), access: 'read-only' },
  ])
  const logger = recordingLogger()
  const approver = new WriteApprover({
    folders,
    logger,
    sandboxPolicy: () => policy(mode),
    workingDirectory: () => cwd === undefined ? undefined : { get: () => cwd },
  })
  const agent = makeAgent(tree.path('ws'))
  return { tree, approver, agent, logger }
}

function write(agent: AgentLike, filePath: string, extra: Record<string, unknown> = {}, name = 'write'): ToolExecutionLike {
  return {
    callId: 'call-1',
    name,
    agent,
    arguments: { file_path: filePath, content: 'x', sandbox_permissions: 'danger-full-access', justification: 'why', ...extra },
  }
}

/** Dispatch `exec` and, inside its body, ask the approver the way dsh-tool-fs does. */
async function dispatch(
  approver: WriteApprover,
  exec: ToolExecutionLike,
  request: { toolName?: string; reason?: string; agent?: AgentLike; callId?: string } = {},
): Promise<ApprovalOutcome> {
  let outcome: ApprovalOutcome | undefined
  await approver.aroundExecute(exec, async () => {
    outcome = await approver.answer({
      agent: request.agent ?? (exec.agent as AgentLike),
      toolName: request.toolName ?? exec.name,
      callId: request.callId ?? exec.callId,
      reason: request.reason ?? REASON,
    }, async () => 'rejected')
  })
  return outcome as ApprovalOutcome
}

describe('WriteApprover', () => {
  it('pre-approves escalated write and edit calls into a read-write folder', async () => {
    const { tree, approver, agent, logger } = await setup()
    expect(await dispatch(approver, write(agent, tree.path('rw/new/file.ts')))).toBe('allowed-once')
    expect(await dispatch(approver, write(agent, tree.path('rw/file.ts'), {}, 'edit'))).toBe('allowed-once')
    expect(approver.pending).toBe(0)
    expect(logger.lines[0]).toBe(`info pre-approved %s of %s inside additional directory %s ${JSON.stringify(['write', tree.path('rw/new/file.ts'), tree.path('rw')])}`)
  })

  it('resolves relative targets against the working directory, else the workspace', async () => {
    const moved = await setup('workspace-write', 'rw')
    expect(await dispatch(moved.approver, write(moved.agent, 'a.txt'))).toBe('allowed-once')
    const unmoved = await setup('workspace-write')
    expect(await dispatch(unmoved.approver, write(unmoved.agent, 'a.txt'))).toBe('rejected')
    expect(await dispatch(unmoved.approver, write(unmoved.agent, '../rw/a.txt'))).toBe('allowed-once')
  })

  it('delegates everything it does not own', async () => {
    const { tree, approver, agent } = await setup()
    symlinkSync(tree.path('outside'), tree.path('rw/escape'))
    const target = tree.path('rw/a.txt')
    expect(await dispatch(approver, write(agent, tree.path('ro/a.txt')))).toBe('rejected')
    expect(await dispatch(approver, write(agent, tree.path('outside/a.txt')))).toBe('rejected')
    expect(await dispatch(approver, write(agent, tree.path('rw/escape/a.txt')))).toBe('rejected')
    expect(await dispatch(approver, write(agent, target, { sandbox_permissions: undefined }))).toBe('rejected')
    expect(await dispatch(approver, write(agent, target), { reason: 'hook: confirm write' })).toBe('rejected')
    expect(await dispatch(approver, write(agent, target), { toolName: 'bash' })).toBe('rejected')
    expect(await dispatch(approver, write(agent, target), { callId: 'other-call' })).toBe('rejected')
    expect(await dispatch(approver, write(agent, target), { agent: makeAgent(tree.path('ws'), 'other') })).toBe('rejected')
    expect(await dispatch(approver, write(agent, target, {}, 'bash'))).toBe('rejected')
    expect(approver.pending).toBe(0)
  })

  it('leaves non-workspace-write sessions to the user', async () => {
    for (const mode of ['read-only', 'danger-full-access'] as const) {
      const { tree, approver, agent } = await setup(mode)
      expect(await dispatch(approver, write(agent, tree.path('rw/a.txt')))).toBe('rejected')
    }
  })

  it('stops tracking a call when its dispatch fails', async () => {
    const { tree, approver, agent } = await setup()
    await expect(approver.aroundExecute(write(agent, tree.path('rw/a')), async () => {
      throw new Error('tool failed')
    })).rejects.toThrow('tool failed')
    expect(approver.pending).toBe(0)
  })
})
