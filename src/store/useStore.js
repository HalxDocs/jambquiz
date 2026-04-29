import { db, collection, addDoc, getDocs, deleteDoc, doc, onSnapshot, updateDoc } from '../firebase'

const SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'English Language',
  'Government',
  'Literature in English',
  'Christian Religious Studies',
  'Islamic Religious Studies',
  'Commerce',
  'Economics',
]

const WEEKS = ['Week 1', 'Week 2', 'Week 3', 'Week 4']

// A topic value can be either a string (legacy: just the topic name) or an object { name, video }.
// Always normalize via this helper before reading.
function normalizeTopic(t) {
  if (!t) return null
  if (typeof t === 'string') return { name: t, video: '' }
  return { name: t.name || '', video: t.video || '' }
}

const SUBSCRIPTION_PRICE_NGN = 800
const TRIAL_DAYS = 14

// Returns subscription/trial status for a student
//   { status: 'trial'|'active'|'expired', daysLeft, expiresAt }
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

// Consistency rank — based on number of distinct (week, subject) test sessions completed
// 0 → GHOST · 1-3 → ROOKIE · 4-9 → LEARNER · 10-19 → CADET · 20-39 → SCHOLAR · 40+ → ELITE
const RANK_TIERS = [
  { name: 'GHOST',    min: 0,  color: 'gray' },
  { name: 'ROOKIE',   min: 1,  color: 'gray' },
  { name: 'LEARNER',  min: 4,  color: 'yellow' },
  { name: 'CADET',    min: 10, color: 'blue' },
  { name: 'SCHOLAR',  min: 20, color: 'purple' },
  { name: 'ELITE',    min: 40, color: 'green' },
]
function getConsistencyRank(scores) {
  const sessions = new Set()
  ;(scores || []).forEach((s) => sessions.add(`${s.week}::${s.subject}`))
  const count = sessions.size
  let current = RANK_TIERS[0]
  let next = null
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (count >= RANK_TIERS[i].min) current = RANK_TIERS[i]
    else { next = RANK_TIERS[i]; break }
  }
  return { rank: current.name, color: current.color, sessions: count, nextRank: next?.name || null, nextAt: next?.min || null }
}

async function addPayment(payment) {
  await addDoc(collection(db, 'payments'), {
    ...payment,
    createdAt: new Date().toISOString(),
  })
}

function listenPayments(callback) {
  return onSnapshot(collection(db, 'payments'), (snapshot) => {
    const payments = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(payments)
  })
}

// Extends a student's subscription by N months. Anchors from the LATER of (now, current expiry).
async function extendSubscription(studentId, months = 1) {
  const snap = await getDocs(collection(db, 'students'))
  const found = snap.docs.find((d) => d.id === studentId)
  if (!found) return null
  const data = found.data()
  const now = Date.now()
  const current = data.subscriptionUntil ? new Date(data.subscriptionUntil).getTime() : 0
  const anchor = Math.max(now, current)
  const next = new Date(anchor)
  next.setMonth(next.getMonth() + months)
  const iso = next.toISOString()
  await updateDoc(doc(db, 'students', studentId), { subscriptionUntil: iso })
  return iso
}

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
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

async function updateStudent(id, data) {
  await updateDoc(doc(db, 'students', id), data)
}

async function findStudent(name) {
  const snapshot = await getDocs(collection(db, 'students'))
  const found = snapshot.docs.find(
    (d) => d.data().name.toLowerCase() === name.toLowerCase()
  )
  return found ? { id: found.id, ...found.data() } : null
}

function listenStudents(callback) {
  return onSnapshot(collection(db, 'students'), (snapshot) => {
    const students = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(students)
  })
}

async function addQuestion(subject, week, question) {
  const { id, firestoreId, ...cleanQuestion } = question
  await addDoc(collection(db, 'questions'), {
    subject,
    week,
    ...cleanQuestion,
    createdAt: new Date().toISOString(),
  })
}

async function editQuestion(firestoreId, data) {
  const { id, firestoreId: _fid, ...cleanData } = data
  await updateDoc(doc(db, 'questions', firestoreId), cleanData)
}

async function deleteStudent(id) {
  await deleteDoc(doc(db, 'students', id))
}

async function deleteQuestion(firestoreId) {
  await deleteDoc(doc(db, 'questions', firestoreId))
}

