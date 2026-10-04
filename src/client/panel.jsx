import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, RefreshCw, ChevronLeft, ChevronRight, Download, GitFork, ExternalLink, Star, X, AlertCircle } from 'lucide-react'
import { t, phaseLabel, ghHint, countLabel, pageLabel } from './locales.js'
import { isOwnRepository } from '../protocol.js'

const css = `
.bazaar { box-sizing:border-box; height:100%; min-height:0; min-width:0; overflow:auto; padding:18px; color:inherit; font-size:13px; letter-spacing:0; }
.bazaar * { box-sizing:border-box; letter-spacing:0; }
.bazaar h2 { font-size:18px; margin:0; font-weight:600; }
.bazaar h3 { font-size:14px; margin:0; font-weight:600; }
.bazaar-header,.bazaar-controls,.bazaar-actions,.bazaar-pagination { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.bazaar-header { justify-content:space-between; margin-bottom:14px; }
.bazaar-controls { margin-bottom:12px; }
.bazaar input,.bazaar select,.bazaar button { font:inherit; color:inherit; border:1px solid var(--dsw-alias-border-secondary); background:var(--dsw-alias-bg-layer-1,transparent); border-radius:6px; min-height:34px; }
.bazaar input { flex:1 1 200px; min-width:0; padding:7px 10px; }
.bazaar select { max-width:100%; min-width:0; padding:5px 8px; }
.bazaar button { display:inline-flex; gap:6px; align-items:center; justify-content:center; padding:6px 10px; cursor:pointer; flex-shrink:0; }
.bazaar button svg { width:15px; height:15px; flex-shrink:0; }
.bazaar .bazaar-icon { width:34px; height:34px; padding:0; }
.bazaar button[disabled],.bazaar button[aria-disabled=true] { opacity:.45; cursor:not-allowed; }
.bazaar button:not([disabled]):not([aria-disabled=true]):hover { background:var(--dsw-alias-bg-layer-2); }
.bazaar :focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px; }
.bazaar .bazaar-primary { color:var(--dsw-alias-brand-primary); }
.bazaar a { color:var(--dsw-alias-brand-primary); text-decoration:none; overflow-wrap:anywhere; }
.bazaar a:hover { text-decoration:underline; }
.bazaar-muted { opacity:.65; font-size:12px; }
.bazaar-notice { margin:8px 0; display:flex; align-items:flex-start; gap:8px; color:var(--dsw-alias-text-error,inherit); overflow-wrap:anywhere; }
.bazaar-notice svg { flex-shrink:0; width:16px; height:16px; }
.bazaar-card { display:flex; flex-wrap:wrap; align-items:flex-start; gap:12px; padding:13px; margin:10px 0; border:1px solid var(--dsw-alias-border-secondary); border-radius:8px; background:var(--dsw-alias-bg-layer-1,transparent); }
.bazaar-card-main { flex:1 1 220px; min-width:0; }
.bazaar-repo { font-weight:600; font-size:14px; }
.bazaar-repo svg { width:12px; height:12px; margin-left:5px; }
.bazaar-description { margin:5px 0 8px; line-height:1.6; overflow-wrap:anywhere; }
.bazaar-meta { display:flex; gap:12px; flex-wrap:wrap; font-size:12px; opacity:.7; }
.bazaar-meta span { display:inline-flex; align-items:center; gap:4px; }
.bazaar-meta svg { width:12px; height:12px; }
.bazaar-hint { position:relative; display:inline-flex; }
.bazaar-hint-text { display:none; position:absolute; bottom:calc(100% + 6px); right:0; z-index:3; padding:7px 10px; border:1px solid var(--dsw-alias-border-secondary); border-radius:6px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-text-primary); width:max-content; max-width:220px; box-shadow:0 2px 8px var(--dsw-alias-border-secondary); }
.bazaar-hint:hover .bazaar-hint-text,.bazaar-hint:focus-within .bazaar-hint-text { display:block; }
.bazaar-band { border-top:1px solid var(--dsw-alias-border-secondary); padding-top:14px; margin-top:16px; }
.bazaar-pagination { justify-content:flex-end; padding-top:8px; }
.bazaar-task-head { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:space-between; }
.bazaar-task-head select { flex:0 1 400px; }
.bazaar-task dl { display:grid; grid-template-columns:90px minmax(0,1fr); gap:6px 12px; margin:12px 0; }
.bazaar-task dt { opacity:.65; }
.bazaar-task dd { margin:0; overflow-wrap:anywhere; }
.bazaar-task pre { font:12px/1.55 ui-monospace,monospace; white-space:pre-wrap; overflow-wrap:anywhere; margin:8px 0; max-height:220px; overflow:auto; }
.bazaar-task details { margin:10px 0; }
.bazaar-subscriptions { display:flex; gap:8px 20px; flex-wrap:wrap; margin:10px 0; }
@media(max-width:500px) { .bazaar { padding:12px; } .bazaar-card-main { flex-basis:100%; } .bazaar-task dl { grid-template-columns:72px minmax(0,1fr); } }
`

