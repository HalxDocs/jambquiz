// Settings store — Go backend. Listeners become short polls.
import { apiGet, apiPut } from '../lib/api'

async function setActiveWeek(week) {
  const value = String(week || 'Week 1').slice(0, 50)
  await apiPut('/api/admin/settings/active-week', { week: value, source: 'manual' })
}

async function getActiveWeek() {
  try {
    const res = await apiGet('/api/settings/active-week')
    return res.week || 'Week 1'
  } catch {
    return 'Week 1'
  }
}

function listenActiveWeek(callback) {
  let stopped = false
  const poll = async () => {
    if (stopped) return
    try {
      const week = await getActiveWeek()
      if (!stopped) callback(week)
    } catch { /* offline — retry on next poll */ }
    if (!stopped) setTimeout(poll, 15000)
  }
  poll()
  return () => { stopped = true }
}

async function setQuizDates(week, date1, date2) {
  await apiPut('/api/admin/settings/quiz-dates', {
    week,
    date1: date1 ? String(date1).slice(0, 50) : '',
    date2: date2 ? String(date2).slice(0, 50) : '',
  })
}

async function getQuizDates(week) {
  try {
    const res = await apiGet(`/api/settings/quiz-dates?week=${encodeURIComponent(week || '')}`)
    const d = res.dates || {}
    return { date1: d.date1 || '', date2: d.date2 || '' }
  } catch {
    return { date1: '', date2: '' }
  }
}

function listenQuizDates(week, callback) {
  let stopped = false
  const poll = async () => {
    if (stopped) return
    try {
      const dates = await getQuizDates(week)
      if (!stopped) callback(dates)
    } catch { /* offline — retry on next poll */ }
    if (!stopped) setTimeout(poll, 15000)
  }
  poll()
  return () => { stopped = true }
}

// Normal weekend window: Fri / Sat / Sun, session starting 5–6pm (2h session).
function isStandardWindowDate(d) {
  if (!d) return false
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return false
  const day = t.getDay()
  if (day !== 0 && day !== 5 && day !== 6) return false
  const mins = t.getHours() * 60 + t.getMinutes()
  return mins >= 17 * 60 && mins < 19 * 60
}

function isBonusQuiz(quizDates) {
  if (!quizDates || (!quizDates.date1 && !quizDates.date2)) return false
  const dates = [quizDates.date1, quizDates.date2].filter(Boolean)
  if (!dates.length) return false
  return !dates.some(isStandardWindowDate)
}

export { setActiveWeek, getActiveWeek, listenActiveWeek, setQuizDates, getQuizDates, listenQuizDates, isStandardWindowDate, isBonusQuiz }
