// Goats store — Go backend (sanitize kept client-side for the editor).
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api'
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
  const res = await apiGet('/api/goats')
  return (res.goats || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

async function createGoat(raw) {
  const clean = sanitizeGoat(raw)
  if (!clean.name) throw new Error('Enter the GOAT name')
  if (!Object.keys(clean.stars).length) throw new Error('Give at least one subject a star rating')
  const res = await apiPost('/api/admin/goats', clean)
  return res.id
}

async function updateGoat(id, raw) {
  const clean = sanitizeGoat(raw)
  if (!clean.name) throw new Error('Enter the GOAT name')
  if (!Object.keys(clean.stars).length) throw new Error('Give at least one subject a star rating')
  await apiPut(`/api/admin/goats/${id}`, clean)
}

async function deleteGoat(id) {
  await apiDelete(`/api/admin/goats/${id}`)
}

async function getWeekGoats(week) {
  try {
    const res = await apiGet(`/api/goats/week?week=${encodeURIComponent(week || '')}`)
    return res.goatIds || []
  } catch {
    return []
  }
}

async function setWeekGoats(week, goatIds) {
  const ids = (goatIds || []).slice(0, 4)
  if (ids.length !== 4) throw new Error('Select exactly 4 GOATs for the week')
  await apiPut('/api/admin/goats/week', { week, goatIds: ids })
}

export { sanitizeGoat, weekGoatDocId, listGoats, createGoat, updateGoat, deleteGoat, getWeekGoats, setWeekGoats }
