// Questions store — Go backend (answer key never leaves the server).
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api'

async function addQuestion(subject, week, question) {
  const { answer, ...rest } = question
  delete rest.id
  delete rest.firestoreId
  const answerNum = answer !== undefined && answer !== null ? parseInt(answer) : 0
  const res = await apiPost('/api/admin/questions', { subject, week, ...rest, answer: answerNum })
  return res.id
}

async function editQuestion(firestoreId, data) {
  const { answer, ...rest } = data
  delete rest.id
  delete rest.firestoreId
  await apiPut(`/api/admin/questions/${firestoreId}`, { ...rest, answer: parseInt(answer) })
}

async function deleteQuestion(firestoreId) {
  await apiDelete(`/api/admin/questions/${firestoreId}`)
}

async function getQuestions(subject, week) {
  const res = await apiGet(`/api/questions?subject=${encodeURIComponent(subject || '')}&week=${encodeURIComponent(week || '')}`)
  return (res.questions || []).map((q) => ({ firestoreId: q.id, ...q }))
}

async function getQuestionsWithAnswers(subject, week) {
  const res = await apiGet(`/api/admin/questions?subject=${encodeURIComponent(subject || '')}&week=${encodeURIComponent(week || '')}`)
  return (res.questions || []).map((q) => ({ firestoreId: q.id, ...q }))
}

function listenQuestions(subject, week, callback) {
  let stopped = false
  const poll = async () => {
    if (stopped) return
    try {
      const qs = await getQuestionsWithAnswers(subject, week)
      if (!stopped) callback(qs)
    } catch { /* offline — retry on next poll */ }
    if (!stopped) setTimeout(poll, 15000)
  }
  poll()
  return () => { stopped = true }
}

async function copyQuestionsToWeek(subject, fromWeek, toWeek) {
  const res = await apiPost('/api/admin/questions/copy', { subject, fromWeek, toWeek })
  return res.copied || 0
}

async function saveQuestionLimit(subject, week, limit) {
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit) || 25))
  await apiPut('/api/admin/limits', { subject, week, limit: safeLimit })
  return safeLimit
}

function defaultQuestionLimit(subject) {
  return subject === 'English Language' ? 40 : 25
}

async function getQuestionLimit(subject, week) {
  try {
    const res = await apiGet(`/api/limits?subject=${encodeURIComponent(subject || '')}&week=${encodeURIComponent(week || '')}`)
    return res.limit ?? defaultQuestionLimit(subject)
  } catch {
    return defaultQuestionLimit(subject)
  }
}

export {
  addQuestion,
  editQuestion,
  deleteQuestion,
  getQuestions,
  getQuestionsWithAnswers,
  listenQuestions,
  copyQuestionsToWeek,
  saveQuestionLimit,
  getQuestionLimit,
  defaultQuestionLimit,
}
