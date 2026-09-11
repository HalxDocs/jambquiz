import { useState, useEffect, useRef } from 'react'
import { functions, httpsCallable } from '../firebase'
import { getCoinBalance, listCoinPacks, createCoinsCheckout } from '../store/useStore'
import { useToastStore } from '../store/toast'
import SEO from '../components/seo/SEO'

const EARN_ROWS = [
  { icon: '🎉', title: 'Sign up', desc: 'Join 274Lab', coins: '+10 coins' },
  { icon: '👯', title: 'Invite 1 friend', desc: 'They register with your number', coins: '+5 coins' },
  { icon: '✅', title: 'Complete 1 test', desc: 'Finish a weekly test', coins: '+5 coins' },
  { icon: '📤', title: 'Share result', desc: 'Share your score after a test', coins: '+5 coins' },
]

export default function Coins({ student, setStudent, setView }) {
  const [balance, setBalance] = useState(student?.coins ?? null)
  const [packs, setPacks] = useState([])
  const [buying, setBuying] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const [justCredited, setJustCredited] = useState(0)
  const [err, setErr] = useState('')
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
        await fn({ reference: target })
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
        useToastStore.getState().showToast(
          credited > 0 ? `+${credited} coins added!` : 'Payment verified — balance updated!',
          'success'
        )
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
      const email = (student.email || '').trim()
      if (email) {
        try {
          const fn = httpsCallable(functions, 'updateStudentProfile')
          await fn({ studentId: student.id, email }).catch(() => {})
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
    const text = `Join me on 274Lab and use my number ${referralNo} when you register — we both get coins! https://www.274lab.com/`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join 274Lab', text })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        useToastStore.getState().showToast('Invite copied — share it!', 'success')
      }
    } catch {}
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
            <p className="text-4xl font-bold font-display">🪙 {balance ?? '—'}</p>
            <p className="text-[11px] text-[#888] font-label mt-2">
              Your referral number: <span className="text-white font-bold text-sm tracking-widest">{referralNo}</span>
            </p>
            <button onClick={copyReferral}
              className="mt-3 bg-white text-[#111] text-xs font-bold font-label px-4 py-2 rounded-xl hover:bg-neutral-200 active:scale-95 transition-all">
              Invite a friend → +5 coins
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
              <p className="text-green-700 text-xs font-bold font-label">🎉 +{justCredited} coins added to your balance!</p>
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
                  <span className="text-xl shrink-0">{r.icon}</span>
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
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
            <p className="text-xs font-bold text-[#888] uppercase tracking-wide font-label mb-3">Buy coins</p>
            <div className="space-y-2.5">
              {packs.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border border-[#F1F1F0] rounded-xl p-3">
                  <span className="text-2xl shrink-0">🪙</span>
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
            <p className="text-[10px] text-[#AAA] text-center mt-3 font-label">Secured by Paystack</p>
          </div>
        </div>
      </div>
    </>
  )
}
