import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCatalog } from '../src/catalog.js'

const low = { repo: 'community/archived-fork', stars: 0, updatedAt: '2026-10-01', archived: true, fork: true }
const high = { repo: 'author/popular', stars: 50, updatedAt: '2026-09-01', archived: false, fork: false }

// These are external source responses, not replacements for Harness services.
function directory({ topic = { items: [high, low], total: 2, incomplete: false }, urls = [] } = {}) {
  const calls = []
  const sources = { urls, topic }
  const catalog = createCatalog({
    readSources: async () => sources.urls,
    searchTopic: async (query, sort, page, signal) => {
      calls.push({ query, sort, page, signal })
      if (sources.topic instanceof Error) throw sources.topic
      return sources.topic
    },
    readSubscription: async url => url === 'https://example.org/failed'
      ? { url, repos: [], error: 'HTTP 503' }
      : { url, repos: ['outside/no-topic', 'community/archived-fork', 'outside/no-topic'] },
  })
  return { catalog, calls, sources }
}

test('browser and Agent consumers share results, cache, complete ordering and explicit sources', async () => {
  const { catalog, calls } = directory({ urls: ['https://example.org/list', 'https://example.org/failed'] })
  const browser = await catalog({ query: 'tools' })
  const agent = await catalog({ query: 'tools' })
  assert.deepEqual(agent, { ...browser, cached: true })
  assert.equal(calls.length, 1)
  assert.deepEqual(browser.items, [high, low], 'Archived, forked, zero-star entries are retained')
  assert.deepEqual(browser.subscribed, ['outside/no-topic', 'community/archived-fork'])
  assert.deepEqual(browser.subscriptions, [
    { url: 'https://example.org/list', count: 3 },
    { url: 'https://example.org/failed', count: 0, error: 'HTTP 503' },
  ])
  const updated = await catalog({ query: 'tools', sort: 'updated' })
  assert.deepEqual(updated.items, [low, high])
  assert.equal(updated.cached, true)
  assert.equal(calls.length, 1)
})

test('incomplete pages keep upstream ordering, pagination and cap for both consumers', async () => {
  const { catalog, calls } = directory({ topic: { items: [high, low], total: 2500, incomplete: true } })
  const first = await catalog()
  assert.equal(first.incomplete, true)
  assert.equal(first.capped, true)
  assert.equal(first.complete, false)
  assert.equal(first.accessibleTotal, 1000)
  assert.equal(first.nextPage, 2)
  await catalog({ sort: 'updated', page: 2 })
  await catalog({ sort: 'updated', page: 10 })
  assert.deepEqual(calls.map(({ sort, page }) => ({ sort, page })), [
    { sort: 'stars', page: 1 }, { sort: 'updated', page: 2 }, { sort: 'updated', page: 10 },
  ])
  assert.equal((await catalog({ sort: 'updated', page: 10 })).nextPage, null)
})

test('a failed topic still reports subscription candidates and diagnostics and is not cached', async () => {
  const { catalog, calls, sources } = directory({ topic: new Error('GitHub 429'), urls: ['https://example.org/list'] })
  const result = await catalog()
  assert.equal(result.topicError, 'GitHub 429')
  assert.equal(result.total, null)
  assert.equal(result.complete, false)
  assert.equal(result.nextPage, null)
  assert.deepEqual(result.subscribed, ['outside/no-topic', 'community/archived-fork'])
  sources.topic = { items: [], total: 0, incomplete: false }
  const recovered = await catalog()
  assert.equal(recovered.complete, true)
  assert.equal(recovered.cached, false)
  assert.equal('topicError' in recovered, false)
  assert.equal(calls.length, 2)
})

test('changed sources, query and explicit refresh invalidate only their shared search', async () => {
  const { catalog, sources, calls } = directory()
  await catalog({ query: 'one' })
  await catalog({ query: 'two' })
  await catalog({ query: 'one', sort: 'updated', refresh: true })
  assert.equal((await catalog({ query: 'one' })).cached, true)
  assert.equal((await catalog({ query: 'two' })).cached, true)
  sources.urls = ['https://example.org/list']
  assert.equal((await catalog({ query: 'one' })).cached, false)
  assert.equal(calls.length, 4)
  const otherProfile = directory()
  assert.equal((await otherProfile.catalog({ query: 'one' })).cached, false)
})

test('cancelled source reads reject rather than caching an empty or completed search', async () => {
  const begun = Promise.withResolvers()
  const finish = Promise.withResolvers()
  let reads = 0
  const catalog = createCatalog({ readSources: async () => [], readSubscription: async () => { throw new Error('No sources') },
    searchTopic: async (_query, _sort, _page, signal) => {
      reads += 1
      begun.resolve(signal)
      await finish.promise
      return { items: [high], total: 1, incomplete: false }
    },
  })
  const abort = new AbortController()
  const result = catalog({}, abort.signal)
  const forwarded = await begun.promise
  abort.abort()
  assert.equal(forwarded.aborted, true)
  finish.resolve()
  await assert.rejects(result, { name: 'AbortError' })
  const retry = await catalog()
  assert.equal(retry.cached, false)
  assert.equal(reads, 2)
  await assert.rejects(catalog({}, AbortSignal.abort()), { name: 'AbortError' })
  assert.equal(reads, 2)
})

test('invalid search arguments fail before any source requests', async () => {
  const { catalog, calls } = directory()
  for (const args of [null, [], 'browse', { spec: 'github:community/unrequested', mode: 'fork' },
    { query: null }, { sort: 'random' }, { page: 0 }, { page: 11 }, { page: 1.5 }, { refresh: '1' }]) {
    await assert.rejects(catalog(args))
  }
  assert.equal(calls.length, 0)
})
