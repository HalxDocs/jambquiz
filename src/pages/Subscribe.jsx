import { useState, useEffect } from 'react'
import { addPayment, extendSubscription, listenPayments, getAccessStatus, SUBSCRIPTION_PRICE_NGN, TRIAL_DAYS, findStudent } from '../store/useStore'

const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || ''

export default function Subscribe({ student, setStudent, setView }) {
  const [paying, setPaying] = useState(false)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [history, setHistory] = useState([])

  useEffect(() => {
    const unsub = listenPayments((all) => {
      setHistory(all.filter((p) => p.studentId === student.id).sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)))
    })
    return () => unsub()
  }, [student])

  const status = getAccessStatus(student)

  const refreshStudent = async () => {
    const fresh = await findStudent(student.name)
    if (fresh) setStudent(fresh)
  }

  const handlePay = () => {
    if (!PAYSTACK_KEY) {
      setErr('Online payment not configured. Please contact admin to record a manual payment.')
      return
    }
    if (typeof window.PaystackPop === 'undefined') {
      setErr('Payment library not loaded. Refresh and try again.')
      return
    }
    setPaying(true)
    setErr('')
    setSuccess('')
    const handler = window.PaystackPop.setup({
      key: PAYSTACK_KEY,
      email: `${student.name.replace(/\s+/g, '').toLowerCase()}@274lab.local`,
      amount: SUBSCRIPTION_PRICE_NGN * 100, // kobo
      currency: 'NGN',
      ref: `274LAB-${student.id}-${Date.now()}`,
      metadata: {
        studentId: student.id,
        studentName: student.name,
      },
      callback: async (response) => {
        try {
          const newExpiry = await extendSubscription(student.id, 1)
          await addPayment({
            studentId: student.id,
            studentName: student.name,
            amount: SUBSCRIPTION_PRICE_NGN,
            currency: 'NGN',
            method: 'paystack',
            reference: response.reference,
            paidAt: new Date().toISOString(),
            extendsTo: newExpiry,
          })
          setSuccess('Payment received — access extended by 1 month!')
          await refreshStudent()
        } catch (e) {
          console.error(e)
          setErr('Payment received but failed to update. Contact admin with reference: ' + response.reference)
        }
        setPaying(false)
      },
      onClose: () => {
        setPaying(false)
      },
    })
    handler.openIframe()
  }

  const statusBadge = {
    active: { color: 'green', label: 'Active' },
    trial: { color: 'yellow', label: `Trial · ${status.daysLeft}d left` },
    expired: { color: 'red', label: 'Expired' },
  }[status.status]

  return (
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
            <li>✓ All subjects · all weeks</li>
            <li>✓ Corrections, explanations, retakes</li>
            <li>✓ Topic videos & study guides</li>
            <li>✓ Performance tracking</li>
          </ul>

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
            Secured by Paystack · {TRIAL_DAYS}-day free trial on new accounts
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
  )
}
