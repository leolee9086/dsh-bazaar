import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { searchParameters, parseSearchResponse, ghProbeState, githubTarget, verifiedFork, isOwnRepository } from './protocol.js'
import { TaskStore } from './tasks.js'
import { createInstaller } from './install.js'
import { createCatalog } from './catalog.js'
import { registerDiscovery } from './discovery.js'
import { createPnpmController } from './pnpm.js'

export const name = 'dsh-bazaar'
export const inject = ['webServer']
const GH_PROBE_MS = 30 * 1000

/** Topic discovery is a convention; explicit sources need no topic or endorsement. */
export function repoIdentity(line) {
  const bare = line.trim().replace(/^github:/i, '')
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
    .replace(/^git@github\.com:/i, '').replace(/[#?].*$/s, '').replace(/\.git$/i, '')
  const match = /^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+)(?:\/.*)?$/.exec(bare)
  return match ? `${match[1]}/${match[2]}` : null
}

export function parseSubscription(text) {
  const seen = new Set()
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    const repo = repoIdentity(line)
    if (repo !== null) seen.add(repo)
  }
  return [...seen]
}

function toItem(repo) {
  return {
    repo: String(repo.full_name ?? ''), url: String(repo.html_url ?? ''),
    description: typeof repo.description === 'string' ? repo.description : '',
    stars: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : 0,
    pushedAt: typeof repo.pushed_at === 'string' ? repo.pushed_at : null,
    updatedAt: typeof repo.updated_at === 'string' ? repo.updated_at : null,
    archived: repo.archived === true, fork: repo.fork === true,
  }
}

