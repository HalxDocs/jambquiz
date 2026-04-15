import { useState, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import Home from './pages/Home'
import SubjectSelect from './pages/SubjectSelect'
import Dashboard from './pages/Dashboard'
import Quiz from './pages/Quiz'
import Results from './pages/Results'
import Admin from './pages/Admin'
import SubjectDetail from './pages/SubjectDetail'

export default function App() {
  const [view, setView] = useState('home')
  const [student, setStudent] = useState(null)
  const [lastScore, setLastScore] = useState(null)
  const [adminAuthed, setAdminAuthed] = useState(false)
  const [selectedSubjectDetail, setSelectedSubjectDetail] = useState(null)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallToast, setShowInstallToast] = useState(false)

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
      {view === 'home' && (
        <Home setView={setView} setStudent={setStudent} setAdminAuthed={setAdminAuthed} />
      )}
      {view === 'subjects' && (
        <SubjectSelect student={student} setStudent={setStudent} setView={setView} />
      )}
      {view === 'dashboard' && student && (
        <Dashboard
          student={student}
          setView={setView}
          setSelectedSubjectDetail={setSelectedSubjectDetail}
        />
      )}
      {view === 'subject-detail' && student && selectedSubjectDetail && (
        <SubjectDetail
          student={student}
          subject={selectedSubjectDetail}
          setView={setView}
        />
      )}
      {view === 'quiz' && student && (
        <Quiz student={student} setView={setView} setLastScore={setLastScore} />
      )}
      {view === 'results' && student && (
        <Results student={student} lastScore={lastScore} setView={setView} />
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

      {/* Install toast */}
      {showInstallToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
          <div className="bg-[#111] text-white rounded-2xl shadow-lg px-4 py-4 flex items-center gap-3">
            <div className="bg-white/10 rounded-xl p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold font-display">Install JAMB Quiz</p>
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
    </div>
  )
}
