/**
 * dsh-workspace-folders — browser half.
 *
 * Adds a folder button to the composer tool row (`conversation.input.left`,
 * an official list slot). It shows how many additional directories the
 * current Session's workspace has; clicking it opens a dialog to add, remove,
 * or change the access of those directories. Changes are saved through the
 * Host half's `/api/workspace-folders/*` routes.
 *
 * Directories can be typed or chosen. The chooser is, in order: the Desktop
 * window's preload bridge (`__DSH_DIRECTORY_PICKER__`, the system folder
 * dialog that DSH Desktop and DSH NEXT also use to add workspaces), the
 * Host's native chooser, or an in-app browser over the Host's browse-kind
 * directory picker (ordinary or LAN browsers).
 */

import * as React from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { en, NS, zh, type FoldersKey } from './locales.ts'

type FolderAccess = 'read-write' | 'read-only'

interface FolderView {
  readonly path: string
  readonly access: FolderAccess
  readonly source: 'workspace' | 'global'
  readonly exists: boolean
}

interface FolderState {
  readonly workspace: string
  readonly directories: readonly FolderView[]
  readonly sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access' | null
  readonly autoApproveWrites: boolean
  readonly picker: 'native' | 'browse' | null
}

interface DirectoryEntry {
  readonly name: string
  readonly path: string
  readonly hidden: boolean
}

interface DirectoryListing {
  readonly path: string
  readonly crumbs: readonly DirectoryEntry[]
  readonly entries: readonly DirectoryEntry[]
  readonly truncated: boolean
}

/** Desktop preload bridge name; DSH Desktop's own workspace flow reads the same global. */
const DESKTOP_DIRECTORY_PICKER_GLOBAL = '__DSH_DIRECTORY_PICKER__'

/**
 * The Desktop window's system folder dialog, absent in ordinary browsers.
 * @returns a call opening one dialog, resolving to the chosen path or null.
 */
function desktopDirectoryPicker(): (() => Promise<string | null>) | undefined {
  const bridge = (globalThis as Record<string, unknown>)[DESKTOP_DIRECTORY_PICKER_GLOBAL]
  if (typeof bridge !== 'object' || bridge === null) return undefined
  const pick = (bridge as { pick?: unknown }).pick
  if (typeof pick !== 'function') return undefined
  return () => (pick as () => Promise<string | null>).call(bridge)
}

type Translate = (key: FoldersKey, params?: Record<string, string | number>) => string

interface ControlProps {
  readonly sessionId: string
  readonly t: Translate
}

/** Minimal Cordis client context surface used here. */
interface ClientContext {
  effect(execute: () => () => void, label?: string): void
  readonly locale: { register(ns: string, dicts: Record<string, Record<string, string>>): () => void }
  readonly slots: {
    inject(name: string, register: () => () => void): void
    register(
      options: {
        name: string
        id: string
        order: number
        locale: string
        inject: (sessionId: string) => { sessionId: string }
      },
      component: (props: ControlProps) => React.ReactElement | null,
    ): () => void
  }
}

/** One refused directory, as reported by the save route. */
interface FolderProblem {
  readonly code: 'missing' | 'inside-workspace'
  readonly path: string
}

class ApiError extends Error {
  constructor(message: string, readonly details: readonly FolderProblem[]) {
    super(message)
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(`api/workspace-folders/${path}`, document.baseURI), {
    cache: 'no-store',
    credentials: 'same-origin',
    ...init,
  })
  let payload: { ok?: boolean; data?: T; error?: string; details?: FolderProblem[] } | undefined
  try {
    payload = await response.json() as typeof payload
  } catch {
    // response.json() failed: the Host did not answer with this plugin's JSON.
    throw new ApiError(`HTTP ${response.status}`, [])
  }
  if (!response.ok || payload?.ok !== true) {
    throw new ApiError(payload?.error ?? `HTTP ${response.status}`, payload?.details ?? [])
  }
  return payload.data as T
}

