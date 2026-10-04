/** GitHub search's documented limits, not marketplace eligibility rules. */
export const PAGE_SIZE = 100
export const SEARCH_LIMIT = 1000

/** Keep the requested global ordering in the upstream query. */
export function searchParameters(query, sort, page) {
  return new URLSearchParams({
    q: `topic:dsh-plugin${query.trim() === '' ? '' : ` ${query.trim()}`}`,
    sort: sort === 'updated' ? 'updated' : 'stars',
    order: 'desc', per_page: String(PAGE_SIZE), page: String(page),
  })
}

/** Invalid/error responses must not become a successful empty catalog. */
export function parseSearchResponse(text) {
  const body = JSON.parse(text)
  if (!Array.isArray(body?.items) || !Number.isInteger(body.total_count) || body.total_count < 0
    || typeof body.incomplete_results !== 'boolean') throw new Error('Invalid GitHub search response')
  return { repos: body.items, total: body.total_count, incomplete: body.incomplete_results }
}

/** Expose GitHub's search cap and partial responses instead of hiding them. */
export function pageMetadata(total, count, page, incomplete) {
  const accessibleTotal = Math.min(total, SEARCH_LIMIT)
  return {
    page, pageSize: PAGE_SIZE, total, accessibleTotal, incomplete,
    capped: total > SEARCH_LIMIT,
    complete: page === 1 && !incomplete && count === total,
    nextPage: page * PAGE_SIZE < accessibleTotal && count > 0 ? page + 1 : null,
  }
}

/** Used only when every search result fits in the cached first page. */
export function sortCompleteItems(items, sort) {
  return [...items].sort(sort === 'updated'
    ? (a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')) || a.repo.localeCompare(b.repo)
    : (a, b) => b.stars - a.stars || a.repo.localeCompare(b.repo))
}

/** A failing authenticated API probe says nothing about CLI installation. */
export function ghProbeState(result) {
  const diagnostic = result.stderr.trim()
  const login = result.stdout.trim()
  if (result.code === 0 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(login)) return { status: 'ready', login }
  if (/HTTP 401|not logged|gh auth login|authentication required|Bad credentials/i.test(diagnostic)) {
    return { status: 'auth-required', login: null, diagnostic }
  }
  if (/HTTP 403|Resource not accessible|insufficient.*scope/i.test(diagnostic)) return { status: 'permission-denied', login: null, diagnostic }
  if (result.timedOut || /timeout|timed out|dial tcp|connection|network|TLS|resolve host|HTTP 5\d\d/i.test(diagnostic)) {
    return { status: 'network-error', login: null, diagnostic }
  }
  return { status: 'unavailable', login: null, diagnostic: diagnostic || 'GitHub identity probe failed' }
}

/** Preserve explicit GitHub refs; do not treat a repository's web subpage as a ref. */
export function githubTarget(spec) {
  const match = /^github:([a-z\d][a-z\d-]*\/[a-z\d._-]+)(?:#([^\s]+))?$/i.exec(spec.trim())
  return match === null ? null : { repo: match[1], ref: match[2] ?? null }
}

/** Ownership affects the Fork action, never discovery or direct installation. */
export function isOwnRepository(repo, login) {
  return typeof repo === 'string' && repo.includes('/') && typeof login === 'string' && login.length > 0
    && repo.split('/')[0].toLowerCase() === login.toLowerCase()
}

/** Validate the actual API-returned fork, including renamed or pre-existing forks. */
export function verifiedFork(upstream, fork, login) {
  const rootId = upstream.source?.id ?? upstream.id
  if (fork.owner?.login?.toLowerCase() !== login.toLowerCase()
    || fork.source?.id !== rootId || !fork.fork
    || !/^[a-z\d][a-z\d-]*\/[a-z\d._-]+$/i.test(fork.full_name ?? '')) {
    throw new Error('GitHub returned a repository that is not your fork of the requested upstream')
  }
  return fork.full_name
}

/** Package retrieval and runtime application have independent outcomes. */
export function installOutcome(result) {
  if (result.application === 'cancelled') return 'cancelled'
  if (result.application === 'failed' || result.error || (result.packageResult &&
    (result.packageResult.exitCode !== 0 || result.packageResult.timedOut))) {
    return result.pendingBuilds?.length ? 'awaiting-build-approval' : 'failed'
  }
  switch (result.application) {
    case 'applied': return 'applied'
    case 'restart-required': return 'restart-required'
    case 'overridden': return 'overridden'
    default: return 'unknown-result'
  }
}

/** Persisted tasks are never authorization to replay an interrupted action. */
export function recoverTask(task) {
  if (task.done) return task
  return { ...task, done: true, phase: 'interrupted',
    error: 'Host restarted before this task settled; installation outcome is unconfirmed. Check installed plugins before retrying.' }
}
