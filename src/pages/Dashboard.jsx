// src/pages/Dashboard.jsx
import { useState, useEffect, useRef } from 'react'
import {
  listenActiveWeek,
  listenScores,
  getTopics,
  normalizeTopic,
  getAccessStatus,
  getConsistencyRank,
  listenQuizDates,
  WEEKS,
} from '../store/useStore'
import { notificationScheduler } from '../services/notificationSchedular'
import { registerPushNotifications, sendLocalNotification } from '../services/pushNotifications'
import { useUserNotificationStore } from '../store/notificationStore'
import KeyPointNotification from '../components/KeyPointNotification'

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
    const upcoming = [quizDates.date1, quizDates.date2]
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .filter((t) => t > now)
      .sort((a, b) => a - b)
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

  // Patches (ACTIVATE MY PATCHES)
  const [patchesActive, setPatchesActive] = useState(() => localStorage.getItem('patches_active') === '1')
  const [currentPatchIdx, setCurrentPatchIdx] = useState(0)

  // Key points notification (auto-cycling embedded card)
  const [keyPointIdx, setKeyPointIdx] = useState(0)
  const [kpDismissed, setKpDismissed] = useState(false)

  // Push notification pop-in state
  const [notificationPoint, setNotificationPoint] = useState(null)
  const notificationActiveRef = useRef(false)

  // ──────────────────────────────────────────────
  // Core data subscriptions
  // ──────────────────────────────────────────────
  useEffect(() => {
    const unsubDates = listenQuizDates((dates) => {
      setQuizDates(dates)
      setQuizTime(isQuizTime(dates))
      setTimeLeft(getTimeUntilQuiz(dates))
    })
    const t = setInterval(() => {
      setQuizDates((prev) => {
        setQuizTime(isQuizTime(prev))
        setTimeLeft(getTimeUntilQuiz(prev))
        return prev
      })
    }, 10000)
    const unsubWeek = listenActiveWeek((week) => setCurrentWeek(week))
    const unsubScores = listenScores((allScores) => {
      const mine = allScores
        .filter((s) => s.studentId === student.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      setScores(mine)
      const { rank } = getConsistencyRank(mine)
      if (firstLoadRef.current) {
        prevRankRef.current = rank
        firstLoadRef.current = false
      } else if (prevRankRef.current && rank !== prevRankRef.current) {
        setRankUpToast(rank)
        prevRankRef.current = rank
        setTimeout(() => setRankUpToast(null), 5000)
      }
    })
    return () => {
      clearInterval(t)
      unsubWeek()
      unsubScores()
      unsubDates()
    }
  }, [student])

  useEffect(() => {
    getTopics(currentWeek).then((t) => setWeekTopics(t || {}))
    setKpDismissed(false)
    setKeyPointIdx(0)
  }, [currentWeek])

  // ──────────────────────────────────────────────
  // Notification scheduler — push + in-app pop-in
  // ──────────────────────────────────────────────
  useEffect(() => {
    const access = getAccessStatus(student)
    if (access.status === 'expired') {
      notificationScheduler.stop()
      return
    }

    // Register push notifications on mount
    registerPushNotifications().then((sub) => {
      if (sub) {
        useUserNotificationStore.getState().setPushSubscription(sub)
        useUserNotificationStore.getState().setPushPermission('granted')
      }
    })

    // Start the 2-hour notification cycle
    notificationScheduler.start(currentWeek, student.subjects, scores)

    // Listen for notification events from the scheduler
    const unsub = notificationScheduler.onNotification((point) => {
      // If app is in foreground, show the animated pop-in
      if (document.visibilityState === 'visible') {
        setNotificationPoint(point)
        notificationActiveRef.current = true
      }
      // Always attempt local notification (service worker handles background)
      sendLocalNotification(point)
    })

    return () => {
      notificationScheduler.stop()
      unsub()
    }
  }, [currentWeek, student.subjects, scores])

  // Sync patches state with notification store
  useEffect(() => {
    useUserNotificationStore.getState().setPatchesActive(patchesActive)
  }, [patchesActive])

  // ──────────────────────────────────────────────
  // Derived data
  // ──────────────────────────────────────────────
  const todaySubjectsAttempted = scores
    .filter(
      (s) =>
        s.week === currentWeek &&
        new Date(s.date).toDateString() === new Date().toDateString()
    )
    .map((s) => s.subject)

  const hasAttemptedAllSubjects =
    student.subjects.length > 0 &&
    student.subjects.every((sub) => todaySubjectsAttempted.includes(sub))

  const getBestBySubject = () => {
    const best = {}
    scores.forEach((s) => {
      if (!best[s.subject] || s.score > best[s.subject].score) best[s.subject] = s
    })
    return best
  }

  const getTotalScore = () => {
    const best = getBestBySubject()
    const subjects = Object.values(best)
    if (subjects.length < 4) return null
    const top4 = subjects.slice(0, 4)
    return {
      total: top4.reduce((a, s) => a + s.score, 0),
      totalOut: top4.reduce((a, s) => a + (s.outOf || 100), 0),
    }
  }

  const getSubjectScore = (sub) => getBestBySubject()[sub] || null

  const getSubjectPct = (sub) => {
    const sc = getSubjectScore(sub)
    if (!sc) return null
    return Math.round((sc.score / (sc.outOf || 100)) * 100)
  }

  const totalScore = getTotalScore()

  const thisWeekTopics = student.subjects
    .map((sub) => ({ subject: sub, topic: normalizeTopic(weekTopics[sub]) }))
    .filter((t) => t.topic && t.topic.name)

  // All key points for current week topics (for embedded notification card)
  const allKeyPoints = student.subjects.flatMap((sub) => {
    const topic = normalizeTopic(weekTopics[sub])
    if (!topic?.keyPoints) return []
    return topic.keyPoints
      .filter((kp) => kp?.trim())
      .map((kp) => ({ subject: sub, point: kp }))
  })

  // Weak subjects: no score or < 50%
  const weakSubjects = student.subjects.filter((sub) => {
    const pct = getSubjectPct(sub)
    return pct === null || pct < 50
  })

  // Key points for weak subjects (patches mode)
  const patchKeyPoints = weakSubjects.flatMap((sub) => {
    const topic = normalizeTopic(weekTopics[sub])
    if (!topic?.keyPoints) return []
    return topic.keyPoints
      .filter((kp) => kp?.trim())
      .map((kp) => ({ subject: sub, point: kp }))
  })

  // Auto-cycle embedded key points notification card
  useEffect(() => {
    if (!allKeyPoints.length || kpDismissed) return
    const t = setInterval(() => setKeyPointIdx((i) => (i + 1) % allKeyPoints.length), 5000)
    return () => clearInterval(t)
  }, [allKeyPoints.length, kpDismissed])

  // Auto-cycle patches overlay
  useEffect(() => {
    if (!patchesActive || !patchKeyPoints.length) return
    const t = setInterval(() => setCurrentPatchIdx((i) => (i + 1) % patchKeyPoints.length), 6000)
    return () => clearInterval(t)
  }, [patchesActive, patchKeyPoints.length])

  const handleActivatePatches = () => {
    setPatchesActive(true)
    localStorage.setItem('patches_active', '1')
    setCurrentPatchIdx(0)
  }

  const handleDeactivatePatches = () => {
    setPatchesActive(false)
    localStorage.removeItem('patches_active')
  }

  // Theme based on patches mode
  const P = patchesActive
    ? { bg: 'bg-red-700', hoverBg: 'hover:bg-red-800', textColor: 'text-red-700' }
    : { bg: 'bg-[#111]', hoverBg: 'hover:bg-[#222]', textColor: 'text-[#111]' }

  const isValentine = (() => {
    const d = new Date()
    return d.getMonth() === 1 && d.getDate() === 14
  })()

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      {/* ──────────────────────────────────────── */}
      {/* Rank-up toast                             */}
      {/* ──────────────────────────────────────── */}
      {rankUpToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
          <div className="bg-[#111] text-white rounded-2xl shadow-xl px-5 py-4 flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div className="flex-1">
              <p className="text-sm font-bold font-display">Rank Up!</p>
              <p className="text-xs text-[#888] font-label mt-0.5">
                Consistency Rank:{' '}
                <span className="text-white font-semibold">{rankUpToast}</span>
              </p>
            </div>
            <button
              onClick={() => setRankUpToast(null)}
              className="text-[#666] hover:text-white text-lg leading-none transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────── */}
      {/* Push notification pop-in (from scheduler) */}
      {/* ──────────────────────────────────────── */}
      {notificationPoint && notificationActiveRef.current && (
        <KeyPointNotification
          point={notificationPoint}
          patchesActive={patchesActive}
          onDismiss={() => {
            notificationActiveRef.current = false
            setNotificationPoint(null)
          }}
        />
      )}

      {/* ──────────────────────────────────────── */}
      {/* Patches overlay                           */}
      {/* ──────────────────────────────────────── */}
      {patchesActive && patchKeyPoints.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-4 pointer-events-none">
          <div className="max-w-md mx-auto bg-red-700 text-white rounded-2xl p-5 shadow-2xl pointer-events-auto">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-[10px] font-bold text-red-300 uppercase tracking-widest font-label">
                  Key Point {currentPatchIdx + 1}/{patchKeyPoints.length}
                </p>
                <p className="text-[11px] font-semibold text-red-200 font-label mt-0.5">
                  {patchKeyPoints[currentPatchIdx]?.subject}
                </p>
              </div>
              <button
                onClick={() => setCurrentPatchIdx((i) => (i + 1) % patchKeyPoints.length)}
                className="text-red-300 hover:text-white text-xs font-bold font-label transition-colors"
              >
                Next →
              </button>
            </div>
            <p className="text-sm font-semibold leading-relaxed font-body mb-4">
              {patchKeyPoints[currentPatchIdx]?.point}
            </p>
            <button
              onClick={handleDeactivatePatches}
              className="w-full bg-red-900 text-red-300 rounded-xl py-2.5 text-xs font-bold font-label hover:bg-red-950 transition-colors"
            >
              Deactivate Patches
            </button>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto px-4 pb-10">
        {/* ────────────────────────────────────── */}
        {/* Top bar                                 */}
        {/* ────────────────────────────────────── */}
        <div className="flex justify-between items-start pt-8 pb-5">
          <div>
            <p className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.2em] font-label mb-0.5">
              Welcome back
            </p>
            <h2 className={`text-xl font-bold font-display leading-tight ${P.textColor}`}>
              {student.name}
            </h2>
            {(() => {
              const r = getConsistencyRank(scores)
              const badge = {
                gray: 'bg-[#1C1C1C] text-[#AAA] border-[#333]',
                yellow: 'bg-yellow-950 text-yellow-300 border-yellow-800',
                blue: 'bg-blue-950 text-blue-300 border-blue-800',
                purple: 'bg-purple-950 text-purple-300 border-purple-800',
                green: 'bg-green-950 text-green-300 border-green-800',
              }
              const currentWeekIdx = WEEKS.indexOf(currentWeek)
              const weeklyMedals = WEEKS.map((week) => {
                const ws = scores.filter((s) => s.week === week)
                if (!ws.length) return null
                const bySubject = {}
                ws.forEach((s) => {
                  if (!bySubject[s.subject] || s.score > bySubject[s.subject])
                    bySubject[s.subject] = s.score
                })
                const total = Object.values(bySubject).reduce((a, b) => a + b, 0)
                return total >= 280 ? '🥇' : total >= 200 ? '🥈' : '🥉'
              })
              return (
                <div className="mt-1.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] text-[#888] font-label">Consistency Rank</span>
                    <span
                      title={
                        r.nextRank
                          ? `${r.toNext} session${r.toNext !== 1 ? 's' : ''} to ${r.nextRank}`
                          : 'Max rank!'
                      }
                      className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full font-label tracking-widest border ${badge[r.color]}`}
                    >
                      <span className="text-[9px]">⚡</span>
                      {r.rank}
                    </span>
                  </div>
                  {/* 26-week medal track */}
                  <div className="space-y-2 mt-2">
                    {[WEEKS.slice(0, 9), WEEKS.slice(9, 18), WEEKS.slice(18)].map((row, rowIdx) => (
                      <div key={rowIdx} className="flex gap-0.5 sm:gap-1">
                        {row.map((week, i) => {
                          const idx = rowIdx * 9 + i
                          const medal = weeklyMedals[idx]
                          const isPast = idx < currentWeekIdx
                          const isCurrent = idx === currentWeekIdx

                          return (
                            <div
                              key={week}
                              title={`${week}${medal ? ` — ${medal}` : isPast ? ' — Missed' : ''}`}
                              className={`flex-1 flex flex-col items-center min-w-0 ${
                                medal || isCurrent ? '' : isPast ? 'opacity-40' : 'opacity-15'
                              }`}
                            >
                              <span className="text-[7px] text-[#666] font-label mb-0.5 hidden sm:block">
                                {week.replace('Week ', '')}
                              </span>

                              <div
                                className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-sm sm:text-base ${
                                  medal
                                    ? 'border-2 border-opacity-50'
                                    : isCurrent
                                    ? 'bg-[#2A2A2A] border border-[#555]'
                                    : 'bg-[#222] border border-[#333]'
                                } ${
                                  medal === '🥇'
                                    ? 'bg-yellow-400/30 border-yellow-400'
                                    : medal === '🥈'
                                    ? 'bg-gray-300/30 border-gray-400'
                                    : medal === '🥉'
                                    ? 'bg-amber-600/30 border-amber-500'
                                    : ''
                                }`}
                              >
                                {medal && <span>{medal}</span>}
                                {!medal && isPast && (
                                  <span className="text-[8px] text-[#555]">●</span>
                                )}
                              </div>

                              <div
                                className={`w-full max-w-[24px] sm:max-w-[28px] h-1 rounded-sm mt-0.5 ${
                                  medal === '🥇'
                                    ? 'bg-yellow-500'
                                    : medal === '🥈'
                                    ? 'bg-gray-400'
                                    : medal === '🥉'
                                    ? 'bg-amber-700'
                                    : isCurrent
                                    ? 'bg-[#555]'
                                    : 'bg-[#333]'
                                }`}
                              />
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
          <button
            onClick={() => {
              if (setStudent) setStudent(null)
              setView('home')
            }}
            className="text-xs text-[#888] hover:text-[#111] border border-[#E5E5E5] bg-white rounded-xl px-3 py-2 font-label transition-colors"
          >
            Log out
          </button>
        </div>

        {/* ────────────────────────────────────── */}
        {/* Subscription banner                     */}
        {/* ────────────────────────────────────── */}
        {(() => {
          const access = getAccessStatus(student)
          if (access.status === 'active' && access.daysLeft > 7) return null
          const styles = {
            trial: {
              bg: 'bg-yellow-50',
              border: 'border-yellow-100',
              text: 'text-yellow-800',
              label: `Free trial · ${access.daysLeft} day${access.daysLeft !== 1 ? 's' : ''} left`,
            },
            active: {
              bg: 'bg-blue-50',
              border: 'border-blue-100',
              text: 'text-blue-800',
              label: `Subscription expires in ${access.daysLeft} day${access.daysLeft !== 1 ? 's' : ''}`,
            },
            expired: {
              bg: 'bg-red-50',
              border: 'border-red-100',
              text: 'text-red-700',
              label: 'Access expired — renew to continue',
            },
          }[access.status]
          return (
            <button
              onClick={() => setView('subscribe')}
              className={`w-full text-left ${styles.bg} ${styles.border} border rounded-xl px-4 py-3 mb-4 flex items-center justify-between hover:opacity-90 transition-opacity`}
            >
              <div>
                <p className={`text-xs font-bold ${styles.text} font-display`}>{styles.label}</p>
                <p className="text-[10px] text-[#888] font-label mt-0.5">
                  {access.status === 'expired'
                    ? 'Tap to subscribe (₦800/month)'
                    : 'Tap to manage subscription'}
                </p>
              </div>
              <span className={`text-xs font-bold ${styles.text} font-label`}>→</span>
            </button>
          )
        })()}

        {/* ────────────────────────────────────── */}
        {/* Key points notification card (embedded) */}
        {/* ────────────────────────────────────── */}
        {allKeyPoints.length > 0 && !kpDismissed && !patchesActive && (
          <div className={`${P.bg} text-white rounded-2xl p-4 mb-4 flex items-start gap-3`}>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest font-label mb-0.5">
                Study Point · {allKeyPoints[keyPointIdx]?.subject}
              </p>
              <p className="text-sm font-semibold font-body leading-snug">
                {allKeyPoints[keyPointIdx]?.point}
              </p>
              {allKeyPoints.length > 1 && (
                <p className="text-[10px] text-white/40 font-label mt-1">
                  {keyPointIdx + 1} / {allKeyPoints.length}
                </p>
              )}
            </div>
            <button
              onClick={() => setKpDismissed(true)}
              className="text-white/40 hover:text-white text-lg leading-none shrink-0 transition-colors"
            >
              ×
            </button>
          </div>
        )}

        {/* ────────────────────────────────────── */}
        {/* Total Score                             */}
        {/* ────────────────────────────────────── */}
        {totalScore !== null && (
          <div className={`${P.bg} text-white rounded-2xl p-5 mb-4`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.2em] font-label mb-1">
                  Total Score
                </p>
                <div className="flex items-end gap-1.5">
                  <span className="text-4xl font-bold font-display">{totalScore.total}</span>
                  <span className="text-white/40 text-sm mb-1 font-label">
                    / {totalScore.totalOut}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setView('results')}
                className="text-[11px] font-semibold text-white/40 hover:text-white transition-colors font-label mt-1"
              >
                View →
              </button>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1.5 mt-4">
              <div
                className="bg-white h-1.5 rounded-full transition-all"
                style={{
                  width: `${Math.min((totalScore.total / totalScore.totalOut) * 100, 100)}%`,
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <p className="text-[10px] text-white/30 font-label">
                {Math.round((totalScore.total / totalScore.totalOut) * 100)}%
              </p>
              <p
                className={`text-[10px] font-semibold font-label ${
                  totalScore.total >= 250
                    ? 'text-green-400'
                    : totalScore.total >= 180
                    ? 'text-yellow-400'
                    : 'text-red-400'
                }`}
              >
                {totalScore.total >= 250
                  ? 'Strong'
                  : totalScore.total >= 180
                  ? 'Average'
                  : 'Needs work'}
              </p>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────── */}
        {/* This week's topics                      */}
        {/* ────────────────────────────────────── */}
        {thisWeekTopics.length > 0 && (
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="text-sm font-bold text-[#111] font-display">Topics to Study</p>
                <p className="text-[11px] text-[#AAA] font-label mt-0.5">
                  {currentWeek} · Prepare before the quiz
                </p>
              </div>
              <span
                className={`text-[10px] font-bold ${P.bg} text-white px-2.5 py-1 rounded-full font-label`}
              >
                {currentWeek}
              </span>
            </div>
            <div className="space-y-2">
              {thisWeekTopics.map(({ subject, topic }) => (
                <div
                  key={subject}
                  className="flex items-center gap-3 py-2 border-b border-[#F3F3F2] last:border-0"
                >
                  <div className={`w-1.5 h-1.5 ${P.bg} rounded-full shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-[#888] uppercase tracking-wide font-label leading-none mb-0.5">
                      {subject}
                    </p>
                    <p className="text-sm font-semibold text-[#111] font-body">{topic.name}</p>
                  </div>
                  {topic.video && (
                    <a
                      href={topic.video}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg font-label hover:bg-red-100 transition-colors"
                    >
                      ▶ Watch
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ────────────────────────────────────── */}
        {/* My Subjects                             */}
        {/* ────────────────────────────────────── */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-bold text-[#111] font-display">My Subjects</p>
            <p className="text-[11px] text-[#AAA] font-label">Tap to see topic performance</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {student.subjects.map((sub) => {
              const pct = getSubjectPct(sub)
              const isWeak = pct === null || pct < 50
              return (
                <button
                  key={sub}
                  onClick={() => {
                    setSelectedSubjectDetail(sub)
                    setView('subject-detail')
                  }}
                  className={`bg-white border rounded-xl p-3.5 text-left hover:shadow-sm active:scale-[0.98] transition-all group ${
                    patchesActive && isWeak
                      ? 'border-red-200'
                      : 'border-[#EBEBEB] hover:border-[#111]'
                  }`}
                >
                  <p className="text-[10px] font-semibold text-[#AAA] uppercase tracking-wide font-label mb-1">
                    Subject
                  </p>
                  <p className="text-xs font-bold text-[#111] leading-snug font-body mb-2">{sub}</p>
                  {pct !== null ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p
                          className={`text-xs font-bold font-label ${
                            pct >= 70
                              ? 'text-green-600'
                              : pct >= 50
                              ? 'text-yellow-600'
                              : 'text-red-500'
                          }`}
                        >
                          {pct}%
                        </p>
                        <p className="text-[10px] text-[#CCC] font-label group-hover:text-[#111] transition-colors">
                          →
                        </p>
                      </div>
                      <div className="w-full bg-[#F3F3F2] rounded-full h-1">
                        <div
                          className={`h-1 rounded-full ${
                            pct >= 70
                              ? 'bg-green-500'
                              : pct >= 50
                              ? 'bg-yellow-500'
                              : 'bg-red-400'
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-[#CCC] font-label">No test yet → </p>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ────────────────────────────────────── */}
        {/* Quiz status                             */}
        {/* ────────────────────────────────────── */}
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm font-bold text-[#111] font-display">This Week's Quiz</p>
            <span className="text-[11px] font-semibold text-[#888] bg-[#F3F3F2] px-2.5 py-1 rounded-lg font-label">
              {currentWeek}
            </span>
          </div>

          {quizTime ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <p className="text-sm font-bold text-green-700 font-display">Quiz is LIVE now</p>
              </div>
              <p className="text-xs text-[#888] mb-4 font-label">
                Login closes at end of window · 1 hour once started
              </p>
              {hasAttemptedAllSubjects ? (
                <div className="bg-[#F3F3F2] rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-[#111] font-display mb-0.5">All done!</p>
                  <p className="text-xs text-[#888] font-label">
                    You've completed all subjects this week
                  </p>
                </div>
              ) : (
                <>
                  {todaySubjectsAttempted.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {todaySubjectsAttempted.map((s) => (
                        <span
                          key={s}
                          className={`text-[10px] font-semibold ${P.bg} text-white px-2 py-0.5 rounded-full font-label`}
                        >
                          ✓ {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      const access = getAccessStatus(student)
                      if (access.status === 'expired') {
                        setView('subscribe')
                        return
                      }
                      setView('quiz')
                    }}
                    className={`w-full ${P.bg} text-white rounded-xl py-3.5 text-sm font-bold ${P.hoverBg} active:scale-[0.99] transition-all font-display`}
                  >
                    {todaySubjectsAttempted.length > 0
                      ? `Continue Quiz (${4 - todaySubjectsAttempted.length} left) →`
                      : 'Start Quiz →'}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs text-[#888] mb-2 font-label">Next quiz in</p>
              <div className="flex gap-3 mb-3">
                {timeLeft.days > 0 && (
                  <div>
                    <span className="text-2xl font-bold text-[#111] font-display">
                      {timeLeft.days}
                    </span>
                    <span className="text-xs text-[#AAA] ml-1 font-label">d</span>
                  </div>
                )}
                <div>
                  <span className="text-2xl font-bold text-[#111] font-display">
                    {timeLeft.hours}
                  </span>
                  <span className="text-xs text-[#AAA] ml-1 font-label">hr</span>
                </div>
                <div>
                  <span className="text-2xl font-bold text-[#111] font-display">
                    {timeLeft.mins}
                  </span>
                  <span className="text-xs text-[#AAA] ml-1 font-label">min</span>
                </div>
              </div>
              <p className="text-[11px] text-[#CCC] font-label">
                {quizDates?.date1 || quizDates?.date2
                  ? [quizDates.date1, quizDates.date2]
                      .filter(Boolean)
                      .map((d) =>
                        new Date(d).toLocaleString('en-NG', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      )
                      .join(' & ')
                  : 'Fri & Sat · 5:00 pm – 6:00 pm login window'}
              </p>
            </div>
          )}
        </div>

        {/* ────────────────────────────────────── */}
        {/* ACTIVATE MY PATCHES                     */}
        {/* ────────────────────────────────────── */}
        <div className="mb-4">
          {patchesActive ? (
            <button
              onClick={handleDeactivatePatches}
              className="w-full bg-red-700 text-white rounded-xl py-3.5 text-sm font-bold hover:bg-red-800 active:scale-[0.99] transition-all font-display"
            >
              🔴 Deactivate Patches
            </button>
          ) : (
            <>
              <button
                onClick={isValentine ? handleActivatePatches : undefined}
                disabled={!isValentine}
                className={`w-full rounded-xl py-3.5 text-sm font-bold transition-all font-display ${
                  isValentine
                    ? 'bg-[#111] text-white hover:bg-[#222] active:scale-[0.99]'
                    : 'bg-[#F3F3F2] text-[#CCC] cursor-not-allowed'
                }`}
              >
                ❤️ ACTIVATE MY PATCHES
              </button>
              {!isValentine && (
                <p className="text-center text-[10px] text-[#CCC] font-label mt-1.5">
                  Unlocks on February 14 only
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setView('results')}
            className="flex-1 bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm text-[#888] hover:text-[#111] hover:border-[#CCC] transition-colors font-label"
          >
            My Results
          </button>
          <button
            onClick={() => setView('leaderboard')}
            className="flex-1 bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm text-[#888] hover:text-[#111] hover:border-[#CCC] transition-colors font-label"
          >
            🏆 Leaderboard
          </button>
        </div>
      </div>
    </div>
  )
}