import { db, collection, addDoc, getDocs, doc, updateDoc, onSnapshot } from '../firebase'

async function setActiveWeek(week) {
  const snapshot = await getDocs(collection(db, 'settings'))
  const existing = snapshot.docs.find((d) => d.data().key === 'activeWeek')
  if (existing) {
    await updateDoc(doc(db, 'settings', existing.id), { value: week })
  } else {
    await addDoc(collection(db, 'settings'), { key: 'activeWeek', value: week })
  }
}

async function getActiveWeek() {
  const snapshot = await getDocs(collection(db, 'settings'))
  const found = snapshot.docs.find((d) => d.data().key === 'activeWeek')
  return found ? found.data().value : 'Week 1'
}

function listenActiveWeek(callback) {
  return onSnapshot(collection(db, 'settings'), (snapshot) => {
    const found = snapshot.docs.find((d) => d.data().key === 'activeWeek')
    callback(found ? found.data().value : 'Week 1')
  })
}

async function setQuizDates(week, date1, date2) {
  const key = `quizDates_${week}`
  const snapshot = await getDocs(collection(db, 'settings'))
  const existing = snapshot.docs.find((d) => d.data().key === key)
  const payload = { date1: date1 || '', date2: date2 || '' }
  if (existing) {
    await updateDoc(doc(db, 'settings', existing.id), payload)
  } else {
    await addDoc(collection(db, 'settings'), { key, ...payload })
  }
}

async function getQuizDates(week) {
  const key = `quizDates_${week}`
  const snapshot = await getDocs(collection(db, 'settings'))
  const found = snapshot.docs.find((d) => d.data().key === key)
  return found ? { date1: found.data().date1 || '', date2: found.data().date2 || '' } : { date1: '', date2: '' }
}

function listenQuizDates(week, callback) {
  const key = `quizDates_${week}`
  return onSnapshot(collection(db, 'settings'), (snapshot) => {
    const found = snapshot.docs.find((d) => d.data().key === key)
    callback(found ? { date1: found.data().date1 || '', date2: found.data().date2 || '' } : { date1: '', date2: '' })
  })
}

export { setActiveWeek, getActiveWeek, listenActiveWeek, setQuizDates, getQuizDates, listenQuizDates }
