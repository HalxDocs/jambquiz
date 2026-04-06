import { useState } from 'react'
import { registerStudent, findStudent } from '../store/useStore'

export default function Home({ setView, setStudent, setAdminAuthed }) {
  const [tab, setTab] = useState('student')
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [year, setYear] = useState('SS3')
  const [adminPw, setAdminPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const years = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3', 'Graduate']

  const handleLogin = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 3) { setErr('Enter your full name'); return }
    if (!password) { setErr('Enter your password'); return }
    setLoading(true)
    setErr('')
    try {
      const existing = await findStudent(trimmed)
      if (!existing) {
        setErr('Name not found. Please register first.')
        setLoading(false)
        return
      }
      if (existing.password !== password) {
        setErr('Wrong password. Try again.')
        setLoading(false)
        return
      }
      setStudent(existing)
      setView(existing.subjects?.length ? 'dashboard' : 'subjects')
    } catch (e) {
      setErr('Connection error. Check your internet.')
    }
    setLoading(false)
  }

  const handleRegister = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 3) { setErr('Enter your full name (at least 3 characters)'); return }
    if (password.length < 4) { setErr('Password must be at least 4 characters'); return }
    if (password !== confirmPassword) { setErr('Passwords do not match'); return }
    setLoading(true)
    setErr('')
    try {
      const existing = await findStudent(trimmed)
      if (existing) {
        setErr('This name is already registered. Please login instead.')
        setLoading(false)
        return
      }
      const newStudent = {
        name: trimmed,
        password,
        year,
        subjects: [],
        joinedAt: new Date().toISOString(),
      }
      const saved = await registerStudent(newStudent)
      if (!saved) {
        setErr('Name already exists. Please login.')
        setLoading(false)
        return
      }
      setStudent(saved)
      setView('subjects')
    } catch (e) {
      setErr('Connection error. Check your internet.')
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
            <div className="flex gap-2 mb-5">
              {['login', 'register'].map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setErr('') }}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    mode === m
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {m === 'login' ? 'Login' : 'Register'}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Full Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Chukwuemeka Okafor"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400"
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Year / Class</label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400 bg-white"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 block mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && mode === 'login' && handleLogin()}
                  placeholder={mode === 'register' ? 'Create a password' : 'Enter your password'}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400"
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400"
                  />
                </div>
              )}
            </div>

            {err && <p className="text-red-500 text-xs mt-3">{err}</p>}

            <button
              onClick={mode === 'login' ? handleLogin : handleRegister}
              disabled={loading}
              className={`w-full mt-4 rounded-xl py-3 text-sm font-semibold transition-colors ${
                loading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-900 text-white hover:bg-gray-700'
              }`}
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Login →' : 'Register →'}
            </button>

            {mode === 'login' && (
              <p className="text-xs text-gray-400 text-center mt-3">
                No account?{' '}
                <button onClick={() => { setMode('register'); setErr('') }} className="text-gray-600 underline">
                  Register here
                </button>
              </p>
            )}
            {mode === 'register' && (
              <p className="text-xs text-gray-400 text-center mt-3">
                Already registered?{' '}
                <button onClick={() => { setMode('login'); setErr('') }} className="text-gray-600 underline">
                  Login here
                </button>
              </p>
            )}
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