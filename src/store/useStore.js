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
  const ref = await addDoc(collection(db, 'students'), {
    ...student,
    createdAt: new Date().toISOString(),
  })
  return { id: ref.id, ...student }
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

async function getQuestionLimit(subject, week) {
  const snapshot = await getDocs(collection(db, 'question_limits'))
  const found = snapshot.docs.find(
    (d) => d.data().subject === subject && d.data().week === week
  )
  return found ? found.data().limit : 25
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