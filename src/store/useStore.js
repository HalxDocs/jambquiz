import { db, collection, addDoc, getDocs, deleteDoc, doc, onSnapshot, query, orderBy } from '../firebase'

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
  if (existing) {
    return { id: existing.id, ...existing.data() }
  }
  const ref = await addDoc(collection(db, 'students'), {
    ...student,
    createdAt: new Date().toISOString(),
  })
  return { id: ref.id, ...student }
}

async function updateStudent(id, data) {
  const snapshot = await getDocs(collection(db, 'students'))
  const existing = snapshot.docs.find((d) => d.id === id)
  if (existing) {
    await deleteDoc(doc(db, 'students', id))
    await addDoc(collection(db, 'students'), { ...existing.data(), ...data })
  }
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
  await addDoc(collection(db, 'questions'), {
    subject,
    week,
    ...question,
    createdAt: new Date().toISOString(),
  })
}

async function deleteQuestion(id) {
  await deleteDoc(doc(db, 'questions', id))
}

async function getQuestions(subject, week) {
  const snapshot = await getDocs(collection(db, 'questions'))
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((q) => q.subject === subject && q.week === week)
}

function listenQuestions(subject, week, callback) {
  return onSnapshot(collection(db, 'questions'), (snapshot) => {
    const qs = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
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

export {
  SUBJECTS,
  WEEKS,
  load,
  save,
  registerStudent,
  updateStudent,
  findStudent,
  listenStudents,
  addQuestion,
  deleteQuestion,
  getQuestions,
  listenQuestions,
  addScore,
  listenScores,
  setTopics,
  getTopics,
  listenTopics,
}