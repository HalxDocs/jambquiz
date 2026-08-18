import { db, collection, addDoc, getDocs, getDoc, deleteDoc, doc, setDoc, updateDoc, onSnapshot, query, where, deleteField } from '../firebase'

function limitDocId(subject, week) {
  return String(subject || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) + '__' + String(week || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
}

// The correct answer lives in a separate `questionAnswers` collection that is
// admin/function-only readable, so the public `questions` docs never expose the
// answer key. Grading happens server-side (see the `submitQuiz` callable).
async function addQuestion(subject, week, question) {
  const { id, firestoreId, answer, ...cleanQuestion } = question
  const ref = await addDoc(collection(db, 'questions'), {
    subject,
    week,
    ...cleanQuestion,
    createdAt: new Date().toISOString(),
  })
  if (answer !== undefined && answer !== null) {
    await setDoc(doc(db, 'questionAnswers', ref.id), { answer: parseInt(answer) })
  }
}

async function editQuestion(firestoreId, data) {
  const { id, firestoreId: _fid, answer, ...cleanData } = data
  const update = { ...cleanData, answer: deleteField() }
  await updateDoc(doc(db, 'questions', firestoreId), update)
  await setDoc(doc(db, 'questionAnswers', firestoreId), { answer: parseInt(answer) })
}

async function deleteQuestion(firestoreId) {
  await deleteDoc(doc(db, 'questions', firestoreId))
  await deleteDoc(doc(db, 'questionAnswers', firestoreId))
}

async function getQuestions(subject, week) {
  const q = query(collection(db, 'questions'), where('subject', '==', subject), where('week', '==', week))
  const snapshot = await getDocs(q)
  return snapshot.docs
    .map((d) => ({ firestoreId: d.id, ...d.data() }))
}

// For the admin editor: attach each question's answer from `questionAnswers`.
async function getQuestionsWithAnswers(subject, week) {
  const qs = await getQuestions(subject, week)
  if (!qs.length) return qs
  const snaps = await Promise.all(qs.map((q) => getDoc(doc(db, 'questionAnswers', q.firestoreId))))
  return qs.map((q, i) => {
    const ans = snaps[i].exists() ? snaps[i].data().answer : (q.answer ?? -1)
    return { ...q, answer: ans }
  })
}

function listenQuestions(subject, week, callback) {
  const q = query(collection(db, 'questions'), where('subject', '==', subject), where('week', '==', week))
  return onSnapshot(q, async (snapshot) => {
    const qs = snapshot.docs.map((d) => ({ firestoreId: d.id, ...d.data() }))
    if (!qs.length) { callback(qs); return }
    const snaps = await Promise.all(qs.map((q) => getDoc(doc(db, 'questionAnswers', q.firestoreId))))
    callback(qs.map((q, i) => ({
      ...q,
      answer: snaps[i].exists() ? snaps[i].data().answer : (q.answer ?? -1),
    })))
  })
}

async function copyQuestionsToWeek(subject, fromWeek, toWeek) {
  const q = query(collection(db, 'questions'), where('subject', '==', subject), where('week', '==', fromWeek))
  const snapshot = await getDocs(q)
  for (const questionDoc of snapshot.docs) {
    const { createdAt, answer, ...cleanQ } = questionDoc.data()
    const ref = await addDoc(collection(db, 'questions'), {
      ...cleanQ,
      week: toWeek,
      createdAt: new Date().toISOString(),
    })
    if (answer !== undefined && answer !== null) {
      await setDoc(doc(db, 'questionAnswers', ref.id), { answer: parseInt(answer) })
    }
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
  getQuestionsWithAnswers,
  listenQuestions,
  copyQuestionsToWeek,
  saveQuestionLimit,
  getQuestionLimit,
  defaultQuestionLimit,
}
