import { useState, useRef, useEffect } from 'react'
import {
  registerStudent,
  verifyAdminSession,
  getStudentByUid,
  linkStudentUid,
  studentAuthEmail,
  ADMIN_EMAIL,
  sendTeacherOtp,
  registerTeacher,
  teacherSignIn,
  getTeacherByUid,
} from '../store/useStore'
import { setStudentUid, setRegistering } from '../store/studentSession'
import { useUserNotificationStore } from '../store/notificationStore'
import { useThemeStore } from '../store/theme'
import {
  auth,
  functions,
  httpsCallable,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  updatePassword,
} from '../firebase'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, Sun01Icon, Moon01Icon } from '@hugeicons/core-free-icons'
import SEO from '../components/seo/SEO'

const LOGIN_COOLDOWN_MS = 30000
const MAX_ATTEMPTS = 5

export default function Auth({ setView, setStudent, setAdminAuthed, defaultMode, defaultTab }) {
  const [tab, setTab] = useState(defaultTab || 'student')
  const [mode, setMode] = useState(defaultMode || 'login')
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
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  // Teacher tab state
  const [tName, setTName] = useState('')
  const [tEmail, setTEmail] = useState('')
  const [tPhone, setTPhone] = useState('')
  const [tCode, setTCode] = useState('')
  const [tPass, setTPass] = useState('')
  const [tConfirm, setTConfirm] = useState('')
  const [tPioneerCode, setTPioneerCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpSending, setOtpSending] = useState(false)
  const [otpBusy, setOtpBusy] = useState(false)
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [teacherStep, setTeacherStep] = useState(1)

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
      const email = studentAuthEmail(trimmed.toLowerCase())
      const spacedEmail = `${trimmed.toLowerCase().replace(/\s+/g, ' ')}@${'274lab.app'}`
      let signedIn = false
      const signInErrors = []
      for (const attemptEmail of [email, spacedEmail]) {
        try {
          await signInWithEmailAndPassword(auth, attemptEmail, password)
          signedIn = true
          break
        } catch (e) {
          signInErrors.push(e && e.code)
        }
      }
      if (!signedIn) {
        const legacyCodes = ['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-email']
        if (signInErrors.some((c) => legacyCodes.includes(c))) {
          try {
            const legacyFn = httpsCallable(functions, 'verifyLegacyLogin')
            const res = await legacyFn({ name: trimmed, password })
            if (res.data && res.data.ok && res.data.customToken) {
              await signInWithCustomToken(auth, res.data.customToken)
              if (password.length >= 6) {
                try { await updatePassword(auth.currentUser, password) } catch {}
              }
            } else {
              setErr('Wrong name or password'); recordAttempt(); setLoading(false); return
            }
          } catch (legacyErr) {
            console.error('[Auth] verifyLegacyLogin failed:', legacyErr)
            setErr('Could not verify account. Please check your connection and try again.')
            recordAttempt(); setLoading(false); return
          }
        } else {
          setErr('Could not sign in. Please try again.'); setLoading(false); return
        }
      }
      attemptsRef.current = 0
      cooldownUntilRef.current = 0
      persistRateLimit()
      let stu = await getStudentByUid(auth.currentUser.uid)
      if (!stu) {
        // uid mismatch — link the Firebase Auth uid to the Firestore doc
        try {
          const linkRes = await linkStudentUid(trimmed)
          if (linkRes?.ok && linkRes.student) stu = linkRes.student
        } catch (e) {
          console.error('[Auth] linkStudentUid failed:', e?.message || e)
        }
      }
      if (stu) { setStudentUid(stu.uid || auth.currentUser.uid); setStudent(stu); setView('dashboard') }
      else { setErr('Could not load your account. Please try again.'); setLoading(false); return }
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
        parentPhone: '',
        teacherPhone: '',
        subjects: [],
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
      setStudentUid(saved.uid)
      setStudent(saved)
      setRegistering(false)
      setView('supporters')
    } catch {
      setRegistering(false)
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
      const existsRes = await httpsCallable(functions, 'adminExists')()
      const exists = existsRes.data && existsRes.data.exists
      if (!exists) {
        setAdminSetupMode(true)
        setErr('No admin password set. Enter a new password to configure.')
        setLoading(false)
        return
      }
      try {
        await signInWithEmailAndPassword(auth, ADMIN_EMAIL, adminPw)
        const isAdmin = await verifyAdminSession()
        if (!isAdmin) { await signOut(auth); setErr('Not an admin account'); setLoading(false); return }
        setAdminAuthed(true); setView('admin')
      } catch (e) {
        setErr('Wrong password')
      }
    } catch {
      if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr('Could not verify admin. Server error — please try again.')
    }
    setLoading(false)
  }

  const handleAdminSetup = async () => {
    if (!adminPw) { setErr('Enter a password'); return }
    if (adminPw.length < 8) { setErr('Password must be at least 8 characters'); return }
    if (adminPw !== adminSetupConfirm) { setErr('Passwords do not match'); return }
    if (!checkOnline()) return
    setLoading(true); setErr('')
    try {
      await httpsCallable(functions, 'setupAdmin')({ adminPassword: adminPw })
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, adminPw)
      setAdminSetupMode(false)
      setAdminSetupConfirm('')
      setAdminPw('')
      setErr('')
      setAdminAuthed(true)
      setView('admin')
    } catch {
      if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  const handleSendOtp = async () => {
    const phone = tPhone.trim()
    if (phone.replace(/\D/g, '').length < 10) { setErr('Enter a valid phone number'); return }
    if (!checkOnline()) return
    setOtpSending(true); setErr('')
    try {
      await sendTeacherOtp(phone.replace(/^\+?234/, ''))
      setOtpSent(true)
      setOtpCooldown(60)
    } catch (e) {
      const msg = (e && e.message) || 'Could not send the code.'
      if (msg.includes('resource-exhausted')) setErr(msg)
      else if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr('Could not send the code. Check the number and try again.')
    }
    setOtpSending(false)
  }

  useEffect(() => {
    if (otpCooldown <= 0) return
    const id = setTimeout(() => setOtpCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [otpCooldown])

  const handleTeacherNextStep = () => {
    const emailTrim = tEmail.trim().toLowerCase()
    if (tName.trim().length < 3) { setErr('Enter your full name (at least 3 characters)'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) { setErr('Enter a valid email address'); return }
    if (tPass.length < 8) { setErr('Password must be at least 8 characters'); return }
    if (tPass !== tConfirm) { setErr('Passwords do not match'); return }
    setErr('')
    setTeacherStep(2)
  }

  const handleTeacherRegister = async () => {
    const phone = tPhone.trim()
    const emailTrim = tEmail.trim().toLowerCase()
    if (tName.trim().length < 3) { setErr('Enter your full name (at least 3 characters)'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) { setErr('Enter a valid email address'); return }
    if (phone.replace(/\D/g, '').length < 10) { setErr('Enter a valid phone number'); return }
    if (!tCode.trim() || !/^\d{6}$/.test(tCode.trim())) { setErr('Enter the 6-digit verification code'); return }
    if (tPass.length < 8) { setErr('Password must be at least 8 characters'); return }
    if (tPass !== tConfirm) { setErr('Passwords do not match'); return }
    if (tPioneerCode.trim() && !/^\d{4}$/.test(tPioneerCode.trim())) { setErr('Pioneer code must be 4 digits'); return }
    if (!checkOnline()) return
    setLoading(true); setErr(''); setOtpBusy(true)
    try {
      const res = await registerTeacher({
        name: tName.trim(),
        email: emailTrim,
        phone: phone.replace(/^\+?234/, ''),
        otp: tCode.trim(),
        password: tPass,
        pioneerCode: tPioneerCode.trim() || undefined,
      })
      if (!res || !res.ok) { setErr('Registration failed. Please try again.'); setLoading(false); setOtpBusy(false); return }
      // Sign the new teacher in client-side so App.jsx's onAuthStateChanged
      // sees the `teacher` claim and routes to the teacher dashboard.
      await teacherSignIn(emailTrim, tPass)
      const t = await getTeacherByUid(auth.currentUser.uid)
      setTeacherSession(t)
      setView('teacher-dashboard')
    } catch (e) {
      const msg = (e && e.message) || 'Could not create your account.'
      if (msg.includes('already-exists')) setErr('This email is already registered.')
      else if (msg.includes('expired')) setErr('This code has expired. Request a new one.')
      else if (msg.includes('already used')) setErr('This code was already used. Request a new one.')
      else if (msg.includes('Incorrect')) setErr('Incorrect verification code.')
      else if (!navigator.onLine) setErr('No internet connection. Check your network.')
      else setErr(msg)
    }
    setLoading(false); setOtpBusy(false)
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
      const t = await getTeacherByUid(auth.currentUser.uid)
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

  const handleForgotPassword = async () => {
    if (resetStudentId) {
      if (!password) { setErr('Enter a new password'); return }
      if (password.length < 8) { setErr('Password must be at least 8 characters'); return }
      if (password !== confirmPassword) { setErr('Passwords do not match'); return }
      if (!checkOnline()) return
      setLoading(true); setErr('')
      try {
        await httpsCallable(functions, 'resetPassword')({ name: name.trim(), newPassword: password })
        setRecoveredPassword('done')
        setPassword('')
        setConfirmPassword('')
        setResetStudentId(null)
        attemptsRef.current = 0
        cooldownUntilRef.current = 0
        persistRateLimit()
      } catch (e) {
        const msg = (e && e.message) || ''
        if (msg.includes('not-found')) setErr('No account found with that name.')
        else if (!navigator.onLine) setErr('No internet connection. Check your network.')
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
      setResetStudentId('1')
      setRecoveredPassword('reset')
    } catch {
      setErr('Something went wrong. Please try again.')
    }
    setLoading(false)
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
                        <EyeIcon open={showPassword} />
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
                        <p><strong>5. Subscription &amp; Payments</strong><br/>Paid subscriptions grant continued access. You may use limited free attempts before subscribing. Payments are processed through Bachs and are non-refundable except where required by law.</p>
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

                {showForgot && (
                  <div className="bg-[#F8F8F7] border border-[#EBEBEB] rounded-xl p-4 mt-3 space-y-3">
                    {recoveredPassword === 'done' ? (
                      <>
                        <p className="text-xs font-semibold text-green-700 font-label">Password reset successful</p>
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
                          <label className="text-[10px] font-semibold text-[#666] uppercase tracking-wide block mb-1 font-label">New Password</label>
                          <div className="relative">
                            <input type={showResetPassword ? 'text' : 'password'} value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              maxLength={64}
                              placeholder="Minimum 8 characters"
                              className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-[#111] transition-colors bg-white" />
                            <button type="button" onClick={() => setShowResetPassword(!showResetPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AAA] hover:text-[#555] transition-colors">
                              <EyeIcon open={showResetPassword} />
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
                              <EyeIcon open={showResetConfirm} />
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleForgotPassword} disabled={loading}
                            className="flex-1 bg-[#111] text-white rounded-xl py-2.5 text-xs font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display disabled:opacity-40">
                            {loading ? 'Resetting...' : 'Reset Password'}
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
                            {loading ? 'Searching...' : 'Find Account'}
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
                      onClick={() => { setMode(m); setErr(''); setTeacherStep(1); setOtpSent(false) }}
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
                        disabled={otpSent}
                        placeholder="803 000 0000"
                        className="flex-1 px-3 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none bg-white disabled:bg-[#F3F3F2] disabled:text-[#AAA]"
                      />
                    </div>
                  </div>
                  )}

                  {mode === 'register' && teacherStep === 2 && (
                    <div>
                      {!otpSent ? (
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={otpSending}
                          className="w-full rounded-xl py-2.5 text-xs font-bold border border-[#E5E5E5] text-[#555] hover:text-[#111] hover:border-[#CCC] active:scale-[0.99] transition-all font-label disabled:opacity-50"
                        >
                          {otpSending ? 'Sending code…' : 'Send confirmation code'}
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] font-semibold text-[#666] uppercase tracking-wide block mb-1 font-label">
                              Verification Code
                            </label>
                            <input
                              value={tCode}
                              onChange={(e) => setTCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              inputMode="numeric"
                              placeholder="6-digit code"
                              className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-center tracking-[0.3em] text-[#111] placeholder:text-[#CCC] placeholder:tracking-normal focus:outline-none focus:border-[#111] transition-colors bg-white"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => { setOtpSent(false); setTCode('') }}
                            disabled={otpCooldown > 0}
                            className="text-[11px] text-[#888] hover:text-[#111] font-label underline underline-offset-2 transition-colors disabled:opacity-40"
                          >
                            {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend code'}
                          </button>
                        </div>
                      )}
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
                      onClick={handleTeacherRegister}
                      disabled={loading}
                      className={`w-full mt-4 rounded-xl py-3.5 text-sm font-bold tracking-wide transition-all active:scale-[0.99] font-display ${
                        loading
                          ? 'bg-[#E5E5E5] text-[#AAA] cursor-not-allowed'
                          : 'bg-[#111] text-white hover:bg-[#222]'
                      }`}
                    >
                      {loading ? (otpBusy ? 'Verifying…' : 'Please wait...') : 'Create Teacher Account'}
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
                    Next, we'll ask for your phone number and send a one-time code to verify it. Registration is free.
                  </p>
                )}
                {mode === 'register' && teacherStep === 2 && !otpSent && (
                  <p className="text-[11px] text-[#AAA] mt-3 font-label leading-relaxed">
                    We'll send a one-time code to verify this phone number.
                  </p>
                )}
                {mode === 'register' && teacherStep === 2 && otpSent && (
                  <p className="text-[11px] text-[#AAA] mt-3 font-label leading-relaxed">
                    Enter the code we just sent to +234{tPhone.replace(/^0+/, '')}. It expires in 10 minutes.
                  </p>
                )}
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
                          <EyeIcon open={showSetupPw} />
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
                          <EyeIcon open={showSetupConfirm} />
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
                        {loading ? 'Saving...' : 'Set Password'}
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
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