const postJson = (body: object): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const STYLE = `
.wsf-body{display:flex;flex-direction:column;gap:12px;max-height:min(60vh,560px);overflow:auto}
.wsf-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.wsf-error{font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary)}
.wsf-error ul{margin:4px 0 0;padding-left:18px}
.wsf-list{display:flex;flex-direction:column;gap:2px}
.wsf-row{display:flex;align-items:center;gap:8px;min-height:32px;padding:4px 8px;border-radius:var(--dsw-radius-md)}
.wsf-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.wsf-path{flex:1;min-width:0;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.wsf-tag{flex:none;font-size:11px;line-height:18px;padding:0 6px;border-radius:999px;color:var(--dsw-alias-label-secondary);border:0.5px solid var(--dsw-alias-border-l2)}
.wsf-tag.wsf-warn{color:var(--dsw-alias-state-warn-primary)}
.wsf-access{flex:none;display:inline-flex;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);overflow:hidden}
.wsf-access button{border:none;background:transparent;padding:2px 8px;font-size:12px;line-height:18px;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.wsf-access button[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:600}
.wsf-remove{flex:none;border:none;background:transparent;cursor:pointer;width:24px;height:24px;border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-tertiary);font-size:16px;line-height:24px}
.wsf-remove:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.wsf-add{display:flex;gap:8px;align-items:center}
.wsf-add > span{flex:1;min-width:0}
.wsf-add > button{flex:none;white-space:nowrap}
.wsf-dialog{width:min(600px,calc(100vw - 48px))!important;max-width:none!important}
.wsf-empty{font-size:13px;color:var(--dsw-alias-label-tertiary);padding:4px 8px}
.wsf-footer{display:flex;justify-content:flex-end;gap:8px}
.wsf-browser{display:flex;flex-direction:column;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);overflow:hidden}
.wsf-crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:6px 8px;border-bottom:0.5px solid var(--dsw-alias-border-l2);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px;color:var(--dsw-alias-label-tertiary)}
.wsf-crumbs button{border:none;background:transparent;padding:1px 4px;border-radius:var(--dsw-radius-sm,4px);cursor:pointer;font:inherit;color:var(--dsw-alias-label-secondary)}
.wsf-crumbs button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.wsf-crumbs button[aria-current="location"]{color:var(--dsw-alias-label-primary);font-weight:600}
.wsf-entries{display:flex;flex-direction:column;max-height:220px;min-height:64px;overflow:auto;padding:4px}
.wsf-entry{display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;text-align:left;padding:4px 8px;border-radius:var(--dsw-radius-md);cursor:pointer;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.wsf-entry:hover{background:var(--dsw-alias-interactive-bg-hover)}
.wsf-entry.wsf-dim{color:var(--dsw-alias-label-tertiary)}
.wsf-entry svg{flex:none;color:var(--dsw-alias-label-tertiary)}
.wsf-browser-footer{display:flex;align-items:center;gap:8px;padding:6px 8px;border-top:0.5px solid var(--dsw-alias-border-l2)}
.wsf-browser-footer > button{flex:none;white-space:nowrap}
.wsf-hidden-toggle{display:flex;align-items:center;gap:6px;margin-right:auto;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
`

/** A path label truncated at its start; `bdi` keeps separators in reading order inside the RTL ellipsis box. */
function PathText({ path }: { path: string }): React.ReactElement {
  return <span className="wsf-path" title={path}><bdi dir="ltr">{path}</bdi></span>
}

function FolderIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
      <path d="M8 7v4M6 9h4" />
    </svg>
  )
}

function PlainFolderIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
    </svg>
  )
}

/**
 * In-app folder browser over the Host's browse-kind directory picker: one level
 * at a time, starting beside the workspace.
 */
function FolderBrowser({ sessionId, onPick, onCancel, t }: {
  sessionId: string
  onPick: (path: string) => void
  onCancel: () => void
  t: Translate
}): React.ReactElement {
  const [listing, setListing] = React.useState<DirectoryListing>()
  const [target, setTarget] = React.useState<string>()
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string>()
  const [showHidden, setShowHidden] = React.useState(false)

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    const query = target === undefined ? `sessionId=${encodeURIComponent(sessionId)}` : `path=${encodeURIComponent(target)}`
    api<DirectoryListing>(`browse?${query}`, { signal: controller.signal }).then(
      (next) => { setListing(next); setLoading(false) },
      (cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setLoading(false)
      },
    )
    return () => controller.abort()
  }, [sessionId, target])

  const entries = listing?.entries.filter(entry => showHidden || !entry.hidden) ?? []
  return (
    <div className="wsf-browser">
      <div className="wsf-crumbs">
        {listing?.crumbs.map((crumb, index) => (
          <React.Fragment key={crumb.path}>
            {index > 1 && <span aria-hidden="true">/</span>}
            <button
              type="button"
              aria-current={crumb.path === listing.path ? 'location' : undefined}
              onClick={() => setTarget(crumb.path)}
            >
              {crumb.name}
            </button>
          </React.Fragment>
        ))}
      </div>
      <div className="wsf-entries" role="list">
        {loading && <div className="wsf-empty">{t('loading')}</div>}
        {!loading && error !== undefined && <div className="wsf-error" role="alert">{t('browseFailed', { message: error })}</div>}
        {!loading && error === undefined && entries.length === 0 && <div className="wsf-empty">{t('noSubfolders')}</div>}
        {!loading && error === undefined && entries.map(entry => (
          <button
            type="button"
            role="listitem"
            key={entry.path}
            className={entry.hidden ? 'wsf-entry wsf-dim' : 'wsf-entry'}
            title={entry.path}
            onClick={() => setTarget(entry.path)}
          >
            <PlainFolderIcon />
            {entry.name}
          </button>
        ))}
        {!loading && listing?.truncated === true && <div className="wsf-note">{t('truncated')}</div>}
      </div>
      <div className="wsf-browser-footer">
        <label className="wsf-hidden-toggle">
          <input type="checkbox" checked={showHidden} onChange={event => setShowHidden(event.currentTarget.checked)} />
          {t('showHidden')}
        </label>
        <Button variant="outline" size="sm" onClick={onCancel}>{t('cancel')}</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={listing === undefined || loading || error !== undefined}
          onClick={() => { if (listing !== undefined) onPick(listing.path) }}
        >
          {t('useFolder')}
        </Button>
      </div>
    </div>
  )
}

