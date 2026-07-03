import { useState } from 'react'
import { functions, httpsCallable } from '../../firebase'
import { addPayment, updateStudent } from '../../store/useStore'

const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || ''
const RESUME_PRICE = 800

export default function AppealOverlay({ student, onAppealed }) {
  const [step, setStep] = useState('notice')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [paying, setPaying] = useState(false)

  const handleVerify = async () => {
    if (!code.trim() || code.trim().length !== 4) { setError('Enter the 4-digit code from your accountability partner'); return }
    setLoading(true)
    setError('')
    try {
      const fn = httpsCallable(functions, 'verifyRecoveryCode')
      const result = await fn({ studentId: student.id, code: code.trim() })
      if (result.data?.ok) {
        onAppealed()
      } else {
        setError('Invalid code. Contact your accountability partner.')
      }
    } catch (e) {
      setError(e?.message || 'Failed to verify code. Check your connection.')
    }
    setLoading(false)
  }

  const handlePay = async () => {
    if (!PAYSTACK_KEY) {
      setError('Online payment not configured. Please contact admin.')
      return
    }
    if (typeof window.PaystackPop === 'undefined') {
      setError('Payment library not loaded. Refresh and try again.')
      return
    }
    const email = student.email || `${student.name.toLowerCase().replace(/\s+/g, '.')}@274lab.com`

    setPaying(true)
    setError('')

    const handler = window.PaystackPop.setup({
      key: PAYSTACK_KEY,
      email,
      amount: RESUME_PRICE * 100,
      currency: 'NGN',
      ref: `274LAB-RESUME-${student.id}-${Date.now()}`,
      metadata: {
        studentId: student.id,
        studentName: student.name,
        type: 'account_resume',
        custom_fields: [
          { display_name: 'Student Name', variable_name: 'student_name', value: student.name },
          { display_name: 'Payment Type', variable_name: 'payment_type', value: 'Account Resume' },
        ],
      },
      callback: async (response) => {
        setTimeout(async () => {
          try {
            await updateStudent(student.id, { missedStreak: 0, suspended: false })
            await addPayment({
              studentId: student.id,
              studentName: student.name,
              email,
              amount: RESUME_PRICE,
              currency: 'NGN',
              method: 'paystack',
              reference: response.reference,
              type: 'account_resume',
              paidAt: new Date().toISOString(),
            })
            onAppealed()
          } catch (e) {
            console.error(e)
            setError('Payment received but failed to update. Contact admin with reference: ' + response.reference)
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

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col items-center justify-center p-6" style={{ overscrollBehavior: 'none' }}>
      {step === 'notice' && (
        <div className="text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-white font-display mb-3">Account Suspended</h2>
          <p className="text-sm text-[#888] font-label leading-relaxed mb-2">
            You've missed 3 weekly quizzes. Weekly tests and key points are paused until you reactivate.
          </p>
          <div className="bg-[#161616] border border-[#333] rounded-xl p-3 mb-6 text-left space-y-2">
            <p className="text-xs text-[#888] font-label">Choose how to reactivate:</p>
            <div className="flex items-start gap-2">
              <span className="text-yellow-400 mt-0.5 text-sm">🔑</span>
              <div>
                <p className="text-xs font-bold text-white font-label">Enter recovery code</p>
                <p className="text-[10px] text-[#666] font-label">Contact your accountability partner</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-400 mt-0.5 text-sm">💰</span>
              <div>
                <p className="text-xs font-bold text-white font-label">Pay N800</p>
                <p className="text-[10px] text-[#666] font-label">Resume access immediately</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setStep('appeal')}
            className="w-full bg-yellow-600 text-white rounded-xl py-3.5 text-sm font-bold hover:bg-yellow-700 active:scale-[0.99] transition-all font-display mb-2.5"
          >
            Enter Recovery Code
          </button>
          <button
            onClick={handlePay}
            disabled={paying}
            className="w-full bg-green-600 text-white rounded-xl py-3.5 text-sm font-bold hover:bg-green-700 active:scale-[0.99] transition-all font-display disabled:opacity-50"
          >
            {paying ? 'Processing...' : 'Pay N800 to Resume'}
          </button>
          {error && <p className="text-xs text-red-400 font-label mt-2">{error}</p>}
        </div>
      )}

      {step === 'appeal' && (
        <div className="text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">🔑</span>
          </div>
          <h2 className="text-xl font-bold text-white font-display mb-3">Enter Recovery Code</h2>
          <p className="text-sm text-[#888] font-label leading-relaxed mb-6">
            Ask your accountability partner for the 4-digit code sent to them when you registered.
          </p>
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.slice(0, 4)); setError('') }}
            placeholder="0000"
            className="w-full border border-[#333] bg-[#161616] text-white rounded-xl px-4 py-3.5 text-center tracking-[0.5em] text-2xl font-bold font-display focus:outline-none focus:border-red-500"
            maxLength={4}
            autoFocus
          />
          {error && <p className="text-xs text-red-400 font-label mt-2">{error}</p>}
          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full bg-green-600 text-white rounded-xl py-3.5 text-sm font-bold hover:bg-green-700 active:scale-[0.99] transition-all font-display mt-4 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>
          <button
            onClick={() => setStep('notice')}
            className="text-xs text-[#555] hover:text-[#888] font-label mt-4 transition-colors"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  )
}
