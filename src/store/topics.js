import { db, collection, addDoc, getDocs, deleteDoc, doc, onSnapshot } from '../firebase'

function normalizeTopic(t) {
  if (!t) return null
  if (typeof t === 'string') return { name: t, video: '', keyPoints: [] }
  return { name: t.name || '', video: t.video || '', keyPoints: Array.isArray(t.keyPoints) ? t.keyPoints : [] }
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

export { normalizeTopic, setTopics, getTopics, listenTopics }
