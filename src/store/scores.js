import { db, collection, addDoc, getDocs, onSnapshot, query, where } from '../firebase'

async function addScore(result) {
  await addDoc(collection(db, 'scores'), {
    ...result,
    createdAt: new Date().toISOString(),
  })
}

function listenScores(callback, studentId) {
  const ref = studentId
    ? query(collection(db, 'scores'), where('studentId', '==', studentId))
    : collection(db, 'scores')
  return onSnapshot(ref, (snapshot) => {
    const scores = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(scores)
  })
}

async function getStudentScores(studentId) {
  const q = query(collection(db, 'scores'), where('studentId', '==', studentId))
  const snapshot = await getDocs(q)
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
}

export { addScore, listenScores, getStudentScores }
