import { HugeiconsIcon } from '@hugeicons/react'
import { Refresh01Icon, DatabaseIcon } from '@hugeicons/core-free-icons'

export default function StatsPanel({ stats, loading, onComputeStats, onRefresh, onTabChange }) {
  if (!stats && !loading) {
    return (
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
        <HugeiconsIcon icon={DatabaseIcon} size={32} color="#CCC" />
        <p className="text-sm font-bold text-[#555] font-display mt-3 mb-1">No Stats Yet</p>
        <p className="text-xs text-[#AAA] font-label mb-4">Run the stats computation to view performance data.</p>
        <button onClick={onComputeStats} className="bg-[#111] text-white px-5 py-2.5 rounded-xl text-xs font-bold font-label hover:bg-[#222] transition-colors">
          Compute Stats
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
        <div className="w-6 h-6 border-2 border-[#111] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-[#CCC] text-sm font-label">{stats ? 'Refreshing…' : 'Computing stats…'}</p>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
        <button onClick={onComputeStats} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#111] text-white font-label hover:bg-[#222] transition-colors shrink-0">
          <HugeiconsIcon icon={DatabaseIcon} size={14} color="currentColor" /> Compute
        </button>
        <button onClick={onRefresh} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E5E5E5] text-[#555] font-label hover:text-[#111] hover:bg-white transition-colors shrink-0">
          <HugeiconsIcon icon={Refresh01Icon} size={14} color="currentColor" /> Refresh
        </button>
        <span className="text-[10px] text-[#AAA] font-label ml-auto shrink-0">
          Updated {stats?.updatedAt ? new Date(stats.updatedAt.seconds * 1000 || stats.updatedAt).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {[
          { value: stats.studentCount, label: 'Students', color: 'text-[#111]' },
          { value: stats.attemptCount, label: 'Attempts', color: 'text-blue-600' },
          { value: stats.avgScore, label: 'Avg Score', color: (stats.avgScore || 0) >= 70 ? 'text-green-600' : (stats.avgScore || 0) >= 50 ? 'text-yellow-600' : 'text-red-500' },
        ].map(({ value, label, color }) => (
          <div key={label} className="bg-white border border-[#EBEBEB] rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold font-display ${color}`}>{value ?? '—'}</p>
            <p className="text-[10px] text-[#AAA] font-label mt-1">{label}</p>
          </div>
        ))}
      </div>

      {stats.revenue && (
        <button onClick={() => onTabChange && onTabChange('payments')}
          className="w-full text-left bg-[#111] text-white rounded-2xl p-5 hover:bg-[#222] transition-colors mb-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-1">Revenue</p>
              <div className="flex items-end gap-1.5">
                <span className="text-3xl font-bold font-display">₦{(stats.revenue.total || 0).toLocaleString()}</span>
                <span className="text-[#666] text-xs mb-1 font-label">all time</span>
              </div>
              <p className="text-[11px] text-[#AAA] font-label mt-1">₦{(stats.revenue.thisMonth || 0).toLocaleString()} this month</p>
            </div>
            <span className="text-[10px] font-semibold text-[#888] hover:text-white font-label">View →</span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10">
            <div className="text-center">
              <p className="text-base font-bold text-green-400 font-display">{stats.statusCounts?.active || 0}</p>
              <p className="text-[10px] text-[#666] font-label">Active</p>
            </div>
            <div className="text-center border-x border-white/10">
              <p className="text-base font-bold text-yellow-400 font-display">{stats.statusCounts?.trial || 0}</p>
              <p className="text-[10px] text-[#666] font-label">Trial</p>
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-red-400 font-display">{stats.statusCounts?.expired || 0}</p>
              <p className="text-[10px] text-[#666] font-label">Expired</p>
            </div>
          </div>
        </button>
      )}

      {stats.topOverall?.length > 0 && (
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
          <p className="text-sm font-bold text-[#111] font-display mb-3">Top Performers</p>
          <div className="space-y-2">
            {stats.topOverall.map((s, i) => (
              <div key={i} className="flex justify-between items-center py-2.5 border-b border-[#F3F3F2] last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-display ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-[#F3F3F2] text-[#555]' : 'bg-orange-50 text-orange-600'
                  }`}>{i + 1}</span>
                  <p className="text-sm font-semibold text-[#111] font-body">{s.name}</p>
                </div>
                <p className="text-sm font-bold text-[#111] font-display">{s.total}<span className="text-[10px] text-[#AAA] font-label">/400</span></p>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.topBySubject?.length > 0 && (
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
          <p className="text-sm font-bold text-[#111] font-display mb-4">Top Performers by Subject</p>
          <div className="space-y-5">
            {stats.topBySubject.map(({ subject, ranked }) => (
              <div key={subject}>
                <p className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] font-label mb-2">{subject}</p>
                <div className="space-y-1.5">
                  {ranked.map((s, i) => (
                    <div key={i} className="flex justify-between items-center py-2 px-3 bg-[#F8F8F7] rounded-xl">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-display shrink-0 ${
                          i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-[#E5E5E5] text-[#555]' : 'bg-orange-50 text-orange-600'
                        }`}>{i + 1}</span>
                        <p className="text-xs font-semibold text-[#111] font-body">{s.name}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold font-display text-[#111]">{s.score}</span>
                        <span className="text-[10px] text-[#AAA] font-label">/{s.outOf}</span>
                        <span className={`ml-2 text-[10px] font-bold font-label ${s.pct >= 70 ? 'text-green-600' : s.pct >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>{s.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.subjectAverages?.length > 0 && (
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
          <p className="text-sm font-bold text-[#111] font-display mb-4">Performance by Subject</p>
          <div className="space-y-4">
            {stats.subjectAverages.map(({ subject, avg, outOf, attemptCount }) => {
              const pct = Math.round((avg / outOf) * 100)
              return (
                <div key={subject}>
                  <div className="flex justify-between items-center mb-1.5">
                    <p className="text-xs font-semibold text-[#333] font-body">{subject}</p>
                    <p className="text-[11px] text-[#888] font-label">{avg}/{outOf} · {attemptCount} attempts</p>
                  </div>
                  <div className="w-full bg-[#F3F3F2] rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}