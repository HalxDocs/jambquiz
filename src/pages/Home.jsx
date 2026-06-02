import { useState, useRef, useEffect } from 'react'
import { registerStudent, findStudent, hashPassword, verifyPassword, stripSensitive, updateStudent } from '../store/useStore'
import { doc, getDoc, setDoc, db } from '../firebase'

const LOGIN_COOLDOWN_MS = 30000
const MAX_ATTEMPTS = 5

import SEO from '../components/seo/SEO'

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "274Lab",
  "description": "JAMB Weekly Quiz and revision platform. 274 days to identify weaknesses and ace JAMB.",
  "url": "https://fitness-gym-fc040.web.app",
}

export default function Home({ setView, setStudent, setAdminAuthed }) {
  const [tab, setTab] = useState('student')
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [email, setEmail] = useState('')
  const [adminPw, setAdminPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [recoveredPassword, setRecoveredPassword] = useState('')
  const [showForgot, setShowForgot] = useState(false)
  const [resetStudentId, setResetStudentId] = useState(null)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [adminSetupMode, setAdminSetupMode] = useState(false)
  const [adminSetupConfirm, setAdminSetupConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showAdminPw, setShowAdminPw] = useState(false)
  const [showSetupPw, setShowSetupPw] = useState(false)
  const [showSetupConfirm, setShowSetupConfirm] = useState(false)

  const RATE_LIMIT_KEY = 'jamb_login_ratelimit'
  const attemptsRef = useRef(0)
  const cooldownUntilRef = useRef(0)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RATE_LIMIT_KEY)
      if (raw) {
        const { attempts, cooldownUntil } = JSON.parse(raw)
        if (Number.isFinite(attempts)) attemptsRef.current = attempts
        if (Number.isFinite(cooldownUntil)) cooldownUntilRef.current = cooldownUntil
      }
    } catch {}
  }, [])

  const persistRateLimit = () => {
    try {
      localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify({
        attempts: attemptsRef.current,
        cooldownUntil: cooldownUntilRef.current,
      }))
    } catch {}
  }

  const checkOnline = () => {
    if (!navigator.onLine) {
      setErr('No internet connection. Please check your network and try again.')
      return false
    }
    return true
  }

  const years = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + i))

  const checkRateLimit = () => {
    const now = Date.now()
    if (now < cooldownUntilRef.current) {
      const secs = Math.ceil((cooldownUntilRef.current - now) / 1000)
      setErr(`Too many attempts. Try again in ${secs}s.`)
      return false
    }
    return true
  }

  const recordAttempt = () => {
    attemptsRef.current++
    if (attemptsRef.current >= MAX_ATTEMPTS) {
      cooldownUntilRef.current = Date.now() + LOGIN_COOLDOWN_MS
      attemptsRef.current = 0
    }
    persistRateLimit()
  }

  const handleLogin = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 3) { setErr('Enter your full name'); return }
    if (!password) { setErr('Enter your password'); return }
    if (!checkRateLimit()) return
    if (!checkOnline()) return
    setLoading(true); setErr('')
    try {
      const existing = await findStudent(trimmed)
      if (!existing) { setErr('Name not found. Please register first.'); recordAttempt(); setLoading(false); return }
      const valid = await verifyPassword(password, existing.password)
      if (!valid) { setErr('Wrong password. Try again.'); recordAttempt(); setLoading(false); return }
      attemptsRef.current = 0
      cooldownUntilRef.current = 0
      persistRateLimit()
      const safe = stripSensitive(existing)
      setStudent(safe)
      setView('dashboard')
    } catch {
      if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr('Could not sign in. Server error — please try again.')
    }
    setLoading(false)
  }

  const handleRegister = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 3) { setErr('Enter your full name (at least 3 characters)'); return }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Enter a valid email'); return }
    if (password.length < 4) { setErr('Password must be at least 4 characters'); return }
    if (password !== confirmPassword) { setErr('Passwords do not match'); return }
    if (!checkOnline()) return
    setLoading(true); setErr('')
    try {
      const existing = await findStudent(trimmed)
      if (existing) { setErr('This name is already registered. Please lock in.'); setLoading(false); return }
      const newStudent = {
        name: trimmed,
        nickname: nickname.trim(),
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
      if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr('Could not create account. Server error — please try again.')
    }
    setLoading(false)
  }

  const handleAdmin = async () => {
    if (!adminPw) { setErr('Enter the admin password'); return }
    if (!checkOnline()) return
    setLoading(true); setErr('')
    try {
      const snap = await getDoc(doc(db, 'admin_settings', 'admin_auth'))
      if (!snap.exists()) {
        setAdminSetupMode(true)
        setErr('No admin password set. Enter a new password to configure.')
        setLoading(false)
        return
      }
      const data = snap.data()
      const valid = await verifyPassword(adminPw, data.passwordHash)
      if (!valid) { setErr('Wrong password'); setLoading(false); return }
      setAdminAuthed(true); setView('admin')
    } catch {
      if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr('Could not verify admin. Server error — please try again.')
    }
    setLoading(false)
  }

  const handleAdminSetup = async () => {
    if (!adminPw) { setErr('Enter a password'); return }
    if (adminPw.length < 4) { setErr('Password must be at least 4 characters'); return }
    if (adminPw !== adminSetupConfirm) { setErr('Passwords do not match'); return }
    if (!checkOnline()) return
    setLoading(true); setErr('')
    try {
      const passwordHash = await hashPassword(adminPw)
      await setDoc(doc(db, 'admin_settings', 'admin_auth'), { passwordHash })
      setAdminSetupMode(false)
      setAdminSetupConfirm('')
      setAdminPw('')
      setErr('')
    } catch {
      if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    if (resetStudentId) {
      if (!currentPassword) { setErr('Enter your current password to confirm'); return }
      if (!password) { setErr('Enter a new password'); return }
      if (password.length < 4) { setErr('Password must be at least 4 characters'); return }
      if (password !== confirmPassword) { setErr('Passwords do not match'); return }
      if (!checkOnline()) return
      setLoading(true); setErr('')
      try {
        const studentDoc = await findStudent(name.trim())
        if (!studentDoc) { setErr('Student not found.'); setLoading(false); return }
        const valid = await verifyPassword(currentPassword, studentDoc.password)
        if (!valid) { setErr('Current password is incorrect.'); recordAttempt(); setLoading(false); return }
        const passwordHash = await hashPassword(password)
        await updateStudent(resetStudentId, { password: passwordHash })
        setRecoveredPassword('done')
        setPassword('')
        setCurrentPassword('')
        setConfirmPassword('')
        setResetStudentId(null)
        attemptsRef.current = 0
        cooldownUntilRef.current = 0
        persistRateLimit()
      } catch {
        if (!navigator.onLine) setErr('No internet connection. Check your network.')
        else setErr('Failed to reset password. Please try again.')
      }
      setLoading(false)
      return
    }

    const trimmed = name.trim()
    if (trimmed.length < 3) { setErr('Enter your full name'); return }
    if (!checkOnline()) return
    setLoading(true); setErr(''); setRecoveredPassword('')
    try {
      const existing = await findStudent(trimmed)
      if (!existing) { setErr('Name not found. Please register first.'); setLoading(false); return }
      setResetStudentId(existing.id)
      setRecoveredPassword('reset')
    } catch {
      if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <>
      <SEO title="Home" jsonLd={ORG_JSONLD} />
    <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto bg-[#111] rounded-2xl flex flex-col items-center justify-center mb-2 shadow-md">
              <span className="text-xl font-bold text-white font-display leading-none tracking-tighter">274</span>
              <span className="text-[9px] font-bold text-white/50 font-display leading-none tracking-widest uppercase mt-0.5">Lab</span>
            </div>
            <p className="text-xs text-[#888] font-label leading-relaxed">
              274days to identify weaknesses and fix them to ace JAMB
            </p>
          {mode !== 'register' && (
            <p className="text-xs text-[#AAA] font-label">
              Weekly Mock: Fri & Sat · 5:00 pm – 6:00 pm
            </p>
          )}
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
                      maxLength={50}
                      placeholder="e.g. Chukwuemeka Okafor"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                    />
                  </div>

                  {mode === 'register' && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Nickname <span className="text-[#CCC] normal-case tracking-normal">(Name friends call you)</span>
                      </label>
                      <input
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="e.g. Emeka, ChiChi"
                        className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                      />
                    </div>
                  )}
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
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && mode === 'login' && handleLogin()}
                        maxLength={64}
                        placeholder={mode === 'register' ? 'Minimum 4 characters' : '••••••••'}
                        className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                        {showPassword ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>
                    {mode === 'login' && (
                      <button onClick={() => { setShowForgot(true); setErr(''); setRecoveredPassword('') }}
                        className="text-[11px] text-[#888] hover:text-[#111] mt-1.5 font-label underline underline-offset-2 transition-colors">
                        Forgot password?
                      </button>
                    )}
                  </div>

                  {mode === 'register' && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirm ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                          placeholder="Repeat your password"
                          className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                        />
                        <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                          {showConfirm ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                              <line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {showForgot && (
                  <div className="bg-[#F8F8F7] border border-[#EBEBEB] rounded-xl p-4 mt-3 space-y-3">
                    {recoveredPassword === 'done' ? (
                      <>
                        <p className="text-xs font-semibold text-green-700 font-label">✓ Password reset successful</p>
                        <p className="text-[11px] text-[#888] font-label">You can now lock in with your new password.</p>
                        <button onClick={() => { setShowForgot(false); setErr(''); setRecoveredPassword('') }}
                          className="w-full mt-1 bg-[#111] text-white rounded-xl py-2.5 text-xs font-bold hover:bg-[#222] transition-all font-display">
                          Back to Login
                        </button>
                      </>
                    ) : recoveredPassword === 'reset' ? (
                      <>
                        <p className="text-xs font-semibold text-[#111] font-label">Reset Password</p>
                        <p className="text-[11px] text-[#888] font-label">Set a new password for <strong>{name.trim()}</strong></p>
                        <div>
                          <label className="text-[10px] font-semibold text-[#666] uppercase tracking-wide block mb-1 font-label">Current Password <span className="text-red-500">*</span></label>
                          <div className="relative">
                            <input type={showPassword ? 'text' : 'password'} value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              maxLength={64}
                              placeholder="Your current password"
                              className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-[#111] transition-colors bg-white" />
                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                              {showPassword ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                                  <line x1="1" y1="1" x2="23" y2="23"/>
                                </svg>
                              ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                  <circle cx="12" cy="12" r="3"/>
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-[#666] uppercase tracking-wide block mb-1 font-label">New Password</label>
                          <div className="relative">
                            <input type={showResetPassword ? 'text' : 'password'} value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              maxLength={64}
                              placeholder="Minimum 4 characters"
                              className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-[#111] transition-colors bg-white" />
                            <button type="button" onClick={() => setShowResetPassword(!showResetPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                              {showResetPassword ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                                  <line x1="1" y1="1" x2="23" y2="23"/>
                                </svg>
                              ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                  <circle cx="12" cy="12" r="3"/>
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-[#666] uppercase tracking-wide block mb-1 font-label">Confirm Password</label>
                          <div className="relative">
                            <input type={showResetConfirm ? 'text' : 'password'} value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword()}
                              placeholder="Repeat your password"
                              className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-[#111] transition-colors bg-white" />
                            <button type="button" onClick={() => setShowResetConfirm(!showResetConfirm)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                              {showResetConfirm ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                                  <line x1="1" y1="1" x2="23" y2="23"/>
                                </svg>
                              ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                  <circle cx="12" cy="12" r="3"/>
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleForgotPassword} disabled={loading}
                            className="flex-1 bg-[#111] text-white rounded-xl py-2.5 text-xs font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display disabled:opacity-40">
                            {loading ? 'Resetting…' : 'Reset Password →'}
                          </button>
                          <button onClick={() => { setShowForgot(false); setErr(''); setRecoveredPassword(''); setResetStudentId(null); setPassword(''); setConfirmPassword('') }}
                            className="flex-1 bg-white border border-[#E5E5E5] text-[#888] rounded-xl py-2.5 text-xs font-bold hover:text-[#111] hover:border-[#CCC] transition-all font-label">
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-[#111] font-label">Recover Password</p>
                        <p className="text-[11px] text-[#888] font-label">Enter your full name to find your account, then set a new password.</p>
                        <input value={name}
                          onChange={(e) => setName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword()}
                          maxLength={50}
                          placeholder="Enter your full name"
                          className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#111] transition-colors bg-white" />
                        <div className="flex gap-2">
                          <button onClick={handleForgotPassword} disabled={loading}
                            className="flex-1 bg-[#111] text-white rounded-xl py-2.5 text-xs font-bold hover:bg-[#222] transition-all font-display disabled:opacity-40">
                            {loading ? 'Searching…' : 'Find Account'}
                          </button>
                          <button onClick={() => { setShowForgot(false); setErr(''); setRecoveredPassword(''); setResetStudentId(null) }}
                            className="flex-1 bg-white border border-[#E5E5E5] text-[#888] rounded-xl py-2.5 text-xs font-bold hover:text-[#111] hover:border-[#CCC] transition-all font-label">
                            Back
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {err && (
                  <div className="mt-3 px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                    <p className="text-red-600 text-xs font-label">{err}</p>
                  </div>
                )}

                {!showForgot && (
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
                )}

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
                {adminSetupMode ? (
                  <div className="space-y-3.5">
                    <p className="text-xs font-bold text-[#111] font-label">Set Admin Password</p>
                    <p className="text-[11px] text-[#888] font-label">This is a one-time setup. The password will be stored securely in the database.</p>
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">New Password</label>
                      <div className="relative">
                        <input type={showSetupPw ? 'text' : 'password'} value={adminPw}
                          onChange={(e) => setAdminPw(e.target.value)}
                          className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-[#111] transition-colors bg-white" />
                        <button type="button" onClick={() => setShowSetupPw(!showSetupPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                          {showSetupPw ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                              <line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">Confirm Password</label>
                      <div className="relative">
                        <input type={showSetupConfirm ? 'text' : 'password'} value={adminSetupConfirm}
                          onChange={(e) => setAdminSetupConfirm(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAdminSetup()}
                          className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-[#111] transition-colors bg-white" />
                        <button type="button" onClick={() => setShowSetupConfirm(!showSetupConfirm)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                          {showSetupConfirm ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                              <line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    {err && (
                      <div className="px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                        <p className="text-red-600 text-xs font-label">{err}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={handleAdminSetup} disabled={loading}
                        className="flex-1 bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display disabled:opacity-40">
                        {loading ? 'Saving…' : 'Set Password →'}
                      </button>
                      <button onClick={() => { setAdminSetupMode(false); setErr(''); setAdminPw(''); setAdminSetupConfirm('') }}
                        className="flex-1 border border-[#E5E5E5] text-[#888] rounded-xl py-3 text-sm font-bold hover:text-[#111] transition-colors font-label">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-4">
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Admin Password
                      </label>
                      <div className="relative">
                        <input
                          type={showAdminPw ? 'text' : 'password'}
                          value={adminPw}
                          onChange={(e) => setAdminPw(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAdmin()}
                          placeholder="••••••••"
                          className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                        />
                        <button type="button" onClick={() => setShowAdminPw(!showAdminPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                          {showAdminPw ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                              <line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    {err && (
                      <div className="mb-3 px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                        <p className="text-red-600 text-xs font-label">{err}</p>
                      </div>
                    )}
                    <button
                      onClick={handleAdmin}
                      disabled={loading}
                      className="w-full bg-[#111] text-white rounded-xl py-3.5 text-sm font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display disabled:opacity-40"
                    >
                      {loading ? 'Verifying...' : 'Access Admin →'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-[#AAA] mt-6 font-label">
          Supported by <span className="text-[#555] font-semibold">A.M.C</span>
        </p>
      </div>
    </div>
    </>
  )
}