async function request(path, { signal, ...options } = {}) {
  const response = await fetch(`/dsh-bazaar/${path}`, {
    ...options, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
    headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) },
  })
  const endpoint = path.split('?')[0]
  let body
  try { body = await response.json() }
  catch {
    throw new Error(response.ok ? `${t('hostProtocolError')} (${endpoint}: JSON)` : `HTTP ${response.status} (${endpoint})`)
  }
  if (!response.ok) {
    const error = new Error(body?.error ?? `HTTP ${response.status} (${endpoint})`)
    error.requestId = body?.requestId
    throw error
  }
  // A rebuilt Client can coexist with the old Host until restart. Reject its payload before setting state.
  const valid = {
    'install-status': () => Array.isArray(body?.tasks) && Object.hasOwn(body, 'install') && Object.hasOwn(body, 'busy'),
    capabilities: () => typeof body?.gh?.status === 'string' && typeof body?.installation === 'boolean' && body?.approval === 'agent-only',
    installed: () => Array.isArray(body?.bundles),
    pnpm: () => options.method === 'POST' ? typeof body?.requestId === 'string' && body.install?.requestId === body.requestId
      : Object.hasOwn(body, 'version') && typeof body?.recommended === 'string' && Array.isArray(body?.localLinks),
    list: () => Array.isArray(body?.items) && Array.isArray(body?.subscriptions) && Array.isArray(body?.subscribed),
  }[endpoint]
  if (valid && !valid()) throw new Error(`${t('hostProtocolError')} (${endpoint})`)
  return body
}

function Notice({ label, error, retry }) {
  return error ? <div className="bazaar-notice" role="alert"><AlertCircle aria-hidden="true" />
    <span>{label}: {error}</span>{retry && <button type="button" onClick={retry}>{t('retry')}</button>}</div> : null
}

/** aria-disabled preserves keyboard focus so the precise capability hint is accessible. */
function ForkButton({ gh, disabled, disabledReason, onClick }) {
  const hint = disabledReason || ghHint(gh)
  return <span className="bazaar-hint"><button type="button" aria-disabled={disabled || gh.status !== 'ready'}
    title={hint} aria-label={`${t('forkInstall')}: ${hint}`}
    onClick={() => { if (!disabled && gh.status === 'ready') onClick() }}><GitFork aria-hidden="true" />{t('forkInstall')}</button>
    <span className="bazaar-hint-text" role="tooltip">{hint}</span></span>
}

function RepoCard({ item, gh, disabledReason, onInstall, installed }) {
  const disabled = !!disabledReason
  const ownRepository = gh.status === 'ready' && isOwnRepository(item.repo, gh.login)
  return <article className="bazaar-card"><div className="bazaar-card-main">
    <a className="bazaar-repo" href={item.url} target="_blank" rel="noreferrer">{item.repo}<ExternalLink aria-hidden="true" /></a>
    {item.description && <p className="bazaar-description">{item.description}</p>}
    <div className="bazaar-meta">
      <span><Star aria-hidden="true" />{item.stars}</span>
      {item.pushedAt && <span>{t('pushed')} {item.pushedAt.slice(0, 10)}</span>}
      {item.archived && <span>{t('archived')}</span>}{item.fork && <span>{t('fork')}</span>}
      {installed && <span>{t('installed')} · {installed}</span>}
    </div>
  </div><div className="bazaar-actions">
    <button className="bazaar-primary" type="button" disabled={disabled} title={disabledReason || undefined} onClick={() => onInstall(`github:${item.repo}`, 'direct')}>
      <Download aria-hidden="true" />{t('install')}</button>
    {!ownRepository && <ForkButton gh={gh} disabled={disabled} disabledReason={disabledReason} onClick={() => onInstall(`github:${item.repo}`, 'fork')} />}
  </div></article>
}

