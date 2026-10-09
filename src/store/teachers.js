// Teacher store — Go backend.
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api'
import { loginTeacherGo } from './session'

export async function registerTeacher(data) {
  const res = await apiPost('/api/auth/teacher/register', data)
  return { ok: true, ...res }
}

export async function teacherUpdatePhone(phone) {
  const res = await apiPatch('/api/teacher/phone', { phone })
  return res
}

export async function teacherSignIn(phoneOrEmail, password) {
  await loginTeacherGo(phoneOrEmail, password)
}

export async function getTeacherByUid() {
  try {
    const res = await apiGet('/api/teacher/dashboard')
    const t = res.teacher || null
    if (!t) return null
    return { ...t, id: t.id }
  } catch { return null }
}

export async function teacherUpdateDetails({ accountNumber, bankName }) {
  const res = await apiPatch('/api/teacher/details', { accountNumber, bankName })
  return res
}

export async function getTeacherDashboard() {
  const res = await apiGet('/api/teacher/dashboard')
  return { ok: true, ...res }
}

export async function adminGetTeachers() {
  const res = await apiGet('/api/admin/teachers')
  return res
}

export async function adminDeleteTeacher(teacherId) {
  const res = await apiDelete(`/api/admin/teachers/${teacherId}`)
  return res
}

export async function makePioneer(teacherId) {
  const res = await apiPost('/api/admin/teachers/pioneer', { teacherId })
  return res
}

export async function removePioneer(teacherId) {
  const res = await apiDelete('/api/admin/teachers/pioneer', { teacherId })
  return res
}

export async function getPioneerDashboard() {
  const res = await apiGet('/api/teacher/pioneer')
  return res
}
