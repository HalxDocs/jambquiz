import { db, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, onSnapshot, query, where } from '../firebase'

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
  const q = query(collection(db, 'questions'), where('subject', '==', subject), where('week', '==', week))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ firestoreId: d.id, ...d.data() }))
}

function listenQuestions(subject, week, callback) {
  const q = query(collection(db, 'questions'), where('subject', '==', subject), where('week', '==', week))
  return onSnapshot(q, (snapshot) => {
    const qs = snapshot.docs.map((d) => ({ firestoreId: d.id, ...d.data() }))
    callback(qs)
  })
}

async function copyQuestionsToWeek(subject, fromWeek, toWeek) {
  const q = query(collection(db, 'questions'), where('subject', '==', subject), where('week', '==', fromWeek))
  const snapshot = await getDocs(q)
  for (const doc of snapshot.docs) {
    const { createdAt, ...cleanQ } = doc.data()
    await addDoc(collection(db, 'questions'), {
      ...cleanQ,
      week: toWeek,
      createdAt: new Date().toISOString(),
    })
  }
  return snapshot.size
}

async function saveQuestionLimit(subject, week, limit) {
  const q = query(collection(db, 'question_limits'), where('subject', '==', subject), where('week', '==', week))
  const snapshot = await getDocs(q)
  if (!snapshot.empty) await deleteDoc(doc(db, 'question_limits', snapshot.docs[0].id))
  await addDoc(collection(db, 'question_limits'), { subject, week, limit })
}

function defaultQuestionLimit(subject) {
  return subject === 'English Language' ? 40 : 25
}

async function getQuestionLimit(subject, week) {
  const q = query(collection(db, 'question_limits'), where('subject', '==', subject), where('week', '==', week))
  const snapshot = await getDocs(q)
  if (snapshot.empty) return defaultQuestionLimit(subject)
  return snapshot.docs[0].data().limit
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
