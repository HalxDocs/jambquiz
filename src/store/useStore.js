import { db, collection, addDoc, getDocs, deleteDoc, doc, onSnapshot, query, orderBy } from '../firebase'

const SUBJECTS = [
  'Mathematics',
  'English Language',
  'Physics',
  'Chemistry',
  'Biology',
  'Economics',
  'Government',
  'Literature in English',
  'Geography',
  'Commerce',
  'Accounting',
  'Agricultural Science',
  'Further Mathematics',
  'Civic Education',
  'Christian Religious Studies',
  'Islamic Religious Studies',
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

async function getScores() {
  const snapshot = await getDocs(collection(db, 'scores'))
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

function listenScores(callback) {
  return onSnapshot(collection(db, 'scores'), (snapshot) => {
    const scores = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(scores)
  })
}

export {
  SUBJECTS,
  WEEKS,
  load,
  save,
  addQuestion,
  deleteQuestion,
  getQuestions,
  listenQuestions,
  addScore,
  getScores,
  listenScores,
}