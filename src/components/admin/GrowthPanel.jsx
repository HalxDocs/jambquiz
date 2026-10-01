import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { CrownIcon, UserGroupIcon, EyeIcon, SplitIcon, ArrowReloadHorizontalIcon } from '@hugeicons/core-free-icons'
import { functions, httpsCallable } from '../../firebase'
import { useToastStore } from '../../store/toast'

const KIND_META = {
  ask: { label: 'Ask a GOAT', icon: CrownIcon },
  peek: { label: 'Peek a Friend', icon: EyeIcon },
  fifty: { label: '50-50', icon: SplitIcon },
}

function StatCard({ value, label, accent }) {
  return (
    <div className="bg-white border border-[#EBEBEB] rounded-xl p-3 text-center min-w-0">
      <p className={`text-xl sm:text-2xl font-bold font-display truncate ${accent || 'text-[#111]'}`}>{value}</p>
      <p className="text-[10px] text-[#888] font-label mt-0.5 leading-tight">{label}</p>
    </div>
  )
}

function Bar({ label, value, max, color, icon, badge }) {
  return (
    <div className="py-1.5">
      <div className="flex justify-between items-center gap-2 mb-1">
        <p className="text-xs font-bold text-[#333] font-body flex items-center gap-1.5 min-w-0">
          {icon && <HugeiconsIcon icon={icon} size={14} color="#B87010" />}
          <span className="truncate">{label}</span>
          {badge && (
            <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-label shrink-0">MOST USED</span>
          )}
        </p>
        <span className="text-xs font-bold text-[#111] font-display shrink-0">{value}</span>
      </div>
      <div className="w-full bg-[#F3F3F2] rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${color || 'bg-[#111]'}`} style={{ width: `${max > 0 ? Math.round((value / max) * 100) : 0}%` }} />
      </div>
    </div>
  )
}

function TopList({ rows, emptyText, valueSuffix }) {
  if (!rows?.length) return <p className="text-[#CCC] text-xs text-center py-4 font-label">{emptyText}</p>
  return (
    <div className="divide-y divide-[#F3F3F2]">
      {rows.map((r, i) => (
        <div key={r.id || i} className="flex items-center gap-2.5 py-2">
          <span className={`w-6 h-6 rounded-lg text-[11px] font-bold flex items-center justify-center shrink-0 font-display ${i < 3 ? 'bg-[#111] text-white' : 'bg-[#F3F3F2] text-[#888]'}`}>
            {i + 1}
          </span>
          <p className="flex-1 text-xs font-bold text-[#111] font-body truncate">{r.name}</p>
          <span className="text-xs font-bold text-[#555] font-display shrink-0">{r.count}{valueSuffix || ''}</span>
        </div>
      ))}
    </div>
  )
}

export default function GrowthPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await httpsCallable(functions, 'getGrowthStats')()
      if (res?.data?.ok) setData(res.data)
      else useToastStore.getState().showToast('Growth stats returned an error', 'error')
    } catch (e) {
      useToastStore.getState().showToast(e?.message || 'Failed to load growth stats', 'error')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading && !data) {
    return (
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
        <div className="w-6 h-6 border-2 border-[#111] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-[#CCC] text-sm font-label">Crunching referrals, squads & lifelines…</p>
      </div>
    )
  }

  const ref = data?.referrals || {}
  const sq = data?.squads || {}
  const lf = data?.lifelines || {}
  const maxKind = Math.max(lf.uses?.ask || 0, lf.uses?.peek || 0, lf.uses?.fifty || 0, 1)
  const maxSize = Math.max(sq.sizeDist?.[1] || 0, sq.sizeDist?.[2] || 0, sq.sizeDist?.[3] || 0, sq.sizeDist?.[4] || 0, 1)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <p className="text-xs font-bold text-[#888] uppercase tracking-wide font-label">Growth insights</p>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-[#E5E5E5] bg-white text-[#555] hover:text-[#111] font-label disabled:opacity-50">
          <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={13} color="currentColor" />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Invite codes ── */}
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 sm:p-5">
        <p className="text-sm font-bold text-[#111] font-display mb-1">Registrations via invite code</p>
        <p className="text-[11px] text-[#AAA] font-label mb-3">Students who signed up with someone's referral number</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <StatCard value={ref.referredCount ?? 0} label="Via invite" accent="text-green-600" />
          <StatCard value={`${ref.rate ?? 0}%`} label="Of all users" />
          <StatCard value={ref.coinsPaid ?? 0} label="Referral coins paid" />
        </div>
        <p className="text-[11px] font-bold text-[#888] uppercase tracking-wide font-label mb-1">Top inviters</p>
        <TopList rows={ref.topReferrers} emptyText="No invite-code signups yet" valueSuffix=" invited" />
      </div>

      {/* ── Squads ── */}
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <HugeiconsIcon icon={UserGroupIcon} size={16} color="#111" />
          <p className="text-sm font-bold text-[#111] font-display">My Squad adoption</p>
        </div>
        <p className="text-[11px] text-[#AAA] font-label mb-3">Peek-a-Friend only works with a squad — this shows if users bother</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <StatCard value={sq.withSquad ?? 0} label="Have a squad" accent="text-green-600" />
          <StatCard value={`${sq.rate ?? 0}%`} label="Of all users" />
          <StatCard value={sq.avgSize ?? 0} label="Avg squad size" />
        </div>
        <Bar label="1 friend" value={sq.sizeDist?.[1] || 0} max={maxSize} />
        <Bar label="2 friends" value={sq.sizeDist?.[2] || 0} max={maxSize} />
        <Bar label="3 friends" value={sq.sizeDist?.[3] || 0} max={maxSize} />
        <Bar label="4 friends" value={sq.sizeDist?.[4] || 0} max={maxSize} color="bg-green-600" />
      </div>

      {/* ── Lifelines ── */}
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <HugeiconsIcon icon={CrownIcon} size={16} color="#B87010" />
          <p className="text-sm font-bold text-[#111] font-display">Lifeline usage</p>
        </div>
        <p className="text-[11px] text-[#AAA] font-label mb-3">
          {(lf.sessionsScanned ?? 0) > 0 ? `Across ${lf.sessionsScanned} test sessions` : 'No test sessions yet'}
        </p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <StatCard value={lf.totalUses ?? 0} label="Total assists" accent="text-green-600" />
          <StatCard value={lf.lifelineUsers ?? 0} label="Users" />
          <StatCard value={lf.sessionsWithLifeline ?? 0} label="Tests w/ lifeline" />
        </div>
        {['ask', 'peek', 'fifty'].map((k) => (
          <Bar key={k}
            label={KIND_META[k].label}
            icon={KIND_META[k].icon}
            value={lf.uses?.[k] || 0}
            max={maxKind}
            badge={lf.topKind === k && (lf.totalUses || 0) > 0}
            color={lf.topKind === k ? 'bg-amber-500' : 'bg-[#111]'}
          />
        ))}
        <p className="text-[11px] font-bold text-[#888] uppercase tracking-wide font-label mt-3 mb-1">Heaviest lifeline users</p>
        <TopList rows={lf.topUsers} emptyText="No lifeline use yet" valueSuffix=" uses" />
      </div>
    </div>
  )
}
