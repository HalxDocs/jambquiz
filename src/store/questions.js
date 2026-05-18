import { db, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, onSnapshot } from '../../firebase'

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

async function copyQuestionsToWeek(subject, fromWeek, toWeek) {
  const snapshot = await getDocs(collection(db, 'questions'))
  const toTransfer = snapshot.docs
    .map((d) => ({ _id: d.id, ...d.data() }))
    .filter((q) => q.subject === subject && q.week === fromWeek)
  for (const q of toTransfer) {
    const { _id, createdAt, ...cleanQ } = q
    await addDoc(collection(db, 'questions'), {
      ...cleanQ,
      week: toWeek,
      createdAt: new Date().toISOString(),
    })
  }
  return toTransfer.length
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

export {
  addQuestion,
  editQuestion,
  deleteQuestion,
  getQuestions,
  listenQuestions,
  copyQuestionsToWeek,
  saveQuestionLimit,
  getQuestionLimit,
  defaultQuestionLimit,
}
