import { useEffect, useState } from 'react'
import { adminGetTeachers, adminDeleteTeacher } from '../../store/useStore'
import { useToastStore } from '../../store/toast'
import { functions, httpsCallable } from '../../firebase'

function monthShort(m) {
  try {
    return new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short' })
  } catch {
    return m || ''
  }
}

const naira = (n) => `N${Number(n || 0).toLocaleString('en-NG')}`

function isPioneerBonusMonth(m) { return m >= '2026-10' && m <= '2026-12' }

const LOGIN_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export default function TeachersPanel() {
  const [teachers, setTeachers] = useState([])
  const [latestMonth, setLatestMonth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState({})
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [pioneerBusy, setPioneerBusy] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const res = await adminGetTeachers()
      if (res && res.ok) {
        setTeachers(res.teachers || [])
        setLatestMonth(res.latestMonth || null)
        const now = new Date()
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        setSelectedMonth((prev) => prev || thisMonth)
      } else {
        setError('Could not load teachers')
      }
    } catch (e) {
      const msg = (e?.message) || 'Could not load teachers'
      if (msg.includes('functions.googleapis.com') || msg.includes('NOT_FOUND')) {
        setError('Teacher feature not deployed. Run: firebase deploy --only functions:adminTeacherDashboard')
      } else if (msg.includes('permission') || msg.includes('denied')) {
        setError('Firestore rules blocking read. Deploy: firebase deploy --only firestore:rules')
      } else {
        setError(msg)
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (error) useToastStore.getState().showToast(error, 'error')
  }, [error])

  const handleMakePioneer = async (teacherId) => {
    setPioneerBusy(teacherId)
    try {
      const fn = httpsCallable(functions, 'makePioneer')
      const res = await fn({ teacherId })
      useToastStore.getState().showToast(`Pioneer created — code ${res.data.code}`, 'success')
      await load()
    } catch (e) {
      useToastStore.getState().showToast(e?.message || 'Failed to make Pioneer', 'error')
    }
    setPioneerBusy(null)
  }

  const handleDeleteTeacher = async (t) => {
    const linked = t.linkedCount || 0
    const ok = window.confirm(
      `Delete teacher "${t.name}" permanently?\n\n` +
      `This signs them out forever and removes their pioneer code.` +
      (linked ? `\n${linked} linked student${linked === 1 ? '' : 's'} will keep their data but lose this teacher.` : `\nNo students are linked to this teacher.`)
    )
    if (!ok) return
    setDeleteBusy(t.teacherId)
    try {
      await adminDeleteTeacher(t.teacherId)
      useToastStore.getState().showToast(`Deleted teacher "${t.name}"`, 'success')
      await load()
    } catch (e) {
      useToastStore.getState().showToast(e?.message || 'Failed to delete teacher', 'error')
    }
    setDeleteBusy(null)
  }

  const handleRemovePioneer = async (teacherId) => {
    if (!window.confirm('Remove Pioneer status and code?')) return
    setPioneerBusy(teacherId)
    try {
      const fn = httpsCallable(functions, 'removePioneer')
      await fn({ teacherId })
      useToastStore.getState().showToast('Pioneer removed', 'success')
      await load()
    } catch (e) {
      useToastStore.getState().showToast(e?.message || 'Failed', 'error')
    }
    setPioneerBusy(null)
  }

  // Always include the current calendar month (even with zero data) so the
  // page opens on "now" instead of getting stuck on the last active month.
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthOptions = [...new Set(
    teachers.reduce((acc, t) => {
      Object.keys(t.monthsEarnings || {}).forEach((m) => acc.push(m))
      ;(t.students || []).forEach((s) => Object.keys(s.monthlyCounts || {}).forEach((m) => acc.push(m)))
      return acc
    }, [currentMonth])
  )].sort()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display text-[#111]">Teachers</h2>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs font-semibold bg-[#111] text-white rounded-lg px-3 py-2 hover:bg-[#222] transition-colors font-label disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#555] font-label">
        <strong className="text-[#111] font-semibold">{teachers.length}</strong> registered teacher{teachers.length === 1 ? '' : 's'}
        {" · N500 per student with ≥3 tests/month · max 30 students per teacher"}
      </div>

      {loading && (
        <div className="bg-white border border-[#E5E5E5] rounded-xl p-8 text-center">
          <p className="text-sm text-[#888] font-label">Loading teachers…</p>
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-red-600 text-xs font-label">{error}</p>
        </div>
      )}

      {!loading && !error && teachers.length === 0 && (
        <div className="bg-white border border-[#E5E5E5] rounded-xl p-8 text-center">
          <p className="text-2xl mb-2">👩‍🏫</p>
          <p className="text-sm font-semibold text-[#111] font-display">No teachers yet</p>
          <p className="text-xs text-[#888] font-label mt-1">Teachers register from the "For Teachers" section on the home page.</p>
        </div>
      )}

      {!loading && teachers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-[#888] font-label font-semibold">Earnings:</span>
          {[...monthOptions, latestMonth].filter(Boolean).sort().map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMonth(m)}
              className={`text-[11px] font-bold rounded-lg px-2.5 py-1 font-label transition-colors ${
                selectedMonth === m ? 'bg-[#111] text-white' : 'bg-white border border-[#E5E5E5] text-[#666] hover:border-[#CCC]'
              }`}
            >
              {monthShort(m)}
            </button>
          ))}
        </div>
      )}

      {!loading && teachers.map((t) => {
        const open = !!expanded[t.teacherId]
        const earnings = (t.monthsEarnings || {})[selectedMonth] || 0
        return (
          <div key={t.teacherId} className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded((p) => ({ ...p, [t.teacherId]: !open }))}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[#FAFAF9] transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#111] font-display truncate">{t.name}</p>
                <p className="text-[11px] text-[#888] font-label truncate">
                  +{t.phone} · {t.bankName ? `${t.bankName} Acct ${t.accountNumber}` : 'No bank details'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-[#666] font-label bg-[#F3F3F2] rounded-lg px-2 py-1">
                  {t.linkedCount || 0} linked
                </span>
                <span className={`text-[11px] font-bold rounded-lg px-2 py-1 font-label ${earnings > 0 ? 'bg-green-50 text-green-700' : 'bg-[#F3F3F2] text-[#888]'}`}>
                  {naira(earnings)}
                </span>
                <span className="text-[#AAA]">{open ? '−' : '+'}</span>
              </div>
            </button>

            <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
              <button onClick={() => handleDeleteTeacher(t)} disabled={deleteBusy === t.teacherId}
                className="text-[11px] font-bold text-red-600 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50 font-label disabled:opacity-50">
                {deleteBusy === t.teacherId ? 'Deleting…' : 'Delete'}
              </button>
              {t.isPioneer ? (
                <>
                  <span className="text-[11px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-200 rounded-lg px-2 py-1 flex items-center gap-1">
                    <span>👑</span> PIONEER {t.pioneerCode}
                  </span>
                  <button onClick={() => handleRemovePioneer(t.teacherId)} disabled={pioneerBusy === t.teacherId} className="text-[11px] text-red-600 hover:underline font-label disabled:opacity-50">
                    Remove
                  </button>
                  <span className="text-[11px] text-[#888] font-label">
                    Bonus {naira((t.pioneerEarnings || {})[selectedMonth] || 0)} {selectedMonth && isPioneerBonusMonth(selectedMonth) ? '(Oct-Dec cap 20)' : ''}
                  </span>
                </>
              ) : (
                <button onClick={() => handleMakePioneer(t.teacherId)} disabled={pioneerBusy === t.teacherId} className="text-[11px] font-bold bg-[#111] text-white rounded-lg px-3 py-1.5 hover:bg-[#222] font-label disabled:opacity-50">
                  {pioneerBusy === t.teacherId ? '...' : 'Make PIONEER'}
                </button>
              )}
            </div>

            {open && (
              <div className="border-t border-[#F1F1F0] px-4 py-3">
                <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#F8F8F7] rounded-lg px-3 py-2">
                    <p className="text-[10px] text-[#888] font-label uppercase tracking-wide mb-0.5">Students linked</p>
                    <p className="font-bold text-[#111] font-display">{t.linkedCount || 0}</p>
                  </div>
                  <div className="bg-[#F8F8F7] rounded-lg px-3 py-2">
                    <p className="text-[10px] text-[#888] font-label uppercase tracking-wide mb-0.5">Met target (≤30)</p>
                    <p className="font-bold text-[#111] font-display">
                      {(t.qualifiedCounts || {})[selectedMonth] || 0}/30
                    </p>
                    <p className="text-[10px] text-[#888] font-label">completed 3 tests this month · N500 each</p>
                  </div>
                  <div className="bg-[#F8F8F7] rounded-lg px-3 py-2">
                    <p className="text-[10px] text-[#888] font-label uppercase tracking-wide mb-0.5">Bank</p>
                    <p className="font-bold text-[#111] font-display truncate">{t.bankName || '—'}</p>
                    <p className="text-[10px] text-[#888] font-label">{t.accountNumber ? `Acct ${t.accountNumber}` : '—'}</p>
                  </div>
                  <div className="bg-[#F8F8F7] rounded-lg px-3 py-2">
                    <p className="text-[10px] text-[#888] font-label uppercase tracking-wide mb-0.5">Contact</p>
                    <p className="font-bold text-[#111] font-display truncate">{t.phone || '—'}</p>
                    <p className="text-[10px] text-[#888] font-label truncate">{t.email || ''}</p>
                  </div>
                </div>

                {(t.students || []).length === 0 ? (
                  <p className="text-xs text-[#AAA] font-label">No linked students yet.</p>
                ) : !selectedMonth ? (
                  <p className="text-xs text-[#AAA] font-label">Pick a month above to see each student's tests.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[#888] font-label">
                          <th className="py-1.5 pr-3 font-semibold">Student</th>
                          <th className="py-1.5 px-2 font-semibold text-right">{monthShort(selectedMonth)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(t.students || []).map((s) => (
                          <tr key={s.studentId} className="border-t border-[#F6F6F5]">
                            <td className="py-2 pr-3 font-semibold text-[#111]">
                              {s.name}
                              <span className="text-[#CCC] font-normal"> ({s.phone || 'no phone'})</span>
                            </td>
                            <td className={`py-2 px-2 text-right font-semibold ${(s.monthlyCounts || {})[selectedMonth] >= 3 ? 'text-green-700' : 'text-[#111]'}`}>
                              {(s.monthlyCounts || {})[selectedMonth] || 0}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[10px] text-[#AAA] font-label mt-2">Showing {monthShort(selectedMonth)} only — change month above.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}