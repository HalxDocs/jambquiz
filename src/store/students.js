import { db, collection, addDoc, getDocs, updateDoc, doc, deleteDoc, onSnapshot } from '../firebase'
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

async function registerStudent(student) {
  const snapshot = await getDocs(collection(db, 'students'))
  const existing = snapshot.docs.find(
    (d) => d.data().name.toLowerCase() === student.name.toLowerCase()
  )
  if (existing) return null
  const nowIso = new Date().toISOString()
  const payload = {
    ...student,
    trialStartedAt: student.trialStartedAt || nowIso,
    subscriptionUntil: student.subscriptionUntil || null,
    createdAt: nowIso,
  }
  const ref = await addDoc(collection(db, 'students'), payload)
  return { id: ref.id, ...payload }
}

async function findStudent(name) {
  const snapshot = await getDocs(collection(db, 'students'))
  const found = snapshot.docs.find(
    (d) => d.data().name.toLowerCase() === name.toLowerCase()
  )
  return found ? { id: found.id, ...found.data() } : null
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

export { getAccessStatus, registerStudent, findStudent, updateStudent, deleteStudent, listenStudents }