function TaskDetail({ task, bundles, onCancel, cancelling }) {
  if (!task) return null
  const bundleName = task.result?.bundle
  const bundle = bundles?.find(row => row.name === bundleName)
  const result = task.result
  return <section className="bazaar-task" aria-label={t('tasks')}>
    <div className="bazaar-task-head"><strong role="status">{phaseLabel(task.phase)}</strong>
      {!task.done && <button type="button" disabled={cancelling || task.phase === 'applying'} onClick={() => onCancel(task.requestId)}>
        <X aria-hidden="true" />{cancelling ? t('cancelling') : t('cancel')}</button>}</div>
    <dl><dt>{t('requested')}</dt><dd>{task.requestedSpec}</dd>
      {task.spec !== task.requestedSpec && <><dt>{t('actual')}</dt><dd>{task.spec}</dd></>}
      <dt>{t('requestId')}</dt><dd>{task.requestId}</dd>{task.sessionId && <><dt>{t('taskSession')}</dt><dd>{task.sessionId}</dd></>}
      {bundleName && <><dt>{t('package')}</dt><dd>{bundleName} · {bundles === null ? t('inspecting')
        : bundle?.installed ? `${t('installed')} · ${bundle.enabled ? t('enabled') : t('disabled')}` : t('notInstalled')}</dd></>}
      {result && <><dt>{t('managerResult')}</dt><dd>{result.application} · {result.changed ? t('changed') : t('unchanged')}</dd></>}
      {task.pnpmResult && <><dt>{t('pnpmSelection')}</dt><dd>{task.pnpmResult.selection.version ?? t('pnpmLauncher')} · {task.pnpmResult.changed ? t('changed') : t('unchanged')}</dd></>}
    </dl>
    <Notice label={t('diagnostics')} error={task.error} />
    <Notice label={t('journalError')} error={task.journalError} />
    {result?.pendingBuilds?.length > 0 && <div>{t('pendingBuilds')}: {result.pendingBuilds.join(', ')}</div>}
    {result?.warnings?.length > 0 && <div>{t('warnings')}: {result.warnings.join('\n')}</div>}
    <details open={!task.done || !!task.error}><summary>{t('output')}{task.logTruncated ? ` · ${t('logTruncated')}` : ''}</summary>
      <pre>{task.log?.map(row => row.text).join('') || result?.packageResult?.output || t('noOutput')}</pre>
      {result?.packageResult?.logPath && <code>{result.packageResult.logPath}</code>}
    </details>
    {result && <details><summary>{t('diagnostics')}</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>}
  </section>
}

