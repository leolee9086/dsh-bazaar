import { pageMetadata, sortCompleteItems } from './protocol.js'

const TOPIC = 'dsh-plugin'
const CACHE_MS = 5 * 60 * 1000

/**
 * One directory for the browser and Agent tools. Inputs perform only source reads;
 * all ordering, source diagnostics and cache decisions live here.
 */
export function createCatalog({ readSources, searchTopic, readSubscription }) {
  // A profile's subscriptions must never reuse another profile's cached response.
  const cache = new Map()
  return async function search(args = {}, signal) {
    // Tool JSON schemas describe inputs; direct executors must also enforce them.
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Search arguments must be an object')
    const unknown = Object.keys(args).filter(key => !['query', 'sort', 'page', 'refresh'].includes(key))
    if (unknown.length) throw new Error(`Unknown search parameters: ${unknown.join(', ')}`)
    const { query = '', sort = 'stars', page = 1, refresh = false } = args
    if (typeof query !== 'string') throw new Error('Search query must be a string')
    if (!['stars', 'updated'].includes(sort)) throw new Error('Search sort must be stars or updated')
    if (!Number.isInteger(page) || page < 1 || page > 10) throw new Error('GitHub search pages range from 1 to 10')
    if (typeof refresh !== 'boolean') throw new Error('Search refresh must be a boolean')
    const control = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(50000)])
    control.throwIfAborted()
    const urls = await readSources()
    control.throwIfAborted()
    const prefix = JSON.stringify([query, urls])
    const key = JSON.stringify([prefix, sort, page])
    if (refresh) {
      for (const [cachedKey, entry] of cache) if (entry.prefix === prefix) cache.delete(cachedKey)
    }
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.body, cached: true }
    const [topic, ...subscriptions] = await Promise.all([
      searchTopic(query, sort, page, control).catch(error => ({ items: [], error: error.message })),
      ...urls.map(url => readSubscription(url, control)),
    ])
    // Source failures are partial results; cancellation is never a successful empty search.
    control.throwIfAborted()
    const body = {
      topic: TOPIC, query, sort, items: topic.items,
      ...(topic.error ? { topicError: topic.error, page, total: null, nextPage: null, complete: false }
        : pageMetadata(topic.total, topic.items.length, page, topic.incomplete)),
      fetchedAt: Date.now(), cached: false,
      subscribed: [...new Set(subscriptions.flatMap(source => source.repos))],
      subscriptions: subscriptions.map(source => ({ url: source.url, count: source.repos.length,
        ...(source.error ? { error: source.error } : {}) })),
    }
    if (!topic.error) {
      cache.set(key, { at: body.fetchedAt, prefix, body })
      // Only a complete first page can be sorted locally without changing global ordering.
      if (body.complete) for (const ordering of ['stars', 'updated']) {
        cache.set(JSON.stringify([prefix, ordering, 1]), {
          at: body.fetchedAt, prefix, body: { ...body, sort: ordering, items: sortCompleteItems(body.items, ordering) },
        })
      }
      while (cache.size > 128) cache.delete(cache.keys().next().value)
    }
    return body
  }
}
