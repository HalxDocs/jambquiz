import { useState, useEffect, useRef } from 'react'
import {
  listenActiveWeek, listenScores, getTopics, normalizeTopic,
  getAccessStatus, getConsistencyRank, listenQuizDates, WEEKS,
} from '../store/useStore'
import { notificationScheduler } from '../services/notificationSchedular'
import { registerPushNotifications, sendLocalNotification, savePushSubscriptionToFirestore, saveNotificationStateToFirestore } from '../services/pushNotifications'
import { useUserNotificationStore } from '../store/notificationStore'
import { db, collection, onSnapshot } from '../firebase'
import KeyPointNotification from '../components/notifications/KeyPointNotification'
import RankToast from '../components/dashboard/RankToast'
import PatchesOverlay from '../components/dashboard/PatchesOverlay'
import PatchesModal from '../components/dashboard/PatchesModal'
import MedalTrack from '../components/dashboard/MedalTrack'
import SubscriptionBanner from '../components/dashboard/SubscriptionBanner'
import KeyPointsCard from '../components/dashboard/KeyPointsCard'
import ScoreHero from '../components/dashboard/ScoreHero'
import TopicsList from '../components/dashboard/TopicsList'
import SubjectCard from '../components/dashboard/SubjectCard'
import QuizCard from '../components/dashboard/QuizCard'

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

