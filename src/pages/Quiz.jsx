import { useState, useEffect, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserGroupIcon } from '@hugeicons/core-free-icons'
import SEO from '../components/seo/SEO'
import { apiPost } from '../lib/api'
import { getStudentProfile } from '../store/useStore'
import { startQuiz, submitQuiz, getTopics, listenActiveWeek, normalizeTopic, getAccessStatus, getStudentById, listenQuizDates, isBonusQuiz, WEEKS, LIFELINES_ENABLED, isLifelinesEnabled, consumeFreeAttempt, logEvent, useLifeline, peekStatus, getCoinBalance, getWeekGoats, listGoats, load, save } from '../store/useStore'
import { useToastStore } from '../store/toast'

import QuizTimer from '../components/quiz/QuizTimer'
import QuestionCard from '../components/quiz/QuestionCard'
import QuestionNav from '../components/quiz/QuestionNav'
import QuizResults from '../components/quiz/QuizResults'
import LifelineBar from '../components/quiz/LifelineBar'
import { GoatPicker, GoatResult } from '../components/quiz/GoatSheet'
import { PeekPicker, PeekResult } from '../components/quiz/PeekSheet'
import { markRevisionCompleted, revisionTopicKey } from '../lib/revisionQueue'

function isInQuizWindow(quizDates) {
  const now = new Date()
  if (quizDates?.date1 || quizDates?.date2) {
    for (const key of ['date1', 'date2']) {
      if (!quizDates[key]) continue
      const start = new Date(quizDates[key])
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
      if (now >= start && now < end) return true
    }
    return false
  }
  const day = now.getDay(), h = now.getHours(), m = now.getMinutes()
  const mins = h * 60 + m
  return (day === 0 || day === 5 || day === 6) && mins >= 17 * 60 && mins < 19 * 60
}

const ABBR = {
  'Mathematics': 'Math', 'English Language': 'English', 'Physics': 'Physics',
  'Chemistry': 'Chem', 'Biology': 'Bio', 'Government': 'Govt',
  'Economics': 'Econ', 'Literature in English': 'Lit',
}

