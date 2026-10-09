// Scores store — Go backend. startQuiz/submitQuiz shapes mirror the old
// callables; list endpoints replace Firestore reads + fetchDetails merge.
import { apiGet, apiPost } from '../lib/api'

async function startQuiz(payload) {
  if (!payload || !payload.studentId || !payload.week) throw new Error('Invalid quiz start')
  return apiPost('/api/quiz/start', payload)
}

async function submitQuiz(payload) {
  if (!payload || !payload.sessionId || typeof payload.answers !== 'object') {
    throw new Error('Invalid submission')
  }
  // assistMeta is accepted server-side; forward when present.
  return apiPost('/api/quiz/submit', payload)
}

// Details are already merged server-side by /api/scores; keep the name.
async function fetchDetails(scores) {
  return scores || []
}

function listenScores(callback, studentId) {
  let stopped = false
  const poll = async () => {
    if (stopped) return
    try {
      const scores = await getStudentScores(studentId)
      if (!stopped) callback(scores)
    } catch { /* offline — retry on next poll */ }
    if (!stopped) setTimeout(poll, 20000)
  }
  poll()
  return () => { stopped = true }
}

async function getStudentScores(studentId) {
  const q = studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''
  const res = await apiGet(`/api/scores${q}`)
  return (res.scores || [])
    .map((s) => ({ ...s, createdAt: s.createdAt || '' }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

async function getStudentScoresAdmin(studentId) {
  return getStudentScores(studentId)
}

export { startQuiz, submitQuiz, listenScores, getStudentScores, getStudentScoresAdmin, fetchDetails }
