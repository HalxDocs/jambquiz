// Student store — Go backend. Export names preserved for components.
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api'
import { registerStudentGo } from './session'

export const AUTH_EMAIL_DOMAIN = '274lab.app'
export const ADMIN_EMAIL = 'admin@274lab.app'

export function normalizePhone(p) {
  if (!p) return ''
  let s = String(p).replace(/[\s\-()]/g, '')
  if (s.startsWith('+')) s = s.slice(1)
  if (s.startsWith('0')) s = '234' + s.slice(1)
  else if (s.length === 10 && /^[789]/.test(s)) s = '234' + s
  if (s.length >= 10 && s.length <= 14) return s
  return ''
}

export function studentAuthEmail(nameLower) {
  const safe = String(nameLower).replace(/\s+/g, '.').toLowerCase()
  return `${safe}@${AUTH_EMAIL_DOMAIN}`
}

// Free trial: 2 quiz attempts within 2 weeks of first test.
const FREE_TRIAL_ATTEMPTS = 2
const FREE_TRIAL_DAYS = 14

function isTrialActive(student, now = Date.now()) {
  if (!student) return false
  const startRaw = student.trialStartedAt || student.joinedAt || null
  if (!startRaw) return true
  const t = new Date(startRaw).getTime()
  if (!Number.isFinite(t)) return true
  return now - t < FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000
}

function trialDaysLeft(student, now = Date.now()) {
  if (!student) return 0
  const startRaw = student.trialStartedAt || student.joinedAt || null
  if (!startRaw) return FREE_TRIAL_DAYS
  const t = new Date(startRaw).getTime()
  if (!Number.isFinite(t)) return FREE_TRIAL_DAYS
  return Math.max(0, Math.ceil((t + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000 - now) / (24 * 60 * 60 * 1000)))
}

function getAccessStatus(student) {
  if (!student) return { status: 'expired', daysLeft: 0, expiresAt: null, freeAttemptsLeft: 0, trialDaysLeft: 0, trialExpired: true }
  if (student.suspended) return { status: 'suspended', daysLeft: 0, expiresAt: null, freeAttemptsLeft: 0, trialDaysLeft: 0, trialExpired: true }
  const now = Date.now()
  const subUntil = student.subscriptionUntil ? new Date(student.subscriptionUntil).getTime() : 0
  const freeUsed = student.freeAttemptsUsed || 0
  const freeAttemptsLeft = Math.max(0, FREE_TRIAL_ATTEMPTS - freeUsed)
  if (freeUsed === 0 && !(subUntil > now)) {
    return { status: 'freebie', daysLeft: 0, expiresAt: null, freeAttemptsLeft, trialDaysLeft: FREE_TRIAL_DAYS, trialExpired: false }
  }
  if (subUntil > now) {
    return {
      status: 'active',
      daysLeft: Math.ceil((subUntil - now) / (1000 * 60 * 60 * 24)),
      expiresAt: new Date(subUntil).toISOString(),
      freeAttemptsLeft,
      trialDaysLeft: trialDaysLeft(student, now),
      trialExpired: !isTrialActive(student, now),
    }
  }
  if (freeUsed < FREE_TRIAL_ATTEMPTS && isTrialActive(student, now)) {
    return {
      status: 'freebie', daysLeft: 0, expiresAt: null, freeAttemptsLeft,
      trialDaysLeft: trialDaysLeft(student, now), trialExpired: false,
    }
  }
  return { status: 'expired', daysLeft: 0, expiresAt: null, freeAttemptsLeft: 0, trialDaysLeft: 0, trialExpired: true }
}

function stripSensitive(student) {
  if (!student) return null
  const rest = { ...student }
  delete rest.password
  delete rest.passwordHash
  return rest
}

function stripPersisted(student) {
  if (!student) return null
  const rest = { ...student }
  delete rest.password
  delete rest.passwordHash
  return rest
}

