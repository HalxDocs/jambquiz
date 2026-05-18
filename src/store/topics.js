import { db, collection, addDoc, getDocs, deleteDoc, doc, onSnapshot, query, where } from '../firebase'

function normalizeTopic(t) {
  if (!t) return null
  if (typeof t === 'string') return { name: t, video: '', keyPoints: [] }
  return { name: t.name || '', video: t.video || '', keyPoints: Array.isArray(t.keyPoints) ? t.keyPoints : [] }
}

async function setTopics(week, topics) {
  const q = query(collection(db, 'topics'), where('week', '==', week))
  const snapshot = await getDocs(q)
  if (!snapshot.empty) await deleteDoc(doc(db, 'topics', snapshot.docs[0].id))
  await addDoc(collection(db, 'topics'), {
    week,
    topics,
    updatedAt: new Date().toISOString(),
  })
}

async function getTopics(week) {
  const q = query(collection(db, 'topics'), where('week', '==', week))
  const snapshot = await getDocs(q)
  if (snapshot.empty) return {}
  return snapshot.docs[0].data().topics
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

export { normalizeTopic, setTopics, getTopics, listenTopics }
