import { useState, useEffect, useRef, useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { HeartAddIcon, Mail01Icon, Sun01Icon, Moon01Icon } from '@hugeicons/core-free-icons'
import {
  listenActiveWeek, listenScores, getTopics, normalizeTopic,
  getAccessStatus, getConsistencyRank, listenQuizDates, WEEKS, logEvent,
  getStudentScores,
} from '../store/useStore'
import { CARD_YELLOW_1, CARD_YELLOW_2, CARD_RED } from '../store/constants'
import { db, doc, onSnapshot } from '../firebase'
import { registerPushNotifications, savePushSubscriptionToFirestore, saveNotificationStateToFirestore } from '../services/pushNotifications'
import { useUserNotificationStore } from '../store/notificationStore'
import RankToast from '../components/dashboard/RankToast'
import PatchesOverlay from '../components/dashboard/PatchesOverlay'
import PatchesModal from '../components/dashboard/PatchesModal'
import SEO from '../components/seo/SEO'
import MedalTrack from '../components/dashboard/MedalTrack'
import SubscriptionBanner from '../components/dashboard/SubscriptionBanner'
import KeyPointsCard from '../components/dashboard/KeyPointsCard'
import ScoreHero from '../components/dashboard/ScoreHero'
import TopicsList from '../components/dashboard/TopicsList'
import SubjectCard from '../components/dashboard/SubjectCard'
import QuizCard from '../components/dashboard/QuizCard'
import AppealOverlay from '../components/dashboard/AppealOverlay'
import CardWarningPopup from '../components/dashboard/CardWarningPopup'
import { notificationScheduler } from '../services/notificationSchedular'
import { getCurrentRevisionBatch, revisionTopicKey, isRevisionCompleted } from '../lib/revisionQueue'
import { prefetch } from '../lib/prefetch'

const RANK_BADGES = {
  gray: 'bg-[#1C1C1C] text-[#AAA] border-[#333]',
  yellow: 'bg-yellow-950 text-yellow-300 border-yellow-800',
  blue: 'bg-blue-950 text-blue-300 border-blue-800',
  purple: 'bg-purple-950 text-purple-300 border-purple-800',
  green: 'bg-green-950 text-green-300 border-green-800',
}

function isQuizTime(quizDates) {
  const now = Date.now()
  if (quizDates && (quizDates.date1 || quizDates.date2)) {
    const WINDOW = 60 * 60 * 1000
    for (const d of [quizDates.date1, quizDates.date2]) {
      if (!d) continue
      const t = new Date(d).getTime()
      if (now >= t && now < t + WINDOW) return true
    }
    return false
  }
  const nowD = new Date()
  const day = nowD.getDay()
  const h = nowD.getHours()
  const m = nowD.getMinutes()
  const mins = h * 60 + m
  return (day === 5 || day === 6) && mins >= 17 * 60 && mins < 19 * 60
}

function getTimeUntilQuiz(quizDates) {
  const now = Date.now()
  if (quizDates && (quizDates.date1 || quizDates.date2)) {
    const upcoming = [quizDates.date1, quizDates.date2].filter(Boolean).map((d) => new Date(d).getTime()).filter((t) => t > now).sort((a, b) => a - b)
    if (!upcoming.length) return { days: 0, hours: 0, mins: 0 }
    const diff = upcoming[0] - now
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      mins: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    }
  }
  const nowD = new Date()
  const day = nowD.getDay()
  const h = nowD.getHours()
  let daysUntil
  if ((day === 5 || day === 6) && h < 17) daysUntil = 0
  else if (day === 5 && h >= 17) daysUntil = 1
  else daysUntil = (5 - day + 7) % 7 || 7
  const target = new Date(nowD)
  target.setDate(nowD.getDate() + daysUntil)
  target.setHours(17, 0, 0, 0)
  const diff = target - nowD
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    mins: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
  }
}