async function registerStudent(student) {
  const name = (student.name || '').trim()
  if (name.length < 3) throw new Error('Name must be at least 3 characters')
  if (!student.password || student.password.length < 8) throw new Error('Password must be at least 8 characters')
  try {
    const res = await registerStudentGo({
      name,
      nickname: student.nickname || '',
      year: student.year || String(new Date().getFullYear()),
      password: student.password,
      email: (student.email || '').toLowerCase(),
      phone: normalizePhone(student.phone),
      parentPhone: normalizePhone(student.parentPhone),
      teacherPhone: normalizePhone(student.teacherPhone),
      subjects: student.subjects || [],
      referredBy: String(student.referredBy || '').replace(/\D/g, '').slice(0, 6) || '',
    })
    // Public profile sync happens server-side in the same transaction.
    return stripSensitive(res.student)
  } catch (e) {
    if (e && /taken|conflict|exists/i.test(e.message)) return null
    throw e
  }
}

async function getStudentByUid() {
  try {
    const res = await apiGet('/api/auth/me')
    return stripSensitive(res.student || null)
  } catch { return null }
}

async function getStudentById() {
  try {
    const res = await apiGet('/api/auth/me')
    return stripSensitive(res.student || null)
  } catch { return null }
}

async function getStudentProfile(id) {
  try {
    const res = await apiGet(`/api/students/${encodeURIComponent(id)}/profile`)
    return res.profile?.name || 'Friend'
  } catch { return 'Friend' }
}

async function changePassword(name, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 8) throw new Error('Password must be at least 8 characters')
  await apiPost('/api/auth/change-password', { currentPassword, newPassword })
  return true
}

async function verifyAdminSession() {
  try {
    const res = await apiGet('/api/auth/me')
    return res?.student?.role === 'admin'
  } catch { return false }
}

async function updateStudent(id, data) {
  const res = await apiPatch(`/api/students/${id}`, data)
  // Keep the public profile in sync server-side (done in the same txn).
  return res.student
}

async function deleteStudent(id) {
  await apiDelete(`/api/admin/students/${id}`)
}

function listenStudents(callback) {
  let stopped = false
  const poll = async () => {
    if (stopped) return
    try {
      const res = await apiGet('/api/admin/students?page=1&pageSize=100')
      if (!stopped) callback(res.students || [])
    } catch { /* offline — retry on next poll */ }
    if (!stopped) setTimeout(poll, 30000)
  }
  poll()
  return () => { stopped = true }
}

// cursorDoc doubles as a page token (number) for component compat.
async function getStudentsPage(year, cursorDoc, pageSize = 20) {
  const page = typeof cursorDoc === 'number' ? cursorDoc : 1
  const q = `/api/admin/students?${year ? `year=${encodeURIComponent(year)}&` : ''}page=${page}&pageSize=${pageSize}`
  const res = await apiGet(q)
  const students = (res.students || []).map(stripSensitive)
  return {
    students,
    lastDoc: res.total > page * (res.pageSize || pageSize) ? page + 1 : null,
    hasMore: res.total > page * (res.pageSize || pageSize),
  }
}

async function getStudentsCount(year) {
  try {
    const q = `/api/admin/students?${year ? `year=${encodeURIComponent(year)}&` : ''}page=1&pageSize=1`
    const res = await apiGet(q)
    return res.total || 0
  } catch (e) {
    console.error('getStudentsCount failed:', e?.message || e)
    return 0
  }
}

async function linkStudentUid() {
  return null
}

async function incrementFreeAttempts() {}

async function consumeFreeAttempt(studentId) {
  try {
    const res = await apiPost('/api/quiz/consume-trial', { studentId })
    return res
  } catch {
    return null
  }
}

export {
  FREE_TRIAL_ATTEMPTS,
  FREE_TRIAL_DAYS,
  isTrialActive,
  trialDaysLeft,
  getAccessStatus,
  registerStudent,
  getStudentByUid,
  getStudentById,
  getStudentProfile,
  changePassword,
  verifyAdminSession,
  updateStudent,
  deleteStudent,
  listenStudents,
  getStudentsPage,
  getStudentsCount,
  stripSensitive, stripPersisted, linkStudentUid,
  incrementFreeAttempts,
  consumeFreeAttempt,
}
