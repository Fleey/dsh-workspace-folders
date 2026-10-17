/**
 * Pre-approval of escalated file writes into read-write folders.
 *
 * Under `workspace-write`, the file sandbox only lets `write`/`edit` modify
 * the Session workspace. A call outside it retries with
 * `sandbox_permissions: "danger-full-access"`, and the tool asks
 * `ctx.approval` before running. This module remembers each such call's
 * target for the call's dispatch lifetime (`tools/execute`) and answers the
 * matching `approval/request` with `allowed-once` when the canonical target
 * lies under a read-write folder. Every other request falls through to the
 * next answerer, so the user still decides. The approval service records the
 * question and the decision in the Session log either way.
 */

import { resolve } from 'node:path'
import { canonicalTarget } from './paths.ts'
import { FILE_WRITE_TOOLS, FULL_ACCESS, type WorkspaceFolders } from './folders.ts'
import type {
  AgentLike, ApprovalOutcome, ApprovalRequestLike, LoggerLike, SandboxPolicyLike, ToolExecutionLike, WorkingDirectoryLike,
} from './types.ts'

/** Reason prefix `dsh-sandbox` writes for an escalation to full access. */
const FULL_ACCESS_REASON = `escalate sandbox to ${FULL_ACCESS}:`

interface TrackedCall {
  readonly agent: AgentLike
  readonly toolName: string
  readonly filePath: string
}

/** Host services the approver reads at decision time. */
export interface ApproverDeps {
  readonly folders: WorkspaceFolders
  readonly logger: LoggerLike
  readonly sandboxPolicy: () => SandboxPolicyLike | undefined
  readonly workingDirectory: () => WorkingDirectoryLike | undefined
}

function trackable(exec: ToolExecutionLike): TrackedCall | undefined {
  if (exec.agent === undefined || !FILE_WRITE_TOOLS.has(exec.name)) return undefined
  const args = exec.arguments
  if (typeof args !== 'object' || args === null) return undefined
  const { file_path: filePath, sandbox_permissions: requested } = args as { file_path?: unknown; sandbox_permissions?: unknown }
  if (requested !== FULL_ACCESS || typeof filePath !== 'string' || filePath.trim() === '') return undefined
  return { agent: exec.agent, toolName: exec.name, filePath }
}

/** Tracks escalated file writes and pre-approves those into read-write folders. */
export class WriteApprover {
  private readonly calls = new Map<string, TrackedCall>()

  constructor(private readonly deps: ApproverDeps) {}

  /** Number of calls currently tracked; zero whenever no tracked call is dispatching. */
  get pending(): number {
    return this.calls.size
  }

  /**
   * `tools/execute` listener: remember an escalated write for exactly the
   * lifetime of its dispatch.
   * @param exec - the dispatching call.
   * @param next - the rest of the dispatch chain.
   * @returns the chain's result unchanged.
   */
  async aroundExecute(exec: ToolExecutionLike, next: () => Promise<unknown>): Promise<unknown> {
    const call = trackable(exec)
    if (call === undefined) return next()
    this.calls.set(exec.callId, call)
    try {
      return await next()
    } finally {
      if (this.calls.get(exec.callId) === call) this.calls.delete(exec.callId)
    }
  }

  /**
   * `approval/request` listener: answer `allowed-once` for a tracked call
   * whose target lies under a read-write folder; delegate everything else.
   * @param request - the pending approval request.
   * @param next - the next answerer.
   * @returns the outcome.
   */
  async answer(request: ApprovalRequestLike, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome> {
    const call = request.callId === undefined ? undefined : this.calls.get(request.callId)
    if (call === undefined || call.agent !== request.agent || call.toolName !== request.toolName) return next()
    if (request.reason?.startsWith(FULL_ACCESS_REASON) !== true) return next()
    const grant = this.grantFor(call)
    if (grant === undefined) return next()
    this.deps.logger.info('pre-approved %s of %s inside additional directory %s', call.toolName, grant.target, grant.folder)
    return 'allowed-once'
  }

  private grantFor(call: TrackedCall): { readonly target: string; readonly folder: string } | undefined {
    const { session } = call.agent
    const workspace = session.header.cwd
    const policy = this.deps.sandboxPolicy()
    if (workspace === undefined || policy === undefined) return undefined
    let base = workspace
    try {
      base = this.deps.workingDirectory()?.get(session) ?? workspace
    } catch {
      // No committed working directory; relative paths resolve against the workspace.
    }
    const target = canonicalTarget(resolve(base, call.filePath))
    const folder = this.deps.folders.writeGrant(workspace, policy.resolve({ session }).mode, target)
    return folder === undefined ? undefined : { target, folder: folder.path }
  }
}
