import { db, collection, addDoc, getDocs, updateDoc, doc, deleteDoc, onSnapshot, query, where } from '../firebase'
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

async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return 'sha256$' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function verifyPassword(password, storedHash) {
  if (storedHash && storedHash.startsWith('sha256$')) {
    const hash = await hashPassword(password)
    return hash === storedHash
  }
  return password === storedHash
}

async function registerStudent(student) {
  const q = query(collection(db, 'students'), where('nameLower', '==', student.name.toLowerCase().trim()))
  const snapshot = await getDocs(q)
  if (!snapshot.empty) return null
  const nowIso = new Date().toISOString()
  const passwordHash = await hashPassword(student.password)
  const payload = {
    name: student.name.trim(),
    nameLower: student.name.toLowerCase().trim(),
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
  return { id: ref.id, ...payload }
}

async function findStudent(name) {
  const q = query(collection(db, 'students'), where('nameLower', '==', name.toLowerCase().trim()))
  const snapshot = await getDocs(q)
  if (snapshot.empty) return null
  const doc = snapshot.docs[0]
  return { id: doc.id, ...doc.data() }
}

async function updateStudent(id, data) {
  await updateDoc(doc(db, 'students', id), data)
}

async function deleteStudent(id) {
  await deleteDoc(doc(db, 'students', id))
}

function listenStudents(callback) {
  return onSnapshot(collection(db, 'students'), (snapshot) => {
    const students = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(students)
  })
}

export { getAccessStatus, registerStudent, findStudent, updateStudent, deleteStudent, listenStudents, hashPassword, verifyPassword }
