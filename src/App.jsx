import { useState, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import Home from './pages/Home'
import SubjectSelect from './pages/SubjectSelect'
import Dashboard from './pages/Dashboard'
import Quiz from './pages/Quiz'
import Results from './pages/Results'
import Admin from './pages/Admin'

export default function App() {
  const [view, setView] = useState('home')
  const [student, setStudent] = useState(null)
  const [lastScore, setLastScore] = useState(null)
  const [adminAuthed, setAdminAuthed] = useState(false)
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
    <div className="min-h-screen bg-gray-50">
      {view === 'home' && (
        <Home
          setView={setView}
          setStudent={setStudent}
          setAdminAuthed={setAdminAuthed}
        />
      )}
      {view === 'subjects' && (
        <SubjectSelect
          student={student}
          setStudent={setStudent}
          setView={setView}
        />
      )}
      {view === 'dashboard' && (
        <Dashboard
          student={student}
          setView={setView}
        />
      )}
      {view === 'quiz' && (
        <Quiz
          student={student}
          setView={setView}
          setLastScore={setLastScore}
        />
      )}
      {view === 'results' && (
        <Results
          student={student}
          lastScore={lastScore}
          setView={setView}
        />
      )}
      {view === 'admin' && adminAuthed && (
        <Admin
          setView={setView}
        />
      )}

      {needRefresh && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
          <div className="bg-blue-600 text-white rounded-2xl shadow-lg px-4 py-4 flex items-center gap-3">
            <div className="bg-white/10 rounded-xl p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Update Available</p>
              <p className="text-xs text-blue-200">New content is ready</p>
            </div>
            <button
              onClick={() => updateServiceWorker(true)}
              className="bg-white text-blue-600 text-xs font-bold px-3 py-2 rounded-xl hover:bg-blue-50 transition-colors"
            >
              Update
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="text-blue-200 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {showInstallToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
          <div className="bg-gray-900 text-white rounded-2xl shadow-lg px-4 py-4 flex items-center gap-3">
            <div className="bg-white/10 rounded-xl p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Install JAMB Quiz</p>
              <p className="text-xs text-gray-400">Add to your home screen</p>
            </div>
            <button
              onClick={handleInstall}
              className="bg-white text-gray-900 text-xs font-bold px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              Install
            </button>
            <button
              onClick={() => setShowInstallToast(false)}
              className="text-gray-400 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
