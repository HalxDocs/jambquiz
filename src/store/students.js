import { db, collection, getDocs, getDoc, getCountFromServer, setDoc, updateDoc, doc, deleteDoc, onSnapshot, query, where, orderBy, limit, startAfter, increment, auth, functions, httpsCallable } from '../firebase'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  signInWithCustomToken,
  getIdTokenResult,
} from '../firebase'

// Firebase Auth is the single source of truth for identity. Students log in by
// name; we map each name to a stable, invisible Firebase Auth email so the
// security rules can rely on `request.auth.uid`. The students doc keeps its own
// auto-id (`id`) and stores the Firebase UID in a `uid` field for ownership checks.
export const AUTH_EMAIL_DOMAIN = '274lab.app'
export const ADMIN_EMAIL = 'admin@274lab.app'

// Canonical Nigerian phone format used for teacher matching: no +, no spaces.
export function normalizePhone(p) {
  if (!p) return ''
  let s = String(p).replace(/[\s\-\(\)]/g, '')
  if (s.startsWith('+')) s = s.slice(1)
  if (s.startsWith('0')) s = '234' + s.slice(1)
  else if (s.length === 10 && /^[789]/.test(s)) s = '234' + s
  if (s.length >= 10 && s.length <= 14) return s
  return ''
}

export function studentAuthEmail(nameLower) {
  // Firebase Auth rejects spaces in the email local-part, so collapse them to
  // dots. Existing accounts were created with spaced names, and this keeps the
  // mapping deterministic (name -> email) for both sign-in and registration.
  const safe = String(nameLower).replace(/\s+/g, '.').toLowerCase()
  return `${safe}@${AUTH_EMAIL_DOMAIN}`
}

function getAccessStatus(student) {
  if (!student) return { status: 'expired', daysLeft: 0, expiresAt: null, freeAttemptsLeft: 0 }
  if (student.suspended) return { status: 'suspended', daysLeft: 0, expiresAt: null, freeAttemptsLeft: 0 }
  const now = Date.now()
  const subUntil = student.subscriptionUntil ? new Date(student.subscriptionUntil).getTime() : 0
  const freeUsed = student.freeAttemptsUsed || 0
  const freeAttemptsLeft = Math.max(0, 2 - freeUsed)
  if (subUntil > now) {
    return {
      status: 'active',
      daysLeft: Math.ceil((subUntil - now) / (1000 * 60 * 60 * 24)),
      expiresAt: new Date(subUntil).toISOString(),
      freeAttemptsLeft,
    }
  }
  if (freeUsed < 2) {
    return {
      status: 'freebie',
      daysLeft: 0,
      expiresAt: null,
      freeAttemptsLeft,
    }
  }
  return { status: 'expired', daysLeft: 0, expiresAt: null, freeAttemptsLeft: 0 }
}

function stripSensitive(student) {
  if (!student) return null
  const { password, ...rest } = student
  return rest
}

function stripPersisted(student) {
  if (!student) return null
  const { password, ...rest } = student
  return rest
}

// Creates the Firebase Auth user (email derived from name) and the students doc.
// Returns the student object, or null if the name is already taken.
async function registerStudent(student) {
  const name = (student.name || '').trim()
  if (name.length < 3) throw new Error('Name must be at least 3 characters')
  const password = student.password
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters')
  const nameLower = name.toLowerCase()
  const nameLowerWords = [...new Set(nameLower.split(/\s+/).filter(Boolean))]
  const email = studentAuthEmail(nameLower)
  let cred
  try {
    cred = await createUserWithEmailAndPassword(auth, email, password)
  } catch (e) {
    if (e && (e.code === 'auth/email-already-in-use' || e.code === 'auth/invalid-email')) return null
    throw e
  }
  const uid = cred.user.uid
  // Force-refresh the ID token so Firestore sees the new auth state immediately
  await cred.user.getIdToken(true)
  const ref = doc(collection(db, 'students'))
  const payload = {
    name,
    nickname: student.nickname || '',
    nameLower,
    nameLowerWords,
    year: student.year || String(new Date().getFullYear()),
    email: (student.email || '').toLowerCase(),
    parentPhone: normalizePhone(student.parentPhone),
    teacherPhone: normalizePhone(student.teacherPhone),
    phone: normalizePhone(student.phone),
    subjects: student.subjects || [],
    uid,
    subscriptionUntil: null,
    freeAttemptsUsed: 0,
    trialStartedAt: new Date().toISOString(),
    joinedAt: new Date().toISOString(),
  }
  try {
    await setDoc(ref, payload)
  } catch (e) {
    console.error('registerStudent/setDoc failed:', e)
    throw e
  }
  // Public friend-search profile (P2-1). Best-effort: the rules allow an owner
  // to create student_profiles/{studentId} directly.
  try {
    const profile = {
      studentId: ref.id,
      name,
      nickname: student.nickname || '',
      nameLowerWords,
      nicknameLower: (student.nickname || '').toLowerCase().trim(),
      year: student.year || String(new Date().getFullYear()),
      updatedAt: new Date().toISOString(),
    }
    await setDoc(doc(db, 'student_profiles', ref.id), profile)
  } catch (e) {
    console.error('registerStudent/syncStudentProfile failed:', e?.message || e)
  }
  return stripSensitive({ id: ref.id, ...payload })
}

