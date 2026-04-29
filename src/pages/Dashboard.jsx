import { useState, useEffect } from 'react'
import { listenActiveWeek, listenScores, getTopics, normalizeTopic, getAccessStatus, getConsistencyRank } from '../store/useStore'

function isQuizTime() {
  const now = new Date()
  const day = now.getDay()
  const h = now.getHours()
  const m = now.getMinutes()
  const mins = h * 60 + m
  return (day === 5 || day === 6) && mins >= 17 * 60 && mins < 19 * 60
}

function getTimeUntilQuiz() {
  const now = new Date()
  const day = now.getDay()
  const h = now.getHours()
  // Next quiz day is Friday OR Saturday — pick whichever comes first
  let daysUntil
  if ((day === 5 || day === 6) && h < 17) daysUntil = 0
  else if (day === 5 && h >= 17) daysUntil = 1 // already Fri quiz time over → Sat tomorrow
  else daysUntil = (5 - day + 7) % 7 || 7
  const target = new Date(now)
  target.setDate(now.getDate() + daysUntil)
  target.setHours(17, 0, 0, 0)
  const diff = target - now
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  return { days, hours, mins }
}

export default function Dashboard({ student, setView, setStudent, setSelectedSubjectDetail }) {
  const [quizTime, setQuizTime] = useState(isQuizTime())
  const [timeLeft, setTimeLeft] = useState(getTimeUntilQuiz())
  const [scores, setScores] = useState([])
  const [currentWeek, setCurrentWeek] = useState('Week 1')
  const [weekTopics, setWeekTopics] = useState({})

  useEffect(() => {
    const t = setInterval(() => {
      setQuizTime(isQuizTime())
      setTimeLeft(getTimeUntilQuiz())
    }, 10000)
    const unsubWeek = listenActiveWeek((week) => setCurrentWeek(week))
    const unsubScores = listenScores((allScores) => {
      const mine = allScores
        .filter((s) => s.studentId === student.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      setScores(mine)
    })
    return () => { clearInterval(t); unsubWeek(); unsubScores() }
  }, [student])

  // Re-fetch topics whenever the active week changes
  useEffect(() => {
    getTopics(currentWeek).then((t) => setWeekTopics(t || {}))
  }, [currentWeek])

  const todaySubjectsAttempted = scores
    .filter(
      (s) => s.week === currentWeek &&
      new Date(s.date).toDateString() === new Date().toDateString()
    )
    .map((s) => s.subject)

  const hasAttemptedAllSubjects =
    student.subjects.length > 0 &&
    student.subjects.every((sub) => todaySubjectsAttempted.includes(sub))

  // Highest score per subject — best attempt counts
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
    const outOf = sc.outOf || 100
    return Math.round((sc.score / outOf) * 100)
  }

  const totalScore = getTotalScore()

  // Topics for this week filtered to student's subjects (normalized to {name, video})
  const thisWeekTopics = student.subjects
    .map((sub) => ({ subject: sub, topic: normalizeTopic(weekTopics[sub]) }))
    .filter((t) => t.topic && t.topic.name)

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="max-w-md mx-auto px-4 pb-10">

        {/* Top bar */}
        <div className="flex justify-between items-start pt-8 pb-5">
          <div>
            <p className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.2em] font-label mb-0.5">
              Welcome back
            </p>
            <h2 className="text-xl font-bold text-[#111] font-display leading-tight">
              {student.name}
            </h2>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {student.year && (
                <span className="inline-block text-[10px] font-bold bg-[#111] text-white px-2 py-0.5 rounded-full font-label tracking-wide">
                  {student.year}
                </span>
              )}
              {(() => {
                const r = getConsistencyRank(scores)
                const colorMap = {
                  gray: 'bg-[#F3F3F2] text-[#555] border-[#E5E5E5]',
                  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
                  blue: 'bg-blue-50 text-blue-700 border-blue-100',
                  purple: 'bg-purple-50 text-purple-700 border-purple-100',
                  green: 'bg-green-50 text-green-700 border-green-100',
                }
                return (
                  <span
                    title={r.nextRank ? `${r.sessions} sessions · ${r.nextAt - r.sessions} to ${r.nextRank}` : `${r.sessions} sessions · max rank!`}
                    className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full font-label tracking-wide border ${colorMap[r.color]}`}
                  >
                    ⚡ {r.rank}
                  </span>
                )
              })()}
            </div>
          </div>
          <button
            onClick={() => { if (setStudent) setStudent(null); setView('home') }}
            className="text-xs text-[#888] hover:text-[#111] border border-[#E5E5E5] bg-white rounded-xl px-3 py-2 font-label transition-colors"
          >
            Log out
          </button>
        </div>

        {/* Subscription banner */}
        {(() => {
          const access = getAccessStatus(student)
          if (access.status === 'active' && access.daysLeft > 7) return null
          const styles = {
            trial: { bg: 'bg-yellow-50', border: 'border-yellow-100', text: 'text-yellow-800', label: `Free trial · ${access.daysLeft} day${access.daysLeft !== 1 ? 's' : ''} left` },
            active: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-800', label: `Subscription expires in ${access.daysLeft} day${access.daysLeft !== 1 ? 's' : ''}` },
            expired: { bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-700', label: 'Access expired — renew to continue' },
          }[access.status]
          return (
            <button
              onClick={() => setView('subscribe')}
              className={`w-full text-left ${styles.bg} ${styles.border} border rounded-xl px-4 py-3 mb-4 flex items-center justify-between hover:opacity-90 transition-opacity`}
            >
              <div>
                <p className={`text-xs font-bold ${styles.text} font-display`}>{styles.label}</p>
                <p className="text-[10px] text-[#888] font-label mt-0.5">
                  {access.status === 'expired' ? 'Tap to subscribe (₦800/month)' : 'Tap to manage subscription'}
                </p>
              </div>
              <span className={`text-xs font-bold ${styles.text} font-label`}>→</span>
            </button>
          )
        })()}

        {/* JAMB Total Score */}
        {totalScore !== null && (
          <div className="bg-[#111] text-white rounded-2xl p-5 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-semibold text-[#888] uppercase tracking-[0.2em] font-label mb-1">
                  JAMB Total Score
                </p>
                <div className="flex items-end gap-1.5">
                  <span className="text-4xl font-bold font-display">{totalScore.total}</span>
                  <span className="text-[#666] text-sm mb-1 font-label">/ {totalScore.totalOut}</span>
                </div>
              </div>
              <button
                onClick={() => setView('results')}
                className="text-[11px] font-semibold text-[#888] hover:text-white transition-colors font-label mt-1"
              >
                View →
              </button>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1.5 mt-4">
              <div
                className="bg-white h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min((totalScore.total / totalScore.totalOut) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <p className="text-[10px] text-[#666] font-label">
                {Math.round((totalScore.total / totalScore.totalOut) * 100)}%
              </p>
              <p className={`text-[10px] font-semibold font-label ${
                totalScore.total >= 250 ? 'text-green-400' :
                totalScore.total >= 180 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {totalScore.total >= 250 ? 'Strong' : totalScore.total >= 180 ? 'Average' : 'Needs work'}
              </p>
            </div>
          </div>
        )}

        {/* This week's topics — shown only when topics are set */}
        {thisWeekTopics.length > 0 && (
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="text-sm font-bold text-[#111] font-display">Topics to Study</p>
                <p className="text-[11px] text-[#AAA] font-label mt-0.5">{currentWeek} · Prepare before the quiz</p>
              </div>
              <span className="text-[10px] font-bold bg-[#111] text-white px-2.5 py-1 rounded-full font-label">
                {currentWeek}
              </span>
            </div>
            <div className="space-y-2">
              {thisWeekTopics.map(({ subject, topic }) => (
                <div key={subject} className="flex items-center gap-3 py-2 border-b border-[#F3F3F2] last:border-0">
                  <div className="w-1.5 h-1.5 bg-[#111] rounded-full shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-[#888] uppercase tracking-wide font-label leading-none mb-0.5">{subject}</p>
                    <p className="text-sm font-semibold text-[#111] font-body">{topic.name}</p>
                  </div>
                  {topic.video && (
                    <a
                      href={topic.video}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg font-label hover:bg-red-100 transition-colors"
                      title="Watch on YouTube"
                    >
                      ▶ Watch
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My Subjects — clickable cards */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-bold text-[#111] font-display">My Subjects</p>
            <p className="text-[11px] text-[#AAA] font-label">Tap to see topic performance</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {student.subjects.map((sub) => {
              const pct = getSubjectPct(sub)
              return (
                <button
                  key={sub}
                  onClick={() => { setSelectedSubjectDetail(sub); setView('subject-detail') }}
                  className="bg-white border border-[#EBEBEB] rounded-xl p-3.5 text-left hover:border-[#111] hover:shadow-sm active:scale-[0.98] transition-all group"
                >
                  <p className="text-[10px] font-semibold text-[#AAA] uppercase tracking-wide font-label mb-1">Subject</p>
                  <p className="text-xs font-bold text-[#111] leading-snug font-body mb-2">{sub}</p>
                  {pct !== null ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className={`text-xs font-bold font-label ${
                          pct >= 70 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'
                        }`}>{pct}%</p>
                        <p className="text-[10px] text-[#CCC] font-label group-hover:text-[#111] transition-colors">→</p>
                      </div>
                      <div className="w-full bg-[#F3F3F2] rounded-full h-1">
                        <div
                          className={`h-1 rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-400'}`}
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

        {/* Quiz status */}
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
                Login closes 6:00 pm · 1 hour once started
              </p>
              {hasAttemptedAllSubjects ? (
                <div className="bg-[#F3F3F2] rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-[#111] font-display mb-0.5">All done!</p>
                  <p className="text-xs text-[#888] font-label">You've completed all subjects this week</p>
                </div>
              ) : (
                <>
                  {todaySubjectsAttempted.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {todaySubjectsAttempted.map((s) => (
                        <span key={s} className="text-[10px] font-semibold bg-[#111] text-white px-2 py-0.5 rounded-full font-label">
                          ✓ {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      const access = getAccessStatus(student)
                      if (access.status === 'expired') { setView('subscribe'); return }
                      setView('quiz')
                    }}
                    className="w-full bg-[#111] text-white rounded-xl py-3.5 text-sm font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display"
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
                    <span className="text-2xl font-bold text-[#111] font-display">{timeLeft.days}</span>
                    <span className="text-xs text-[#AAA] ml-1 font-label">d</span>
                  </div>
                )}
                <div>
                  <span className="text-2xl font-bold text-[#111] font-display">{timeLeft.hours}</span>
                  <span className="text-xs text-[#AAA] ml-1 font-label">hr</span>
                </div>
                <div>
                  <span className="text-2xl font-bold text-[#111] font-display">{timeLeft.mins}</span>
                  <span className="text-xs text-[#AAA] ml-1 font-label">min</span>
                </div>
              </div>
              <p className="text-[11px] text-[#CCC] font-label">Fri & Sat · 5:00 pm – 6:00 pm login window</p>
            </div>
          )}
        </div>

        {/* Recent results */}
        {scores.length > 0 && (
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-3">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-bold text-[#111] font-display">Recent Results</p>
              <button
                onClick={() => setView('results')}
                className="text-xs text-[#888] hover:text-[#111] font-label transition-colors"
              >
                View all →
              </button>
            </div>
            <div className="space-y-0">
              {scores.slice(0, 4).map((s, i) => (
                <div key={i} className={`flex justify-between items-center py-2.5 ${
                  i < Math.min(scores.length, 4) - 1 ? 'border-b border-[#F3F3F2]' : ''
                }`}>
                  <div>
                    <p className="text-xs font-semibold text-[#111] font-body">{s.subject}</p>
                    <p className="text-[10px] text-[#AAA] font-label mt-0.5">
                      {s.week} · {new Date(s.date).toLocaleDateString('en-NG')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold font-display ${
                      s.score / (s.outOf || 100) >= 0.7 ? 'text-green-600' :
                      s.score / (s.outOf || 100) >= 0.5 ? 'text-yellow-600' : 'text-red-500'
                    }`}>
                      {s.score}
                    </p>
                    <p className="text-[10px] text-[#CCC] font-label">/{s.outOf || 100}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => setView('results')}
          className="w-full bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm text-[#888] hover:text-[#111] hover:border-[#CCC] transition-colors font-label"
        >
          View All My Results
        </button>

      </div>
    </div>
  )
}
