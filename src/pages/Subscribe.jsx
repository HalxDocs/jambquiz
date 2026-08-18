import { useState, useEffect, useRef } from 'react'
import { functions, httpsCallable } from '../firebase'
import { listenPayments, getAccessStatus, SUBSCRIPTION_PRICE_NGN, getStudentById, updateStudent, logEvent } from '../store/useStore'

import SEO from '../components/seo/SEO'

export default function Subscribe({ student, setStudent, setView }) {
  const [paying, setPaying] = useState(false)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [history, setHistory] = useState([])
  const [email, setEmail] = useState(student.email || '')
  const bachsInit = useRef(false)

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

  const status = getAccessStatus(student)

  const refreshStudent = async () => {
    const fresh = await getStudentById(student.id)
    if (fresh) setStudent(fresh)
  }

  const handlePay = async () => {
    const cleanEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErr('Enter a valid email address for your receipt')
      return
    }

    if (typeof window.Bachs === 'undefined') {
      setErr('Payment library not loaded. Refresh and try again.')
      return
    }

    setPaying(true)
    setErr('')
    setSuccess('')

    if (cleanEmail !== student.email) {
      try { await updateStudent(student.id, { email: cleanEmail }) } catch { /* non-fatal */ }
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
              await verifyFn({ checkoutId: checkout_id })
              setSuccess('Payment received — access extended by 1 month!')
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
      setErr(e?.message || 'Failed to start payment. Please try again.')
      setPaying(false)
    }
  }

  const statusBadge = {
    active: { color: 'green', label: 'Active' },
    freebie: { color: 'yellow', label: `${status.freeAttemptsLeft} free quiz left` },
    expired: { color: 'red', label: 'Expired' },
  }[status.status]

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
            Secured by Bachs · 2 free quizzes on signup
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
                  <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full font-label">
                    Paid
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  )
}
