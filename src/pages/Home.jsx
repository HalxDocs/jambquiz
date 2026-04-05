import { useState } from 'react'
import { registerStudent, findStudent } from '../store/useStore'

export default function Home({ setView, setStudent, setAdminAuthed }) {
  const [tab, setTab] = useState('student')
  const [name, setName] = useState('')
  const [adminPw, setAdminPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const handleStudent = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 3) {
      setErr('Enter your full name (at least 3 characters)')
      return
    }
    setLoading(true)
    setErr('')
    try {
      const existing = await findStudent(trimmed)
      if (existing) {
        setStudent(existing)
        setView(existing.subjects?.length ? 'dashboard' : 'subjects')
      } else {
        const newStudent = {
          name: trimmed,
          subjects: [],
          joinedAt: new Date().toISOString(),
        }
        const saved = await registerStudent(newStudent)
        setStudent(saved)
        setView('subjects')
      }
    } catch (e) {
      setErr('Connection error. Please check your internet and try again.')
    }
    setLoading(false)
  }

  const handleAdmin = () => {
    if (adminPw === 'jamb2024') {
      setAdminAuthed(true)
      setView('admin')
    } else {
      setErr('Wrong password')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md p-8">

        <div className="text-center mb-8">
          <div className="text-xs tracking-widest text-gray-400 uppercase mb-2">Nigeria</div>
          <h1 className="text-3xl font-bold text-gray-900">JAMB Weekly Quiz</h1>
          <p className="text-gray-500 mt-2 text-sm">Every Friday · 5:00pm – 6:00pm login window</p>
        </div>

        <div className="flex border-b border-gray-200 mb-6">
          {['student', 'admin'].map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setErr('') }}
              className={`flex-1 pb-3 text-sm font-medium transition-colors ${
                tab === t
                  ? 'border-b-2 border-gray-900 text-gray-900'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'student' ? 'Student' : 'Admin'}
            </button>
          ))}
        </div>

        {tab === 'student' && (
          <div>
            <label className="text-sm text-gray-500 block mb-2">Your Full Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStudent()}
              placeholder="e.g. Chukwuemeka Okafor"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400"
            />
            {err && <p className="text-red-500 text-xs mt-2">{err}</p>}
            <button
              onClick={handleStudent}
              disabled={loading}
              className={`w-full mt-4 rounded-xl py-3 text-sm font-semibold transition-colors ${
                loading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-900 text-white hover:bg-gray-700'
              }`}
            >
              {loading ? 'Please wait...' : 'Continue →'}
            </button>
            <p className="text-xs text-gray-400 text-center mt-3">
              Returning? Enter your name exactly as before
            </p>
          </div>
        )}

        {tab === 'admin' && (
          <div>
            <label className="text-sm text-gray-500 block mb-2">Admin Password</label>
            <input
              type="password"
              value={adminPw}
              onChange={(e) => setAdminPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdmin()}
              placeholder="Enter password"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400"
            />
            {err && <p className="text-red-500 text-xs mt-2">{err}</p>}
            <button
              onClick={handleAdmin}
              className="w-full mt-4 bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors"
            >
              Login as Admin →
            </button>
          </div>
        )}

      </div>
    </div>
  )
}