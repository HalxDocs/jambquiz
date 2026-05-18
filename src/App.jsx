import { useState, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import Home from './pages/Home'
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
import { findStudent, stripSensitive } from './store/useStore'

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
function isInStandaloneMode() {
  return ('standalone' in window.navigator) && window.navigator.standalone
}

const SESSION_KEY = 'jamb_session'
const INTRO_KEY = 'jamb_intro_seen'

export default function App() {
  const introSeen = typeof window !== 'undefined' && localStorage.getItem(INTRO_KEY) === '1'
  const savedSession = (() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
  })()

  const [view, setView] = useState(savedSession ? 'dashboard' : (introSeen ? 'home' : 'intro'))
  const [student, setStudentState] = useState(savedSession)
  const [lastScore, setLastScore] = useState(null)
  const [adminAuthed, setAdminAuthed] = useState(false)
  const [selectedSubjectDetail, setSelectedSubjectDetail] = useState(null)
  const [retakeData, setRetakeData] = useState(null)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallToast, setShowInstallToast] = useState(false)
  const [showIosHint, setShowIosHint] = useState(() => isIos() && !isInStandaloneMode())

  const setStudent = (s) => {
    const safe = s ? stripSensitive(s) : null
    setStudentState(safe || s)
    if (safe) localStorage.setItem(SESSION_KEY, JSON.stringify(safe))
    else localStorage.removeItem(SESSION_KEY)
  }

  const dismissIntro = () => {
    localStorage.setItem(INTRO_KEY, '1')
    setView('home')
  }

  // Intercept hardware back button — go to dashboard instead of closing the app
  useEffect(() => {
    const subViews = ['quiz', 'results', 'leaderboard', 'subject-detail', 'subscribe', 'supporters', 'subjects']
    if (subViews.includes(view)) {
      window.history.pushState({ jamb: view }, '')
    }
  }, [view])

  useEffect(() => {
    const handler = () => {
      const subViews = ['quiz', 'results', 'leaderboard', 'subject-detail', 'subscribe', 'supporters', 'subjects']
      if (subViews.includes(view)) {
        setView('dashboard')
        window.history.pushState({ jamb: 'dashboard' }, '')
      }
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [view])

  // Refresh persisted student from server on mount (so subjects/year stay current)
  useEffect(() => {
    if (savedSession?.name) {
      findStudent(savedSession.name).then((fresh) => {
        if (fresh) setStudent(fresh)
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) setInterval(() => r.update(), 60 * 60 * 1000)
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
      {view === 'intro' && (
        <Intro onContinue={dismissIntro} />
      )}
      {view === 'home' && (
        <Home setView={setView} setStudent={setStudent} setAdminAuthed={setAdminAuthed} />
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
    </div>
  )
}
