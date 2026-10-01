import { useState, useEffect, useRef } from 'react'
import { functions, httpsCallable } from '../firebase'
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
  const bachsInit = useRef(false)
  const paystackVerifying = useRef(false)

  useEffect(() => {
    if (typeof window.Bachs !== 'undefined' && !bachsInit.current) {
      window.Bachs.Initialize({ onEvent: () => {} })
      bachsInit.current = true
    }
  }, [])

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
        const fn = httpsCallable(functions, 'completePaystackCheckout')
        const res = await fn({ reference: target })
        // Optimistic: show Active immediately without waiting for Firestore propagation
        applyOptimisticActive()
        const pay = res?.data?.payment || null
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
        localStorage.removeItem('pending_paystack_ref')
        // Clean the URL so a refresh does not re-verify
        try {
          const url = new URL(window.location.href)
          url.searchParams.delete('reference')
          url.searchParams.delete('trxref')
          window.history.replaceState({}, '', url.pathname + url.search + url.hash)
        } catch {}
        await refreshStudent()
      } catch (e) {
        // Not a hard error — the webhook may still fulfill it a moment later.
        // Only surface a message if this was an explicit redirect (ref in URL).
        if (ref) setErr(e?.message || 'Could not verify Paystack payment. If you were charged, contact support with ref: ' + target)
        // Keep the pending ref so the student can retry via the button
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

  const openBachsCheckout = async (cleanEmail) => {
    if (typeof window.Bachs === 'undefined') {
      setErr('Payment library not loaded. Refresh and try again.')
      setPaying(false)
      return
    }
    try {
      const fn = httpsCallable(functions, 'createBachsCheckout')
      const result = await fn({ studentId: student.id, type: 'subscription' })
      const { checkout_url, checkout_id } = result.data

      window.Bachs.Checkout.open({
        checkoutUrl: checkout_url,
        onEvent: async (event) => {
          if (event.type === 'checkout.completed') {
            try {
              const verifyFn = httpsCallable(functions, 'completeBachsCheckout')
              const verifyRes = await verifyFn({ checkoutId: checkout_id })
              applyOptimisticActive()
              const bpay = verifyRes?.data?.payment || null
              setSuccess('Payment received — access extended by 1 month!')
              setSuccessInfo({ reference: checkout_id, email: bpay?.email || cleanEmail, amount: bpay?.amount || SUBSCRIPTION_PRICE_NGN, method: 'bachs', type: 'subscription', paidAt: bpay?.paidAt || new Date().toISOString(), extendsTo: bpay?.extendsTo || '', studentName: student?.name || '' })
              await refreshStudent()
            } catch (e) {
              console.error(e)
              setErr('Payment received but failed to verify. Contact admin with checkout ID: ' + checkout_id)
            }
            setPaying(false)
          }
          if (event.type === 'checkout.failed' || event.type === 'checkout.expired') {
            setErr('Payment was not completed. Please try again.')
            setPaying(false)
          }
          if (event.type === 'checkout.closed') {
            setPaying(false)
          }
        },
      })
    } catch (e) {
      setErr(e?.message || 'Failed to start Bachs payment. Please try again.')
      setPaying(false)
    }
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

    // ── Primary: Paystack ──────────────────────────────────────────────
    try {
      const callbackUrl = window.location.origin + '/'
      const fn = httpsCallable(functions, 'createPaystackCheckout')
      const result = await fn({ studentId: student.id, type: 'subscription', callbackUrl })
      const { authorization_url, reference } = result.data
      if (authorization_url && reference) {
        try { localStorage.setItem('pending_paystack_ref', reference) } catch {}
        try { localStorage.setItem('pending_paystack_student', student.id) } catch {}
        // Paystack's hosted checkout (standard.paystack.co) — redirect the
        // whole page. Paystack will append ?trxref=&reference= to the
        // callbackUrl and the App root will auto-verify it.
        window.location.href = authorization_url
        return
      }
      throw new Error('Paystack did not return an authorization URL')
    } catch (e) {
      const msg = (e && e.message) || ''
      const notConfigured = msg.includes('PAYSTACK_SECRET_KEY') || msg.includes('not configured') || msg.includes('failed-precondition')
      if (notConfigured) {
        // Paystack not set up — silently fall through to Bachs backup.
        console.log('[Paystack] not configured, falling back to Bachs:', msg)
      } else {
        console.warn('[Paystack] init failed, falling back to Bachs:', msg)
        // For transient Paystack errors we still try Bachs so the student is not blocked.
        // Surface a soft hint but keep paying=true while Bachs opens.
        setErr('Paystack is temporarily unavailable — trying backup gateway…')
      }
    }

    // ── Backup: Bachs ──────────────────────────────────────────────────
    await openBachsCheckout(cleanEmail)
  }

  const statusBadge = {
    active: { color: 'green', label: 'Active' },
    freebie: { color: 'yellow', label: `${status.freeAttemptsLeft} free quiz left` },
    expired: { color: 'red', label: 'Expired' },
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
              onDone={() => { setSuccess(''); setSuccessInfo(null); setView('dashboard') }}
              doneLabel="Go to Dashboard →"
            />
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
            {paying ? 'Opening payment…' : status.status === 'active' ? 'Extend by 1 month →' : `Pay ₦${SUBSCRIPTION_PRICE_NGN.toLocaleString()} →`}
          </button>

          <p className="text-[10px] text-[#AAA] text-center mt-3 font-label">
            Secured by Paystack · Bachs as backup · 2 free quizzes on signup
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
