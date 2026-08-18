import { db, collection, getDocs, onSnapshot, query, where, auth, functions, httpsCallable } from '../firebase'

// Grading happens SERVER-SIDE via a one-shot quiz session. The client first
// calls `startQuiz` (server assigns a random, seeded question set and returns
// the sessionId + public question content), then `submitQuiz` with only the
// sessionId + the student's chosen option indices. The server validates the
// exact assigned set, grades against the in-memory answer key, and writes
// scores + collapsed scoreDetails. The answer key never reaches the client
// before grading. Payload shapes:
//   startQuiz: { studentId, week, retakeSubject? } -> { sessionId, week, questions, isRetake }
//   submitQuiz: { sessionId, answers: { [subject]: [optionIdx| -1] } }
async function startQuiz(payload) {
  const uid = auth.currentUser && auth.currentUser.uid
  if (!uid) throw new Error('Not signed in')
  if (!payload || !payload.studentId || !payload.week) throw new Error('Invalid quiz start')
  const fn = httpsCallable(functions, 'startQuiz')
  const res = await fn(payload)
  return res.data
}

async function submitQuiz(payload) {
  const uid = auth.currentUser && auth.currentUser.uid
  if (!uid) throw new Error('Not signed in')
  if (!payload || !payload.sessionId || typeof payload.answers !== 'object') {
    throw new Error('Invalid submission')
  }
  const fn = httpsCallable(functions, 'submitQuiz')
  const res = await fn(payload)
  return res.data
}

// Merge protected answer details into a list of scores. Corrections are served
// server-side by `getScoreDetails`, which only returns the answer key once the
// quiz window for that week has closed (correctionsReleased). The client never
// reads the raw scoreDetails doc — that would leak the answer key during the
// live window since owner reads are allowed by the rules.
async function fetchDetails(scores) {
  if (!scores.length) return scores
  const byKey = {}
  for (const s of scores) {
    if (!s.studentId || !s.week) continue
    const key = `${s.studentId}_${s.week.replace(/\s+/g, '_')}`
    if (!byKey[key]) byKey[key] = { studentId: s.studentId, week: s.week, list: [] }
    byKey[key].list.push(s)
  }
  const fn = httpsCallable(functions, 'getScoreDetails')
  for (const { studentId, week, list } of Object.values(byKey)) {
    try {
      const res = await fn({ studentId, week })
      const d = res.data || {}
      const released = d.released === true
      const bySubject = {}
      ;(d.subjects || []).forEach((sub) => { bySubject[sub.subject] = sub.questions || [] })
      const ansBySubject = {}
      ;(d.answers || []).forEach((sub) => { ansBySubject[sub.subject] = sub.answers || [] })
      list.forEach((s) => {
        s.released = released
        s.questions = released ? (bySubject[s.subject] || null) : null
        s.answers = released ? (ansBySubject[s.subject] || null) : null
      })
    } catch (e) {
      console.error('[fetchDetails] Failed to load scoreDetails for', week, e)
      list.forEach((s) => { s.questions = null; s.answers = null; s.released = false })
    }
  }
  return scores
}

function listenScores(callback, studentId) {
  const ref = studentId
    ? query(collection(db, 'scores'), where('studentId', '==', studentId))
    : collection(db, 'scores')
  let pending = null
  return onSnapshot(ref, (snapshot) => {
    const scores = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    const run = async () => {
      if (studentId) await fetchDetails(scores)
      if (pending === run) { pending = null; callback(scores) }
    }
    pending = run
    run()
  })
}

async function getStudentScores(studentId) {
  const q = query(collection(db, 'scores'), where('studentId', '==', studentId))
  const snapshot = await getDocs(q)
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

async function getStudentScoresAdmin(studentId) {
  const scores = await getStudentScores(studentId)
  await fetchDetails(scores)
  return scores.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export { startQuiz, submitQuiz, listenScores, getStudentScores, getStudentScoresAdmin, fetchDetails }
