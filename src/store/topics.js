import { db, writeBatch, collection, doc, getDoc, setDoc, getDocs, onSnapshot } from '../firebase'

function sanitizeTopic(t) {
  if (!t) return null
  const raw = typeof t === 'string' ? { name: t, video: '', keyPoints: [] } : t
  const name = (raw.name || '').toString().slice(0, 200).trim()
  const video = (raw.video || '').toString().slice(0, 500).trim()
  const kpsIn = Array.isArray(raw.keyPoints) ? raw.keyPoints : []
  const keyPoints = kpsIn.slice(0, 10).map((k) => (k == null ? '' : String(k).slice(0, 1000)))
  return { name, video, keyPoints }
}

function normalizeTopic(t) {
  if (!t) return null
  if (typeof t === 'string') return { name: t, video: '', keyPoints: [] }
  return { name: t.name || '', video: t.video || '', keyPoints: Array.isArray(t.keyPoints) ? t.keyPoints : [] }
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
  const targetId = topicDocId(week)
  const all = await getDocs(collection(db, 'topics'))
  const batch = writeBatch(db)
  let hasDelete = false
  all.docs.forEach((d) => {
    if (d.id === targetId) return
    if (d.data().week === week) {
      batch.delete(doc(db, 'topics', d.id))
      hasDelete = true
    }
  })
  batch.set(doc(db, 'topics', targetId), {
    week,
    topics: clean,
    updatedAt: new Date().toISOString(),
  })
  await batch.commit()
  return hasDelete
}

async function getTopics(week) {
  const snap = await getDoc(doc(db, 'topics', topicDocId(week)))
  if (snap.exists()) return snap.data().topics || {}
  const legacy = await getDocs(collection(db, 'topics'))
  const found = legacy.docs.find((d) => d.data().week === week)
  return found ? (found.data().topics || {}) : {}
}

function listenTopics(callback) {
  return onSnapshot(collection(db, 'topics'), (snapshot) => {
    const byWeek = {}
    snapshot.docs.forEach((d) => {
      const data = d.data()
      if (!data || !data.week) return
      const cur = byWeek[data.week]
      const ts = data.updatedAt || ''
      if (!cur || (cur.updatedAt || '') < ts) {
        byWeek[data.week] = { topics: data.topics || {}, updatedAt: ts }
      }
    })
    const all = {}
    Object.entries(byWeek).forEach(([week, v]) => { all[week] = v.topics })
    callback(all)
  })
}

export { normalizeTopic, sanitizeTopic, sanitizeTopicsMap, topicDocId, setTopics, getTopics, listenTopics }