export default function Dashboard({ student, setView, setStudent, setSelectedSubjectDetail, setRetakeData }) {
  const [quizDates, setQuizDates] = useState(null)
  const [quizTime, setQuizTime] = useState(false)
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, mins: 0 })
  const [scores, setScores] = useState([])
  const [currentWeek, setCurrentWeek] = useState('Week 1')
  const [weekTopics, setWeekTopics] = useState({})
  const [rankUpToast, setRankUpToast] = useState(null)
  const prevRankRef = useRef(null)
  const firstLoadRef = useRef(true)
  const rankToastRef = useRef(null)
  const patchesToastRef = useRef(null)

  const [patchesActive, setPatchesActive] = useState(() => localStorage.getItem('patches_active') === '1')
  const [currentPatchIdx, setCurrentPatchIdx] = useState(0)
  const [showPatchesModal, setShowPatchesModal] = useState(false)
  const [selectedPatchSubjects, setSelectedPatchSubjectsLocal] = useState([])

  const [keyPointIdx, setKeyPointIdx] = useState(0)
  const [kpDismissed, setKpDismissed] = useState(false)
  const [patchesToast, setPatchesToast] = useState(false)

  const [isDark, setIsDark] = useState(() => localStorage.getItem('app_theme') !== 'light')

  // Inject/remove dark mode styles
  useEffect(() => {
    const existing = document.getElementById('dashboard-dark-styles')
    if (isDark) {
      if (!existing) {
        const style = document.createElement('style')
        style.id = 'dashboard-dark-styles'
        style.textContent = `
          body.dashboard-dark { background: #0A0A0A !important; }
          body.dashboard-dark .bg-\\[\\#F8F8F7\\] { background: #0A0A0A !important; }
          body.dashboard-dark .bg-white { background-color: #161616 !important; }
          body.dashboard-dark .border-\\[\\#EBEBEB\\] { border-color: #2A2A2A !important; }
          body.dashboard-dark .border-\\[\\#E5E5E5\\] { border-color: #2A2A2A !important; }
          body.dashboard-dark .border-\\[\\#F3F3F2\\] { border-color: #2A2A2A !important; }
          body.dashboard-dark .text-\\[\\#111\\] { color: #EDEDED !important; }
          body.dashboard-dark .text-\\[\\#333\\] { color: #DDD !important; }
          body.dashboard-dark .text-\\[\\#555\\] { color: #AAA !important; }
          body.dashboard-dark .text-\\[\\#666\\] { color: #999 !important; }
          body.dashboard-dark .text-\\[\\#888\\] { color: #888 !important; }
          body.dashboard-dark .text-\\[\\#AAA\\] { color: #777 !important; }
          body.dashboard-dark .text-\\[\\#CCC\\] { color: #666 !important; }
          body.dashboard-dark .bg-\\[\\#F3F3F2\\] { background-color: #1A1A1A !important; }
          body.dashboard-dark .bg-\\[\\#FAFAF9\\] { background-color: #1A1A1A !important; }
          body.dashboard-dark .bg-\\[\\#F5F5F5\\] { background-color: #1A1A1A !important; }
          body.dashboard-dark select { background-color: #161616 !important; color: #DDD !important; border-color: #2A2A2A !important; }
          body.dashboard-dark input { background-color: #161616 !important; color: #DDD !important; border-color: #2A2A2A !important; }
        `
        document.head.appendChild(style)
      }
      document.body.classList.add('dashboard-dark')
    } else {
      document.body.classList.remove('dashboard-dark')
      if (existing) existing.remove()
    }
    return () => {
      document.body.classList.remove('dashboard-dark')
      const s = document.getElementById('dashboard-dark-styles')
      if (s) s.remove()
    }
  }, [isDark])

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev
      localStorage.setItem('app_theme', next ? 'dark' : 'light')
      return next
    })
  }

  const missedStreak = student.missedStreak || 0
  const isSuspended = student.suspended || false
  const isRedCard = missedStreak >= CARD_RED || isSuspended
  const [showAppeal, setShowAppeal] = useState(() => isRedCard)
  const [appealResolved, setAppealResolved] = useState(false)
  const [showCardWarning, setShowCardWarning] = useState(false)

  useEffect(() => {
    if (missedStreak > 0 && !isRedCard) {
      setShowCardWarning(true)
    }
  }, [missedStreak, isRedCard])

  const handleAppealed = () => {
    setShowAppeal(false)
    setAppealResolved(true)
    if (setStudent) {
      setStudent({ ...student, missedStreak: 0, suspended: false })
    }
  }

  const [pushPermission, setPushPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )

  useEffect(() => {
    const unsubWeek = listenActiveWeek((week) => setCurrentWeek(week))
    const unsubScores = listenScores((allScores) => {
      const mine = [...allScores].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      setScores(mine)
      const { rank } = getConsistencyRank(mine)
      if (firstLoadRef.current) { prevRankRef.current = rank; firstLoadRef.current = false }
      else if (prevRankRef.current && rank !== prevRankRef.current) {
        setRankUpToast(rank); prevRankRef.current = rank
        clearTimeout(rankToastRef.current)
        rankToastRef.current = setTimeout(() => setRankUpToast(null), 5000)
      }
    }, student.id)
    return () => { unsubWeek(); unsubScores(); clearTimeout(rankToastRef.current) }
  }, [student])

  useEffect(() => {
    if (currentWeek && student?.subjects?.length) {
      notificationScheduler.start(currentWeek, student.subjects, scores, student.id)
    }
    return () => notificationScheduler.stop()
  }, [currentWeek, student.id])

  useEffect(() => {
    if (!currentWeek) return
    const unsubDates = listenQuizDates(currentWeek, (dates) => { setQuizDates(dates); setQuizTime(isQuizTime(dates)); setTimeLeft(getTimeUntilQuiz(dates)) })
    const t = setInterval(() => { setQuizDates((prev) => { const qd = prev; setQuizTime(isQuizTime(qd)); setTimeLeft(getTimeUntilQuiz(qd)); return qd }) }, 10000)
    return () => { unsubDates(); clearInterval(t) }
  }, [currentWeek])

  useEffect(() => {
    let active = true
    getTopics(currentWeek).then((t) => { if (active) setWeekTopics(t || {}) }).catch(() => {})
    setKpDismissed(false); setKeyPointIdx(0)
    return () => { active = false }
  }, [currentWeek])

  useEffect(() => { logEvent(student.id, 'page_view', { page: 'dashboard' }) }, [])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'students', student.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setStudent({ ...student, ...data })
      }
    }, () => {})
    return () => unsub()
  }, [student.id])

  const handleEnableNotifications = async () => {
    const sub = await registerPushNotifications()
    if (sub) {
      useUserNotificationStore.getState().setPushSubscription(sub)
      useUserNotificationStore.getState().setPushPermission('granted')
      savePushSubscriptionToFirestore(student.id, sub)
    }
    setPushPermission(Notification.permission)
  }

  useEffect(() => {
    if (Notification.permission === 'granted') {
      const access = getAccessStatus(student)
      if (access.status === 'expired') return
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription()
      ).then((existing) => {
        if (existing) {
          useUserNotificationStore.getState().setPushSubscription(existing)
          useUserNotificationStore.getState().setPushPermission('granted')
          return
        }
        registerPushNotifications().then((sub) => {
          if (sub) {
            useUserNotificationStore.getState().setPushSubscription(sub)
            useUserNotificationStore.getState().setPushPermission('granted')
            savePushSubscriptionToFirestore(student.id, sub)
          }
        })
      })
    }
  }, [student.id])

  // Inject/remove patches dark mode styles
  useEffect(() => {
    const existing = document.getElementById('patches-mode-styles')
    if (patchesActive) {
      if (!existing) {
        const style = document.createElement('style')
        style.id = 'patches-mode-styles'
        style.textContent = `
          html.patches-mode { background: #0a0a0a !important; }
          html.patches-mode > body { background: #0a0a0a !important; color: #ddd !important; }
          html.patches-mode .bg-\\[\\#F8F8F7\\] { background: #0d0d0d !important; }
          html.patches-mode .bg-white { background-color: #161616 !important; }
          html.patches-mode .border-\\[\\#EBEBEB\\] { border-color: #2a1515 !important; }
          html.patches-mode .border-\\[\\#E5E5E5\\] { border-color: #3a1818 !important; }
          html.patches-mode .border-\\[\\#F3F3F2\\] { border-color: #2a1515 !important; }
          html.patches-mode .text-\\[\\#111\\] { color: #ff5555 !important; }
          html.patches-mode .text-\\[\\#333\\] { color: #ddd !important; }
          html.patches-mode .text-\\[\\#555\\] { color: #cc8888 !important; }
          html.patches-mode .text-\\[\\#666\\] { color: #cc6666 !important; }
          html.patches-mode .text-\\[\\#888\\] { color: #cc6666 !important; }
          html.patches-mode .text-\\[\\#AAA\\] { color: #aa5555 !important; }
          html.patches-mode .text-\\[\\#CCC\\] { color: #884444 !important; }
          html.patches-mode .text-\\[\\#999\\] { color: #aa5555 !important; }
          html.patches-mode .bg-\\[\\#F3F3F2\\] { background-color: #1a1a1a !important; }
          html.patches-mode .bg-\\[\\#FAFAF9\\] { background-color: #1a1a1a !important; }
          html.patches-mode .bg-\\[\\#F5F5F5\\] { background-color: #1a1a1a !important; }
          html.patches-mode .from-\\[\\#1a1a1a\\] { background: #0a0a0a !important; }
          html.patches-mode .to-\\[\\#111\\] { background: #0a0a0a !important; }
          html.patches-mode .bg-gradient-to-b { background: linear-gradient(to bottom, #0d0d0d, #080808) !important; }
          html.patches-mode .bg-\\[\\#FFF8E7\\] { background-color: #1a1515 !important; }
          html.patches-mode select { background-color: #161616 !important; color: #ddd !important; }
          html.patches-mode input { background-color: #161616 !important; color: #ddd !important; }
        `
        document.head.appendChild(style)
      }
      document.documentElement.classList.add('patches-mode')
      setPatchesToast(true)
      clearTimeout(patchesToastRef.current)
      patchesToastRef.current = setTimeout(() => setPatchesToast(false), 5000)
    } else {
      document.documentElement.classList.remove('patches-mode')
      if (existing) existing.remove()
    }
    return () => {
      document.documentElement.classList.remove('patches-mode')
      const s = document.getElementById('patches-mode-styles')
      if (s) s.remove()
      clearTimeout(patchesToastRef.current)
    }
  }, [patchesActive])

  useEffect(() => { useUserNotificationStore.getState().setPatchesActive(patchesActive) }, [patchesActive])

  const currentWeekIdx = WEEKS.indexOf(currentWeek)
  const rankData = getConsistencyRank(scores)
  const weeklyMedals = WEEKS.map((week) => scores.some((s) => s.week === week) ? 'gold' : null)

  const todaySubjectsAttempted = scores.filter((s) => s.week === currentWeek && new Date(s.date).toDateString() === new Date().toDateString()).map((s) => s.subject)
  const hasAttemptedAllSubjects = student.subjects.length > 0 && student.subjects.every((sub) => todaySubjectsAttempted.includes(sub))

  const getBestBySubject = () => { const best = {}; scores.forEach((s) => { if (!best[s.subject] || s.score > best[s.subject].score) best[s.subject] = s }); return best }
  const getTotalScore = () => { const best = getBestBySubject(); const subjects = Object.values(best); if (subjects.length < 4) return null; const top4 = subjects.slice(0, 4); return { total: top4.reduce((a, s) => a + s.score, 0), totalOut: top4.reduce((a, s) => a + (s.outOf || 100), 0) } }
  const getSubjectScore = (sub) => getBestBySubject()[sub] || null
  const getSubjectPct = (sub) => { const sc = getSubjectScore(sub); if (!sc) return null; return Math.round((sc.score / (sc.outOf || 100)) * 100) }

  const totalScore = getTotalScore()
  const thisWeekTopics = student.subjects.map((sub) => ({ subject: sub, topic: normalizeTopic(weekTopics[sub]) })).filter((t) => t.topic && t.topic.name)

  const allKeyPoints = student.subjects.flatMap((sub) => { const topic = normalizeTopic(weekTopics[sub]); if (!topic?.keyPoints) return []; return topic.keyPoints.filter((kp) => kp?.trim()).map((kp) => ({ subject: sub, point: kp })) })
  const weakSubjects = student.subjects.filter((sub) => { const pct = getSubjectPct(sub); return pct === null || pct < 50 })
  const currentWeekWeakKeyPoints = weakSubjects.flatMap((sub) => { const topic = normalizeTopic(weekTopics[sub]); if (!topic?.keyPoints) return []; return topic.keyPoints.filter((kp) => kp?.trim()).map((kp) => ({ subject: sub, point: kp })) })

  // Revision queue — automatically cycles through all weak topics, 2 per week
  const revisionBatch = useMemo(() => getCurrentRevisionBatch(scores), [scores])


  // Fetch key points from revision batch topics (may span different weeks)
  const [revisionKeyPoints, setRevisionKeyPoints] = useState([])
  useEffect(() => {
    if (!patchesActive || !revisionBatch.length) { setRevisionKeyPoints([]); return }
    let active = true
    const weeks = [...new Set(revisionBatch.map((item) => item.week))]
    Promise.all(weeks.map((w) => getTopics(w))).then((results) => {
      if (!active) return
      const points = []
      results.forEach((topicsData, i) => {
        if (!topicsData) return
        const week = weeks[i]
        revisionBatch.filter((item) => item.week === week).forEach((item) => {
          const topic = normalizeTopic(topicsData[item.subject])
          if (topic?.keyPoints) {
            topic.keyPoints.filter((kp) => kp?.trim()).forEach((kp) => points.push({ subject: item.subject, point: kp }))
          }
        })
      })
      setRevisionKeyPoints(points)
    }).catch(() => {})
    return () => { active = false }
  }, [patchesActive, revisionBatch])

  const patchKeyPoints = revisionKeyPoints.length > 0 ? revisionKeyPoints : currentWeekWeakKeyPoints

  useEffect(() => { if (!allKeyPoints.length || kpDismissed) return; const t = setInterval(() => setKeyPointIdx((i) => (i + 1) % allKeyPoints.length), 5000); return () => clearInterval(t) }, [allKeyPoints.length, kpDismissed])
  useEffect(() => { if (!patchesActive || !patchKeyPoints.length) return; const t = setInterval(() => setCurrentPatchIdx((i) => (i + 1) % patchKeyPoints.length), 6000); return () => clearInterval(t) }, [patchesActive, patchKeyPoints.length])

  useEffect(() => { if (patchesActive) { const saved = localStorage.getItem('patches_selected_subjects'); if (saved) { try { const parsed = JSON.parse(saved); setSelectedPatchSubjectsLocal(parsed); useUserNotificationStore.getState().setSelectedPatchSubjects(parsed) } catch {} } } }, [])

  const handleOpenPatchesModal = () => { setSelectedPatchSubjectsLocal(weakSubjects.length > 0 ? [...weakSubjects] : [...student.subjects]); setShowPatchesModal(true) }
  const handleConfirmPatches = () => {
    const subjects = selectedPatchSubjects.length > 0 ? selectedPatchSubjects : (weakSubjects.length > 0 ? weakSubjects : student.subjects)
    setPatchesActive(true); localStorage.setItem('patches_active', '1'); localStorage.setItem('patches_selected_subjects', JSON.stringify(subjects))
    setSelectedPatchSubjectsLocal(subjects); useUserNotificationStore.getState().setSelectedPatchSubjects(subjects); useUserNotificationStore.getState().setPatchesActive(true)
    setCurrentPatchIdx(0); setShowPatchesModal(false)
    saveNotificationStateToFirestore(student.id, { patchesActive: true, selectedPatchSubjects: subjects, seenPoints: useUserNotificationStore.getState().seenPoints, currentCycleIndex: useUserNotificationStore.getState().currentCycleIndex, lastNotifiedAt: useUserNotificationStore.getState().lastNotifiedAt })
  }
  const handleTogglePatchSubject = (sub) => setSelectedPatchSubjectsLocal((prev) => prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub])
  const handleDeactivatePatches = () => {
    setPatchesActive(false); localStorage.removeItem('patches_active'); localStorage.removeItem('patches_selected_subjects')
    useUserNotificationStore.getState().setPatchesActive(false); useUserNotificationStore.getState().setSelectedPatchSubjects([])
    saveNotificationStateToFirestore(student.id, { patchesActive: false, selectedPatchSubjects: [], seenPoints: useUserNotificationStore.getState().seenPoints, currentCycleIndex: useUserNotificationStore.getState().currentCycleIndex, lastNotifiedAt: useUserNotificationStore.getState().lastNotifiedAt })
  }

  const P = patchesActive ? { bg: 'bg-red-700', hoverBg: 'hover:bg-red-800', textColor: 'text-red-700' } : { bg: 'bg-[#111]', hoverBg: 'hover:bg-[#222]', textColor: 'text-[#111]' }
  const patchesUnlocked = (() => { const d = new Date(); return d.getMonth() === 5 && d.getDate() >= 21 })()

  return (
    <>
      <SEO title="Dashboard" />
    <div className="min-h-screen bg-[#F8F8F7]">
      <RankToast rank={rankUpToast} onDismiss={() => setRankUpToast(null)} />
      {patchesToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
          <div className="bg-red-700 text-white rounded-2xl shadow-xl px-5 py-4 flex items-center gap-3">
            <span className="text-2xl shrink-0">🚨</span>
            <div className="flex-1">
              <p className="text-sm font-bold font-display">Patches Activated!</p>
              <p className="text-xs text-red-200 font-label mt-0.5">Time to work on your weak topics</p>
            </div>
            <button onClick={() => setPatchesToast(false)} className="text-red-200 hover:text-white text-lg leading-none transition-colors shrink-0">×</button>
          </div>
        </div>
      )}

      {pushPermission !== 'granted' && (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md">
          <div className="bg-[#111] border border-[#333] rounded-2xl p-4 shadow-2xl flex items-center gap-3">
            <span className="text-2xl shrink-0">🔔</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white font-display">
                {pushPermission === 'denied' ? 'Notifications blocked' : 'Enable notifications'}
              </p>
              <p className="text-xs text-[#AAA] font-label mt-0.5">
                {pushPermission === 'denied'
                  ? 'Go to browser settings → Site settings → Notifications → Allow'
                  : 'Learn bit by bit everyday with 247chops notifications. Enable notification'}
              </p>
            </div>
            {pushPermission === 'default' && (
              <button
                onClick={handleEnableNotifications}
                className="shrink-0 bg-white text-[#111] rounded-xl px-4 py-2 text-xs font-bold font-label hover:bg-[#F0F0F0] active:scale-95 transition-all"
              >
                Enable
              </button>
            )}
          </div>
        </div>
      )}

      {patchesActive && patchKeyPoints.length > 0 && (
        <PatchesOverlay
          currentIdx={currentPatchIdx} total={patchKeyPoints.length}
          subject={patchKeyPoints[currentPatchIdx]?.subject}
          point={patchKeyPoints[currentPatchIdx]?.point}
          onNext={() => setCurrentPatchIdx((i) => (i + 1) % patchKeyPoints.length)}
          onDeactivate={handleDeactivatePatches}
        />
      )}

      {showAppeal && !appealResolved && (
        <AppealOverlay student={student} onAppealed={handleAppealed} />
      )}

      {showCardWarning && (
        <CardWarningPopup
          missedStreak={missedStreak}
          onDismiss={() => setShowCardWarning(false)}
        />
      )}

      {showPatchesModal && (
        <PatchesModal
          subjects={weakSubjects.length > 0 ? weakSubjects : student.subjects}
          selected={selectedPatchSubjects}
          onToggle={handleTogglePatchSubject}
          onConfirm={handleConfirmPatches}
          onCancel={() => setShowPatchesModal(false)}
        />
      )}

      <div className="max-w-md mx-auto px-4 pb-10">
        <div className="pt-8 pb-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.2em] font-label mb-0.5">Welcome back</p>
              <h2 className={`text-xl font-bold font-display leading-tight ${P.textColor}`}>{student.name}</h2>
              <div className="flex items-center gap-1.5 mt-1.5 mb-3">
                <span className="text-[10px] text-[#888] font-label">Consistency Rank</span>
                <span
                  title={rankData.nextRank ? `${rankData.toNext} session${rankData.toNext !== 1 ? 's' : ''} to ${rankData.nextRank}` : 'Max rank!'}
                  className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full font-label tracking-widest border ${RANK_BADGES[rankData.color]}`}
                >
                  <span className="text-[9px]">⚡</span>{rankData.rank}
                </span>
              </div>
              
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1.5">
                <button onClick={toggleTheme}
                  className="flex items-center gap-1.5 text-xs text-[#888] hover:text-[#111] border border-[#E5E5E5] bg-white rounded-xl px-2.5 py-2 font-label transition-colors shrink-0"
                >
                  <HugeiconsIcon icon={isDark ? Sun01Icon : Moon01Icon} size={14} color="currentColor" />
                  <span>{isDark ? 'Lightmode' : 'Darkmode'}</span>
                </button>
                <button onClick={() => { if (setStudent) setStudent(null); setView('home') }}
                  className="text-xs text-[#888] hover:text-[#111] border border-[#E5E5E5] bg-white rounded-xl px-3 py-2 font-label transition-colors shrink-0">Log out</button>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-4 h-6 rounded-[2px] transition-all duration-500 ${missedStreak >= CARD_YELLOW_1 ? 'bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.4)]' : 'bg-yellow-100'}`} />
                <div className={`w-4 h-6 rounded-[2px] transition-all duration-500 ${missedStreak >= CARD_YELLOW_2 ? 'bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.4)]' : 'bg-yellow-100'}`} />
                <div className={`w-4 h-6 rounded-[2px] transition-all duration-500 ${missedStreak >= CARD_RED ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]' : 'bg-red-100'}`} />
              </div>
            </div>
          </div>

          <MedalTrack weeklyMedals={weeklyMedals} currentWeekIdx={currentWeekIdx} />
        </div>

        <SubscriptionBanner student={student} onSubscribe={() => setView('subscribe')} />

        {allKeyPoints.length > 0 && !kpDismissed && !patchesActive && !isRedCard && (
          <KeyPointsCard point={allKeyPoints[keyPointIdx]} current={keyPointIdx} total={allKeyPoints.length} theme={P} onDismiss={() => setKpDismissed(true)} />
        )}

        <ScoreHero total={totalScore?.total} totalOut={totalScore?.totalOut} theme={P} onViewResults={() => setView('results')} />

        <TopicsList topics={thisWeekTopics} currentWeek={currentWeek} theme={P} />

        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-bold text-[#111] font-display">My Subjects</p>
            <p className="text-[11px] text-[#AAA] font-label">Tap to see topic performance</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {student.subjects.map((sub) => {
              const pct = getSubjectPct(sub)
              return (
                <SubjectCard key={sub} subject={sub} pct={pct} isWeak={pct === null || pct < 50} patchesActive={patchesActive}
                  onClick={() => { setSelectedSubjectDetail(sub); setView('subject-detail') }} />
              )
            })}
          </div>
        </div>

        <QuizCard
          currentWeek={currentWeek} quizTime={quizTime} quizDates={quizDates} timeLeft={timeLeft} theme={P}
          hasAttemptedAllSubjects={hasAttemptedAllSubjects} todaySubjectsAttempted={todaySubjectsAttempted}
          onStartQuiz={() => { if (isRedCard) { setView('subscribe'); return }; const access = getAccessStatus(student); if (access.status === 'expired') setView('subscribe'); else setView('quiz') }}
          onSubscribe={() => setView('subscribe')}
        />

        <div className="mb-4">
          {patchesActive ? (
            <button onClick={handleDeactivatePatches} className="w-full bg-red-700 text-white rounded-xl py-3.5 text-sm font-bold hover:bg-red-800 active:scale-[0.99] transition-all font-display">
              🔴 Deactivate Patches
            </button>
          ) : (
            <>
              <button onClick={patchesUnlocked ? handleOpenPatchesModal : undefined} disabled={!patchesUnlocked}
                className={`w-full rounded-xl py-3.5 text-sm font-bold transition-all font-display inline-flex items-center justify-center gap-1.5 ${patchesUnlocked ? 'bg-[#111] text-white hover:bg-[#222] active:scale-[0.99]' : 'bg-[#F3F3F2] text-[#CCC] cursor-not-allowed'}`}>
                <HugeiconsIcon icon={HeartAddIcon} size={16} color="currentColor" /> ACTIVATE MY PATCHES
              </button>
              {!patchesUnlocked && <p className="text-center text-[10px] text-[#CCC] font-label mt-1.5">Unlocks on June 21</p>}
            </>
          )}
        </div>

        <div className="flex gap-2">
          <button onMouseEnter={() => prefetch('student-scores', () => getStudentScores(student.id))} onClick={() => setView('results')} className="flex-1 bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm text-[#888] hover:text-[#111] hover:border-[#CCC] transition-colors font-label">My Results</button>
          <button onClick={() => setView('leaderboard')} className="flex-1 bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm text-[#888] hover:text-[#111] hover:border-[#CCC] transition-colors font-label">🏆 Leaderboard</button>
          <button onClick={() => setView('contact')} className="flex-1 bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm text-[#888] hover:text-[#111] hover:border-[#CCC] transition-colors font-label inline-flex items-center justify-center gap-1"><HugeiconsIcon icon={Mail01Icon} size={14} color="currentColor" /> Contact</button>
        </div>
      </div>
    </div>
    </>
  )
}
