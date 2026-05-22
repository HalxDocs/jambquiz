import { db, collection, addDoc, getDocs, updateDoc, doc, deleteDoc, onSnapshot, query, where, orderBy, limit, startAfter } from '../firebase'
import { TRIAL_DAYS } from './constants'

function getAccessStatus(student) {
  if (!student) return { status: 'expired', daysLeft: 0, expiresAt: null }
  const now = Date.now()
  const subUntil = student.subscriptionUntil ? new Date(student.subscriptionUntil).getTime() : 0
  if (subUntil > now) {
    return {
      status: 'active',
      daysLeft: Math.ceil((subUntil - now) / (1000 * 60 * 60 * 24)),
      expiresAt: new Date(subUntil).toISOString(),
    }
  }
  const trialStart = student.trialStartedAt
    ? new Date(student.trialStartedAt).getTime()
    : student.joinedAt ? new Date(student.joinedAt).getTime() : now
  const trialEnd = trialStart + TRIAL_DAYS * 24 * 60 * 60 * 1000
  if (trialEnd > now) {
    return {
      status: 'trial',
      daysLeft: Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)),
      expiresAt: new Date(trialEnd).toISOString(),
    }
  }
  return { status: 'expired', daysLeft: 0, expiresAt: new Date(trialEnd).toISOString() }
}

function generateSalt() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashWithSalt(password, salt) {
  const encoder = new TextEncoder()
  const data = encoder.encode(salt + password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password) {
  const salt = generateSalt()
  const hash = await hashWithSalt(password, salt)
  return 'sha256$' + salt + '$' + hash
}

async function verifyPassword(password, storedHash) {
  if (storedHash && storedHash.startsWith('sha256$')) {
    const parts = storedHash.split('$')
    if (parts.length === 3) {
      const salt = parts[1]
      const hash = await hashWithSalt(password, salt)
      return storedHash === 'sha256$' + salt + '$' + hash
    }
    return false
  }
  return password === storedHash
}

function stripSensitive(student) {
  if (!student) return null
  const { password, ...rest } = student
  return rest
}

async function registerStudent(student) {
  const nameLower = student.name.toLowerCase().trim()
  const q = query(collection(db, 'students'), where('nameLower', '==', nameLower))
  const snapshot = await getDocs(q)
  if (!snapshot.empty) return null
  const nowIso = new Date().toISOString()
  const passwordHash = await hashPassword(student.password)
  const payload = {
    name: student.name.trim(),
    nickname: student.nickname || '',
    nameLower: student.name.toLowerCase().trim(),
    nicknameLower: (student.nickname || '').toLowerCase().trim(),
    password: passwordHash,
    year: student.year,
    email: student.email || '',
    parentPhone: student.parentPhone || '',
    teacherPhone: student.teacherPhone || '',
    subjects: student.subjects || [],
    trialStartedAt: student.trialStartedAt || nowIso,
    subscriptionUntil: student.subscriptionUntil || null,
    joinedAt: nowIso,
  }
  const ref = await addDoc(collection(db, 'students'), payload)
  return { id: ref.id, ...stripSensitive(payload) }
}

async function findStudent(name) {
  const nameLower = name.toLowerCase().trim()
  // Try indexed query first
  const q = query(collection(db, 'students'), where('nameLower', '==', nameLower))
  let snapshot = await getDocs(q)
  if (!snapshot.empty) {
    const d = snapshot.docs[0]
    return { id: d.id, ...d.data() }
  }
  // Fallback: scan legacy users without nameLower
  const allSnap = await getDocs(collection(db, 'students'))
  const legacy = allSnap.docs.find((d) => !d.data().nameLower && d.data().name?.toLowerCase().trim() === nameLower)
  if (!legacy) return null
  // Migrate: add nameLower to legacy user
  await updateDoc(doc(db, 'students', legacy.id), { nameLower })
  return { id: legacy.id, ...legacy.data(), nameLower }
}

async function findStudentSafe(name) {
  const found = await findStudent(name)
  return found ? stripSensitive(found) : null
}

async function updateStudent(id, data) {
  await updateDoc(doc(db, 'students', id), data)
}

async function deleteStudent(id) {
  await deleteDoc(doc(db, 'students', id))
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

export { getAccessStatus, registerStudent, findStudent, updateStudent, deleteStudent, listenStudents, getStudentsPage, hashPassword, verifyPassword, findStudentSafe, stripSensitive }