// Returns the signed-in Firebase user's student profile (by UID), or null.
async function getStudentByUid(uid) {
  if (!uid) return null
  const snap = await getDocs(query(collection(db, 'students'), where('uid', '==', uid)))
  if (snap.empty) return null
  const d = snap.docs[0]
  return stripSensitive({ id: d.id, ...d.data() })
}

async function getStudentById(id) {
  const d = await getDoc(doc(db, 'students', id))
  if (!d.exists()) return null
  return stripSensitive({ id: d.id, ...d.data() })
}

// Changes a password for an already-known name. Signs the user in (acts as
// re-auth) then updates the password. Used by both the logged-in change flow
// and the "forgot password" flow (where the user is not yet signed in).
async function changePassword(name, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 8) throw new Error('Password must be at least 8 characters')
  const nameLower = (name || '').toLowerCase().trim()
  const email = studentAuthEmail(nameLower)
  const cred = await signInWithEmailAndPassword(auth, email, currentPassword)
  await updatePassword(cred.user, newPassword)
  return true
}

// Admin sign-in: returns true if the signed-in admin carries the admin claim.
async function verifyAdminSession() {
  const user = auth.currentUser
  if (!user) return false
  try {
    // Force a token refresh so a freshly-applied `admin` custom claim is
    // present. Cached tokens can lag behind claim changes and cause admin-only
    // callables (e.g. adminDeleteStudent) to return permission-denied.
    await user.getIdToken(true)
    const token = await getIdTokenResult(user, true)
    return !!token.claims.admin
  } catch {
    return false
  }
}

async function updateStudent(id, data) {
  await updateDoc(doc(db, 'students', id), data)
}

async function deleteStudent(id) {
  await deleteDoc(doc(db, 'students', id))
}

async function incrementFreeAttempts(studentId) {
  try {
    await updateDoc(doc(db, 'students', studentId), { freeAttemptsUsed: increment(1) })
  } catch {}
}

function listenStudents(callback) {
  return onSnapshot(collection(db, 'students'), (snapshot) => {
    const students = snapshot.docs.map((d) => stripSensitive({ id: d.id, ...d.data() }))
    callback(students)
  })
}

async function getStudentsPage(year, cursorDoc, pageSize = 20) {
  let constraints = [orderBy('nameLower'), limit(pageSize)]
  if (year) constraints.push(where('year', '==', year))
  if (cursorDoc) constraints.push(startAfter(cursorDoc))
  const q = query(collection(db, 'students'), ...constraints)
  const snap = await getDocs(q)
  const students = snap.docs.map((d) => stripSensitive({ id: d.id, ...d.data() }))
  return {
    students,
    lastDoc: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.docs.length === pageSize,
  }
}

async function getStudentsCount(year) {
  try {
    const constraints = []
    if (year) constraints.push(where('year', '==', year))
    const q = constraints.length
      ? query(collection(db, 'students'), ...constraints)
      : collection(db, 'students')
    const snap = await getCountFromServer(q)
    return snap.data().count
  } catch (e) {
    console.error('getStudentsCount failed:', e?.message || e)
    return 0
  }
}

async function linkStudentUid(name) {
  const res = await httpsCallable(functions, 'linkStudentUid')({ name })
  return res.data
}

export {
  getAccessStatus,
  registerStudent,
  getStudentByUid,
  getStudentById,
  changePassword,
  verifyAdminSession,
  updateStudent,
  deleteStudent,
  listenStudents,
  getStudentsPage,
  getStudentsCount,
  stripSensitive, stripPersisted, linkStudentUid,
  incrementFreeAttempts,
}
