const cache = new Map()
const TTL = 120_000

export function prefetch(key, fetcher) {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.ts < TTL) return entry.data
  const promise = Promise.resolve(fetcher()).then((data) => {
    cache.set(key, { data, ts: Date.now() })
    return data
  }).catch(() => null)
  cache.set(key, { data: promise, ts: Date.now() })
  return promise
}

export function getCached(key) {
  const entry = cache.get(key)
  if (!entry || Date.now() - entry.ts > TTL) return null
  return entry.data
}

export function clearCache(key) {
  if (key) cache.delete(key)
  else cache.clear()
}
