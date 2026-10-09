// JWT session against the Go backend. Replaces Firebase Auth.
import {
  apiPostPublic, apiGet, getToken, setSession, getCachedMe,
  clearSession,
} from '../lib/api'
import { setStudentUid, clearStudentUid } from './studentSession'

const SESSION_TS_KEY = 'go_session_ts'
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function touchSession() {
  try { localStorage.setItem(SESSION_TS_KEY, String(Date.now())) } catch { /* non-fatal */ }
}

function sessionFresh() {
  try {
    const ts = Number(localStorage.getItem(SESSION_TS_KEY) || 0)
    return ts && Date.now() - ts < SESSION_MAX_AGE_MS
  } catch { /* non-fatal */ return false }
}

// Restore a persisted session: returns { kind, profile } or null.
export async function restoreSession() {
  const token = getToken()
  if (!token || !sessionFresh()) {
    if (!sessionFresh()) clearSession()
    return null
  }
  try {
    const kind = sessionKind()
    if (kind === 'teacher') {
      const cached = getCachedMe()
      if (cached?.profile) touchSession()
      return { kind: 'teacher', profile: cached?.profile || null }
    }
    const res = await apiGet('/api/auth/me')
    if (res?.student) {
      setSession(token, { kind: 'student', profile: res.student })
      setStudentUid(res.student.id)
      touchSession()
      return { kind: 'student', profile: res.student }
    }
  } catch { /* non-fatal */ }
  return null
}

export function sessionKind() {
  const me = getCachedMe()
  return me?.kind || null
}

export function sessionStudent() {
  const me = getCachedMe()
  return me?.kind === 'student' ? me.profile : null
}

export async function loginStudent(name, password) {
  const res = await apiPostPublic('/api/auth/login', { name, password })
  setSession(res.token, { kind: 'student', profile: res.student })
  setStudentUid(res.student.id)
  touchSession()
  return res
}

export async function registerStudentGo(data) {
  const res = await apiPostPublic('/api/auth/register', data)
  setSession(res.token, { kind: 'student', profile: res.student })
  setStudentUid(res.student.id)
  touchSession()
  return res
}

export async function refreshStudent() {
  const res = await apiGet('/api/auth/me')
  if (res?.student) {
    setSession(getToken(), { kind: 'student', profile: res.student })
    touchSession()
    return res.student
  }
  return null
}

export async function loginTeacherGo(phoneOrEmail, password) {
  const res = await apiPostPublic('/api/auth/teacher/login', { phone: phoneOrEmail, password })
  setSession(res.token, { kind: 'teacher', profile: res.teacher })
  touchSession()
  return res
}

export async function registerTeacherGo(data) {
  const res = await apiPostPublic('/api/auth/teacher/register', data)
  setSession(res.token, { kind: 'teacher', profile: res.teacher })
  touchSession()
  return res
}

export async function loginAdminGo(name, password) {
  const res = await apiPostPublic('/api/auth/login', { name, password })
  if (res?.student?.role !== 'admin') throw new Error('Not an admin account')
  setSession(res.token, { kind: 'admin', profile: res.student })
  touchSession()
  return res
}

export function signOut() {
  clearSession()
  clearStudentUid()
  try { localStorage.removeItem(SESSION_TS_KEY) } catch { /* non-fatal */ }
}
