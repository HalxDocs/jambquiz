import { useState, useRef, useEffect } from 'react'
import {
  registerStudent,
  verifyAdminSession,
} from '../store/useStore'
import { setStudentUid, setRegistering } from '../store/studentSession'
import { loginStudent, loginAdminGo } from '../store/session'
import { apiPost } from '../lib/api'
import { useUserNotificationStore } from '../store/notificationStore'
import { useThemeStore } from '../store/theme'
import {
  registerTeacher,
  teacherSignIn,
  getTeacherByUid,
} from '../store/useStore'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, Sun01Icon, Moon01Icon } from '@hugeicons/core-free-icons'
import SEO from '../components/seo/SEO'
import ServerMoveBanner from '../components/ui/ServerMoveBanner'
import { RESET_FLAG } from '../lib/api'
import { apiConfigured, requestPasswordReset, confirmPasswordReset } from '../lib/api'

const LOGIN_COOLDOWN_MS = 30000
const MAX_ATTEMPTS = 5

export default function Auth({ setView, setStudent, setAdminAuthed, defaultMode, defaultTab }) {
  const [tab, setTab] = useState(defaultTab || 'student')
  const [mode, setMode] = useState(defaultMode || 'login')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [referrer, setReferrer] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [email, setEmail] = useState('')
  const [adminPw, setAdminPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showAdminPw, setShowAdminPw] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  // New-server password reset (Go backend)
  const [showReset, setShowReset] = useState(false)
  const [resetStep, setResetStep] = useState('name')
  const [resetName, setResetName] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetPw, setResetPw] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  const [resetDone, setResetDone] = useState(false)

  // Teacher tab state
  const [tName, setTName] = useState('')
  const [tEmail, setTEmail] = useState('')
  const [tPhone, setTPhone] = useState('')
  const [tPass, setTPass] = useState('')
  const [tConfirm, setTConfirm] = useState('')
  const [tPioneerCode, setTPioneerCode] = useState('')
  const [teacherStep, setTeacherStep] = useState(1)
  const [showPhoneConfirm, setShowPhoneConfirm] = useState(false)

  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

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

  useEffect(() => {
    try {
      if (localStorage.getItem(RESET_FLAG) === '1') {
        localStorage.removeItem(RESET_FLAG)
        setShowReset(true)
        setTab('student')
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

  const setTeacherSession = (t) => {
    try {
      if (t) localStorage.setItem('jamb_teacher_session', JSON.stringify(t))
      else localStorage.removeItem('jamb_teacher_session')
    } catch {}
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
    if (loading) return
    setLoading(true); setErr('')
    try {
      const res = await loginStudent(trimmed, password)
      attemptsRef.current = 0
      cooldownUntilRef.current = 0
      persistRateLimit()
      const stu = res.student
      if (stu) { setStudentUid(stu.id); setStudent(stu); setView('dashboard') }
      else { setErr('Could not load your account. Please try again.'); setLoading(false); return }
    } catch (e) {
      const msg = (e && e.message) || ''
      if (/invalid|unauthorized|expired/i.test(msg)) { setErr('Wrong name or password'); recordAttempt() }
      else if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr(msg || 'Could not sign in. Server error — please try again.')
    }
    setLoading(false)
  }

  const handleRegister = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 3) { setErr('Enter your full name (at least 3 characters)'); return }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Enter a valid email'); return }
    if (password.length < 8) { setErr('Password must be at least 8 characters'); return }
    if (password !== confirmPassword) { setErr('Passwords do not match'); return }
    if (!acceptedTerms) { setErr('You must agree to the Terms and Conditions to create an account.'); return }
    if (!checkOnline()) return
    setLoading(true); setErr('')
    try {
      // Flag so onAuthStateChanged doesn't route the fresh account to the
      // dashboard before the Supporters hand-off.
      setRegistering(true)
      const saved = await registerStudent({
        name: trimmed,
        nickname: nickname.trim(),
        password,
        year,
        email: email.trim().toLowerCase(),
        phone: '',
        parentPhone: '',
        teacherPhone: '',
        subjects: [],
        referredBy: referrer.trim(),
        joinedAt: new Date().toISOString(),
      })
      if (!saved) { setErr('This name is already registered. Please lock in.'); setLoading(false); setRegistering(false); return }
      // Clear old persisted patches / notification state from previous sessions
      localStorage.removeItem('patches_active')
      localStorage.removeItem('patches_selected_subjects')
      useUserNotificationStore.getState().setPatchesActive(false)
      useUserNotificationStore.getState().setSelectedPatchSubjects([])
      useUserNotificationStore.getState().setPushPermission('default')
      useUserNotificationStore.getState().setPushSubscription(null)
      setStudentUid(saved.id)
      setStudent(saved)
      setRegistering(false)
      // Send welcome SMS in background (non-blocking)
      try {
        apiPost('/api/notify/welcome-sms', { studentId: saved.id }).catch((e) => {
          console.error('[Auth] Welcome SMS failed:', e?.message || e)
        })
      } catch {}
      setView('supporters')
    } catch {
      setRegistering(false)
      if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr('Could not create account. Server error — please try again.')
    }
    setLoading(false)
  }

  const handleAdmin = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 3) { setErr('Enter the admin name'); return }
    if (!adminPw) { setErr('Enter the admin password'); return }
    if (!checkOnline()) return
    setLoading(true); setErr('')
    try {
      await loginAdminGo(trimmed, adminPw)
      const isAdmin = await verifyAdminSession()
      if (!isAdmin) { setErr('Not an admin account'); setLoading(false); return }
      setAdminAuthed(true); setView('admin')
    } catch (e) {
      const msg = (e && e.message) || ''
      if (/invalid|unauthorized|expired|not an admin/i.test(msg)) setErr(msg || 'Wrong name or password')
      else if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr(msg || 'Could not verify admin. Server error — please try again.')
    }
    setLoading(false)
  }

  const handleTeacherNextStep = () => {
    const emailTrim = tEmail.trim().toLowerCase()
    if (tName.trim().length < 3) { setErr('Enter your full name (at least 3 characters)'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) { setErr('Enter a valid email address'); return }
    if (tPass.length < 8) { setErr('Password must be at least 8 characters'); return }
    if (tPass !== tConfirm) { setErr('Passwords do not match'); return }
    setErr('')
    setTeacherStep(2)
  }

  // Teacher confirms the typed number in a modal instead of SMS OTP.
  // The number can be corrected later from the dashboard (Edit phone number).
  const openPhoneConfirm = () => {
    const phone = tPhone.trim()
    const emailTrim = tEmail.trim().toLowerCase()
    if (tName.trim().length < 3) { setErr('Enter your full name (at least 3 characters)'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) { setErr('Enter a valid email address'); return }
    if (phone.replace(/\D/g, '').length < 10) { setErr('Enter a valid phone number'); return }
    if (tPass.length < 8) { setErr('Password must be at least 8 characters'); return }
    if (tPass !== tConfirm) { setErr('Passwords do not match'); return }
    if (tPioneerCode.trim() && !/^\d{4}$/.test(tPioneerCode.trim())) { setErr('Pioneer code must be 4 digits'); return }
    if (!checkOnline()) return
    setErr('')
    setShowPhoneConfirm(true)
  }

  const handleTeacherRegister = async () => {
    const phone = tPhone.trim()
    const emailTrim = tEmail.trim().toLowerCase()
    if (!checkOnline()) return
    setLoading(true); setErr('')
    try {
      const res = await registerTeacher({
        name: tName.trim(),
        email: emailTrim,
        phone: phone.replace(/^\+?234/, ''),
        password: tPass,
        pioneerCode: tPioneerCode.trim() || undefined,
      })
      if (!res || !res.ok) { setErr('Registration failed. Please try again.'); setLoading(false); return }
      // Teacher session is stored by teacherSignIn; App routes to the dashboard.
      await teacherSignIn(emailTrim, tPass)
      const t = await getTeacherByUid()
      setTeacherSession(t)
      setShowPhoneConfirm(false)
      setView('teacher-dashboard')
    } catch (e) {
      const msg = (e && e.message) || 'Could not create your account.'
      if (msg.includes('already-exists')) setErr('This email is already registered.')
      else if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr(msg)
    }
    setLoading(false)
  }

  const handleTeacherLogin = async () => {
    const emailTrim = tEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) { setErr('Enter the email you registered with'); return }
    if (!tPass) { setErr('Enter your password'); return }
    if (!checkRateLimit()) return
    if (!checkOnline()) return
    if (loading) return
    setLoading(true); setErr('')
    try {
      await teacherSignIn(emailTrim, tPass)
      const t = await getTeacherByUid()
      if (!t) { setErr('No teacher account found for that email.'); setLoading(false); return }
      setTeacherSession(t)
      setView('teacher-dashboard')
    } catch (e) {
      const code = e && e.code
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-email') {
        setErr('Wrong email or password'); recordAttempt()
      } else if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr('Could not sign in. Please try again.')
    }
    setLoading(false)
  }

  const handleResetRequest = async () => {
    const trimmed = resetName.trim()
    if (trimmed.length < 3) { setResetMsg('Enter your full name'); return }
    if (!apiConfigured()) { setResetMsg('Online reset is not available yet. Please try again later or contact support.'); return }
    setResetBusy(true); setResetMsg('')
    try {
      await requestPasswordReset(trimmed)
      setResetStep('code')
      setResetMsg('Code sent by SMS to your number and your parent\'s number.')
    } catch (e) {
      setResetMsg(e?.message || 'Could not send code. Please try again.')
    }
    setResetBusy(false)
  }

  const handleResetConfirm = async () => {
    if (resetCode.trim().length !== 4) { setResetMsg('Enter the 4-digit code'); return }
    if (resetPw.length < 8) { setResetMsg('New password must be at least 8 characters'); return }
    if (resetPw !== resetConfirm) { setResetMsg('Passwords do not match'); return }
    setResetBusy(true); setResetMsg('')
    try {
      await confirmPasswordReset(resetName.trim(), resetCode.trim(), resetPw)
      setResetDone(true)
    } catch (e) {
      setResetMsg(e?.message || 'Could not reset password. Please try again.')
    }
    setResetBusy(false)
  }

  const EyeIcon = ({ open }) => open ? (
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
  )

  return (
    <>
      <SEO title="Sign In" />
    <div className="min-h-screen bg-[#F8F8F7] flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-[#EBEBEB]">
        <div className="max-w-sm mx-auto px-5 h-14 flex items-center justify-between">
          <button onClick={() => setView('landing')} className="flex items-center gap-2 text-[#666] hover:text-[#111] transition-colors">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={18} color="currentColor" />
            <span className="text-xs font-label font-semibold">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="flex items-center gap-1.5 text-xs text-[#888] hover:text-[#111] transition-colors font-label">
              <HugeiconsIcon icon={isDark ? Sun01Icon : Moon01Icon} size={14} color="currentColor" />
            </button>
            <div className="w-7 h-7 bg-[#111] rounded-lg flex items-center justify-center">
              <span className="text-[9px] font-bold text-white font-display leading-none">274</span>
            </div>
            <span className="text-sm font-bold text-[#111] font-display">274Lab</span>
          </div>
          <div className="w-16" />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-start justify-center px-4 pt-8 pb-12">
        <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm w-full max-w-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-[#EBEBEB]">
            {['student', 'teacher', 'admin'].map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setErr('') }}
                className={`flex-1 py-3.5 text-xs font-semibold tracking-wide uppercase transition-all font-label ${
                  tab === t
                    ? 'text-[#111] border-b-2 border-[#111]'
                    : 'text-[#AAA] hover:text-[#666]'
                }`}
              >
                {t === 'student' ? 'Student' : t === 'teacher' ? 'Teacher' : 'Admin'}
              </button>
            ))}
          </div>

          <div className="px-6 pt-4 pb-0">
            <p className="text-sm font-bold text-[#111] font-display">Welcome to the Lab</p>
          </div>

          <div className="p-6">
            <ServerMoveBanner setView={setView} />
            {showReset && (
              <div className="bg-[#F8F8F7] border border-[#EBEBEB] rounded-xl p-4 mb-4 space-y-3">
                {resetDone ? (
                  <>
                    <p className="text-xs font-semibold text-green-700 font-label">Password reset successful</p>
                    <p className="text-[11px] text-[#888] font-label">Sign in below with your new password.</p>
                    <button onClick={() => { setShowReset(false); setResetDone(false); setResetStep('name'); setResetMsg('') }}
                      className="w-full bg-[#111] text-white rounded-xl py-2.5 text-xs font-bold hover:bg-[#222] font-display">
                      Back to Sign In
                    </button>
                  </>
                ) : resetStep === 'name' ? (
                  <>
                    <p className="text-xs font-semibold text-[#111] font-label">Reset password for the new servers</p>
                    <p className="text-[11px] text-[#888] font-label">Enter your full name — we will text a 4-digit code to your number.</p>
                    <input value={resetName} onChange={(e) => setResetName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleResetRequest()}
                      maxLength={50} placeholder="e.g. Chukwuemeka Okafor"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#111] bg-white" />
                    {resetMsg && <p className="text-[11px] text-[#888] font-label">{resetMsg}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleResetRequest} disabled={resetBusy}
                        className="flex-1 bg-[#111] text-white rounded-xl py-2.5 text-xs font-bold hover:bg-[#222] font-display disabled:opacity-40">
                        {resetBusy ? 'Sending...' : 'Send Code'}
                      </button>
                      <button onClick={() => { setShowReset(false); setResetMsg('') }}
                        className="flex-1 bg-white border border-[#E5E5E5] text-[#888] rounded-xl py-2.5 text-xs font-bold font-label">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-[#111] font-label">Enter code + new password</p>
                    <input value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      inputMode="numeric" placeholder="0000"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-center tracking-[0.3em] focus:outline-none focus:border-[#111] bg-white" />
                    <input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)}
                      maxLength={64} placeholder="New password (min 8 characters)"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#111] bg-white" />
                    <input type="password" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleResetConfirm()}
                      placeholder="Repeat new password"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#111] bg-white" />
                    {resetMsg && <p className="text-[11px] text-[#888] font-label">{resetMsg}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleResetConfirm} disabled={resetBusy}
                        className="flex-1 bg-[#111] text-white rounded-xl py-2.5 text-xs font-bold hover:bg-[#222] font-display disabled:opacity-40">
                        {resetBusy ? 'Resetting...' : 'Reset Password'}
                      </button>
                      <button onClick={() => { setResetStep('name'); setResetMsg('') }}
                        className="flex-1 bg-white border border-[#E5E5E5] text-[#888] rounded-xl py-2.5 text-xs font-bold font-label">
                        Back
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
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
                        Friend's number <span className="text-[#CCC] normal-case tracking-normal">(optional · you both earn coins)</span>
                      </label>
                      <input
                        value={referrer}
                        onChange={(e) => setReferrer(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        inputMode="numeric"
                        placeholder="e.g. 01"
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
                        <EyeIcon open={showPassword} />
                      </button>
                    </div>
                    {mode === 'login' && (
                      <div className="flex items-center gap-3 mt-1.5">
                        <button onClick={() => { setShowReset(true); setResetDone(false); setResetStep('name'); setResetMsg(''); setErr('') }}
                          className="text-[11px] text-[#888] hover:text-[#111] font-label underline underline-offset-2 transition-colors">
                          Forgot password?
                        </button>
                        <button onClick={() => { setShowReset(true); setResetDone(false); setResetStep('name'); setResetMsg(''); setErr('') }}
                          className="text-[11px] text-[#888] hover:text-[#111] font-label underline underline-offset-2 transition-colors">
                          New servers? Reset password
                        </button>
                      </div>
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
                          <EyeIcon open={showConfirm} />
                        </button>
                      </div>
                    </div>
                  )}
                  {mode === 'register' && (
                    <div className="flex items-start gap-2.5 pt-1">
                      <input
                        type="checkbox"
                        id="terms"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        className="mt-0.5 w-4 h-4 shrink-0 rounded border-[#D0D0D0] text-[#111] focus:ring-[#111] cursor-pointer"
                      />
                      <label htmlFor="terms" className="text-[11px] text-[#888] font-label leading-relaxed">
                        I agree to the{' '}
                        <button
                          type="button"
                          onClick={() => setShowTerms(true)}
                          className="text-[#111] font-semibold underline underline-offset-2"
                        >
                          Terms and Conditions
                        </button>
                      </label>
                    </div>
                  )}
                </div>

                {showTerms && (
                  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowTerms(false)}>
                    <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                      <h3 className="text-lg font-bold font-display text-[#111] mb-3">Terms &amp; Conditions</h3>
                      <div className="text-xs text-[#555] font-body leading-relaxed space-y-3">
                        <p>By creating an account on 274Lab, you agree to the following terms:</p>
                        <p><strong>1. Account Responsibility</strong><br/>You are responsible for maintaining the confidentiality of your account credentials. One account per student.</p>
                        <p><strong>2. Data Collection</strong><br/>We collect your name, academic performance data (quiz scores), and phone numbers you provide for progress reports.</p>
                        <p><strong>3. SMS Communication</strong><br/>By providing parent/teacher phone numbers, you consent to receiving automated weekly performance SMS reports. Standard message rates may apply.</p>
                        <p><strong>4. Push Notifications</strong><br/>You may receive educational push notifications. You can disable these in your browser settings at any time.</p>
                        <p><strong>5. Subscription &amp; Payments</strong><br/>Paid subscriptions grant continued access. You may use limited free attempts before subscribing. Payments are processed through Paystack and are non-refundable except where required by law.</p>
                        <p><strong>6. Acceptable Use</strong><br/>You agree to use the platform solely for educational purposes. Any misuse, including automated access or cheating, may result in account suspension.</p>
                        <p><strong>7. Changes to Terms</strong><br/>We may update these terms at any time. Continued use after changes constitutes acceptance.</p>
                        <p><strong>8. Contact</strong><br/>For questions, reach out via the Contact page in the app or email contact@274lab.com.</p>
                      </div>
                      <button onClick={() => setShowTerms(false)}
                        className="w-full mt-4 bg-[#111] text-white rounded-xl py-2.5 text-sm font-bold font-display hover:bg-[#222] transition-colors">
                        I Understand
                      </button>
                    </div>
                  </div>
                )}

                {err && (
                  <div className="mt-3 px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                    <p className="text-red-600 text-xs font-label">{err}</p>
                  </div>
                )}

                {(
                  <button
                    onClick={mode === 'login' ? handleLogin : handleRegister}
                    disabled={loading}
                    className={`w-full mt-4 rounded-xl py-3.5 text-sm font-bold tracking-wide transition-all active:scale-[0.99] font-display ${
                      loading
                        ? 'bg-[#E5E5E5] text-[#AAA] cursor-not-allowed'
                        : 'bg-[#111] text-white hover:bg-[#222]'
                    }`}
                  >
                    {loading ? 'Please wait...' : mode === 'login' ? 'Lock In' : 'Create Account'}
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

            {tab === 'teacher' && (
              <div>
                {/* Mode toggle */}
                <div className="flex gap-1 p-1 bg-[#F3F3F2] rounded-xl mb-5">
                  {['login', 'register'].map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); setErr(''); setTeacherStep(1); setShowPhoneConfirm(false) }}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all font-label ${
                        mode === m
                          ? 'bg-white text-[#111] shadow-sm'
                          : 'text-[#999] hover:text-[#555]'
                      }`}
                    >
                      {m === 'login' ? 'Sign In' : 'Sign up'}
                    </button>
                  ))}
                </div>

                <div className="space-y-3.5">
                  {mode === 'register' && teacherStep === 1 && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Full Name
                      </label>
                      <input
                        value={tName}
                        onChange={(e) => setTName(e.target.value)}
                        maxLength={50}
                        placeholder="e.g. Mrs. Adebayo"
                        className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                      />
                    </div>
                  )}

                  {mode === 'login' && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Email
                      </label>
                      <input
                        type="email"
                        value={tEmail}
                        onChange={(e) => setTEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleTeacherLogin()}
                        placeholder="you@example.com"
                        className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                      />
                    </div>
                  )}

                  {mode === 'register' && teacherStep === 1 && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Email
                      </label>
                      <input
                        type="email"
                        value={tEmail}
                        onChange={(e) => setTEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleTeacherNextStep()}
                        placeholder="you@example.com"
                        className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                      />
                    </div>
                  )}

                  {mode === 'register' && teacherStep === 1 && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={tPass}
                          onChange={(e) => setTPass(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleTeacherNextStep()}
                          maxLength={64}
                          placeholder="Minimum 8 characters"
                          className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                          <EyeIcon open={showPassword} />
                        </button>
                      </div>
                    </div>
                  )}

                  {mode === 'register' && teacherStep === 1 && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirm ? 'text' : 'password'}
                          value={tConfirm}
                          onChange={(e) => setTConfirm(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleTeacherNextStep()}
                          placeholder="Repeat your password"
                          className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                        />
                        <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                          <EyeIcon open={showConfirm} />
                        </button>
                      </div>
                    </div>
                  )}

                  {mode === 'register' && teacherStep === 1 && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Who referred you? <span className="text-[#CCC] normal-case tracking-normal">(optional)</span>
                      </label>
                      <input
                        value={tPioneerCode}
                        onChange={(e) => setTPioneerCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        inputMode="numeric"
                        placeholder="Enter 4-digit pioneer code"
                        className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-center tracking-[0.3em] text-[#111] placeholder:text-[#CCC] placeholder:tracking-normal focus:outline-none focus:border-[#111] transition-colors bg-white"
                      />
                    </div>
                  )}

                  {mode === 'register' && teacherStep === 2 && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Phone Number
                      </label>
                      <div className="flex border border-[#E5E5E5] rounded-xl overflow-hidden focus-within:border-[#111] transition-colors bg-white">
                      <span className="px-3 py-3 text-sm font-semibold text-[#555] bg-[#F8F8F7] border-r border-[#E5E5E5] select-none font-label">+234</span>
                       <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        value={tPhone}
                        onChange={(e) => {
                          // Accept 803..., 0803..., +234803..., 234803... — all normalize to 803... for the +234 prefix
                          let v = e.target.value.replace(/\D/g, '')
                          // Strip a leading 234 country code if the user pasted it
                          if (v.startsWith('234')) v = v.slice(3)
                          // Strip a single leading 0 so 0803... and 803... both become 803... (displayed as +234 803...)
                          if (v.startsWith('0')) v = v.replace(/^0+/, '')
                          setTPhone(v.slice(0, 10)); setErr('')
                        }}
                        placeholder="803 000 0000"
                        className="flex-1 px-3 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none bg-white"
                      />
                    </div>
                  </div>
                  )}

                  {mode === 'login' && (
                    <div>
                      <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={tPass}
                          onChange={(e) => setTPass(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleTeacherLogin()}
                          maxLength={64}
                          placeholder="••••••••"
                          className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                          <EyeIcon open={showPassword} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {err && (
                  <div className="mt-3 px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                    <p className="text-red-600 text-xs font-label">{err}</p>
                  </div>
                )}

                {mode === 'login' ? (
                  <button
                    onClick={handleTeacherLogin}
                    disabled={loading}
                    className={`w-full mt-4 rounded-xl py-3.5 text-sm font-bold tracking-wide transition-all active:scale-[0.99] font-display ${
                      loading
                        ? 'bg-[#E5E5E5] text-[#AAA] cursor-not-allowed'
                        : 'bg-[#111] text-white hover:bg-[#222]'
                    }`}
                  >
                    {loading ? 'Please wait...' : 'Sign In'}
                  </button>
                ) : teacherStep === 1 ? (
                  <button
                    onClick={handleTeacherNextStep}
                    disabled={loading}
                    className={`w-full mt-4 rounded-xl py-3.5 text-sm font-bold tracking-wide transition-all active:scale-[0.99] font-display ${
                      loading
                        ? 'bg-[#E5E5E5] text-[#AAA] cursor-not-allowed'
                        : 'bg-[#111] text-white hover:bg-[#222]'
                    }`}
                  >
                    Sign up →
                  </button>
                ) : (
                  <>
                    <button
                      onClick={openPhoneConfirm}
                      disabled={loading}
                      className={`w-full mt-4 rounded-xl py-3.5 text-sm font-bold tracking-wide transition-all active:scale-[0.99] font-display ${
                        loading
                          ? 'bg-[#E5E5E5] text-[#AAA] cursor-not-allowed'
                          : 'bg-[#111] text-white hover:bg-[#222]'
                      }`}
                    >
                      Create Teacher Account
                    </button>
                    <button
                      type="button"
                      onClick={() => setTeacherStep(1)}
                      disabled={loading}
                      className="w-full mt-2 text-[11px] text-[#888] hover:text-[#111] font-label transition-colors disabled:opacity-40"
                    >
                      ← Back to details
                    </button>
                  </>
                )}

                {mode === 'register' && teacherStep === 1 && (
                  <p className="text-[11px] text-[#AAA] mt-3 font-label leading-relaxed">
                    Next, we'll ask for your phone number. Registration is free.
                  </p>
                )}
                {mode === 'register' && teacherStep === 2 && (
                  <p className="text-[11px] text-[#AAA] mt-3 font-label leading-relaxed">
                    Students use this number to link you as their teacher.
                  </p>
                )}

                {showPhoneConfirm && (
                  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !loading && setShowPhoneConfirm(false)}>
                    <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl text-center" onClick={(e) => e.stopPropagation()}>
                      <p className="text-[11px] font-semibold text-[#666] uppercase tracking-wide font-label mb-2">Confirm your number</p>
                      <p className="text-sm text-[#555] font-body mb-1">Is this your phone number?</p>
                      <p className="text-xl font-bold text-[#111] font-display tracking-wide mb-5">+234{tPhone.replace(/^0+/, '')}</p>
                      <button
                        onClick={handleTeacherRegister}
                        disabled={loading}
                        className={`w-full rounded-xl py-3 text-sm font-bold transition-all active:scale-[0.99] font-display ${
                          loading ? 'bg-[#E5E5E5] text-[#AAA] cursor-not-allowed' : 'bg-[#111] text-white hover:bg-[#222]'
                        }`}
                      >
                        {loading ? 'Creating account…' : 'Yes, it’s mine'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPhoneConfirm(false)}
                        disabled={loading}
                        className="w-full mt-2 rounded-xl py-2.5 text-xs font-bold text-[#555] hover:text-[#111] border border-[#E5E5E5] hover:border-[#CCC] transition-all font-label disabled:opacity-40"
                      >
                        Edit number
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

{tab === 'admin' && (
              <div>
                <div>
                  <div className="mb-4">
                    <label className="text-[11px] font-semibold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
                      Admin Name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={50}
                      placeholder="Enter admin name"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                    />
                  </div>
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
                          placeholder="Enter admin password"
                          className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                        />
                        <button type="button" onClick={() => setShowAdminPw(!showAdminPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                          <EyeIcon open={showAdminPw} />
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
                      {loading ? 'Verifying...' : 'Access Admin'}
                    </button>
                  </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