/** GitHub owns ordering across pages; complete first pages may share a local cache. */
async function searchTopic(query, sort, page, signal) {
  const params = searchParameters(query, sort, page)
  const viaGh = await runGh(['api', `search/repositories?${params}`], { timeoutMs: 40000, signal })
  let text
  if (viaGh.code === 0) text = viaGh.stdout
  else {
    const response = await fetch(`https://api.github.com/search/repositories?${params}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': name }, signal,
    })
    if (!response.ok) throw new Error(`GitHub ${response.status}: ${(await response.text()).slice(0, 300)}`)
    text = await response.text()
  }
  const body = parseSearchResponse(text)
  return { items: body.repos.map(toItem), total: body.total, incomplete: body.incomplete }
}

async function readSubscription(url, signal) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': name }, signal })
    if (!response.ok) return { url, repos: [], error: `HTTP ${response.status}` }
    return { url, repos: parseSubscription(await response.text()) }
  } catch (error) { return { url, repos: [], error: error.message } }
}

function statePath(ctx) {
  const profile = ctx.get('profileContext')
  return typeof profile?.dir === 'string' && profile.dir
    ? { dir: `${profile.dir}/.dsh-bazaar`, file: `${profile.dir}/.dsh-bazaar/subscriptions.json` } : null
}

async function readSubscriptions(ctx) {
  const paths = statePath(ctx)
  if (!paths) return []
  try {
    const parsed = JSON.parse(await (await import('node:fs/promises')).readFile(paths.file, 'utf8'))
    if (!Array.isArray(parsed) || parsed.some(url => typeof url !== 'string')) throw new Error('Invalid subscription settings')
    return parsed
  } catch (error) { if (error.code === 'ENOENT') return []; throw error }
}

/** Browser authentication is applied by the route wrapper; POST origin adds CSRF protection. */
async function readMutation(request) {
  const origin = request.headers.origin
  try {
    if (typeof origin !== 'string' || new URL(origin).host !== request.headers.host) {
      return { ok: false, status: 403, error: 'untrusted origin' }
    }
  } catch { return { ok: false, status: 403, error: 'untrusted origin' } }
  try {
    let size = 0
    const chunks = []
    for await (const chunk of request) {
      size += chunk.length
      if (size > 64 * 1024) return { ok: false, status: 413, error: 'request body too large' }
      chunks.push(chunk)
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid JSON body')
    return { ok: true, value }
  } catch { return { ok: false, status: 400, error: 'invalid JSON body' } }
}

// GUI processes may have a different PATH; standard install locations are fallback probes.
const GH_CANDIDATES = ['gh', 'C:\\Program Files\\GitHub CLI\\gh.exe',
  'C:\\Program Files (x86)\\GitHub CLI\\gh.exe', '/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh']
let ghPath = { at: 0, command: null, status: 'missing' }
let ghProbe = { at: 0, value: undefined }

async function ghCommand(force = false, signal) {
  if (!force && Date.now() - ghPath.at < GH_PROBE_MS) return ghPath
  let unavailable = false
  for (const candidate of GH_CANDIDATES) {
    signal?.throwIfAborted()
    const probe = await runGhAt(candidate, ['--version'], { timeoutMs: 10000, signal })
    signal?.throwIfAborted()
    if (probe.code === 0) {
      ghPath = { at: Date.now(), command: candidate, status: 'installed' }
      return ghPath
    }
    if (!['ENOENT', 'ENOTDIR'].includes(probe.errorCode)) unavailable = true
  }
  ghPath = { at: Date.now(), command: null, status: unavailable ? 'unavailable' : 'missing' }
  return ghPath
}

async function runGh(args, options = {}) {
  const found = await ghCommand(false, options.signal)
  if (!found.command) return { code: 127, stdout: '', stderr: `gh ${found.status}` }
  return runGhAt(found.command, args, options)
}

/** shell:false preserves arguments; cancellation settles only after child exit. */
function runGhAt(executable, args, { timeoutMs = 120000, signal } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve({ code: null, stdout: '', stderr: 'Cancelled' }); return }
    let child
    try { child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch (error) { resolve({ code: 127, stdout: '', stderr: error.message, errorCode: error.code }); return }
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let errorCode
    const abort = () => { child.kill() }
    const timer = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    child.stdout?.on('data', chunk => { stdout = (stdout + chunk.toString('utf8')).slice(-4 * 1024 * 1024) })
    child.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-64 * 1024) })
    child.on('error', error => { errorCode = error.code; stderr += error.message })
    child.on('close', code => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve({ code, stdout, stderr, timedOut, errorCode })
    })
  })
}

async function ghIdentity(force = false, signal) {
  if (!force && ghProbe.value !== undefined && Date.now() - ghProbe.at < GH_PROBE_MS) return ghProbe.value
  const found = await ghCommand(force, signal)
  const value = found.command
    ? ghProbeState(await runGhAt(found.command, ['api', 'user', '--jq', '.login'], { timeoutMs: 20000, signal }))
    : { status: found.status, login: null }
  signal?.throwIfAborted()
  ghProbe = { at: Date.now(), value }
  return value
}

/** Resolve the requested upstream ref before forking, then verify the API-returned fork and commit. */
async function forkAndPin(spec, signal) {
  const requested = githubTarget(spec)
  if (!requested) throw new Error('Fork installation requires github:owner/repo#ref')
  const identity = await ghIdentity(true, signal)
  signal.throwIfAborted()
  if (identity.status !== 'ready') throw new Error(`GitHub CLI: ${identity.status}: ${identity.diagnostic ?? ''}`)
  if (isOwnRepository(requested.repo, identity.login)) throw new Error('This repository already belongs to your GitHub account; use direct installation')
  const api = async (endpoint, args = []) => {
    signal.throwIfAborted()
    const result = await runGh(['api', endpoint, ...args], { timeoutMs: 30000, signal })
    signal.throwIfAborted()
    if (result.code !== 0) throw new Error(result.stderr.trim() || `gh api failed: ${endpoint}`)
    return JSON.parse(result.stdout)
  }
  const upstream = await api(`repos/${requested.repo}`)
  const commit = await api(`repos/${requested.repo}/commits/${encodeURIComponent(requested.ref ?? upstream.default_branch)}`)
  if (!/^[0-9a-f]{40}$/i.test(commit.sha ?? '')) throw new Error('GitHub returned an invalid commit')
  const created = await api(`repos/${requested.repo}/forks`, ['--method', 'POST', '-F', 'default_branch_only=false'])
  if (!githubTarget(`github:${created.full_name}`)) throw new Error('GitHub returned an invalid fork identity')
  let lastError
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const fork = await api(`repos/${created.full_name}`)
      const target = verifiedFork(upstream, fork, identity.login)
      const pinned = await api(`repos/${target}/commits/${commit.sha}`)
      if (pinned.sha !== commit.sha) throw new Error('Fork commit does not match requested commit')
      return { target, sha: commit.sha }
    } catch (error) {
      signal.throwIfAborted()
      if (!/HTTP 404|HTTP 409/.test(error.message)) throw error
      lastError = error
    }
    if (attempt < 9) await delay(1500, undefined, { signal })
  }
  throw new Error(`Fork ${created.full_name} is not ready at the requested commit; nothing installed. ${lastError?.message ?? ''}`)
}

/** Build the profile's shared directory without exposing browser authentication or installation authority. */
export function createHostCatalog(ctx) {
  return createCatalog({ readSources: () => readSubscriptions(ctx), searchTopic, readSubscription })
}

export async function apply(ctx) {
  const catalog = createHostCatalog(ctx)
  registerDiscovery(ctx, catalog)
  const paths = statePath(ctx)
  const store = paths ? new TaskStore(paths.dir) : null
  if (store) await store.load()
  const installer = store ? createInstaller(ctx, store, forkAndPin) : null
  const pnpm = store ? createPnpmController(ctx, store) : null
  const route = (path, method, handler) => ctx.webServer.register({
    kind: 'exact', path,
    handler: async (request, response) => {
      const send = (status, body) => {
        response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        response.end(JSON.stringify(body))
      }
      const connection = ctx.get('connection')
      if (!connection) { send(503, { error: 'Browser authentication service unavailable' }); return }
      const rejection = connection.requestRejection(request)
      if (rejection) { send(rejection, { error: 'Browser authentication required' }); return }
      if (!(Array.isArray(method) ? method : [method]).includes(request.method)) { send(405, { error: 'method not allowed' }); return }
      try { await handler(request, send) }
      catch (error) { send(500, { error: error instanceof Error ? error.message : String(error) }) }
    },
  })

  route('/dsh-bazaar/list', 'GET', async (request, send) => {
    const url = new URL(request.url, 'http://localhost')
    const query = url.searchParams.get('q') ?? ''
    const sort = url.searchParams.get('sort') === 'updated' ? 'updated' : 'stars'
    const page = Number(url.searchParams.get('page') ?? '1')
    if (!Number.isInteger(page) || page < 1 || page > 10) { send(400, { error: 'GitHub search pages range from 1 to 10' }); return }
    const controller = new AbortController()
    const abort = () => controller.abort()
    request.once('aborted', abort)
    try {
      send(200, await catalog({ query, sort, page, refresh: url.searchParams.get('refresh') === '1' }, controller.signal))
    } finally { request.off('aborted', abort) }
  })
  route('/dsh-bazaar/capabilities', 'GET', async (request, send) => {
    const force = new URL(request.url, 'http://localhost').searchParams.get('refresh') === '1'
    send(200, { gh: await ghIdentity(force, AbortSignal.timeout(80000)), installation: installer?.available() === true,
      approval: 'agent-only', buildScripts: 'separate-explicit-approval' })
  })
  route('/dsh-bazaar/pnpm', ['GET', 'POST'], async (request, send) => {
    if (!pnpm?.available()) { send(503, { error: 'Current profile unavailable' }); return }
    if (request.method === 'GET') { send(200, await pnpm.read()); return }
    const mutation = await readMutation(request)
    if (!mutation.ok) { send(mutation.status, { error: mutation.error }); return }
    if (!pnpm?.available()) { send(503, { error: 'Current profile unavailable' }); return }
    if (Object.keys(mutation.value).length !== 1 || !Object.hasOwn(mutation.value, 'version')) {
      send(400, { error: 'pnpm selection accepts only version' }); return
    }
    const busy = store.busy()
    if (busy) { send(409, { error: 'A profile operation is already pending', requestId: busy.requestId }); return }
    try {
      const task = await pnpm.begin(mutation.value.version)
      send(200, { requestId: task.requestId, install: task })
    } catch (error) { send(400, { error: error.message }) }
  })
  route('/dsh-bazaar/sessions', 'GET', async (_request, send) => {
    const controller = ctx.get('sessionController')
    if (!controller) { send(503, { error: 'Session service unavailable' }); return }
    send(200, await controller.list({}, AbortSignal.timeout(20000)))
  })
  route('/dsh-bazaar/installed', 'GET', async (_request, send) => {
    const manager = ctx.get('pluginManager')
    if (!manager) { send(503, { error: 'Plugin manager unavailable' }); return }
    send(200, { bundles: await manager.listBundles() })
  })
  for (const mode of ['direct', 'fork']) route(mode === 'direct' ? '/dsh-bazaar/install' : '/dsh-bazaar/fork-install', 'POST', async (request, send) => {
    const mutation = await readMutation(request)
    if (!mutation.ok) { send(mutation.status, { error: mutation.error }); return }
    if (!installer?.available()) { send(503, { error: 'Plugin manager unavailable' }); return }
    const busy = store.busy()
    if (busy) { send(409, { error: 'An installation is already pending', requestId: busy.requestId }); return }
    const value = mutation.value
    const repo = typeof value.repo === 'string' ? repoIdentity(value.repo) : null
    const spec = typeof value.spec === 'string' ? value.spec : repo ? `github:${repo}` : ''
    try {
      const task = await installer.begin({ spec, mode })
      send(202, { requestId: task.requestId, install: task })
    } catch (error) {
      const active = store.busy()
      const requestId = error.requestId ?? active?.requestId
      send(active ? 409 : 400, { error: error.message, ...(requestId ? { requestId } : {}) })
    }
  })
  route('/dsh-bazaar/install-status', 'GET', async (request, send) => {
    const id = new URL(request.url, 'http://localhost').searchParams.get('requestId')
    const task = id ? store?.get(id) : store?.latest()
    if (id && !task) { send(404, { error: 'Installation request not found', requestId: id }); return }
    send(200, { install: task ?? null, busy: store?.busy()?.requestId ?? null,
      tasks: (store?.list() ?? []).map(({ log, result, ...row }) => ({ ...row,
        ...(result ? { result: { application: result.application, bundle: result.bundle } } : {}) })),
    })
  })
  route('/dsh-bazaar/cancel-install', 'POST', async (request, send) => {
    const mutation = await readMutation(request)
    if (!mutation.ok) { send(mutation.status, { error: mutation.error }); return }
    const controller = store?.get(mutation.value.requestId)?.kind === 'pnpm' ? pnpm : installer
    if (!controller) { send(503, { error: 'Profile operation service unavailable' }); return }
    send(200, await controller.cancel(mutation.value.requestId))
  })
}
