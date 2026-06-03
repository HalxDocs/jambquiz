import { db, collection, addDoc, getDocs, getDoc, deleteDoc, doc, setDoc, updateDoc, onSnapshot, query, where } from '../firebase'

function limitDocId(subject, week) {
  return String(subject || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) + '__' + String(week || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
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
  for (const questionDoc of snapshot.docs) {
    const { createdAt, ...cleanQ } = questionDoc.data()
    await addDoc(collection(db, 'questions'), {
      ...cleanQ,
      week: toWeek,
      createdAt: new Date().toISOString(),
    })
  }
  return snapshot.size
}

async function saveQuestionLimit(subject, week, limit) {
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit) || 25))
  await setDoc(doc(db, 'question_limits', limitDocId(subject, week)), {
    subject,
    week,
    limit: safeLimit,
    updatedAt: new Date().toISOString(),
  })
  return safeLimit
}

function defaultQuestionLimit(subject) {
  return subject === 'English Language' ? 40 : 25
}

async function getQuestionLimit(subject, week) {
  const snap = await getDoc(doc(db, 'question_limits', limitDocId(subject, week)))
  if (!snap.exists()) return defaultQuestionLimit(subject)
  return snap.data().limit
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
