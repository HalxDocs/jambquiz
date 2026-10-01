import { db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from '../firebase'
import { SUBJECTS } from './constants'

function sanitizeGoat(raw) {
  const name = String(raw?.name || '').trim().slice(0, 60)
  const profession = String(raw?.profession || '').trim().slice(0, 60)
  const stars = {}
  const explanations = {}
  const comments = {}
  SUBJECTS.forEach((sub) => {
    const s = Math.max(0, Math.min(3, parseInt(raw?.stars?.[sub], 10) || 0))
    if (s > 0) {
      stars[sub] = s
      explanations[sub] = String(raw?.explanations?.[sub] || '').trim().slice(0, 1000)
      // Per-subject GOAT comment — shown FIRST (tap OK), before the
      // explanation (3-star) or narrowed options (2/1-star). Falls back to
      // legacy docs without comments.
      const c = String(raw?.comments?.[sub] ?? raw?.comment?.[sub] ?? '').trim().slice(0, 1000)
      if (c) comments[sub] = c
    }
  })
  return { name, profession, stars, explanations, comments }
}

function weekGoatDocId(week) {
  return String(week || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'Week_1'
}

async function listGoats() {
  const snap = await getDocs(collection(db, 'goats'))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

async function createGoat(raw) {
  const clean = sanitizeGoat(raw)
  if (!clean.name) throw new Error('Enter the GOAT name')
  if (!Object.keys(clean.stars).length) throw new Error('Give at least one subject a star rating')
  const ref = doc(collection(db, 'goats'))
  await setDoc(ref, { ...clean, createdAt: new Date().toISOString() })
  return ref.id
}

async function updateGoat(id, raw) {
  const clean = sanitizeGoat(raw)
  if (!clean.name) throw new Error('Enter the GOAT name')
  if (!Object.keys(clean.stars).length) throw new Error('Give at least one subject a star rating')
  await updateDoc(doc(db, 'goats', id), { ...clean, updatedAt: new Date().toISOString() })
}

async function deleteGoat(id) {
  await deleteDoc(doc(db, 'goats', id))
}

async function getWeekGoats(week) {
  const snap = await getDoc(doc(db, 'goatWeeks', weekGoatDocId(week)))
  if (!snap.exists()) return []
  return snap.data().goatIds || []
}

async function setWeekGoats(week, goatIds) {
  const ids = (goatIds || []).slice(0, 4)
  if (ids.length !== 4) throw new Error('Select exactly 4 GOATs for the week')
  await setDoc(doc(db, 'goatWeeks', weekGoatDocId(week)), {
    week,
    goatIds: ids,
    updatedAt: new Date().toISOString(),
  })
}

export { sanitizeGoat, weekGoatDocId, listGoats, createGoat, updateGoat, deleteGoat, getWeekGoats, setWeekGoats }
