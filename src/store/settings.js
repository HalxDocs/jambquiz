import { db, doc, getDoc, setDoc, onSnapshot } from '../firebase'

function activeWeekDocId() { return 'activeWeek' }
function quizDatesDocId(week) {
  return 'quizDates_' + String(week || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
}

async function setActiveWeek(week) {
  const value = String(week || 'Week 1').slice(0, 50)
  await setDoc(doc(db, 'settings', activeWeekDocId()), { key: 'activeWeek', value, updatedAt: new Date().toISOString() })
}

async function getActiveWeek() {
  const snap = await getDoc(doc(db, 'settings', activeWeekDocId()))
  if (snap.exists() && snap.data().value) return snap.data().value
  return 'Week 1'
}

function listenActiveWeek(callback) {
  return onSnapshot(doc(db, 'settings', activeWeekDocId()), (snap) => {
    callback(snap.exists() ? (snap.data().value || 'Week 1') : 'Week 1')
  }, () => callback('Week 1'))
}

async function setQuizDates(week, date1, date2) {
  const payload = {
    key: 'quizDates_' + week,
    date1: date1 ? String(date1).slice(0, 50) : '',
    date2: date2 ? String(date2).slice(0, 50) : '',
    updatedAt: new Date().toISOString(),
  }
  await setDoc(doc(db, 'settings', quizDatesDocId(week)), payload)
}

async function getQuizDates(week) {
  const snap = await getDoc(doc(db, 'settings', quizDatesDocId(week)))
  if (!snap.exists()) return { date1: '', date2: '' }
  return { date1: snap.data().date1 || '', date2: snap.data().date2 || '' }
}

function listenQuizDates(week, callback) {
  return onSnapshot(doc(db, 'settings', quizDatesDocId(week)), (snap) => {
    callback(snap.exists() ? { date1: snap.data().date1 || '', date2: snap.data().date2 || '' } : { date1: '', date2: '' })
  }, () => callback({ date1: '', date2: '' }))
}

export { setActiveWeek, getActiveWeek, listenActiveWeek, setQuizDates, getQuizDates, listenQuizDates }
