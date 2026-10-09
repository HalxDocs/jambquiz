// Topics store — Go backend.
import { apiGet, apiPut } from '../lib/api'

function sanitizeTopic(t) {
  if (!t) return null
  const raw = typeof t === 'string' ? { name: t, video: '', keyPoints: [] } : t
  const name = (raw.name || '').toString().slice(0, 200).trim()
  const smsName = (raw.smsName || '').toString().slice(0, 30).trim()
  const video = (raw.video || '').toString().slice(0, 500).trim()
  const kpsIn = Array.isArray(raw.keyPoints) ? raw.keyPoints : []
  const keyPoints = kpsIn.slice(0, 10).map((k) => (k == null ? '' : String(k).slice(0, 1000)))
  return { name, smsName, video, keyPoints }
}

function normalizeTopic(t) {
  if (!t) return null
  if (typeof t === 'string') return { name: t, smsName: '', video: '', keyPoints: [] }
  return { name: t.name || '', smsName: t.smsName || '', video: t.video || '', keyPoints: Array.isArray(t.keyPoints) ? t.keyPoints : [] }
}

function sanitizeTopicsMap(raw) {
  const out = {}
  Object.entries(raw || {}).forEach(([sub, val]) => {
    const clean = sanitizeTopic(val)
    if (clean && (clean.name || clean.video || clean.keyPoints.some((k) => k))) out[sub] = clean
  })
  return out
}

function topicDocId(week) {
  return String(week || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'Week_1'
}

async function setTopics(week, topics) {
  const clean = sanitizeTopicsMap(topics)
  await apiPut(`/api/admin/topics/${encodeURIComponent(week)}`, { topics: clean })
  return false
}

async function getTopics(week) {
  try {
    const res = await apiGet(`/api/topics/${encodeURIComponent(week)}`)
    return res.topics || {}
  } catch {
    return {}
  }
}

function listenTopics(callback) {
  let stopped = false
  const poll = async () => {
    if (stopped) return
    try {
      const weeks = Array.from({ length: 26 }, (_, i) => `Week ${i + 1}`)
      const results = await Promise.all(
        weeks.map((w) => getTopics(w).catch(() => ({})))
      )
      if (stopped) return
      const all = {}
      weeks.forEach((w, i) => { if (results[i] && Object.keys(results[i]).length) all[w] = results[i] })
      callback(all)
    } catch { /* offline — retry on next poll */ }
    if (!stopped) setTimeout(poll, 60000)
  }
  poll()
  return () => { stopped = true }
}

export { normalizeTopic, sanitizeTopic, sanitizeTopicsMap, topicDocId, setTopics, getTopics, listenTopics }
