import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'

export default function PaymentsPanel({ payments, loading, search, onSearch, page, onPrevPage, onNextPage, hasMore, stats }) {
  return (
    <div className="space-y-4">
      {(stats?.revenue) ? (
        <div className="bg-[#111] text-white rounded-2xl p-5">
          <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-1">Total Revenue</p>
          <div className="flex items-end gap-1.5">
            <span className="text-4xl font-bold font-display">₦{(stats.revenue.total || 0).toLocaleString()}</span>
            <span className="text-[#666] text-sm mb-1 font-label">all time</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/10">
            <div>
              <p className="text-[10px] text-[#666] font-label mb-0.5">This month</p>
              <p className="text-lg font-bold font-display">₦{(stats.revenue.thisMonth || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#666] font-label mb-0.5">Last 30 days</p>
              <p className="text-lg font-bold font-display">₦{(stats.revenue.last30Days || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#111] text-white rounded-2xl p-5 text-center">
          <p className="text-sm text-[#888] font-label">Compute stats to see revenue</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-[#EBEBEB] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-600 font-display">{stats?.statusCounts?.active || 0}</p>
          <p className="text-[10px] text-[#888] font-label mt-0.5">Active</p>
        </div>
        <div className="bg-white border border-[#EBEBEB] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-yellow-600 font-display">{stats?.statusCounts?.freebie || 0}</p>
          <p className="text-[10px] text-[#888] font-label mt-0.5">Free</p>
        </div>
        <div className="bg-white border border-[#EBEBEB] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-500 font-display">{stats?.statusCounts?.expired || 0}</p>
          <p className="text-[10px] text-[#888] font-label mt-0.5">Expired</p>
        </div>
      </div>

      <input value={search} onChange={(e) => onSearch(e.target.value)}
        placeholder="Search by student name…"
        className="w-full border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white" />

      {loading ? (
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
          <div className="w-6 h-6 border-2 border-[#111] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-[#CCC] text-sm font-label">Loading…</p>
        </div>
      ) : (
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-bold text-[#111] font-display">Payments</p>
            <span className="text-[11px] font-semibold bg-[#F3F3F2] text-[#555] px-2.5 py-1 rounded-lg font-label">
              {payments.length}{search ? ` matching` : ''}
            </span>
          </div>
          {payments.length === 0 ? (
            <p className="text-[#CCC] text-sm text-center py-6 font-label">No payments found</p>
          ) : (
            <div className="space-y-1">
              {payments.map((p) => (
                <div key={p.id} className="flex justify-between items-center py-2.5 border-b border-[#F3F3F2] last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#111] font-body truncate">{p.studentName || 'Unknown'}</p>
                    <p className="text-[10px] text-[#AAA] font-label mt-0.5">
                      {new Date(p.paidAt).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      <span className={p.method === 'bachs' ? 'text-blue-600' : 'text-[#888]'}>{p.method || 'unknown'}</span>
                    </p>
                    {p.reference && <p className="text-[9px] text-[#CCC] font-label truncate mt-0.5">{p.reference}</p>}
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-sm font-bold text-green-600 font-display">₦{(p.amount || 0).toLocaleString()}</p>
                    {p.extendsTo && <p className="text-[10px] text-[#AAA] font-label">until {new Date(p.extendsTo).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      <div className="flex justify-between items-center mt-2">
        <button onClick={onPrevPage} disabled={page === 0}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold font-label transition-colors ${
            page === 0 ? 'text-[#CCC] cursor-not-allowed' : 'text-[#555] hover:text-[#111] hover:bg-white border border-[#E5E5E5]'
          }`}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} color="currentColor" /> Prev
        </button>
        <span className="text-[11px] text-[#AAA] font-label">Page {page + 1}</span>
        <button onClick={onNextPage} disabled={!hasMore}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold font-label transition-colors ${
            !hasMore ? 'text-[#CCC] cursor-not-allowed' : 'text-[#555] hover:text-[#111] hover:bg-white border border-[#E5E5E5]'
          }`}>
          Next <HugeiconsIcon icon={ArrowRight01Icon} size={14} color="currentColor" />
        </button>
      </div>
    </div>
  )
}