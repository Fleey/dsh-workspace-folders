/**
 * Structural views of the DeepSeek Harness 0.2.1 Host services this plugin
 * uses. Only the members read here are declared; the running Host supplies
 * the real services, so these types never ship at runtime.
 */

/** Per-workspace access granted to one additional directory. */
export type FolderAccess = 'read-write' | 'read-only'

/** One additional directory as stored and configured. */
export interface FolderEntry {
  /** Absolute, canonical directory path. */
  readonly path: string
  /** Whether write/edit calls into it are pre-approved. */
  readonly access: FolderAccess
}

/** Sandbox file-effect modes (`@deepseek-ai/dsh-sandbox`). */
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

/** The parts of a Session read here (`@deepseek-ai/dsh-session`). */
export interface SessionLike {
  readonly id: string
  readonly header: { readonly cwd?: string | undefined }
}

/** The parts of an Agent read here (`@deepseek-ai/dsh-agent`). */
export interface AgentLike {
  readonly session: SessionLike
}

/** Prompt-assembly context; `agent` is merged in by `@deepseek-ai/dsh-agent`. */
export interface AssembleContextLike {
  readonly agent?: AgentLike | undefined
}

/** `ctx.systemPrompt` (`@deepseek-ai/dsh-system-prompt`). */
export interface SystemPromptLike {
  context(context: {
    readonly name: string
    readonly order: number
    readonly text: (context: AssembleContextLike) => string
    readonly interpolate?: boolean
    readonly required?: boolean
  }): () => void
  getContextOrder(name: 'SANDBOX_POLICY' | 'APPROVAL_POLICY'): number
}

/** `ctx.sandboxPolicy` (`@deepseek-ai/dsh-sandbox-policy`). */
export interface SandboxPolicyLike {
  resolve(request: { session?: SessionLike }): { readonly mode: SandboxMode; readonly workspaceRoot: string }
}

/** `ctx.workingDirectory` (`@deepseek-ai/dsh-working-directory`). */
export interface WorkingDirectoryLike {
  get(session: SessionLike): string
}

/** Settled slash-command outcome (`@deepseek-ai/dsh-commands`). */
export type CommandResult =
  | { readonly kind: 'success'; readonly text?: string }
  | { readonly kind: 'error'; readonly text: string }

/** One slash-command invocation (`@deepseek-ai/dsh-commands`). */
export interface CommandInvocationLike {
  readonly agent: AgentLike
  readonly rawInput: string
  readonly signal?: AbortSignal
}

/** `ctx.commands` (`@deepseek-ai/dsh-commands`). */
export interface CommandsLike {
  register(definition: {
    readonly name: string
    readonly description: string
    readonly input?: { readonly hint: string }
    readonly handler: (invocation: CommandInvocationLike) => CommandResult | Promise<CommandResult>
  }): () => void
}

/** One exact Fetch route on the shared `/api` channel (`@deepseek-ai/dsh-client-connection`). */
export interface FetchRouteLike {
  readonly path: string
  readonly methods: readonly ('GET' | 'HEAD' | 'POST')[]
  readonly requestBody: 'buffered' | 'streaming'
  readonly fetch: (request: Request) => Promise<Response>
}

/** `ctx.connection` (`@deepseek-ai/dsh-client-connection`, Host face). */
export interface ConnectionLike {
  readonly fetch: { register(route: FetchRouteLike): () => Promise<void> }
}

/** `ctx.sessions` (`@deepseek-ai/dsh-session`). */
export interface SessionsLike {
  get(id: string): SessionLike | undefined
}

/** `ctx.workspaceRegistry` (`@deepseek-ai/dsh-workspace`). */
export interface WorkspaceRegistryLike {
  list(): readonly { readonly id: string; readonly path: string; readonly sessionIds: readonly string[] }[]
}

/** One directory row of a browse listing (`@deepseek-ai/dsh-host-directory-picker/types`). */
export interface DirectoryEntryLike {
  readonly name: string
  readonly path: string
  readonly hidden: boolean
}

/** One browse level with its ancestry (`@deepseek-ai/dsh-host-directory-picker/types`). */
export interface DirectoryListingLike {
  readonly path: string
  readonly home: string
  readonly crumbs: readonly DirectoryEntryLike[]
  readonly entries: readonly DirectoryEntryLike[]
  readonly truncated: boolean
}

/** OS chooser on the Host display. */
export interface NativePickerCapabilityLike {
  readonly kind: 'native'
  pick(signal?: AbortSignal): Promise<string | null>
}

/** Level-by-level listing an in-app browser drives. */
export interface BrowsePickerCapabilityLike {
  readonly kind: 'browse'
  list(path?: string, signal?: AbortSignal): Promise<DirectoryListingLike>
}

/** `ctx.directoryPicker` (`@deepseek-ai/dsh-host-directory-picker`); other kinds may be merged in. */
export interface DirectoryPickerLike {
  capability(): NativePickerCapabilityLike | BrowsePickerCapabilityLike | { readonly kind: string }
}

/** Tool call view seen by `tools/execute` (`@deepseek-ai/dsh-tools`). */
export interface ToolExecutionLike {
  readonly callId: string
  readonly name: string
  readonly arguments: unknown
  readonly agent?: AgentLike | undefined
}

/** Approval request seen by `approval/request` (`@deepseek-ai/dsh-user-approval`). */
export interface ApprovalRequestLike {
  readonly agent: AgentLike
  readonly toolName: string
  readonly callId?: string | undefined
  readonly reason?: string | undefined
}

/** Outcome of one approval request. */
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

/** Logger surface of a Cordis context. */
export interface LoggerLike {
  info(format: string, ...args: unknown[]): void
  warn(format: string, ...args: unknown[]): void
}

/**
 * The Cordis context surface used by the plugin. Optional services are read
 * through `get`, never through property access.
 */
export interface PluginContext {
  readonly logger: LoggerLike
  get(name: 'sandboxPolicy'): SandboxPolicyLike | undefined
  get(name: 'workingDirectory'): WorkingDirectoryLike | undefined
  get(name: 'sessions'): SessionsLike | undefined
  get(name: 'workspaceRegistry'): WorkspaceRegistryLike | undefined
  get(name: 'directoryPicker'): DirectoryPickerLike | undefined
  inject(deps: readonly string[], callback: (ctx: ScopedContext) => void): void
  effect(execute: () => (() => unknown) | void, label?: string): void
  on(
    name: 'tools/execute',
    listener: (exec: ToolExecutionLike, next: () => Promise<unknown>) => Promise<unknown>,
  ): () => void
  on(
    name: 'approval/request',
    listener: (request: ApprovalRequestLike, next: () => Promise<ApprovalOutcome>) => Promise<ApprovalOutcome>,
    options: { prepend: boolean },
  ): () => void
}

/** A nested-injection context exposing the requested services. */
export interface ScopedContext extends PluginContext {
  readonly systemPrompt: SystemPromptLike
  readonly commands: CommandsLike
  readonly connection: ConnectionLike
}
