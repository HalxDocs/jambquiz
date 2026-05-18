import { db, collection, addDoc, getDocs, onSnapshot } from '../../firebase'

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

export { addScore, listenScores, getStudentScores }
