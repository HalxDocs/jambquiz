import { useState, useEffect, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { SparklesIcon, UserGroupIcon, CheckmarkCircle02Icon, Share01Icon, Coins01Icon } from '@hugeicons/core-free-icons'
import { functions, httpsCallable } from '../firebase'
import { getCoinBalance, listCoinPacks, createCoinsCheckout, listenPayments } from '../store/useStore'
import { useToastStore } from '../store/toast'
import SEO from '../components/seo/SEO'
import Receipt from '../components/payments/Receipt'

const EARN_ROWS = [
  { icon: SparklesIcon, title: 'Sign up', desc: 'Join 274Lab', coins: '+20 coins' },
  { icon: UserGroupIcon, title: 'Invite 1 friend', desc: 'They register with your number', coins: '+50 coins' },
  { icon: CheckmarkCircle02Icon, title: 'Complete 1 test', desc: 'Finish a weekly test', coins: '+10 coins' },
  { icon: Share01Icon, title: 'Share result', desc: 'Share your score after a test', coins: '+5 coins' },
]

export default function Coins({ student, setStudent, setView }) {
  const [balance, setBalance] = useState(student?.coins ?? null)
  const [packs, setPacks] = useState([])
  const [buying, setBuying] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const [justCredited, setJustCredited] = useState(0)
  const [err, setErr] = useState('')
  const [email, setEmail] = useState(student?.email || '')
  const [receipt, setReceipt] = useState(null)
  const [history, setHistory] = useState([])
  const [viewingReceipt, setViewingReceipt] = useState(null)
  const verifyingRef = useRef(false)

  const refreshBalance = async () => {
    try {
      const r = await getCoinBalance(student.id)
      if (r && r.ok) {
        setBalance(r.coins)
        setStudent({ ...student, coins: r.coins, referralNo: r.referralNo || student.referralNo })
        return r.coins
      }
    } catch {}
    return null
  }

  useEffect(() => {
    refreshBalance()
    listCoinPacks()
      .then((r) => { if (r && r.ok) setPacks(r.packs || []) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id])

  // Coin purchase history (for receipts) — same pattern as Subscribe
  useEffect(() => {
    const unsub = listenPayments((all) => {
      setHistory(all.filter((p) => p.studentId === student.id).sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)))
    })
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id])

  // Paystack redirect callback for coin purchases — verify immediately so the
  // new balance shows without waiting for the webhook.
  useEffect(() => {
    let ref = null
    let pending = null
    try { ref = new URLSearchParams(window.location.search).get('reference') || new URLSearchParams(window.location.search).get('trxref') } catch {}
    try { pending = localStorage.getItem('pending_paystack_ref') } catch {}
    const target = ref || pending
    if (!target || verifyingRef.current) return
    if (!student?.id) return
    // Only coin refs belong here; subscription/resume refs are handled on Subscribe
    if (!target.includes('-COIN-')) return
    if (!target.includes(student.id)) return
    verifyingRef.current = true
    setVerifying(true)
    const before = balance ?? student?.coins ?? 0
    const verify = async () => {
      try {
        const fn = httpsCallable(functions, 'completePaystackCheckout')
        const res = await fn({ reference: target })
        try { localStorage.removeItem('pending_paystack_ref') } catch {}
        try {
          const url = new URL(window.location.href)
          url.searchParams.delete('reference')
          url.searchParams.delete('trxref')
          window.history.replaceState({}, '', url.pathname + url.search + url.hash)
        } catch {}
        const fresh = await refreshBalance()
        const credited = fresh != null ? Math.max(0, fresh - before) : 0
        setJustCredited(credited)
        // Server now returns the payment record — show the full receipt.
        // Fall back to the paid amount signal when the record isn't attached.
        const payment = res?.data?.payment || null
        if (payment) {
          setReceipt({ ...payment, studentName: payment.studentName || student?.name || '' })
        } else {
          useToastStore.getState().showToast(
            credited > 0 ? `+${credited} coins added!` : 'Payment verified — balance updated!',
            'success'
          )
        }
      } catch (e) {
        // Webhook may still fulfill it a moment later — only alarm on explicit redirect
        if (ref) setErr(e?.message || 'Could not verify coin payment. If you were charged, contact support with ref: ' + target)
      }
      setVerifying(false)
    }
    verify()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student])

  const handleBuy = async (pack) => {
    setBuying(pack.id); setErr('')
    try {
      // Email is optional for coins — save it when valid so Paystack can send
      // the receipt; otherwise proceed without blocking payment.
      const cleanEmail = (email || '').trim().toLowerCase()
      if (cleanEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          setErr('Enter a valid email for your receipt — or leave it blank.')
          setBuying(null)
          return
        }
        try {
          const fn = httpsCallable(functions, 'updateStudentProfile')
          await fn({ studentId: student.id, email: cleanEmail }).catch(() => {})
        } catch {}
      }
      const res = await createCoinsCheckout(student.id, pack.id)
      if (res?.authorization_url && res?.reference) {
        try { localStorage.setItem('pending_paystack_ref', res.reference) } catch {}
        try { localStorage.setItem('pending_paystack_student', student.id) } catch {}
        window.location.href = res.authorization_url
        return
      }
      throw new Error('Paystack did not return a checkout URL')
    } catch (e) {
      setErr(e?.message || 'Could not start checkout. Try again.')
    }
    setBuying(null)
  }

  const referralNo = student?.referralNo || '…'

  const copyReferral = async () => {
    const text = `Join me start practicing bit by bit for JAMB on 274Lab and use my number ${referralNo} when you register - you get +20 coins and I get +50! https://www.274lab.com/`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join 274Lab', text })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        useToastStore.getState().showToast('Invite copied — share it!', 'success')
      }
    } catch {}
  }

  // Full receipt after a successful coin purchase — same Receipt design as
  // every other payment in the app, with share + print.
  if (receipt) {
    return (
      <>
        <SEO title="Payment Successful" />
        <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <Receipt
              payment={receipt}
              emailSentTo={receipt.email || email || student?.email || ''}
              footerNote={receipt.email || email || student?.email ? 'Paystack also emailed your receipt.' : ''}
              onDone={() => { setReceipt(null); setView('dashboard') }}
              doneLabel="Go to Dashboard →"
            />
            <button onClick={() => setReceipt(null)}
              className="w-full mt-2 text-xs text-[#AAA] font-label py-2">
              Back to Coins
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <SEO title="Get More Coins" />
      <div className="min-h-screen bg-[#F8F8F7]">
        <div className="max-w-md mx-auto px-4 pb-10">
          <div className="flex items-center gap-3 pt-8 pb-5">
            <button onClick={() => setView('dashboard')} className="text-[#888] hover:text-[#111] text-sm font-label transition-colors">
              ← Back
            </button>
            <h2 className="text-xl font-bold text-[#111] font-display">Coins</h2>
          </div>

          {/* Balance hero */}
          <div className="bg-[#111] text-white rounded-2xl p-5 mb-4 text-center">
            <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-1">Your balance</p>
            <p className="text-4xl font-bold font-display inline-flex items-center gap-2 justify-center">
              <HugeiconsIcon icon={Coins01Icon} size={32} color="#F5C518" /> {balance ?? '—'}
            </p>
            <p className="text-[11px] text-[#888] font-label mt-2">
              Your referral number: <span className="text-white font-bold text-sm tracking-widest">{referralNo}</span>
            </p>
            <button onClick={copyReferral}
              className="mt-3 bg-white text-[#111] text-xs font-bold font-label px-4 py-2 rounded-xl hover:bg-neutral-200 active:scale-95 transition-all">
              Invite a friend → +50 coins
            </button>
          </div>

          {verifying && (
            <div className="mb-3 px-3.5 py-2.5 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
              <p className="text-blue-700 text-xs font-label">Verifying your payment…</p>
            </div>
          )}
          {justCredited > 0 && (
            <div className="mb-3 px-3.5 py-2.5 bg-green-50 border border-green-100 rounded-xl">
              <p className="text-green-700 text-xs font-bold font-label inline-flex items-center gap-1.5">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="#15803D" /> +{justCredited} coins added to your balance!
              </p>
            </div>
          )}
          {err && (
            <div className="mb-3 px-3.5 py-2 bg-red-50 border border-red-100 rounded-xl">
              <p className="text-red-600 text-xs font-label">{err}</p>
            </div>
          )}

          {/* How to earn */}
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
            <p className="text-xs font-bold text-[#888] uppercase tracking-wide font-label mb-3">How to get more coins</p>
            <div className="space-y-2.5">
              {EARN_ROWS.map((r) => (
                <div key={r.title} className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#111] border border-[#111] flex items-center justify-center shrink-0">
                    <HugeiconsIcon icon={r.icon} size={18} color="white" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#111] font-body">{r.title}</p>
                    <p className="text-[11px] text-[#AAA] font-label">{r.desc}</p>
                  </div>
                  <span className="text-[11px] font-bold text-green-700 bg-green-50 border border-green-100 px-2 py-1 rounded-lg font-label shrink-0">{r.coins}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Buy packs */}
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
            <p className="text-xs font-bold text-[#888] uppercase tracking-wide font-label mb-3">Buy coins</p>
            <div className="mb-3">
              <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">
                Email <span className="text-[#CCC] normal-case tracking-normal">for payment receipt · optional</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErr('') }}
                placeholder="you@example.com (optional)"
                className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white"
              />
            </div>
            <div className="space-y-2.5">
              {packs.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border border-[#F1F1F0] rounded-xl p-3">
                  <span className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                    <HugeiconsIcon icon={Coins01Icon} size={20} color="#B87010" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#111] font-display">{p.coins} coins</p>
                    <p className="text-xs text-[#888] font-label">₦{Number(p.priceNgn || 0).toLocaleString()}</p>
                  </div>
                  <button onClick={() => handleBuy(p)} disabled={!!buying}
                    className="bg-[#111] text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-[#222] active:scale-95 transition-all font-display disabled:opacity-50">
                    {buying === p.id ? 'Opening…' : 'BUY'}
                  </button>
                </div>
              ))}
              {packs.length === 0 && (
                <p className="text-xs text-[#CCC] font-label text-center py-3">Coin packs unavailable right now</p>
              )}
            </div>
            <p className="text-[10px] text-[#AAA] text-center mt-3 font-label">Secured by Paystack · receipt for every payment</p>
          </div>

          {/* Purchase history with receipts */}
          {history.length > 0 && (
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
              <p className="text-xs font-bold text-[#888] uppercase tracking-wide font-label mb-3">Coin purchase history</p>
              <div className="space-y-2">
                {history.filter((p) => (p.type === 'coin_purchase' || p.type === 'coins' || !p.type)).map((p) => (
                  <div key={p.id} className="flex justify-between items-center py-2 border-b border-[#F3F3F2] last:border-0">
                    <div>
                      <p className="text-sm font-bold text-[#111] font-display">+{p.coins || '?'} coins · ₦{Number(p.amount || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-[#AAA] font-label mt-0.5">
                        {p.paidAt ? (() => { try { return new Date(p.paidAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '' } })() : ''}
                        {p.method && ` · ${p.method}`}
                      </p>
                    </div>
                    <button onClick={() => setViewingReceipt(p)}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-[#E5E5E5] text-[#555] hover:text-[#111] font-label shrink-0">
                      Receipt
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Receipt modal for a past purchase */}
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
    </>
  )
}
