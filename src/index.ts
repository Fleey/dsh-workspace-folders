/**
 * dsh-workspace-folders — Host half.
 *
 * Gives each workspace additional working directories:
 *
 * - The Session's runtime context lists them (a logged, required snapshot
 *   placed right after the sandbox policy), so the model knows to read,
 *   search, and edit them by absolute path. With `loadInstructions`, a second
 *   context right after it carries each folder's root `AGENTS.md` or
 *   `CLAUDE.md`.
 * - Escalated `write`/`edit` calls into a read-write folder are pre-approved
 *   while the standing sandbox mode is `workspace-write`; other escalations
 *   still ask the user.
 * - `/add-dir`, `/remove-dir`, and `/dirs` manage the list from any command
 *   surface; the Web composer's folder button uses the `/api` routes.
 *
 * Every Host service is optional, so the plugin also loads in compositions
 * without a sandbox, command surface, or Web connection.
 */

import { WriteApprover } from './approval.ts'
import { folderCommands } from './commands.ts'
import { parseConfig } from './config.ts'
import { renderFoldersContext, WorkspaceFolders } from './folders.ts'
import { readFolderInstructions, renderInstructionsContext } from './instructions.ts'
import { folderRoutes } from './routes.ts'
import { FolderStore } from './store.ts'
import type { PluginContext } from './types.ts'

export type { Config } from './config.ts'

/** Plugin name shown by the Loader. */
export const name = 'dsh-workspace-folders'

/**
 * Mount the folder contexts, write pre-approval, commands, and routes.
 * @param ctx - the plugin's Cordis context.
 * @param rawConfig - the row's `config` value.
 */
export function apply(ctx: PluginContext, rawConfig: unknown): void {
  const config = parseConfig(rawConfig)
  const folders = new WorkspaceFolders(new FolderStore(config.storeFile), config)
  const changed = (workspace: string): void => {
    ctx.logger.info('additional directories of %s: %o', workspace, folders.store.get(workspace).map(entry => entry.path))
  }
  const sandboxPolicy = () => ctx.get('sandboxPolicy')
  const workingDirectory = () => ctx.get('workingDirectory')

  ctx.inject(['systemPrompt'], (scope) => {
    const order = scope.systemPrompt.getContextOrder('SANDBOX_POLICY') + 1
    scope.systemPrompt.context({
      name: 'workspace-folders',
      order,
      required: true,
      interpolate: false,
      text: (assembly) => {
        const session = assembly.agent?.session
        const workspace = session?.header.cwd
        if (session === undefined || workspace === undefined) return ''
        return renderFoldersContext(
          workspace,
          folders.effective(workspace),
          sandboxPolicy()?.resolve({ session }).mode,
          config.autoApproveWrites,
        )
      },
    })
    if (!config.loadInstructions) return
    // Required like the folder list: the user opted in, so suppressing
    // optional runtime context does not silently drop these instructions.
    scope.systemPrompt.context({
      name: 'workspace-folders:instructions',
      order: order + 1,
      required: true,
      interpolate: false,
      text: (assembly) => {
        const workspace = assembly.agent?.session.header.cwd
        if (workspace === undefined) return ''
        const instructions = readFolderInstructions(folders.effective(workspace), config.maxInstructionBytes)
        return renderInstructionsContext(instructions, config.maxInstructionBytes)
      },
    })
  })

  const approver = new WriteApprover({ folders, logger: ctx.logger, sandboxPolicy, workingDirectory })
  ctx.on('tools/execute', (exec, next) => approver.aroundExecute(exec, next))
  // Ahead of the interactive answerers, which never delegate once they prompt.
  ctx.on('approval/request', (request, next) => approver.answer(request, next), { prepend: true })

  ctx.inject(['commands'], (scope) => {
    for (const command of folderCommands({ folders, logger: ctx.logger, workingDirectory, changed })) {
      try {
        scope.commands.register(command)
      } catch (error) {
        ctx.logger.warn('cannot register /%s (another plugin may own it): %s', command.name, error)
      }
    }
  })

  ctx.inject(['connection'], (scope) => {
    const routes = folderRoutes({
      folders,
      changed,
      sandboxPolicy,
      sessions: () => ctx.get('sessions'),
      workspaceRegistry: () => ctx.get('workspaceRegistry'),
      directoryPicker: () => ctx.get('directoryPicker'),
    })
    for (const route of routes) scope.connection.fetch.register(route)
  })
}
