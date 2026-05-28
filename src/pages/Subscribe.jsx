import { useState, useEffect } from 'react'
import { addPayment, extendSubscription, listenPayments, getAccessStatus, SUBSCRIPTION_PRICE_NGN, findStudent, updateStudent } from '../store/useStore'

const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || ''

export default function Subscribe({ student, setStudent, setView }) {
  const [paying, setPaying] = useState(false)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [history, setHistory] = useState([])
  const [email, setEmail] = useState(student.email || '')

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

  const handlePay = async () => {
    if (!PAYSTACK_KEY) {
      setErr('Online payment not configured. Please contact admin to record a manual payment.')
      return
    }
    if (typeof window.PaystackPop === 'undefined') {
      setErr('Payment library not loaded. Refresh and try again.')
      return
    }
    const cleanEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErr('Enter a valid email address for your receipt')
      return
    }

    setPaying(true)
    setErr('')
    setSuccess('')

    // Persist the email on the student record so we don't ask again
    if (cleanEmail !== student.email) {
      try { await updateStudent(student.id, { email: cleanEmail }) } catch { /* non-fatal */ }
    }

    const handler = window.PaystackPop.setup({
      key: PAYSTACK_KEY,
      email: cleanEmail,
      amount: SUBSCRIPTION_PRICE_NGN * 100, // kobo
      currency: 'NGN',
      ref: `274LAB-${student.id}-${Date.now()}`,
      metadata: {
        studentId: student.id,
        studentName: student.name,
        custom_fields: [
          { display_name: 'Student Name', variable_name: 'student_name', value: student.name },
          { display_name: 'JAMB Year', variable_name: 'jamb_year', value: student.year || 'N/A' },
        ],
      },
      callback: (response) => {
        // Paystack callback runs in the inline iframe context; use Promise + setTimeout(0)
        setTimeout(async () => {
          try {
            const newExpiry = await extendSubscription(student.id, 1)
            await addPayment({
              studentId: student.id,
              studentName: student.name,
              email: cleanEmail,
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
        }, 0)
      },
      onClose: () => {
        setPaying(false)
      },
    })
    handler.openIframe()
  }

  const statusBadge = {
    active: { color: 'green', label: 'Active' },
    freebie: { color: 'yellow', label: `${status.freeAttemptsLeft} free quiz left` },
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