function loadState(sessionId: string, signal?: AbortSignal): Promise<FolderState> {
  return api<FolderState>(`state?sessionId=${encodeURIComponent(sessionId)}`, signal === undefined ? undefined : { signal })
}

function AccessToggle({ value, onChange, t }: {
  value: FolderAccess
  onChange: (next: FolderAccess) => void
  t: Translate
}): React.ReactElement {
  return (
    <span className="wsf-access" role="group">
      <button type="button" aria-pressed={value === 'read-write'} onClick={() => onChange('read-write')}>{t('readWrite')}</button>
      <button type="button" aria-pressed={value === 'read-only'} onClick={() => onChange('read-only')}>{t('readOnly')}</button>
    </span>
  )
}

function FoldersDialog({ sessionId, state, onClose, onSaved, t }: {
  sessionId: string
  state: FolderState
  onClose: () => void
  onSaved: (state: FolderState) => void
  t: Translate
}): React.ReactElement {
  const own = state.directories.filter(folder => folder.source === 'workspace')
  const inherited = state.directories.filter(folder => folder.source === 'global')
  const [draft, setDraft] = React.useState<FolderView[]>(own)
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [failure, setFailure] = React.useState<{ message: string; details: readonly FolderProblem[] }>()
  const [browsing, setBrowsing] = React.useState(false)
  const desktopPick = React.useMemo(desktopDirectoryPicker, [])
  const chooser = desktopPick !== undefined ? 'desktop' : state.picker

  const append = (path: string): void => {
    const trimmed = path.trim()
    if (trimmed === '') return
    setDraft(rows => [...rows.filter(row => row.path !== trimmed), { path: trimmed, access: 'read-write', source: 'workspace', exists: true }])
    setInput('')
  }

  const run = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setFailure(undefined)
    try {
      await operation()
    } catch (cause) {
      setFailure({
        message: cause instanceof Error ? cause.message : String(cause),
        details: cause instanceof ApiError ? cause.details : [],
      })
    } finally {
      setBusy(false)
    }
  }

  const choose = (): Promise<void> => {
    if (chooser === 'browse') {
      setBrowsing(open => !open)
      return Promise.resolve()
    }
    return run(async () => {
      const path = desktopPick !== undefined
        ? await desktopPick()
        : (await api<{ path: string | null }>('pick', postJson({}))).path
      if (path !== null) append(path)
    })
  }

  const save = (): Promise<void> => run(async () => {
    const pending = input.trim() === '' ? draft : [...draft, { path: input.trim(), access: 'read-write' as const }]
    const next = await api<FolderState>('save', postJson({
      sessionId,
      directories: pending.map(({ path, access }) => ({ path, access })),
    }))
    onSaved(next)
  })

  const note = state.sandboxMode === 'read-only'
    ? t('readOnlyMode')
    : state.sandboxMode === 'workspace-write'
      ? state.autoApproveWrites ? t('autoApprove') : t('noAutoApprove')
      : undefined

  return (
    <Modal
      open
      onClose={onClose}
      title={t('title')}
      closeLabel={t('close')}
      description={t('description')}
      className="wsf-dialog"
      footer={(
        <div className="wsf-footer">
          <Button variant="outline" onClick={onClose} disabled={busy}>{t('cancel')}</Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? t('saving') : t('save')}</Button>
        </div>
      )}
    >
      <div className="wsf-body">
        <div className="wsf-list">
          <div className="wsf-row">
            <PathText path={state.workspace} />
            <span className="wsf-tag">{t('primary')}</span>
          </div>
          {inherited.map(folder => (
            <div className="wsf-row" key={`global:${folder.path}`}>
              <PathText path={folder.path} />
              {!folder.exists && <span className="wsf-tag wsf-warn">{t('missing')}</span>}
              <span className="wsf-tag">{folder.access === 'read-write' ? t('readWrite') : t('readOnly')}</span>
              <span className="wsf-tag">{t('global')}</span>
            </div>
          ))}
          {draft.map(folder => (
            <div className="wsf-row" key={folder.path}>
              <PathText path={folder.path} />
              {!folder.exists && <span className="wsf-tag wsf-warn">{t('missing')}</span>}
              <AccessToggle
                value={folder.access}
                t={t}
                onChange={access => setDraft(rows => rows.map(row => row.path === folder.path ? { ...row, access } : row))}
              />
              <button
                type="button"
                className="wsf-remove"
                aria-label={t('remove', { path: folder.path })}
                title={t('remove', { path: folder.path })}
                onClick={() => setDraft(rows => rows.filter(row => row.path !== folder.path))}
              >
                ×
              </button>
            </div>
          ))}
          {draft.length === 0 && inherited.length === 0 && <div className="wsf-empty">{t('empty')}</div>}
        </div>
        <div className="wsf-add">
          <Input
            value={input}
            placeholder={t('placeholder')}
            spellCheck={false}
            data-modal-autofocus=""
            onChange={event => setInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                append(input)
              }
            }}
          />
          <Button variant="outline" onClick={() => append(input)} disabled={busy || input.trim() === ''}>{t('add')}</Button>
          {chooser !== null && (
            <Button variant="outline" onClick={() => void choose()} disabled={busy} aria-expanded={chooser === 'browse' ? browsing : undefined}>
              {t('choose')}
            </Button>
          )}
        </div>
        {browsing && (
          <FolderBrowser
            sessionId={sessionId}
            t={t}
            onCancel={() => setBrowsing(false)}
            onPick={(path) => { append(path); setBrowsing(false) }}
          />
        )}
        {note !== undefined && <div className="wsf-note">{note}</div>}
        {failure !== undefined && (
          <div className="wsf-error" role="alert">
            {failure.details.length > 0 ? t('invalid') : t('error', { message: failure.message })}
            {failure.details.length > 0 && (
              <ul>
                {failure.details.map(detail => (
                  <li key={`${detail.code}:${detail.path}`}>
                    {t(detail.code === 'missing' ? 'problemMissing' : 'problemInside', { path: detail.path })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function FoldersControl({ sessionId, t }: ControlProps): React.ReactElement | null {
  const [state, setState] = React.useState<FolderState>()
  const [unavailable, setUnavailable] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    const controller = new AbortController()
    setState(undefined)
    setUnavailable(false)
    setOpen(false)
    loadState(sessionId, controller.signal).then(setState, () => {
      if (!controller.signal.aborted) setUnavailable(true)
    })
    return () => controller.abort()
  }, [sessionId])
  // Sessions without a workspace directory have nothing to extend.
  if (unavailable) return null
  const count = state?.directories.length ?? 0
  // Re-read on open so changes made with /add-dir or /remove-dir show up.
  const openDialog = (): void => {
    loadState(sessionId).then((next) => { setState(next); setOpen(true) }, () => setOpen(true))
  }
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<FolderIcon />}
        aria-label={t('button')}
        title={t('button')}
        disabled={state === undefined}
        onClick={openDialog}
      >
        {count > 0 ? t('count', { count }) : null}
      </Button>
      {open && state !== undefined && (
        <FoldersDialog
          sessionId={sessionId}
          state={state}
          t={t}
          onClose={() => setOpen(false)}
          onSaved={(next) => { setState(next); setOpen(false) }}
        />
      )}
    </>
  )
}

/** Client services this bundle needs. */
export const inject = ['slots', 'locale']

/**
 * Register copy, styles, and the composer control.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'workspace-folders: copy')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.owner = 'dsh-workspace-folders'
    style.textContent = STYLE
    document.head.appendChild(style)
    return () => style.remove()
  }, 'workspace-folders: styles')
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'dsh-workspace-folders.control',
    order: 900,
    locale: NS,
    inject: sessionId => ({ sessionId }),
  }, FoldersControl))
}
