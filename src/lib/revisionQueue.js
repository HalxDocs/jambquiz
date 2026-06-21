const REVISION_COMPLETED_KEY = 'patches_revision_completed'
const BATCH_SIZE = 2

const WEEKS_SORTED = Array.from({ length: 26 }, (_, i) => `Week ${i + 1}`)

export function revisionTopicKey(subject, week) {
  return `${subject}|${week}`
}

export function buildRevisionQueue(scores) {
  const best = {}
  scores.forEach((s) => {
    if (!s.subject || !s.week) return
    const key = revisionTopicKey(s.subject, s.week)
    if (!best[key] || s.score > best[key].score) {
      best[key] = { subject: s.subject, week: s.week, score: s.score, outOf: s.outOf || 100 }
    }
  })

  const weak = Object.values(best).filter((s) => {
    const pct = Math.round((s.score / s.outOf) * 100)
    return pct < 50
  })

  return weak.sort((a, b) => {
    const wi = WEEKS_SORTED.indexOf(a.week) - WEEKS_SORTED.indexOf(b.week)
    if (wi !== 0) return wi
    return a.subject.localeCompare(b.subject)
  })
}

function getCompletedKeys() {
  try {
    return JSON.parse(localStorage.getItem(REVISION_COMPLETED_KEY) || '[]')
  } catch { return [] }
}

const MAX_COMPLETED_KEYS = 200

export function markRevisionCompleted(key) {
  try {
    const done = getCompletedKeys()
    if (!done.includes(key)) {
      done.push(key)
      if (done.length > MAX_COMPLETED_KEYS) done.splice(0, done.length - MAX_COMPLETED_KEYS)
      localStorage.setItem(REVISION_COMPLETED_KEY, JSON.stringify(done))
    }
  } catch {}
}

export function isRevisionCompleted(key) {
  return getCompletedKeys().includes(key)
}

export function getCurrentRevisionBatch(scores, batchSize = BATCH_SIZE) {
  const queue = buildRevisionQueue(scores)
  const done = getCompletedKeys()
  const remaining = queue.filter((item) => !done.includes(revisionTopicKey(item.subject, item.week)))
  return remaining.slice(0, batchSize)
}

export function getRemainingRevisionCount(scores) {
  const queue = buildRevisionQueue(scores)
  const done = getCompletedKeys()
  return queue.filter((item) => !done.includes(revisionTopicKey(item.subject, item.week))).length
}
