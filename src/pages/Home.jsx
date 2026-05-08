import { useState } from 'react'
import { registerStudent, findStudent } from '../store/useStore'

export default function Home({ setView, setStudent, setAdminAuthed }) {
  const [tab, setTab] = useState('student')
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [year, setYear] = useState('2027')
  const [email, setEmail] = useState('')
  const [adminPw, setAdminPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const years = Array.from({ length: 10 }, (_, i) => String(2027 + i))

  const handleLogin = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 3) { setErr('Enter your full name'); return }
    if (!password) { setErr('Enter your password'); return }
    setLoading(true); setErr('')
    try {
      const existing = await findStudent(trimmed)
      if (!existing) { setErr('Name not found. Please register first.'); setLoading(false); return }
      if (existing.password !== password) { setErr('Wrong password. Try again.'); setLoading(false); return }
      setStudent(existing)
      setView(existing.subjects?.length ? 'dashboard' : 'subjects')
    } catch {
      setErr('Connection error. Check your internet.')
    }
    setLoading(false)
  }

  const handleRegister = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 3) { setErr('Enter your full name (at least 3 characters)'); return }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Enter a valid email'); return }
    if (password.length < 4) { setErr('Password must be at least 4 characters'); return }
    if (password !== confirmPassword) { setErr('Passwords do not match'); return }
    setLoading(true); setErr('')
    try {
      const existing = await findStudent(trimmed)
      if (existing) { setErr('This name is already registered. Please lock in.'); setLoading(false); return }
      const newStudent = {
        name: trimmed,
        password,
        year,
        email: email.trim().toLowerCase(),
        parentPhone: '',
        teacherPhone: '',
        subjects: [],
        joinedAt: new Date().toISOString(),
      }
      const saved = await registerStudent(newStudent)
      if (!saved) { setErr('Name already exists. Please lock in.'); setLoading(false); return }
      setStudent(saved)
      setView('supporters')
    } catch {
      setErr('Connection error. Check your internet.')
    }
    setLoading(false)
  }

  const handleAdmin = () => {
    if (adminPw === 'jamb2024') { setAdminAuthed(true); setView('admin') }
    else setErr('Wrong password')
  }

  return (
    <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto bg-[#111] rounded-2xl flex flex-col items-center justify-center mb-4 shadow-md">
            <span className="text-xl font-bold text-white font-display leading-none tracking-tighter">274</span>
            <span className="text-[9px] font-bold text-white/50 font-display leading-none tracking-widest uppercase mt-0.5">Lab</span>
          </div>
          <p className="text-[10px] font-semibold text-[#888] font-label tracking-[0.2em] uppercase mb-2">
            Diagnose • Discipline • Patch
          </p>
          <p className="text-xs text-[#AAA] font-label">
            Weekly Mock: Fri & Sat · 5:00 pm – 6:00 pm
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-[#EBEBEB]">
            {['student', 'admin'].map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setErr('') }}
                className={`flex-1 py-3.5 text-xs font-semibold tracking-wide uppercase transition-all font-label ${
                  tab === t
                    ? 'text-[#111] border-b-2 border-[#111]'
                    : 'text-[#AAA] hover:text-[#666]'
                }`}
              >
                {t === 'student' ? 'Student' : 'Admin'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === 'student' && (
              <div>
                {/* Mode toggle */}
                <div className="flex gap-1 p-1 bg-[#F3F3F2] rounded-xl mb-5">
                  {['login', 'register'].map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); setErr('') }}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all font-label ${
                        mode === m
                          ? 'bg-white text-[#111] shadow-sm'
                          : 'text-[#999] hover:text-[#555]'
                      }`}
                    >
                      {m === 'login' ? 'Lock In' : 'Register'}
                    </button>
                  ))}
                </div>

                <div className="space-y-3.5">
                  <div>
                    <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                      Full Name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Chukwuemeka Okafor"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                    />
                  </div>

                  {mode === 'register' && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Email <span className="text-[#CCC] normal-case tracking-normal">for payment receipts · optional</span>
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                      />
                    </div>
                  )}

                  {mode === 'register' && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        JAMB Year
                      </label>
                      <select
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white transition-colors"
                      >
                        {years.map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && mode === 'login' && handleLogin()}
                      placeholder={mode === 'register' ? 'Minimum 4 characters' : '••••••••'}
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                    />
                  </div>

                  {mode === 'register' && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                        placeholder="Repeat your password"
                        className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                      />
                    </div>
                  )}
                </div>

                {err && (
                  <div className="mt-3 px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                    <p className="text-red-600 text-xs font-label">{err}</p>
                  </div>
                )}

                <button
                  onClick={mode === 'login' ? handleLogin : handleRegister}
                  disabled={loading}
                  className={`w-full mt-4 rounded-xl py-3.5 text-sm font-bold tracking-wide transition-all active:scale-[0.99] font-display ${
                    loading
                      ? 'bg-[#E5E5E5] text-[#AAA] cursor-not-allowed'
                      : 'bg-[#111] text-white hover:bg-[#222]'
                  }`}
                >
                  {loading ? 'Please wait…' : mode === 'login' ? 'Lock In →' : 'Create Account →'}
                </button>

                <p className="text-xs text-[#AAA] text-center mt-3 font-label">
                  {mode === 'login' ? 'No account? ' : 'Already registered? '}
                  <button
                    onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr('') }}
                    className="text-[#111] font-semibold underline underline-offset-2"
                  >
                    {mode === 'login' ? 'Register here' : 'Lock in'}
                  </button>
                </p>
              </div>
            )}

            {tab === 'admin' && (
              <div>
                <div className="mb-4">
                  <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                    Admin Password
                  </label>
                  <input
                    type="password"
                    value={adminPw}
                    onChange={(e) => setAdminPw(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdmin()}
                    placeholder="••••••••"
                    className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                  />
                </div>
                {err && (
                  <div className="mb-3 px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                    <p className="text-red-600 text-xs font-label">{err}</p>
                  </div>
                )}
                <button
                  onClick={handleAdmin}
                  className="w-full bg-[#111] text-white rounded-xl py-3.5 text-sm font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display"
                >
                  Access Admin →
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-[#AAA] mt-6 font-label">
          Supported by <span className="text-[#555] font-semibold">Adeola Memorial College</span>
        </p>
      </div>
    </div>
  )
}