/** A saved declaration selects future installs; it does not claim a version already executed. */
function PnpmSettings({ disabled, onTask, revision }) {
  const [selection, setSelection] = useState(null)
  const [version, setVersion] = useState('')
  const [readError, setReadError] = useState(null)
  const [mutationError, setMutationError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const gate = useRef(false)
  useEffect(() => {
    const abort = new AbortController()
    setReadError(null)
    setSelection(null)
    void request('pnpm', { signal: abort.signal }).then(value => {
      if (abort.signal.aborted) return
      setSelection(value)
      setVersion(value.version ?? value.recommended)
    }).catch(failure => { if (!abort.signal.aborted) setReadError(failure.message) })
    return () => abort.abort()
  }, [revision, refresh])
  const save = async target => {
    if (gate.current || disabled || !selection) return
    gate.current = true
    setSaving(true)
    setSaved(false)
    setMutationError(null)
    try {
      const value = await request('pnpm', { method: 'POST', body: JSON.stringify({ version: target }) })
      onTask(value.install)
      if (value.install.phase !== 'configured') throw new Error(value.install.error ?? phaseLabel(value.install.phase))
      setSaved(true)
    } catch (failure) { setMutationError(failure.message) }
    finally { setSaving(false); gate.current = false; setRefresh(value => value + 1) }
  }
  return <section className="bazaar-band" aria-label={t('pnpmTitle')}>
    <h3>{t('pnpmTitle')}</h3>
    <p className="bazaar-muted">{selection ? `${t('pnpmCurrent')}: ${selection.version ?? t('pnpmLauncher')}` : t('pnpmReading')}</p>
    <form className="bazaar-controls" onSubmit={event => { event.preventDefault(); void save(version.trim()) }}>
      <input aria-label={t('pnpmVersion')} value={version} onChange={event => setVersion(event.target.value)} placeholder="11.28.2" />
      <button type="submit" disabled={disabled || saving || !selection || !/^\d+\.\d+\.\d+$/.test(version.trim())}>{saving ? t('pnpmSaving') : t('pnpmSave')}</button>
      <button type="button" disabled={disabled || saving || !selection} onClick={() => void save(null)}>{t('pnpmDefault')}</button>
    </form>
    <p className="bazaar-muted">{t('pnpmHelp')}</p>
    {selection?.localLinks?.length > 0 && <p className="bazaar-muted">{t('pnpmLinks')} {selection.localLinks.join(', ')}</p>}
    {saved && <p role="status">{t('pnpmSaved')}</p>}
    <Notice label={t('pnpmError')} error={mutationError || readError} retry={() => { setMutationError(null); setRefresh(value => value + 1) }} />
  </section>
}

/** Local display state never invents package success; the host journal is authoritative. */
export function BazaarPanel() {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('stars')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState(null)
  const [catalogError, setCatalogError] = useState(null)
  const [loading, setLoading] = useState(true)
  const catalogSequence = useRef(0)
  const catalogRefresh = useRef(0)
  const [capability, setCapability] = useState({ gh: { status: 'probing' }, installation: false })
  const [capabilityError, setCapabilityError] = useState(null)
  const [source, setSource] = useState('')
  const [selectedTask, setSelectedTask] = useState('')
  const [task, setTask] = useState(null)
  const [tasks, setTasks] = useState([])
  const [busy, setBusy] = useState(null)
  const [statusReady, setStatusReady] = useState(false)
  const [statusError, setStatusError] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const submissionGate = useRef(false)
  const [statusRevision, setStatusRevision] = useState(0)
  const [cancelling, setCancelling] = useState(false)
  const [bundles, setBundles] = useState(null)
  const [bundleError, setBundleError] = useState(null)

  useEffect(() => {
    const abort = new AbortController()
    const sequence = ++catalogSequence.current
    setLoading(true)
    setCatalogError(null)
    setData(null)
    const force = revision !== catalogRefresh.current
    catalogRefresh.current = revision
    const params = new URLSearchParams({ q: query, sort, page: String(page), ...(force ? { refresh: '1' } : {}) })
    void request(`list?${params}`, { signal: abort.signal }).then(value => {
      if (!abort.signal.aborted && sequence === catalogSequence.current) setData(value)
    }).catch(error => {
      if (!abort.signal.aborted && sequence === catalogSequence.current) setCatalogError(error.message)
    }).finally(() => { if (!abort.signal.aborted && sequence === catalogSequence.current) setLoading(false) })
    return () => abort.abort()
  }, [query, sort, page, revision])

  useEffect(() => {
    const abort = new AbortController()
    setCapabilityError(null)
    setCapability({ gh: { status: 'probing' }, installation: false })
    void request(`capabilities${revision ? '?refresh=1' : ''}`, { signal: abort.signal }).then(value => {
      if (!abort.signal.aborted) setCapability(value)
    }).catch(error => {
      if (!abort.signal.aborted) { setCapability({ gh: { status: 'unavailable' }, installation: false }); setCapabilityError(error.message) }
    })
    return () => abort.abort()
  }, [revision])

  // Recursive scheduling: slow requests never overlap or overwrite a newer selection.
  useEffect(() => {
    const abort = new AbortController()
    let timer
    setStatusReady(false)
    const poll = async () => {
      try {
        const value = await request(`install-status${selectedTask ? `?requestId=${encodeURIComponent(selectedTask)}` : ''}`, { signal: abort.signal })
        if (abort.signal.aborted) return
        if (selectedTask && value.install?.requestId !== selectedTask) throw new Error('Installation request identity mismatch')
        setTask(value.install)
        setTasks(value.tasks)
        setBusy(value.busy)
        setStatusError(null)
        setStatusReady(true)
      } catch (error) {
        if (abort.signal.aborted) return
        setStatusError(error.message)
        setStatusReady(false)
      } finally { if (!abort.signal.aborted) timer = setTimeout(poll, 1500) }
    }
    void poll()
    return () => { abort.abort(); clearTimeout(timer) }
  }, [selectedTask, statusRevision])

  const resultIdentity = `${task?.requestId ?? ''}:${task?.done ?? false}:${task?.phase ?? ''}`
  useEffect(() => {
    const abort = new AbortController()
    setBundles(null)
    setBundleError(null)
    void request('installed', { signal: abort.signal }).then(value => {
      if (!abort.signal.aborted) setBundles(value.bundles)
    }).catch(error => { if (!abort.signal.aborted) setBundleError(error.message) })
    return () => abort.abort()
  }, [resultIdentity, revision])

  const install = useCallback(async (spec, mode) => {
    if (submissionGate.current || !statusReady || busy || !capability.installation) return
    submissionGate.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const value = await request(mode === 'fork' ? 'fork-install' : 'install', {
        method: 'POST', body: JSON.stringify({ spec }),
      })
      if (typeof value.requestId !== 'string' || value.install?.requestId !== value.requestId) throw new Error('Installation request identity missing')
      setSelectedTask(value.requestId)
      setTask(value.install)
      setBusy(value.install.done ? null : value.requestId)
    } catch (error) {
      setSubmitError(error.message)
      if (error.requestId) setSelectedTask(error.requestId)
    } finally {
      // Even a lost response may have been accepted: reconcile before enabling another submission.
      setStatusReady(false)
      setStatusRevision(previous => previous + 1)
      setSubmitting(false)
      submissionGate.current = false
    }
  }, [statusReady, busy, capability.installation])

  const cancel = async requestId => {
    setCancelling(true)
    setSubmitError(null)
    try {
      const value = await request('cancel-install', { method: 'POST', body: JSON.stringify({ requestId }) })
      if (value.status === 'too-late') setSubmitError(t('tooLate'))
    } catch (error) { setSubmitError(error.message) }
    finally { setCancelling(false); setStatusRevision(previous => previous + 1) }
  }
  const disabledReason = submitting ? t('submitting') : !statusReady ? t(statusError ? 'statusUnconfirmed' : 'statusChecking')
    : busy ? t('installationBusy') : !capability.installation ? t(capabilityError ? 'capabilityError'
      : capability.gh.status === 'probing' ? 'capabilityChecking' : 'managerUnavailable') : ''
  const disabled = !!disabledReason
  const items = data?.items ?? []
  const confirmedPackage = spec => {
    const completed = [...tasks].reverse().find(row => row.requestedSpec === spec && row.result?.bundle)
    return bundles?.some(row => row.name === completed?.result.bundle && row.installed) ? completed.result.bundle : null
  }
  return <div className="bazaar"><style>{css}</style>
    <header className="bazaar-header"><h2>{t('title')}</h2><span className="bazaar-muted">{t('topic')}: dsh-plugin{data?.total != null ? ` · ${countLabel(data.total)}` : ''}</span></header>
    <form className="bazaar-controls" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(draft.trim()) }}>
      <input value={draft} aria-label={t('searchLabel')} placeholder={t('searchPlaceholder')} onChange={event => setDraft(event.target.value)} />
      <button type="submit" className="bazaar-icon" aria-label={t('search')} title={t('search')}><Search aria-hidden="true" /></button>
      <select aria-label={t('sort')} value={sort} onChange={event => { setPage(1); setSort(event.target.value) }}>
        <option value="stars">{t('stars')}</option><option value="updated">{t('updated')}</option></select>
      <button className="bazaar-icon" type="button" title={t('refresh')} aria-label={t('refresh')}
        onClick={() => { setRevision(value => value + 1); setStatusRevision(value => value + 1) }}><RefreshCw aria-hidden="true" /></button>
    </form>
    <div className="bazaar-controls"><span className="bazaar-muted" title={capability.gh?.diagnostic}>
      {capability.gh.status === 'ready' ? `${t('githubAccount')}: ${capability.gh.login}` : ghHint(capability.gh)}</span>
      {disabledReason && <span className="bazaar-muted" role="status">{disabledReason}</span>}</div>
    <form className="bazaar-controls" onSubmit={event => { event.preventDefault(); void install(source, 'direct') }}>
      <input aria-label={t('installSource')} placeholder={t('sourcePlaceholder')} value={source} onChange={event => setSource(event.target.value)} />
      <button type="submit" disabled={disabled || !source.trim()} title={disabledReason || (!source.trim() ? t('enterSource') : undefined)}><Download aria-hidden="true" />{t('install')}</button>
    </form>
    <Notice label={t('capabilityError')} error={capabilityError} />
    <Notice label={t('catalogError')} error={catalogError || data?.topicError} retry={() => setRevision(value => value + 1)} />
    {data?.incomplete && <div className="bazaar-muted">{t('partial')}</div>}{data?.capped && <div className="bazaar-muted">{t('capped')}</div>}
    <section aria-label={t('searchLabel')} aria-busy={loading}>
      {loading && <p role="status">{t('loading')}</p>}
      {!loading && !catalogError && !data?.topicError && items.length === 0 && <p>{t('empty')}</p>}
      {items.map(item => <RepoCard key={item.repo} item={item} gh={capability.gh} disabledReason={disabledReason} onInstall={install} installed={confirmedPackage(`github:${item.repo}`)} />)}
    </section>
    <nav className="bazaar-pagination" aria-label={t('pagination')}>
      <span className="bazaar-muted">{pageLabel(page)}</span><button className="bazaar-icon" type="button" disabled={loading || page === 1}
        title={t('previous')} aria-label={t('previous')} onClick={() => setPage(value => value - 1)}><ChevronLeft aria-hidden="true" /></button>
      <button className="bazaar-icon" type="button" disabled={loading || !data?.nextPage} title={t('next')} aria-label={t('next')}
        onClick={() => setPage(data.nextPage)}><ChevronRight aria-hidden="true" /></button>
    </nav>
    {(data?.subscribed?.length > 0 || data?.subscriptions?.length > 0) && <section className="bazaar-band"><h3>{t('subscriptions')}</h3>
      {data.subscriptions.map(row => <div key={row.url}><a href={row.url} target="_blank" rel="noreferrer">{row.url}</a> · {row.count}
        <Notice label={t('subscriptions')} error={row.error} /></div>)}
      <div className="bazaar-subscriptions">{data.subscribed.map(repo => <a key={repo} href={`https://github.com/${repo}`} target="_blank" rel="noreferrer">{repo}</a>)}</div>
    </section>}
    <PnpmSettings disabled={submitting || !statusReady || !!busy} revision={revision} onTask={value => {
      setSelectedTask(value.requestId); setTask(value); setStatusReady(false); setStatusRevision(previous => previous + 1)
    }} />
    <section className="bazaar-band"><div className="bazaar-task-head"><h3>{t('tasks')}</h3>
      <select aria-label={t('taskHistory')} value={selectedTask} onChange={event => { setSelectedTask(event.target.value); setTask(null) }}>
        <option value="">{t('latest')}</option>{[...tasks].reverse().map(row => <option key={row.requestId} value={row.requestId}>
          {phaseLabel(row.phase)} · {row.requestedSpec}</option>)}
      </select></div>
      <Notice label={t('connectionError')} error={statusError} retry={() => setStatusRevision(value => value + 1)} />
      <Notice label={t('diagnostics')} error={submitError} />
      <Notice label={t('bundleError')} error={bundleError} />
      <TaskDetail task={task} bundles={bundles} onCancel={cancel} cancelling={cancelling} />
    </section>
  </div>
}