async function getQuestions(subject, week) {
  const snapshot = await getDocs(collection(db, 'questions'))
  return snapshot.docs
    .map((d) => ({ firestoreId: d.id, ...d.data() }))
    .filter((q) => q.subject === subject && q.week === week)
}

function listenQuestions(subject, week, callback) {
  return onSnapshot(collection(db, 'questions'), (snapshot) => {
    const qs = snapshot.docs
      .map((d) => ({ firestoreId: d.id, ...d.data() }))
      .filter((q) => q.subject === subject && q.week === week)
    callback(qs)
  })
}

async function addScore(result) {
  await addDoc(collection(db, 'scores'), {
    ...result,
    createdAt: new Date().toISOString(),
  })
}

function listenScores(callback) {
  return onSnapshot(collection(db, 'scores'), (snapshot) => {
    const scores = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(scores)
  })
}

async function getStudentScores(studentId) {
  const snapshot = await getDocs(collection(db, 'scores'))
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.studentId === studentId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
}

async function setTopics(week, topics) {
  const snapshot = await getDocs(collection(db, 'topics'))
  const existing = snapshot.docs.find((d) => d.data().week === week)
  if (existing) {
    await deleteDoc(doc(db, 'topics', existing.id))
  }
  await addDoc(collection(db, 'topics'), {
    week,
    topics,
    updatedAt: new Date().toISOString(),
  })
}

async function getTopics(week) {
  const snapshot = await getDocs(collection(db, 'topics'))
  const found = snapshot.docs.find((d) => d.data().week === week)
  return found ? found.data().topics : {}
}

function listenTopics(callback) {
  return onSnapshot(collection(db, 'topics'), (snapshot) => {
    const all = {}
    snapshot.docs.forEach((d) => {
      const data = d.data()
      all[data.week] = data.topics
    })
    callback(all)
  })
}

async function saveQuestionLimit(subject, week, limit) {
  const snapshot = await getDocs(collection(db, 'question_limits'))
  const existing = snapshot.docs.find(
    (d) => d.data().subject === subject && d.data().week === week
  )
  if (existing) await deleteDoc(doc(db, 'question_limits', existing.id))
  await addDoc(collection(db, 'question_limits'), { subject, week, limit })
}

function defaultQuestionLimit(subject) {
  return subject === 'English Language' ? 40 : 25
}

async function getQuestionLimit(subject, week) {
  const snapshot = await getDocs(collection(db, 'question_limits'))
  const found = snapshot.docs.find(
    (d) => d.data().subject === subject && d.data().week === week
  )
  return found ? found.data().limit : defaultQuestionLimit(subject)
}

async function setActiveWeek(week) {
  const snapshot = await getDocs(collection(db, 'settings'))
  const existing = snapshot.docs.find((d) => d.data().key === 'activeWeek')
  if (existing) {
    await updateDoc(doc(db, 'settings', existing.id), { value: week })
  } else {
    await addDoc(collection(db, 'settings'), { key: 'activeWeek', value: week })
  }
}

async function getActiveWeek() {
  const snapshot = await getDocs(collection(db, 'settings'))
  const found = snapshot.docs.find((d) => d.data().key === 'activeWeek')
  return found ? found.data().value : 'Week 1'
}

function listenActiveWeek(callback) {
  return onSnapshot(collection(db, 'settings'), (snapshot) => {
    const found = snapshot.docs.find((d) => d.data().key === 'activeWeek')
    callback(found ? found.data().value : 'Week 1')
  })
}

export {
  SUBJECTS,
  WEEKS,
  SUBSCRIPTION_PRICE_NGN,
  TRIAL_DAYS,
  normalizeTopic,
  getAccessStatus,
  getConsistencyRank,
  addPayment,
  listenPayments,
  extendSubscription,
  load,
  save,
  registerStudent,
  updateStudent,
  deleteStudent,
  findStudent,
  listenStudents,
  addQuestion,
  editQuestion,
  deleteQuestion,
  getQuestions,
  listenQuestions,
  addScore,
  listenScores,
  getStudentScores,
  setTopics,
  getTopics,
  listenTopics,
  saveQuestionLimit,
  getQuestionLimit,
  setActiveWeek,
  getActiveWeek,
  listenActiveWeek,
}