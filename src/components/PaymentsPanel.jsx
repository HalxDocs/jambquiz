import { useState } from 'react'
import { getAccessStatus } from '../store/useStore'

export default function PaymentsPanel({ payments, students }) {
  const [paymentSearch, setPaymentSearch] = useState('')
  const [success, setSuccess] = useState('')

  const totalRevenue = payments.reduce((a, p) => a + (p.amount || 0), 0)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const monthRevenue = payments
    .filter((p) => new Date(p.paidAt).getTime() >= monthStart)
    .reduce((a, p) => a + (p.amount || 0), 0)
  const last30Start = now.getTime() - 30 * 24 * 60 * 60 * 1000
  const last30Revenue = payments
    .filter((p) => new Date(p.paidAt).getTime() >= last30Start)
    .reduce((a, p) => a + (p.amount || 0), 0)

  let active = 0, trial = 0, expired = 0
  students.forEach((s) => {
    const st = getAccessStatus(s).status
    if (st === 'active') active++
    else if (st === 'trial') trial++
    else expired++
  })

  const filtered = paymentSearch.trim()
    ? payments.filter((p) => (p.studentName || '').toLowerCase().includes(paymentSearch.trim().toLowerCase()))
    : payments
  const sorted = [...filtered].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))

  return (
    <div className="space-y-4">
      <div className="bg-[#111] text-white rounded-2xl p-5">
        <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-1">Total Revenue</p>
        <div className="flex items-end gap-1.5">
          <span className="text-4xl font-bold font-display">₦{totalRevenue.toLocaleString()}</span>
          <span className="text-[#666] text-sm mb-1 font-label">all time</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/10">
          <div>
            <p className="text-[10px] text-[#666] font-label mb-0.5">This month</p>
            <p className="text-lg font-bold font-display">₦{monthRevenue.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#666] font-label mb-0.5">Last 30 days</p>
            <p className="text-lg font-bold font-display">₦{last30Revenue.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-[#EBEBEB] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-600 font-display">{active}</p>
          <p className="text-[10px] text-[#888] font-label mt-0.5">Active</p>
        </div>
        <div className="bg-white border border-[#EBEBEB] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-yellow-600 font-display">{trial}</p>
          <p className="text-[10px] text-[#888] font-label mt-0.5">On Trial</p>
        </div>
        <div className="bg-white border border-[#EBEBEB] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-500 font-display">{expired}</p>
          <p className="text-[10px] text-[#888] font-label mt-0.5">Expired</p>
        </div>
      </div>

      <input
        value={paymentSearch}
        onChange={(e) => setPaymentSearch(e.target.value)}
        placeholder="Search by student name…"
        className="w-full border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white"
      />

      {success && (
        <div className="bg-green-50 border border-green-100 rounded-xl px-3.5 py-2">
          <p className="text-green-600 text-xs font-label">{success}</p>
        </div>
      )}

      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
        <div className="flex justify-between items-center mb-3">
          <p className="text-sm font-bold text-[#111] font-display">All Payments</p>
          <span className="text-[11px] font-semibold bg-[#F3F3F2] text-[#555] px-2.5 py-1 rounded-lg font-label">
            {sorted.length} record{sorted.length !== 1 ? 's' : ''}
          </span>
        </div>
        {sorted.length === 0 ? (
          <p className="text-[#CCC] text-sm text-center py-6 font-label">No payments yet</p>
        ) : (
          <div className="space-y-1">
            {sorted.map((p) => (
              <div key={p.id} className="flex justify-between items-center py-2.5 border-b border-[#F3F3F2] last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[#111] font-body truncate">{p.studentName || 'Unknown'}</p>
                  <p className="text-[10px] text-[#AAA] font-label mt-0.5">
                    {new Date(p.paidAt).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {' · '}
                    <span className={p.method === 'paystack' ? 'text-blue-600' : 'text-[#888]'}>{p.method || 'unknown'}</span>
                  </p>
                  {p.reference && (
                    <p className="text-[9px] text-[#CCC] font-label truncate mt-0.5">{p.reference}</p>
                  )}
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-sm font-bold text-green-600 font-display">₦{(p.amount || 0).toLocaleString()}</p>
                  {p.extendsTo && (
                    <p className="text-[10px] text-[#AAA] font-label">until {new Date(p.extendsTo).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
