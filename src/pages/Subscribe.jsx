import { useState, useEffect, useRef } from 'react'
import { apiPost } from '../lib/api'
import { listenPayments, getAccessStatus, SUBSCRIPTION_PRICE_NGN, getStudentById, updateStudent, logEvent } from '../store/useStore'
import Receipt from '../components/payments/Receipt'

import SEO from '../components/seo/SEO'

export default function Subscribe({ student, setStudent, setView }) {
  const [paying, setPaying] = useState(false)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [successInfo, setSuccessInfo] = useState(null)
  const [history, setHistory] = useState([])
  const [email, setEmail] = useState(student.email || '')
  const [viewingReceipt, setViewingReceipt] = useState(null)
  const paystackVerifying = useRef(false)
  const PAYSTACK_KEY = (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '').trim()
  const [verifyNote, setVerifyNote] = useState('')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // Verify a Paystack reference against the server, polling a few times so a
  // slow Paystack settle or a cold function does not surface as a failure.
  // If the webhook fulfilled first, the server returns alreadyFulfilled.
  const verifyReference = async (target, attempts = 6) => {
    let lastErr = null
    for (let i = 1; i <= attempts; i++) {
      try {
        setVerifyNote(i === 1 ? 'Confirming payment…' : `Confirming payment… (retry ${i}/${attempts})`)
        const res = await apiPost('/api/payments/paystack/complete', { reference: target })
        return res || null
      } catch (e) {
        lastErr = e
        const msg = (e?.message || '').toLowerCase()
        const retryable = msg.includes('not successful yet') || msg.includes('failed-precondition') || msg.includes('unavailable') || msg.includes('internal') || msg.includes('deadline')
        if (!retryable || i === attempts) throw e
        await sleep(2500)
      }
    }
    throw lastErr
  }

  useEffect(() => { logEvent(student.id, 'page_view', { page: 'subscribe' }) }, [])

  useEffect(() => {
    const unsub = listenPayments((all) => {
      setHistory(all.filter((p) => p.studentId === student.id).sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)))
    })
    return () => unsub()
  }, [student])

  // Paystack redirect callback — Paystack appends ?reference=...&trxref=... to the
  // callback_url (or the hosting root if none is set). Verify it immediately so
  // the student sees their subscription extended without waiting for the webhook.
  useEffect(() => {
    let ref = null
    let pending = null
    try { ref = new URLSearchParams(window.location.search).get('reference') || new URLSearchParams(window.location.search).get('trxref') } catch {}
    try { pending = localStorage.getItem('pending_paystack_ref') } catch {}
    const target = ref || pending
    if (!target || paystackVerifying.current) return
    if (!student?.id) return
    // Coin purchases are verified on the Coins page, not here
    if (target.includes('-COIN-')) return
    // Only auto-verify a reference that belongs to this student (our refs embed the studentId)
    if (!target.includes(student.id)) return
    paystackVerifying.current = true
    setPaying(true)
    const verify = async () => {
      try {
        const data = await verifyReference(target)
        await finalizePayment(target, data)
      } catch (e) {
        // Not a hard error — the webhook may still fulfill it a moment later.
        // Only surface a message if this was an explicit redirect (ref in URL).
        if (ref) setErr(e?.message || 'Could not verify Paystack payment. If you were charged, contact support with ref: ' + target)
        // Keep the pending ref so the student can retry via the button
        setVerifyNote('')
      }
      setPaying(false)
    }
    verify()
  }, [student])

  const status = getAccessStatus(student)

  const refreshStudent = async () => {
    const fresh = await getStudentById(student.id)
    if (fresh) setStudent(fresh)
  }

  const applyOptimisticActive = () => {
    const base = student.subscriptionUntil && new Date(student.subscriptionUntil).getTime() > Date.now()
      ? new Date(student.subscriptionUntil)
      : new Date()
    base.setMonth(base.getMonth() + 1)
    const iso = base.toISOString()
    setStudent({ ...student, subscriptionUntil: iso })
  }

  const finalizePayment = async (target, data) => {
    // Optimistic: show Active immediately without waiting for Firestore propagation
    applyOptimisticActive()
    const pay = data?.payment || null
    const isResume = target.includes('-RES-')
    setSuccess(isResume ? 'Payment received — account reactivated!' : 'Payment received — access extended by 1 month!')
    setSuccessInfo({
      reference: target,
      email: pay?.email || email || student.email || '',
      amount: pay?.amount || SUBSCRIPTION_PRICE_NGN,
      method: pay?.method || 'paystack',
      type: pay?.type || (isResume ? 'account_resume' : 'subscription'),
      paidAt: pay?.paidAt || new Date().toISOString(),
      extendsTo: pay?.extendsTo || '',
      studentName: student.name || '',
    })
    try { localStorage.removeItem('pending_paystack_ref') } catch { /* non-fatal */ }
    // Clean the URL so a refresh does not re-verify
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('reference')
      url.searchParams.delete('trxref')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    } catch { /* non-fatal */ }
    setVerifyNote('')
    await refreshStudent()
  }

  const handlePay = async () => {
    const cleanEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErr('Enter a valid email address for your receipt')
      return
    }

    setPaying(true)
    setErr('')
    setSuccess('')

    if (cleanEmail !== student.email) {
      try { await updateStudent(student.id, { email: cleanEmail }) } catch { /* non-fatal */ }
    }

    // ── Paystack (only gateway) ──────────────────────────────────────
    try {
      const callbackUrl = window.location.origin + '/'
      const result = await apiPost('/api/payments/paystack/create', { studentId: student.id, type: 'subscription', callbackUrl })
      const { authorization_url, reference } = result
      if (authorization_url && reference) {
        try { localStorage.setItem('pending_paystack_ref', reference) } catch {}
        try { localStorage.setItem('pending_paystack_student', student.id) } catch {}
        // A — inline popup keeps the app (auth + student state) warm instead
        // of a full-page redirect. Falls back to redirect when the popup lib
        // or public key is unavailable.
        if (window.PaystackPop && PAYSTACK_KEY) {
          try {
            const handler = window.PaystackPop.setup({
              key: PAYSTACK_KEY,
              email: cleanEmail,
              amount: SUBSCRIPTION_PRICE_NGN * 100,
              ref: reference,
              metadata: { studentId: student.id, type: 'subscription' },
              callback: async (resp) => {
                setPaying(true)
                setErr('')
                try {
                  const data = await verifyReference(resp?.reference || reference)
                  await finalizePayment(resp?.reference || reference, data)
                } catch (e) {
                  setErr(e?.message || 'Payment received but could not be confirmed yet. Contact support with ref: ' + reference)
                  setVerifyNote('')
                }
                setPaying(false)
              },
              onClose: () => {
                // Popup closed before paying — pending ref stays so retry works.
                setPaying(false)
                setVerifyNote('')
              },
            })
            handler.openIframe()
            return
          } catch {
            // fall through to redirect
          }
        }
        // Fallback: Paystack's hosted checkout (standard.paystack.co).
        // Paystack appends ?trxref=&reference= to the callbackUrl and the
        // App root auto-verifies it (with retry) on return.
        window.location.href = authorization_url
        return
      }
      throw new Error('Paystack did not return an authorization URL')
    } catch (e) {
      setErr(e?.message || 'Could not start payment. Check your connection and try again.')
      setPaying(false)
    }
  }

  const statusBadge = {
    active: { color: 'green', label: 'Active' },
    freebie: { color: 'yellow', label: `${status.freeAttemptsLeft} free quiz left` },
    expired: { color: 'red', label: 'Expired' },
    suspended: { color: 'red', label: 'Suspended' },
  }[status.status]

  if (success && successInfo) {
    return (
      <>
        <SEO title="Payment Successful" />
        <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <Receipt
              payment={{
                type: successInfo.type || 'subscription',
                amount: successInfo.amount,
                reference: successInfo.reference,
                email: successInfo.email,
                studentName: successInfo.studentName || student?.name || '',
                paidAt: successInfo.paidAt,
                extendsTo: successInfo.extendsTo,
                method: successInfo.method || 'paystack',
              }}
              emailSentTo={successInfo.email}
              footerNote={successInfo.email ? 'Paystack also emailed your receipt.' : success}
              onDone={() => { setSuccess(''); setSuccessInfo(null); setView('quiz') }}
              doneLabel="Start test →"
            />
            <button
              onClick={() => { setSuccess(''); setSuccessInfo(null); setView('dashboard') }}
              className="w-full mt-2 text-xs text-[#888] hover:text-[#111] font-label py-2 transition-colors"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <SEO title="Subscribe" />
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="max-w-md mx-auto px-4 pb-10">

        <div className="flex items-center gap-3 pt-8 pb-5">
          <button
            onClick={() => setView('dashboard')}
            className="text-[#888] hover:text-[#111] text-sm font-label transition-colors"
          >
            ← Back
          </button>
          <h2 className="text-xl font-bold text-[#111] font-display">Subscription</h2>
        </div>

        {/* Status hero */}
        <div className="bg-[#111] text-white rounded-2xl p-5 mb-4">
          <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-1">
            Current Status
          </p>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-bold font-display">{statusBadge.label}</p>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full font-label ${
              statusBadge.color === 'green' ? 'bg-green-400/20 text-green-300' :
              statusBadge.color === 'yellow' ? 'bg-yellow-400/20 text-yellow-300' :
              'bg-red-400/20 text-red-300'
            }`}>
              {status.status.toUpperCase()}
            </span>
          </div>
          {status.expiresAt && (
            <p className="text-[11px] text-[#888] font-label mt-2">
              {status.status === 'expired' ? 'Expired' : 'Renews'} {new Date(status.expiresAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Pay card */}
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
          <p className="text-xs font-bold text-[#888] uppercase tracking-wide font-label mb-2">Plan</p>
          <div className="flex items-end gap-1.5 mb-1">
            <span className="text-4xl font-bold text-[#111] font-display">₦{SUBSCRIPTION_PRICE_NGN.toLocaleString()}</span>
            <span className="text-sm text-[#888] mb-1.5 font-label">/ month</span>
          </div>
          <p className="text-xs text-[#888] font-label mb-4">
            Full access to weekly tests, corrections, and topic videos.
          </p>

          <ul className="text-xs text-[#555] font-body space-y-1.5 mb-4">
            <li>✓ Friday & Saturday weekly quizzes</li>
            <li>• Learn something everyday with 247chops</li>
            <li>✓ Corrections, explanations, retakes</li>
            <li>✓ Topic videos & study guides</li>
            <li>✓ Performance tracking</li>
          </ul>

          {/* Email for receipt */}
          <div className="mb-3">
            <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">
              Email <span className="text-[#CCC] normal-case tracking-normal">for payment receipt</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErr('') }}
              placeholder="you@example.com"
              className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white"
            />
          </div>

          {err && (
            <div className="mb-3 px-3.5 py-2 bg-red-50 border border-red-100 rounded-xl">
              <p className="text-red-600 text-xs font-label">{err}</p>
            </div>
          )}
          {success && (
            <div className="mb-3 px-3.5 py-2 bg-green-50 border border-green-100 rounded-xl">
              <p className="text-green-600 text-xs font-label">{success}</p>
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={paying}
            className={`w-full rounded-xl py-3.5 text-sm font-bold transition-all font-display ${
              paying
                ? 'bg-[#EBEBEB] text-[#AAA] cursor-not-allowed'
                : 'bg-[#111] text-white hover:bg-[#222] active:scale-[0.99]'
            }`}
          >
            {paying ? (verifyNote || 'Opening payment…') : status.status === 'active' ? 'Extend by 1 month →' : `Pay ₦${SUBSCRIPTION_PRICE_NGN.toLocaleString()} →`}
          </button>

          <p className="text-[10px] text-[#AAA] text-center mt-3 font-label">
            Secured by Paystack · 2 free quizzes on signup
          </p>
        </div>

        {/* Payment history */}
        {history.length > 0 && (
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
            <p className="text-xs font-bold text-[#888] uppercase tracking-wide font-label mb-3">Payment History</p>
            <div className="space-y-2">
              {history.map((p) => (
                <div key={p.id} className="flex justify-between items-center py-2 border-b border-[#F3F3F2] last:border-0">
                  <div>
                    <p className="text-sm font-bold text-[#111] font-display">₦{p.amount.toLocaleString()}</p>
                    <p className="text-[10px] text-[#AAA] font-label mt-0.5">
                      {new Date(p.paidAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {p.method && ` · ${p.method}`}
                    </p>
                  </div>
                  <button onClick={() => setViewingReceipt(p)}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-[#E5E5E5] text-[#555] hover:text-[#111] font-label shrink-0">
                    Receipt
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Receipt modal for a past payment */}
        {viewingReceipt && (
          <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setViewingReceipt(null)}>
            <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <Receipt
                payment={viewingReceipt}
                emailSentTo={viewingReceipt.email || ''}
                onDone={() => setViewingReceipt(null)}
                doneLabel="Close ✓"
              />
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  )
}