export default function Quiz({ student, setStudent, setView, setLastScore, retakeData, setRetakeData }) {
  const [step, setStep] = useState('init') // init | loading | quiz | done | locked | expired | error
  const [quizData, setQuizData] = useState({}) // { [subject]: { questions, answers, currentQ } }
  const quizDataRef = useRef(quizData)
  quizDataRef.current = quizData
  const [sessionId, setSessionId] = useState(null)
  const [activeSubject, setActiveSubject] = useState(null)
  const [timeLeft, setTimeLeft] = useState(60 * 60)
  const [submitting, setSubmitting] = useState(false)
  const [allResults, setAllResults] = useState([])
  const [medalToast, setMedalToast] = useState(null)
  const [currentWeek, setCurrentWeek] = useState(null)
  const [quizDates, setQuizDates] = useState(null)
  const [quizDatesReady, setQuizDatesReady] = useState(false)
  const [nextWeekTopics, setNextWeekTopics] = useState({})
  const [paymentPrompt, setPaymentPrompt] = useState(null)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [err, setErr] = useState('')
  const [errTitle, setErrTitle] = useState('No Questions Yet')
  // Re-gate trigger + "I just paid" retry state (C)
  const [gateBump, setGateBump] = useState(0)
  const [rechecking, setRechecking] = useState('')
  const [recheckErr, setRecheckErr] = useState('')
  // ── Lifelines ──
  const [coins, setCoins] = useState(student.coins ?? 10)
  const [usage, setUsage] = useState({ ask: 0, peek: 0, fifty: 0 })
  const [narrowed, setNarrowed] = useState({}) // qKey -> { kind, eliminate?, shown? }
  const assistLogRef = useRef([])
  const [goatSheet, setGoatSheet] = useState(null) // null | { stage:'pick' } | { stage:'result', ...payload }
  const [peekSheet, setPeekSheet] = useState(null) // null | { stage:'pick' } | { stage:'result', ...payload }
  const [lifelineBusy, setLifelineBusy] = useState(null)
  const [weekGoats, setWeekGoats] = useState([])
  const [lifelineErr, setLifelineErr] = useState('')
  // Squad lifeline picks (Peek a Friend) — chosen before the session starts
  const [peekFriends, setPeekFriends] = useState([])
  const [squadNames, setSquadNames] = useState({})
  // Per-question peek status: has each selected friend answered THIS question?
  const [peekStatuses, setPeekStatuses] = useState([])
  const peekCacheRef = useRef({})
  const timerRef = useRef(null)
  const paymentTimerRef = useRef(null)

  const weekLabel = retakeData?.week || currentWeek || 'Week 1'
  const subjects = retakeData ? [retakeData.subject] : (student.subjects || [])

  useEffect(() => {
    const unsubWeek = listenActiveWeek((week) => setCurrentWeek(week))
    return () => { unsubWeek() }
  }, [])

  useEffect(() => {
    if (!currentWeek) return
    const timeout = setTimeout(() => setQuizDatesReady(true), 5000)
    const unsubDates = listenQuizDates(currentWeek, (dates) => {
      setQuizDates(dates)
      setQuizDatesReady(true)
      clearTimeout(timeout)
    })
    return () => { unsubDates(); clearTimeout(timeout) }
  }, [currentWeek])

  useEffect(() => {
    if (!currentWeek) return
    const idx = WEEKS.indexOf(currentWeek)
    const next = WEEKS[Math.min(idx + 1, WEEKS.length - 1)]
    getTopics(next).then((t) => setNextWeekTopics(t || {}))
  }, [currentWeek])

  // Squad names for the pre-test picker (public profiles)
  useEffect(() => {
    const squad = Array.isArray(student.squad) ? student.squad : []
    if (!squad.length) { setSquadNames({}); return }
    let cancelled = false
    Promise.all(squad.map((id) =>
      getStudentProfile(id)
        .then((name) => ({ id, name }))
        .catch(() => ({ id, name: 'Friend' }))
    )).then((rows) => {
      if (cancelled) return
      const m = {}
      rows.forEach((r) => { m[r.id] = r.name })
      setSquadNames(m)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [student.squad])

  const peekFriendsKey = `lifeline_peek_friends_${student.id}`
  const proceedAfterGate = () => {
    // Lifelines are live from Week 6 onward (current week included).
    const lifelinesForThisWeek = isLifelinesEnabled(retakeData?.week || currentWeek)
    if (!lifelinesForThisWeek) { setStep('loading'); return }
    // Retakes and squad-less students skip straight to the session
    const squad = Array.isArray(student.squad) ? student.squad.filter(Boolean) : []
    if (retakeData || !squad.length) { setStep('loading'); return }
    // Auto-use the previously selected pair when still valid (doc fallback)
    try {
      const prev = JSON.parse(localStorage.getItem(peekFriendsKey) || localStorage.getItem('lifeline_peek_friends') || '[]')
      const valid = prev.filter((id) => squad.includes(id)).slice(0, 2)
      if (valid.length) {
        setPeekFriends(valid)
        try { localStorage.setItem(peekFriendsKey, JSON.stringify(valid)) } catch {}
        setStep('loading')
        return
      }
    } catch {}
    setStep('squad')
  }

  // Gate check: once dates + week are ready, decide what to show.
  // Bonus quizzes (admin-scheduled outside the Fri/Sat/Sun 5–6pm window) are
  // free practice: they never touch the free trial and never block on expiry.
  const isBonus = !retakeData && isBonusQuiz(quizDates)
  useEffect(() => {
    if (!quizDatesReady) return
    if (!currentWeek && !retakeData) return
    // Re-runnable from expired/suspended so the "I just paid" retry can
    // re-gate without a full remount (bumped via gateBump after refresh).
    if (step !== 'init' && step !== 'expired' && step !== 'suspended') return
    const { status } = getAccessStatus(student)
    if (status === 'suspended') { setStep('suspended'); return }
    if (status === 'expired' && !isBonus) { setStep('expired'); return }
    if (!retakeData && !isInQuizWindow(quizDates)) { setStep('locked'); return }
    logEvent(student.id, 'quiz_loaded', { page: 'dashboard' })
    proceedAfterGate()
  }, [quizDatesReady, currentWeek, gateBump])

  // Load quiz via a server-issued session (startQuiz). The server assigns the
  // question set and returns the public content (no answer key).
  useEffect(() => {
    if (step !== 'loading') return
    const week = retakeData?.week || weekLabel
    ;(async () => {
      setErr('')
      try {
        const res = await startQuiz({
          studentId: student.id,
          week,
          retakeSubject: retakeData ? retakeData.subject : undefined,
        })
        if (!res || !res.ok) throw new Error('startQuiz failed')
        setSessionId(res.sessionId)
        const data = {}
        Object.keys(res.questions || {}).forEach((subj) => {
          const qs = res.questions[subj] || []
          data[subj] = { questions: qs, answers: new Array(qs.length).fill(null), currentQ: 0 }
        })
        if (!Object.keys(data).length) {
          setErrTitle('No Questions Yet')
          setErr(`No questions available for ${week} yet. Check back later.`)
          setStep('error')
          return
        }
        setQuizData(data)
        setActiveSubject(Object.keys(data)[0])
        setStep('quiz')
      } catch (e) {
        const msg = (e && e.message) || ''
        if (/locked/i.test(msg)) {
          setErr('The quiz window is not open yet.')
          setStep('locked')
        } else if (/deadline/i.test(msg)) {
          setErrTitle('Time Is Up')
          setErr('Time is up — your quiz could not be submitted.')
          setStep('error')
        } else {
          setErrTitle('No Questions Yet')
          setErr('Failed to load questions. Check your connection.')
          setStep('error')
        }
      }
    })()
  }, [step])

  // Lifeline setup: coin balance once per student; GOATs + usage whenever the
  // test week is known. (Previously this ran once on mount when currentWeek was
  // still null, so a Week 6 test loaded Week 1 GOATs and the server rejected
  // every Ask as "not assisting this week".)
  const testWeek = retakeData?.week || currentWeek || weekLabel
  const usageKey = `lifeline_usage_${student.id}_${String(testWeek || '').replace(/\s+/g, '_')}`
  useEffect(() => {
    let active = true
    getCoinBalance(student.id).then((r) => { if (active && r?.ok) setCoins(r.coins) }).catch(() => {})
    return () => { active = false }
  }, [student.id])
  useEffect(() => {
    if (!testWeek) return
    let active = true
    ;(async () => {
      try {
        const [ids, all] = await Promise.all([getWeekGoats(testWeek), listGoats()])
        if (!active) return
        const byId = Object.fromEntries(all.map((g) => [g.id, g]))
        setWeekGoats(ids.map((id) => byId[id]).filter(Boolean))
      } catch { if (active) setWeekGoats([]) }
    })()
    // Usage is per student + week so a previous test never shows "used up" here
    try {
      const saved = JSON.parse(localStorage.getItem(usageKey) || '{}')
      if (saved && typeof saved === 'object') setUsage({ ask: 0, peek: 0, fifty: 0, ...saved })
      else setUsage({ ask: 0, peek: 0, fifty: 0 })
    } catch { setUsage({ ask: 0, peek: 0, fifty: 0 }) }
    return () => { active = false }
  }, [testWeek])

  const qKeyOf = (subj, qi) => `${subj}::${qi}`

  const logAssist = (entry) => {
    const arr = assistLogRef.current
    if (!arr.some((a) => a.subject === entry.subject && a.qIndex === entry.qIndex && a.kind === entry.kind)) {
      arr.push(entry)
    }
  }

  const callLifeline = async (kind, extra) => {
    if (!sessionId || lifelineBusy) return null
    setLifelineBusy(kind); setLifelineErr('')
    try {
      const res = await useLifeline({
        studentId: student.id,
        sessionId,
        subject: activeSubject,
        qIndex: quizDataRef.current[activeSubject]?.currentQ ?? 0,
        kind,
        ...extra,
      })
      if (res?.ok) {
        if (typeof res.coins === 'number') setCoins(res.coins)
        if (!res.cached) {
          setUsage((prev) => {
            const u = { ...prev, [kind]: (prev[kind] || 0) + 1 }
            try { localStorage.setItem(usageKey, JSON.stringify(u)) } catch {}
            return u
          })
        }
        return res
      }
      throw new Error('Lifeline failed')
    } catch (e) {
      const msg = (e?.message || '').includes('Not enough coins')
        ? 'Not enough coins — tap Get more after this test'
        : (e?.message || 'Lifeline failed. Try again.')
      if (msg.includes('No uses left')) {
        setUsage((u) => ({ ...u, [kind]: 5 }))
      } else {
        setLifelineErr(msg)
        setTimeout(() => setLifelineErr(''), 3500)
      }
      return null
    } finally {
      setLifelineBusy(null)
    }
  }

  const handleUseButton = (kind) => {
    if (!isLifelinesEnabled(retakeData?.week || currentWeek || weekLabel)) return
    const curAns = quizDataRef.current[activeSubject]?.answers?.[quizDataRef.current[activeSubject]?.currentQ ?? 0]
    if (curAns === null || curAns === undefined) {
      useToastStore.getState().showToast('Pick an answer first', 'info')
      return
    }
    if (kind === 'ask') setGoatSheet({ stage: 'pick' })
    else if (kind === 'peek') setPeekSheet({ stage: 'pick' })
    else if (kind === 'fifty') handleFifty()
  }

  const handleFifty = async () => {
    const subj = activeSubject
    const qi = quizDataRef.current[subj]?.currentQ ?? 0
    const res = await callLifeline('fifty', {})
    if (res?.eliminate) {
      setNarrowed((n) => ({ ...n, [qKeyOf(subj, qi)]: { kind: 'fifty', eliminate: res.eliminate } }))
      logAssist({ subject: subj, qIndex: qi, kind: 'fifty' })
      useToastStore.getState().showToast('50-50 applied — 2 wrong options crossed out', 'success')
    }
  }

  const handlePickGoat = async (goat) => {
    const subj = activeSubject
    const qi = quizDataRef.current[subj]?.currentQ ?? 0
    setGoatSheet({ stage: 'pick', busy: goat.id })
    const res = await callLifeline('ask', { goatId: goat.id })
    if (!res) { setGoatSheet({ stage: 'pick' }); return }
    if (res.stars === 3) {
      setGoatSheet({ stage: 'result', goatName: res.goatName || goat.name, stars: 3, explanation: res.explanation || '', explanationImage: res.explanationImage || '' })
    } else {
      const shown = res.shown || []
      setNarrowed((n) => ({ ...n, [qKeyOf(subj, qi)]: { kind: 'ask', stars: res.stars, shown } }))
      setGoatSheet({ stage: 'result', goatName: res.goatName || goat.name, stars: res.stars, shownOptions: shown })
    }
    logAssist({ subject: subj, qIndex: qi, kind: 'ask', goatId: res.goatId || goat.id, goatName: res.goatName || goat.name })
  }

  const handlePickFriend = async (friend) => {
    setPeekSheet({ stage: 'pick', busy: friend.id })
    const res = await callLifeline('peek', { friendId: friend.id })
    if (!res?.optionText) { setPeekSheet({ stage: 'pick' }); return }
    const subj = activeSubject
    const qi = quizDataRef.current[subj]?.currentQ ?? 0
    setPeekSheet({ stage: 'result', friendName: res.friendName || friend.name, optionText: res.optionText })
    logAssist({ subject: subj, qIndex: qi, kind: 'peek' })
  }

  // Peek status per question: show name + sign for each selected friend so
  // learners know who has answered this question before spending coins.
  // Read-only and free (no answer content ever leaves the server).
  useEffect(() => {
    if (step !== 'quiz' || !sessionId || !peekFriends.length) { setPeekStatuses([]); return }
    if (!isLifelinesEnabled(retakeData?.week || currentWeek || weekLabel)) { setPeekStatuses([]); return }
    const subj = activeSubject
    const qi = quizData[subj]?.currentQ ?? 0
    if (!subj) { setPeekStatuses([]); return }
    const cacheKey = `${sessionId}::${subj}::${qi}`
    const cached = peekCacheRef.current[cacheKey]
    if (cached) { setPeekStatuses(cached); return }
    let active = true
    setPeekStatuses([])
    ;(async () => {
      try {
        const res = await peekStatus({
          studentId: student.id,
          sessionId,
          subject: subj,
          qIndex: qi,
          friendIds: peekFriends,
        })
        if (!active) return
        const list = Array.isArray(res?.statuses) ? res.statuses : []
        peekCacheRef.current[cacheKey] = list
        setPeekStatuses(list)
      } catch { if (active) setPeekStatuses([]) }
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId, activeSubject, peekFriends, quizData[activeSubject]?.currentQ])

  // Timer — runs only during quiz
  useEffect(() => {
    if (step !== 'quiz') return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [step])

  useEffect(() => {
    if (timeLeft === 0 && step === 'quiz') handleSubmitAll()
  }, [timeLeft])

  const setAnswer = (subj, qIdx, optIdx) => {
    setQuizData((prev) => ({
      ...prev,
      [subj]: { ...prev[subj], answers: prev[subj].answers.map((a, i) => i === qIdx ? optIdx : a) },
    }))
  }

  const setCurrentQ = (subj, idx) => {
    setQuizData((prev) => ({ ...prev, [subj]: { ...prev[subj], currentQ: idx } }))
  }

  const requestSubmit = () => {
    if (submitting || !sessionId) return
    setShowSubmitConfirm(true)
  }

  const handleSubmitAll = async () => {
    if (submitting) return
    setShowSubmitConfirm(false)
    if (!sessionId) { setErrTitle('Could Not Submit'); setErr('Quiz session missing — please restart the quiz.'); setStep('error'); return }
    setSubmitting(true)
    clearInterval(timerRef.current)

    const qd = quizDataRef.current

    // Only the sessionId + chosen option indices leave the client. The server
    // validates the exact assigned question set, so the answer key can't be
    // enumerated one question at a time.
    const answers = {}
    Object.keys(qd).forEach((subj) => {
      answers[subj] = qd[subj].answers.map((a) => (a === null || a === undefined ? -1 : a))
    })

    try {
      const res = await submitQuiz({ sessionId, answers, assistMeta: assistLogRef.current })
      // Idempotent replay: the server returns { alreadySubmitted: true } as a
      // SUCCESS (not a throw). Rebuild from the stored server results so a
      // double-tap / auto-retry never shows a 0-score screen.
      if (res?.alreadySubmitted && Array.isArray(res.results) && res.results.length) {
        const stored = res.results.map((g) => ({
          studentId: student.id,
          studentName: student.name,
          subject: g.subject,
          week: g.week || weekLabel,
          score: g.score ?? 0,
          outOf: g.outOf || 100,
          correct: g.correct ?? 0,
          wrong: g.wrong ?? 0,
          unanswered: g.unanswered ?? 0,
          total: g.total ?? 0,
          questions: g.questions || null,
          answers: g.answers || null,
          released: g.released !== false,
          assists: Array.isArray(g.assists) ? g.assists : [],
          date: new Date().toISOString(),
        }))
        if (stored.length > 0) setLastScore(stored[0])
        if (setRetakeData) setRetakeData(null)
        const total = stored.reduce((a, r) => a + r.score, 0)
        const medal = total >= 280 ? '🥇' : total >= 200 ? '🥈' : '🥉'
        setAllResults(stored)
        setMedalToast({ medal, total, max: stored.length * 100 })
        setStep('done')
        setSubmitting(false)
        return
      }
      const graded = res && res.results ? res.results : []
      // Merge the server grade with local question content for the corrections
      // view. During the live window corrections stay locked (released=false).
      const results = Object.keys(qd).map((subj) => {
        const g = graded.find((r) => r.subject === subj) || {}
        const local = qd[subj]
        const released = g.released !== false
        return {
          studentId: student.id,
          studentName: student.name,
          subject: subj,
          week: weekLabel,
          score: g.score ?? 0,
          outOf: 100,
          correct: g.correct ?? 0,
          wrong: g.wrong ?? 0,
          unanswered: g.unanswered ?? 0,
          total: g.total ?? local.questions.length,
          questions: released && g.questions ? g.questions : null,
          answers: released && g.answers ? g.answers : null,
          released,
          date: new Date().toISOString(),
        }
      })

      if (results.length > 0) setLastScore(results[0])
      if (setRetakeData) setRetakeData(null)
      if (retakeData && results.length > 0) {
        results.forEach((r) => {
          const pct = Math.round((r.score / (r.outOf || 100)) * 100)
          if (pct >= 50) markRevisionCompleted(revisionTopicKey(r.subject, r.week))
        })
      }
      const total = results.reduce((a, r) => a + r.score, 0)
      const medal = total >= 280 ? '🥇' : total >= 200 ? '🥈' : '🥉'
      // Attach server-computed assist attribution for the results screen
      const assistsBySubject = {}
      graded.forEach((g) => { if (g.subject && Array.isArray(g.assists)) assistsBySubject[g.subject] = g.assists })
      results.forEach((r) => { r.assists = assistsBySubject[r.subject] || [] })
      setAllResults(results)
      setMedalToast({ medal, total, max: results.length * 100 })
      if (typeof res?.earnedCoins === 'number') {
        setCoins((c) => (typeof c === 'number' ? c + 5 : c))
        useToastStore.getState().showToast('+10 coins for completing the test!', 'success')
      }

      try {
        const cached = load('jamb_scores_cache', [])
        const trimmed = cached.slice(-50)
        save('jamb_scores_cache', [...trimmed, ...results])
      } catch {}

      // Bonus quizzes + retakes never consume the free trial
      const consumesTrial = !retakeData && !isBonus
      if (consumesTrial) consumeFreeAttempt(student.id).catch(() => {})
      logEvent(student.id, 'quiz_completed', {
        subjects: results.map((r) => r.subject),
        scores: results.map((r) => r.score),
        total,
      }).catch(() => {})

      const preview = getAccessStatus({ ...student, freeAttemptsUsed: (student.freeAttemptsUsed || 0) + (consumesTrial ? 1 : 0) })
      if (consumesTrial && preview.status === 'expired') {
        setPaymentPrompt('show')
        paymentTimerRef.current = setTimeout(() => {
          setPaymentPrompt(null)
          setStep('done')
        }, 3500)
      } else {
        setStep('done')
      }
    } catch (e) {
      console.error('Failed to submit quiz', e)
      const msg = e?.message || ''
      if (/alreadySubmitted/i.test(msg)) {
        // Rare race: server threw instead of returning the flag — results are
        // safe on the backend, so just show them.
        setStep('done')
      } else if (/deadline|time is up/i.test(msg)) {
        setErrTitle('Time Is Up')
        setErr('Time is up — your 1-hour quiz session expired before submit.')
        setStep('error')
      } else if (/Malformed answers/i.test(msg)) {
        setErrTitle('Could Not Submit')
        setErr('Your test data did not match the server session. Reopen the quiz from the dashboard to get a fresh session, then submit.')
        setStep('error')
      } else if (/Quiz is locked|locked/i.test(msg)) {
        setErrTitle('Quiz Locked')
        setErr('The quiz window closed before submit. Your answers are kept on this screen — try again when the window reopens.')
        setStep('error')
      } else {
        setErrTitle('Could Not Submit')
        setErr(`Could not submit your quiz (${msg || 'network error'}). Your answers are safe — tap Try again.`)
        setStep('error')
      }
    }
    setSubmitting(false)
  }

  useEffect(() => { return () => clearTimeout(paymentTimerRef.current) }, [])

  // ── GATE SCREENS ───────────────────────────────────────────────────────────
  if (step === 'init' || step === 'loading') {
    return (
      <>
      <SEO title="Quiz" />
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#111] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#888] font-label">Loading quiz…</p>
        </div>
      </div>
    </>
    )
  }

  if (paymentPrompt) {
    return (
      <>
      <SEO title="Quiz" />
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-8 max-w-sm w-full text-center">
          <span className="text-3xl">⏰</span>
          <h2 className="text-xl font-bold text-[#111] font-display mt-3 mb-2">Free Trial Ended</h2>
          <p className="text-sm text-[#888] font-label mb-4">
            You've used all 2 free quizzes. Subscribe for ₦800/month to keep practicing and tracking your progress!
          </p>
          <button onClick={() => setView('subscribe')} className="w-full bg-[#111] text-white rounded-xl py-3 text-sm font-bold font-display mb-2">
            Subscribe Now →
          </button>
          <button onClick={() => { setPaymentPrompt(null); setStep('done') }} className="w-full text-xs text-[#AAA] font-label py-2">
            Skip, show results
          </button>
        </div>
      </div>
    </>
    )
  }

  // C — "I just paid" retry: re-verify any pending Paystack ref, refresh the
  // student, and re-run the gate. Covers the case where payment succeeded
  // but this screen still holds the stale (expired) student snapshot.
  const handleJustPaid = async () => {
    setRecheckErr('')
    try {
      let pending = null
      try { pending = localStorage.getItem('pending_paystack_ref') } catch { /* non-fatal */ }
      if (pending && pending.includes(student.id)) {
        setRechecking('Confirming payment…')
        for (let i = 0; i < 4; i++) {
          try {
            await apiPost('/api/payments/paystack/complete', { reference: pending })
            break
          } catch (e) {
            const m = (e?.message || '').toLowerCase()
            const retryable = m.includes('not successful yet') || m.includes('failed-precondition')
            if (!retryable || i === 3) {
              if (i === 3) throw e
              break
            }
            await new Promise((r) => setTimeout(r, 2500))
          }
        }
        try { localStorage.removeItem('pending_paystack_ref') } catch { /* non-fatal */ }
      } else {
        setRechecking('Checking access…')
      }
      const fresh = await getStudentById(student.id)
      if (fresh && setStudent) setStudent(fresh)
      const { status } = getAccessStatus(fresh || student)
      if (status === 'expired') {
        setRecheckErr('Payment not confirmed yet — if you were charged, wait a minute and try again, or contact support.')
      } else {
        setGateBump((n) => n + 1)
      }
    } catch (e) {
      setRecheckErr(e?.message || 'Could not confirm payment. Try again.')
    }
    setRechecking('')
  }

  if (step === 'expired') {
    return (
      <>
      <SEO title="Quiz" />
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-8 max-w-sm w-full text-center">
          <span className="text-3xl">🔒</span>
          <h2 className="text-xl font-bold text-[#111] font-display mt-3 mb-2">Access Expired</h2>
          <p className="text-sm text-[#888] font-label mb-6">Your subscription has ended. Renew for ₦800/month to continue.</p>
          <div className="flex gap-2">
            <button onClick={() => setView('dashboard')} className="flex-1 border border-[#E5E5E5] text-[#555] py-3 rounded-xl text-sm font-bold font-display">Back</button>
            <button onClick={() => setView('subscribe')} className="flex-1 bg-[#111] text-white py-3 rounded-xl text-sm font-bold font-display">Subscribe →</button>
          </div>
          <button
            onClick={handleJustPaid}
            disabled={!!rechecking}
            className="w-full mt-2 text-xs font-bold font-label py-2.5 text-[#555] hover:text-[#111] disabled:opacity-50 transition-colors"
          >
            {rechecking || 'I just paid — check again'}
          </button>
          {recheckErr && (
            <p className="text-red-600 text-xs font-label mt-1">{recheckErr}</p>
          )}
        </div>
      </div>
    </>
    )
  }

  if (step === 'suspended') {
    return (
      <>
      <SEO title="Quiz" />
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-8 max-w-sm w-full text-center">
          <span className="text-3xl">🟥</span>
          <h2 className="text-xl font-bold text-[#111] font-display mt-3 mb-2">Account Suspended</h2>
          <p className="text-sm text-[#888] font-label mb-6">You've missed 6 weekly tests. Reactivate with recovery code or pay ₦800.</p>
          <div className="flex gap-2">
            <button onClick={() => setView('dashboard')} className="flex-1 border border-[#E5E5E5] text-[#555] py-3 rounded-xl text-sm font-bold font-display">Back</button>
            <button onClick={() => setView('subscribe')} className="flex-1 bg-[#111] text-white py-3 rounded-xl text-sm font-bold font-display">Reactivate →</button>
          </div>
        </div>
      </div>
    </>
    )
  }

  if (step === 'locked') {
    return (
      <>
      <SEO title="Quiz" />
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-8 max-w-sm w-full text-center">
          <span className="text-3xl">🔒</span>
          <h2 className="text-xl font-bold text-[#111] font-display mt-3 mb-2">Quiz Locked</h2>
          <p className="text-sm text-[#888] font-label mb-1">Login window: <strong className="text-[#111]">Fri, Sat & Sun · 5:00pm – 6:00pm</strong></p>
          <p className="text-sm text-[#888] font-label mb-6">Once started: <strong className="text-[#111]">1 hour</strong> for all subjects</p>
          <button onClick={() => setView('dashboard')} className="bg-[#111] text-white px-6 py-3 rounded-xl text-sm font-bold font-display">Back to Dashboard</button>
        </div>
      </div>
    </>
    )
  }

  if (step === 'error') {
    return (
      <>
      <SEO title="Quiz" />
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-8 max-w-sm w-full text-center">
          <span className="text-3xl">😕</span>
          <h2 className="text-xl font-bold text-[#111] font-display mt-3 mb-2">{errTitle}</h2>
          <p className="text-sm text-[#888] font-label mb-6">{err}</p>
          {errTitle === 'Could Not Submit' && sessionId ? (
            <div className="flex gap-2">
              <button onClick={() => setView('dashboard')} className="flex-1 border border-[#E5E5E5] text-[#555] py-3 rounded-xl text-sm font-bold font-label">Back</button>
              <button onClick={handleSubmitAll} disabled={submitting} className={`flex-1 rounded-xl py-3 text-sm font-bold font-display transition-colors ${submitting ? 'bg-[#EBEBEB] text-[#AAA]' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                {submitting ? 'Retrying…' : 'Try again ✓'}
              </button>
            </div>
          ) : (
            <button onClick={() => setView('dashboard')} className="bg-[#111] text-white px-6 py-3 rounded-xl text-sm font-bold font-display">Back to Dashboard</button>
          )}
        </div>
      </div>
    </>
    )
  }

  // ── DONE ───────────────────────────────────────────────────────────────────
  if (step === 'done') {

    return (
      <>
      <SEO title="Quiz Results" />
      <QuizResults allResults={allResults} weekLabel={weekLabel} medalToast={medalToast} setMedalToast={setMedalToast} nextWeekTopics={nextWeekTopics} onBackToDashboard={() => setView('dashboard')} onViewResults={() => setView('results')} />
    </>
    )
  }

  // ── SQUAD PICK (Peek-a-Friend setup) ───────────────────────────────────────
  if (step === 'squad') {
    const squad = (Array.isArray(student.squad) ? student.squad : []).filter(Boolean)
    const toggle = (id) => {
      setPeekFriends((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id].slice(0, 2))
    }
    const confirm = () => {
      try { localStorage.setItem(peekFriendsKey, JSON.stringify(peekFriends.slice(0, 2))) } catch {}
      setStep('loading')
    }
    const skipSquad = () => {
      setPeekFriends([])
      try { localStorage.setItem(peekFriendsKey, JSON.stringify([])) } catch {}
      setStep('loading')
    }
    return (
      <>
      <SEO title="Pick Friends" />
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-6 max-w-sm w-full text-center">
          <div className="w-12 h-12 mx-auto bg-[#111] rounded-2xl flex items-center justify-center mb-2">
            <HugeiconsIcon icon={UserGroupIcon} size={22} color="white" />
          </div>
          <h2 className="text-lg font-bold text-[#111] font-display mb-1">Pick 2 friends to peek</h2>
          <p className="text-xs text-[#888] font-label mb-4">Peek a Friend shows what they picked. Tap to select.</p>
          <div className="space-y-2 mb-4 text-left">
            {squad.map((id) => {
              const on = peekFriends.includes(id)
              return (
                <button key={id} onClick={() => toggle(id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all active:scale-[0.99] ${
                    on ? 'bg-[#111] text-white border-[#111]' : 'bg-white text-[#333] border-[#E8E8E8]'
                  }`}>
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 ${on ? 'bg-white/20 border-white/40 text-white' : 'border-[#CCC] text-transparent'}`}>✓</span>
                  <span className="text-sm font-semibold font-body truncate">{squadNames[id] || '…'}</span>
                </button>
              )
            })}
          </div>
          <button onClick={confirm} disabled={!peekFriends.length}
            className={`w-full rounded-xl py-3 text-sm font-bold font-display transition-all ${
              peekFriends.length ? 'bg-[#111] text-white hover:bg-[#222]' : 'bg-[#EBEBEB] text-[#AAA] cursor-not-allowed'
            }`}>
            Next →
          </button>
          <button onClick={skipSquad} className="w-full mt-2 rounded-xl py-2.5 text-xs font-bold text-[#555] hover:text-[#111] font-label">
            Skip for this test
          </button>
          <button onClick={() => setView('leaderboard')} className="w-full mt-1 text-[11px] text-[#888] hover:text-[#111] font-label">
            No squad yet? Find friends →
          </button>
        </div>
      </div>
      </>
    )
  }

  // ── ACTIVE QUIZ ────────────────────────────────────────────────────────────
  const subjectList = Object.keys(quizData)
  const current = activeSubject ? quizData[activeSubject] : null
  if (!current) return null

  const { questions, answers, currentQ } = current
  const q = questions[currentQ]
  const totalAnswered = subjectList.reduce((a, s) => a + (quizData[s]?.answers?.filter((x) => x !== null).length ?? 0), 0)
  const totalQs = subjectList.reduce((a, s) => a + (quizData[s]?.questions?.length ?? 0), 0)
  const totalUnanswered = totalQs - totalAnswered
  const subjIdx = subjectList.indexOf(activeSubject)
  const isLastSubj = subjIdx === subjectList.length - 1
  const isLastQ = currentQ === questions.length - 1

  return (
    <>
      <SEO title="Quiz" />
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="bg-white border-b border-[#EBEBEB] sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 pt-3">

          {/* Timer row */}
          <div className="flex justify-between items-center mb-2">
            <div>
              <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide font-label">{weekLabel}</p>
              <p className="text-sm font-bold text-[#111] font-display">
                Q{currentQ + 1}/{questions.length}
                <span className="text-[#AAA] font-normal text-xs ml-1.5">{totalAnswered}/{totalQs} answered</span>
              </p>
            </div>
            <QuizTimer timeLeft={timeLeft} />
          </div>

          {/* Subject tabs */}
          <div className="flex overflow-x-auto -mx-4 px-4 gap-0 scrollbar-hide">
            {subjectList.map((subj) => {
              const d = quizData[subj]
              const n = d.answers.filter((a) => a !== null).length
              const isActive = subj === activeSubject
              const abbr = ABBR[subj] || subj.split(' ')[0]
              return (
                <button key={subj} onClick={() => setActiveSubject(subj)}
                  className={`flex-shrink-0 flex flex-col items-center px-3 pb-2 pt-0.5 border-b-2 text-[11px] font-bold font-label transition-all ${
                    isActive ? 'text-[#111] border-[#111]' : 'text-[#AAA] border-transparent hover:text-[#555]'
                  }`}>
                  <span>{abbr}</span>
                  <span className={`text-[9px] mt-0.5 ${n === d.questions.length ? 'text-green-500' : isActive ? 'text-[#888]' : 'text-[#CCC]'}`}>
                    {n}/{d.questions.length}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Per-subject question progress bar */}
          <div className="w-full bg-[#F3F3F2] h-0.5">
            <div className="bg-[#111] h-0.5 transition-all" style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
          </div>
        </div>
      </div>

      {isLifelinesEnabled(weekLabel) && (
        <LifelineBar
          coins={coins}
          usage={usage}
          maxUses={5}
          disabled={submitting}
          needsAnswer={(() => { const a = quizData[activeSubject]?.answers?.[quizData[activeSubject]?.currentQ ?? 0]; return a === null || a === undefined })()}
          onUse={handleUseButton}
          onGetMore={() => useToastStore.getState().showToast('Finish this test first — buy coins after submit', 'info')}
        />
      )}
      {lifelineErr && (
        <div className="max-w-md mx-auto px-4 pt-2">
          <div className="px-3.5 py-2 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-red-600 text-xs font-label">{lifelineErr}</p>
          </div>
        </div>
      )}
      {peekFriends.length > 0 && peekStatuses.length > 0 && (
        <div className="max-w-md mx-auto px-4 pt-2">
          <div className="flex items-center justify-center gap-2 flex-wrap bg-white border border-[#EBEBEB] rounded-xl px-3 py-2">
            <span className="text-[10px] font-bold text-[#AAA] uppercase tracking-wide font-label">Peek:</span>
            {peekStatuses.map((p) => (
              <span key={p.friendId}
                title={p.answered ? `${p.friendName} answered this question` : p.hasTest ? `${p.friendName} has not answered this one yet` : `${p.friendName} has not taken this test yet`}
                className={`inline-flex items-center gap-1 text-[11px] font-bold font-label px-2 py-0.5 rounded-lg ${
                  p.answered ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-[#F3F3F2] text-[#888] border border-[#EBEBEB]'
                }`}>
                <span className="max-w-[80px] truncate">{String(p.friendName || 'Friend').split(' ')[0]}</span>
                <span>{p.answered ? '✓' : '✗'}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto px-4 pb-6">
        <QuestionCard
          question={q}
          selectedAnswer={answers[currentQ]}
          onSelectAnswer={(i) => setAnswer(activeSubject, currentQ, i)}
          disabled={submitting}
          eliminated={(() => {
            const n = narrowed[`${activeSubject}::${currentQ}`]
            if (!n) return []
            if (n.kind === 'fifty') return n.eliminate || []
            if (n.kind === 'ask' && n.shown) {
              return [0, 1, 2, 3].filter((i) => !n.shown.includes(i))
            }
            return []
          })()}
        />

        {/* Navigation */}
        <div className="flex gap-2.5 mb-4">
          {currentQ > 0 ? (
            <button onClick={() => setCurrentQ(activeSubject, currentQ - 1)}
              className="flex-1 bg-white border border-[#E5E5E5] rounded-xl py-3 text-sm font-semibold text-[#555] hover:border-[#CCC] font-label transition-colors">
              ← Prev
            </button>
          ) : <div className="flex-1" />}

          {!isLastQ ? (
            <button onClick={() => setCurrentQ(activeSubject, currentQ + 1)}
              className="flex-1 bg-[#111] text-white rounded-xl py-3 text-sm font-bold font-display hover:bg-[#222] transition-colors">
              Next →
            </button>
          ) : !isLastSubj ? (
            <button onClick={() => setActiveSubject(subjectList[subjIdx + 1])}
              className="flex-1 bg-[#111] text-white rounded-xl py-3 text-sm font-bold font-display hover:bg-[#222] transition-colors">
              {ABBR[subjectList[subjIdx + 1]] || subjectList[subjIdx + 1].split(' ')[0]} →
            </button>
          ) : (
            <button onClick={requestSubmit} disabled={submitting}
              className={`flex-1 rounded-xl py-3 text-sm font-bold font-display transition-colors ${submitting ? 'bg-[#EBEBEB] text-[#AAA]' : 'bg-green-600 text-white hover:bg-green-700'}`}>
              {submitting ? 'Submitting…' : 'Submit All ✓'}
            </button>
          )}
        </div>

        <QuestionNav total={questions.length} currentIndex={currentQ} answers={answers} onJump={(i) => setCurrentQ(activeSubject, i)} />

        {/* Always-visible submit all */}
        <button onClick={requestSubmit} disabled={submitting}
          className={`w-full rounded-xl py-3.5 text-sm font-bold font-display transition-colors ${submitting ? 'bg-[#EBEBEB] text-[#AAA] cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>
          {submitting ? 'Submitting…' : `Submit All (${totalAnswered}/${totalQs} answered) ✓`}
        </button>
      </div>

      {/* Submit confirmation */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 text-center shadow-xl">
            <div className="w-12 h-12 mx-auto bg-green-50 rounded-2xl flex items-center justify-center mb-4 text-2xl">📤</div>
            <h2 className="text-lg font-bold text-[#111] font-display mb-2">Submit your quiz?</h2>
            <p className="text-sm text-[#666] font-label mb-1">
              You've answered <strong className="text-[#111]">{totalAnswered}</strong> of {totalQs} questions.
            </p>
            {totalUnanswered > 0 ? (
              <p className="text-sm text-[#F97316] font-label mb-5">
                You still have <strong>{totalUnanswered}</strong> unanswered question{totalUnanswered > 1 ? 's' : ''}. Unanswered questions score 0.
              </p>
            ) : (
              <p className="text-sm text-green-600 font-label mb-5">All questions answered — ready to submit!</p>
            )}
            <div className="flex gap-2.5">
              <button onClick={() => setShowSubmitConfirm(false)} disabled={submitting}
                className="flex-1 border border-[#E5E5E5] text-[#555] rounded-xl py-3 text-sm font-bold font-label hover:bg-[#F8F8F7] transition-colors">
                No, keep reviewing
              </button>
              <button onClick={handleSubmitAll} disabled={submitting}
                className={`flex-1 rounded-xl py-3 text-sm font-bold font-display transition-colors ${submitting ? 'bg-[#EBEBEB] text-[#AAA]' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                {submitting ? 'Submitting…' : 'Yes, submit ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lifeline sheets */}
      {goatSheet?.stage === 'pick' && (
        <GoatPicker
          goats={weekGoats}
          subject={activeSubject}
          busyId={goatSheet.busy}
          onPick={handlePickGoat}
          onClose={() => !lifelineBusy && setGoatSheet(null)}
        />
      )}
      {goatSheet?.stage === 'result' && (
        <GoatResult
          goatName={goatSheet.goatName}
          stars={goatSheet.stars}
          subject={activeSubject}
          explanation={goatSheet.explanation}
          explanationImage={goatSheet.explanationImage}
          shownOptions={goatSheet.shownOptions}
          questionOptions={questions[currentQ]?.options}
          onDone={() => setGoatSheet(null)}
        />
      )}
      {peekSheet?.stage === 'pick' && (
        <PeekPicker
          friends={peekFriends.map((id) => ({ id, name: squadNames[id] || 'Friend' }))}
          busyId={peekSheet.busy}
          onPick={handlePickFriend}
          onClose={() => !lifelineBusy && setPeekSheet(null)}
        />
      )}
      {peekSheet?.stage === 'result' && (
        <PeekResult
          friendName={peekSheet.friendName}
          optionText={peekSheet.optionText}
          onDone={() => setPeekSheet(null)}
        />
      )}
    </div>
    </>
  )
}
