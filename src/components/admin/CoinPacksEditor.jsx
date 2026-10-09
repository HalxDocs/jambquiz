import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../lib/api'
import { useToastStore } from '../../store/toast'

export default function CoinPacksEditor() {
  const [packs, setPacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [coins, setCoins] = useState('10')
  const [price, setPrice] = useState('250')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await apiGet('/api/coins/packs')
      if (res.ok) setPacks(res.packs || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    const c = parseInt(coins, 10), p = parseInt(price, 10)
    if (!c || c < 1 || c > 1000) { useToastStore.getState().showToast('Coins must be 1–1000'); return }
    if (!p || p < 1 || p > 100000) { useToastStore.getState().showToast('Price must be ₦1–₦100,000'); return }
    setSaving(true)
    try {
      const res = await apiPost('/api/admin/coin-packs', { coins: c, priceNgn: p })
      if (res.ok) {
        useToastStore.getState().showToast(`${c} coins → ₦${p.toLocaleString()} saved`, 'success')
        await load()
      }
    } catch (e) {
      useToastStore.getState().showToast(e?.message || 'Failed to save pack')
    }
    setSaving(false)
  }

  return (
    <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
      <p className="text-sm font-bold text-[#111] font-display mb-1">Coin packs</p>
      <p className="text-[11px] text-[#AAA] font-label mb-3">Prices students pay in the Coins page. No deploy needed.</p>
      {loading ? (
        <p className="text-xs text-[#CCC] font-label">Loading…</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {packs.map((p) => (
            <div key={p.id} className="flex justify-between items-center py-1.5 border-b border-[#F3F3F2] last:border-0">
              <p className="text-xs font-bold text-[#111] font-display">🪙 {p.coins} coins</p>
              <p className="text-xs text-[#555] font-label">₦{Number(p.priceNgn || 0).toLocaleString()}</p>
            </div>
          ))}
          {packs.length === 0 && <p className="text-xs text-[#CCC] font-label">No packs — defaults apply</p>}
        </div>
      )}
      <div className="flex gap-2">
        <input value={coins} onChange={(e) => setCoins(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric" placeholder="Coins"
          className="flex-1 border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] focus:outline-none focus:border-[#111]" />
        <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric" placeholder="₦ Price"
          className="flex-1 border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] focus:outline-none focus:border-[#111]" />
        <button onClick={handleSave} disabled={saving}
          className="bg-[#111] text-white rounded-xl px-4 py-2 text-xs font-bold hover:bg-[#222] font-display disabled:opacity-40">
          {saving ? '…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