export default function Dashboard({ student, setView, setStudent, setSelectedSubjectDetail }) {
  const [quizDates, setQuizDates] = useState(null)
  const [quizTime, setQuizTime] = useState(false)
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, mins: 0 })
  const [scores, setScores] = useState([])
  const [currentWeek, setCurrentWeek] = useState('Week 1')
  const [weekTopics, setWeekTopics] = useState({})
  const [rankUpToast, setRankUpToast] = useState(null)
  const prevRankRef = useRef(null)
  const firstLoadRef = useRef(true)

  const [patchesActive, setPatchesActive] = useState(() => localStorage.getItem('patches_active') === '1')
  const [currentPatchIdx, setCurrentPatchIdx] = useState(0)
  const [showPatchesModal, setShowPatchesModal] = useState(false)
  const [selectedPatchSubjects, setSelectedPatchSubjectsLocal] = useState([])

  const [keyPointIdx, setKeyPointIdx] = useState(0)
  const [kpDismissed, setKpDismissed] = useState(false)

  const [notificationPoint, setNotificationPoint] = useState(null)
  const notificationActiveRef = useRef(false)

  const [broadcast, setBroadcast] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'admin_broadcasts'), (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data()
          const lastSeen = localStorage.getItem('last_broadcast_id')
          if (data.message && data.title && change.doc.id !== lastSeen) {
            setBroadcast({ id: change.doc.id, title: data.title, message: data.message })
          }
        }
      })
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsubDates = listenQuizDates((dates) => { setQuizDates(dates); setQuizTime(isQuizTime(dates)); setTimeLeft(getTimeUntilQuiz(dates)) })
    const t = setInterval(() => { setQuizDates((prev) => { setQuizTime(isQuizTime(prev)); setTimeLeft(getTimeUntilQuiz(prev)); return prev }) }, 10000)
    const unsubWeek = listenActiveWeek((week) => setCurrentWeek(week))
    const unsubScores = listenScores((allScores) => {
      const mine = allScores.filter((s) => s.studentId === student.id).sort((a, b) => new Date(b.date) - new Date(a.date))
      setScores(mine)
      const { rank } = getConsistencyRank(mine)
      if (firstLoadRef.current) { prevRankRef.current = rank; firstLoadRef.current = false }
      else if (prevRankRef.current && rank !== prevRankRef.current) { setRankUpToast(rank); prevRankRef.current = rank; setTimeout(() => setRankUpToast(null), 5000) }
    })
    return () => { clearInterval(t); unsubWeek(); unsubScores(); unsubDates() }
  }, [student])

  useEffect(() => { getTopics(currentWeek).then((t) => setWeekTopics(t || {})); setKpDismissed(false); setKeyPointIdx(0) }, [currentWeek])

  useEffect(() => {
    const access = getAccessStatus(student)
    if (access.status === 'expired') { notificationScheduler.stop(); return }
    registerPushNotifications().then((sub) => { if (sub) { useUserNotificationStore.getState().setPushSubscription(sub); useUserNotificationStore.getState().setPushPermission('granted'); savePushSubscriptionToFirestore(student.id, sub) } })
    notificationScheduler.start(currentWeek, student.subjects, scores, student.id)
    const unsub = notificationScheduler.onNotification((point) => { if (document.visibilityState === 'visible') { setNotificationPoint(point); notificationActiveRef.current = true }; sendLocalNotification(point) })
    return () => { notificationScheduler.stop(); unsub() }
  }, [currentWeek, student.subjects, scores, patchesActive])

  useEffect(() => { useUserNotificationStore.getState().setPatchesActive(patchesActive) }, [patchesActive])

  const currentWeekIdx = WEEKS.indexOf(currentWeek)
  const rankData = getConsistencyRank(scores)
  const weeklyMedals = WEEKS.map((week) => {
    const ws = scores.filter((s) => s.week === week)
    if (!ws.length) return null
    const bySubject = {}
    ws.forEach((s) => { if (!bySubject[s.subject] || s.score > bySubject[s.subject]) bySubject[s.subject] = s.score })
    const total = Object.values(bySubject).reduce((a, b) => a + b, 0)
    return total >= 280 ? '🥇' : total >= 200 ? '🥈' : '🥉'
  })

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
  const patchKeyPoints = weakSubjects.flatMap((sub) => { const topic = normalizeTopic(weekTopics[sub]); if (!topic?.keyPoints) return []; return topic.keyPoints.filter((kp) => kp?.trim()).map((kp) => ({ subject: sub, point: kp })) })

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
    notificationScheduler.start(currentWeek, student.subjects, scores, student.id)
  }
  const handleTogglePatchSubject = (sub) => setSelectedPatchSubjectsLocal((prev) => prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub])
  const handleDeactivatePatches = () => {
    setPatchesActive(false); localStorage.removeItem('patches_active'); localStorage.removeItem('patches_selected_subjects')
    useUserNotificationStore.getState().setPatchesActive(false); useUserNotificationStore.getState().setSelectedPatchSubjects([])
    saveNotificationStateToFirestore(student.id, { patchesActive: false, selectedPatchSubjects: [], seenPoints: useUserNotificationStore.getState().seenPoints, currentCycleIndex: useUserNotificationStore.getState().currentCycleIndex, lastNotifiedAt: useUserNotificationStore.getState().lastNotifiedAt })
    notificationScheduler.start(currentWeek, student.subjects, scores, student.id)
  }

  const P = patchesActive ? { bg: 'bg-red-700', hoverBg: 'hover:bg-red-800', textColor: 'text-red-700' } : { bg: 'bg-[#111]', hoverBg: 'hover:bg-[#222]', textColor: 'text-[#111]' }
  const isValentine = (() => { const d = new Date(); return d.getMonth() === 1 && d.getDate() === 14 })()

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <RankToast rank={rankUpToast} onDismiss={() => setRankUpToast(null)} />

      {notificationPoint && notificationActiveRef.current && (
        <KeyPointNotification point={notificationPoint} patchesActive={patchesActive} onDismiss={() => { notificationActiveRef.current = false; setNotificationPoint(null) }} />
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
            <button onClick={() => { if (setStudent) setStudent(null); setView('home') }}
              className="text-xs text-[#888] hover:text-[#111] border border-[#E5E5E5] bg-white rounded-xl px-3 py-2 font-label transition-colors shrink-0 ml-2">Log out</button>
          </div>
          <MedalTrack weeklyMedals={weeklyMedals} currentWeekIdx={currentWeekIdx} />
        </div>

        <SubscriptionBanner student={student} onSubscribe={() => setView('subscribe')} />

        {allKeyPoints.length > 0 && !kpDismissed && !patchesActive && (
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
          onStartQuiz={() => { const access = getAccessStatus(student); if (access.status === 'expired') setView('subscribe'); else setView('quiz') }}
          onSubscribe={() => setView('subscribe')}
        />

        <div className="mb-4">
          {patchesActive ? (
            <button onClick={handleDeactivatePatches} className="w-full bg-red-700 text-white rounded-xl py-3.5 text-sm font-bold hover:bg-red-800 active:scale-[0.99] transition-all font-display">
              🔴 Deactivate Patches
            </button>
          ) : (
            <>
              <button onClick={isValentine ? handleOpenPatchesModal : undefined} disabled={!isValentine}
                className={`w-full rounded-xl py-3.5 text-sm font-bold transition-all font-display ${isValentine ? 'bg-[#111] text-white hover:bg-[#222] active:scale-[0.99]' : 'bg-[#F3F3F2] text-[#CCC] cursor-not-allowed'}`}>
                ❤️ ACTIVATE MY PATCHES
              </button>
              {!isValentine && <p className="text-center text-[10px] text-[#CCC] font-label mt-1.5">Unlocks on February 14 only</p>}
            </>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={() => setView('results')} className="flex-1 bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm text-[#888] hover:text-[#111] hover:border-[#CCC] transition-colors font-label">My Results</button>
          <button onClick={() => setView('leaderboard')} className="flex-1 bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm text-[#888] hover:text-[#111] hover:border-[#CCC] transition-colors font-label">🏆 Leaderboard</button>
        </div>
      </div>
    </div>
  )
}
