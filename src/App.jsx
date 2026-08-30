import { useState, useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import Home from './pages/Home'
import Auth from './pages/Auth'
import Intro from './pages/Intro'
import SubjectSelect from './pages/SubjectSelect'
import Dashboard from './pages/Dashboard'
import Quiz from './pages/Quiz'
import Results from './pages/Results'
import Admin from './pages/Admin'
import SubjectDetail from './pages/SubjectDetail'
import Subscribe from './pages/Subscribe'
import Leaderboard from './pages/Leaderboard'
import Supporters from './pages/Supporters'
import Contact from './pages/Contact'
import TeacherDashboard from './pages/TeacherDashboard'
import GlobalToast from './components/ui/GlobalToast'
import ErrorBoundary from './components/ui/ErrorBoundary'
import CardWarningPopup from './components/dashboard/CardWarningPopup'
import { stripSensitive, stripPersisted, getStudentByUid, getTeacherByUid } from './store/useStore'
import { useThemeStore } from './store/theme'
import { applyDarkTheme } from './lib/darkTheme'
import { auth, onAuthStateChanged, getIdTokenResult, functions, httpsCallable } from './firebase'
import { setStudentUid, clearStudentUid, isRegistering } from './store/studentSession'
import { useUserNotificationStore } from './store/notificationStore'
import { useToastStore } from './store/toast'

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
function isInStandaloneMode() {
  return ('standalone' in window.navigator) && window.navigator.standalone
}

const SESSION_KEY = 'jamb_session'
const SESSION_TS_KEY = 'jamb_session_ts'
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const INTRO_KEY = 'jamb_intro_seen'
const TEACHER_SESSION_KEY = 'jamb_teacher_session'

export default function App() {
  const introSeen = typeof window !== 'undefined' && localStorage.getItem(INTRO_KEY) === '1'
  const savedSession = (() => {
    try {
      const ts = Number(localStorage.getItem(SESSION_TS_KEY) || 0)
      if (ts && Date.now() - ts > SESSION_MAX_AGE_MS) {
        localStorage.removeItem(SESSION_KEY)
        localStorage.removeItem(SESSION_TS_KEY)
        return null
      }
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
    } catch { return null }
  })()
  const savedTeacherSession = (() => {
    try {
      return JSON.parse(localStorage.getItem(TEACHER_SESSION_KEY) || 'null')
    } catch { return null }
  })()

  const teachersPath = typeof window !== 'undefined' && (window.location.pathname === '/teachers' || window.location.pathname.startsWith('/teachers/'))
  const [view, setView] = useState(teachersPath ? 'landing' : (savedTeacherSession ? 'teacher-dashboard' : (savedSession ? 'dashboard' : 'landing')))
  const [homeMode, setHomeMode] = useState('login')
  const [homeTab, setHomeTab] = useState('student')
  const theme = useThemeStore((s) => s.theme)
  const [student, setStudentState] = useState(savedSession)
  const [teacher, setTeacherState] = useState(savedTeacherSession)
  const [lastScore, setLastScore] = useState(null)
  const [adminAuthed, setAdminAuthed] = useState(false)
  const [selectedSubjectDetail, setSelectedSubjectDetail] = useState(null)
  const [retakeData, setRetakeData] = useState(null)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallToast, setShowInstallToast] = useState(false)
  const [showIosHint, setShowIosHint] = useState(() => isIos() && !isInStandaloneMode())
  const [showRegCardWarning, setShowRegCardWarning] = useState(false)
  const prevViewRef = useRef(view)

  // Global dark mode: applied to every view except the public landing page
  // (which has its own dark styling and must stay untouched).
  useEffect(() => {
    applyDarkTheme(theme === 'dark' && view !== 'landing')
    return () => applyDarkTheme(false)
  }, [theme, view])

  const setStudent = (s) => {
    const safe = s ? stripSensitive(s) : null
    setStudentState(safe || s)
    if (safe) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(stripPersisted(safe)))
      localStorage.setItem(SESSION_TS_KEY, String(Date.now()))
    } else {
      localStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(SESSION_TS_KEY)
      clearStudentUid()
    }
  }

  const setTeacher = (t) => {
    setTeacherState(t || null)
    try {
      if (t) localStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify(t))
      else localStorage.removeItem(TEACHER_SESSION_KEY)
    } catch {}
  }

  const dismissIntro = () => {
    localStorage.setItem(INTRO_KEY, '1')
    setView('home')
  }

  // Show the registration card warning whenever the user lands on the
  // Supporters step (fresh signup or returning), regardless of the preceding
  // view. The strict `prevView==='home'` check broke because onAuthStateChanged
  // re-routes home -> dashboard before the supporters transition.
  useEffect(() => {
    if (view === 'supporters' && prevViewRef.current !== 'supporters') {
      setShowRegCardWarning(true)
    }
    prevViewRef.current = view
  }, [view])

  // Handle /teachers deep link — scroll to teachers section on landing
  useEffect(() => {
    if (view === 'landing' && typeof window !== 'undefined' && window.location.pathname === '/teachers') {
      const t = setTimeout(() => document.getElementById('teachers')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350)
      return () => clearTimeout(t)
    }
  }, [view])

  // Intercept hardware back button — go to dashboard instead of closing the app
  useEffect(() => {
    const subViews = ['quiz', 'results', 'leaderboard', 'subject-detail', 'subscribe', 'supporters', 'subjects', 'contact']
    if (subViews.includes(view)) {
      window.history.pushState({ jamb: view }, '')
    } else if (view === 'home' && homeTab === 'teacher') {
      window.history.pushState({ jamb: 'teachers' }, '', '/teachers')
    } else if (view === 'landing' && window.location.pathname === '/teachers') {
      // keep /teachers visible on landing
    } else if (window.location.pathname === '/teachers' && view !== 'home' && view !== 'landing') {
      window.history.replaceState({}, '', '/')
    }
  }, [view])

  useEffect(() => {
    const handler = () => {
      const subViews = ['quiz', 'results', 'leaderboard', 'subject-detail', 'subscribe', 'supporters', 'subjects', 'contact']
      if (subViews.includes(view)) {
        setView('dashboard')
        window.history.pushState({ jamb: 'dashboard' }, '')
      }
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [view])

  // Drive the session from Firebase Auth. The signed-in user is the single
  // source of truth: a student gets their profile loaded by UID; an admin
  // (custom claim) gets adminAuthed set; a signed-out user drops to landing.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setStudentState(null)
        setTeacherState(null)
        setAdminAuthed(false)
        localStorage.removeItem('jamb_admin')
        localStorage.removeItem('jamb_teacher_session')
        localStorage.removeItem('patches_active')
        localStorage.removeItem('patches_selected_subjects')
        useUserNotificationStore.getState().setPatchesActive(false)
        useUserNotificationStore.getState().setSelectedPatchSubjects([])
        useUserNotificationStore.getState().setPushPermission('default')
        useUserNotificationStore.getState().setPushSubscription(null)
        setView((v) =>
          ['dashboard', 'supporters', 'subjects', 'quiz', 'results', 'subscribe', 'leaderboard', 'contact', 'subject-detail', 'admin', 'teacher-dashboard'].includes(v)
            ? 'landing'
            : v
        )
        return
      }
      try {
        const token = await getIdTokenResult(user)
        if (token.claims.admin) {
          setAdminAuthed(true)
          localStorage.setItem('jamb_admin', '1')
          setView((v) => (v === 'landing' || v === 'home' ? 'admin' : v))
        } else if (token.claims.teacher) {
          const t = await getTeacherByUid(user.uid)
          if (t) {
            setTeacherState(t)
            try { localStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify(t)) } catch {}
            if (!isRegistering()) {
              setView((v) => (v === 'landing' || v === 'home' ? 'teacher-dashboard' : v))
            }
          }
        } else {
          const stu = await getStudentByUid(user.uid)
          if (stu) {
            setStudentUid(stu.uid)
            setStudent(stu)
            // During registration the Supporters step is in charge of routing;
            // don't yank the new user to the dashboard and flash it briefly.
            if (!isRegistering()) {
              setView((v) => (v === 'landing' || v === 'home' ? 'dashboard' : v))
            }
          } else {
            // Firebase Auth user exists but no matching student doc — stale
            // session or legacy account that was never migrated. Clear the
            // session and send the user back to sign in.
            console.warn('[Auth] Student doc not found for uid:', user.uid)
            setStudentState(null)
            localStorage.removeItem('jamb_session')
            localStorage.removeItem('jamb_session_ts')
            clearStudentUid()
            setView('landing')
          }
        }
      } catch {
        setStudentState(null)
      }
    })
    return () => unsub()
  }, [])

  // Paystack redirect callback (primary gateway). Paystack appends
  // ?reference=...&trxref=... to the callback_url, which lands on the
  // hosting root. Pick it up here even when the Subscribe page is not
  // mounted (view is landing/dashboard). We just route to Subscribe and
  // let that page verify and show the dedicated success screen + receipt.
  const paystackHandledRef = useRef(null)
  useEffect(() => {
    if (!student) return
    const params = new URLSearchParams(window.location.search)
    const urlRef = params.get('reference') || params.get('trxref')
    let pendingRef = null
    try { pendingRef = localStorage.getItem('pending_paystack_ref') } catch {}
    const ref = urlRef || pendingRef
    if (!ref || !ref.includes(student.id)) return
    if (paystackHandledRef.current === ref) return
    paystackHandledRef.current = ref

    if (urlRef) {
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('reference')
        url.searchParams.delete('trxref')
        window.history.replaceState({}, '', url.pathname + url.search + url.hash)
      } catch {}
      // Keep the ref for Subscribe.jsx to verify and render the success page
      try { localStorage.setItem('pending_paystack_ref', ref) } catch {}
      setView('subscribe')
    } else if (pendingRef) {
      // Pending without URL — user is on landing after Paystack, nudge to Subscribe
      setView('subscribe')
    }
  }, [student])

  const swIntervalRef = useRef(null)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        clearInterval(swIntervalRef.current)
        swIntervalRef.current = setInterval(() => r.update(), 60 * 60 * 1000)
      }
    },
    onDeregister() {
      clearInterval(swIntervalRef.current)
    },
  })

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallToast(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowInstallToast(false)
      setDeferredPrompt(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <ErrorBoundary>
        {view === 'landing' && (
        <Home setView={setView} setHomeMode={setHomeMode} setHomeTab={setHomeTab} />
      )}
      {view === 'intro' && (
        <Intro onContinue={dismissIntro} />
      )}
      {view === 'home' && (
        <Auth setView={setView} setStudent={setStudent} setAdminAuthed={setAdminAuthed} defaultMode={homeMode} defaultTab={homeTab} />
      )}
      {view === 'supporters' && student && (
        <Supporters student={student} setStudent={setStudent} setView={setView} />
      )}
      {view === 'subjects' && (
        <SubjectSelect student={student} setStudent={setStudent} setView={setView} />
      )}
      {view === 'dashboard' && student && (
        <Dashboard
          student={student}
          setView={setView}
          setStudent={setStudent}
          setSelectedSubjectDetail={setSelectedSubjectDetail}
          setRetakeData={setRetakeData}
        />
      )}
      {view === 'subject-detail' && student && selectedSubjectDetail && (
        <SubjectDetail
          student={student}
          subject={selectedSubjectDetail}
          setView={setView}
          setRetakeData={setRetakeData}
        />
      )}
      {view === 'quiz' && student && (
        <Quiz student={student} setView={setView} setLastScore={setLastScore} retakeData={retakeData} setRetakeData={setRetakeData} />
      )}
      {view === 'results' && student && (
        <Results student={student} lastScore={lastScore} setView={setView} />
      )}
      {view === 'subscribe' && student && (
        <Subscribe student={student} setStudent={setStudent} setView={setView} />
      )}
      {view === 'leaderboard' && student && (
        <Leaderboard student={student} setView={setView} />
      )}
      {view === 'admin' && adminAuthed && (
        <Admin setView={setView} />
      )}
      {view === 'teacher-dashboard' && teacher && (
        <TeacherDashboard teacher={teacher} setTeacher={setTeacher} setView={setView} />
      )}
      {view === 'contact' && student && (
        <Contact student={student} setView={setView} />
      )}

      {/* Update toast */}
      {needRefresh && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
          <div className="bg-[#111] text-white rounded-2xl shadow-lg px-4 py-4 flex items-center gap-3">
            <div className="bg-white/10 rounded-xl p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold font-display">Update Available</p>
              <p className="text-xs text-[#888] font-label">New content is ready</p>
            </div>
            <button
              onClick={() => updateServiceWorker(true)}
              className="bg-white text-[#111] text-xs font-bold px-3 py-2 rounded-xl hover:bg-[#F3F3F2] transition-colors font-label"
            >
              Update
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="text-[#888] hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Install toast — Android/desktop Chrome */}
      {showInstallToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
          <div className="bg-[#111] text-white rounded-2xl shadow-lg px-4 py-4 flex items-center gap-3">
            <div className="bg-white/10 rounded-xl p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold font-display">Install 274Lab</p>
              <p className="text-xs text-[#888] font-label">Add to your home screen</p>
            </div>
            <button
              onClick={handleInstall}
              className="bg-white text-[#111] text-xs font-bold px-3 py-2 rounded-xl hover:bg-[#F3F3F2] transition-colors font-label"
            >
              Install
            </button>
            <button
              onClick={() => setShowInstallToast(false)}
              className="text-[#888] hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* iOS install hint */}
      {showIosHint && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
          <div className="bg-[#111] text-white rounded-2xl shadow-lg px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="bg-white/10 rounded-xl p-2 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold font-display mb-0.5">Install 274Lab</p>
                <p className="text-xs text-[#AAA] font-label leading-relaxed">
                  Tap the{' '}
                  <span className="inline-flex items-center gap-0.5 text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </span>
                  {' '}Share button below, then <strong className="text-white">"Add to Home Screen"</strong>
                </p>
              </div>
              <button
                onClick={() => setShowIosHint(false)}
                className="text-[#888] hover:text-white text-lg leading-none shrink-0"
              >
                ×
              </button>
            </div>
            {/* Arrow pointing down to Safari's share bar */}
            <div className="flex justify-center mt-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#555] animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      )}

      <GlobalToast />

      {showRegCardWarning && (
        <CardWarningPopup
          missedStreak={0}
          isNewRegistration={true}
          onDismiss={() => setShowRegCardWarning(false)}
        />
      )}
      </ErrorBoundary>
    </div>
  )
}
