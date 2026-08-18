import { useEffect, useMemo, useState } from 'react'
import { signOut, auth } from '../firebase'
import { getTeacherDashboard, teacherUpdateDetails } from '../store/useStore'
import { useToastStore } from '../store/toast'
import SEO from '../components/seo/SEO'

function monthLabel(m) {
  try {
    return new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }).toUpperCase()
  } catch {
    return m || ''
  }
}

function monthShort(m) {
  try {
    return new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short' })
  } catch {
    return m || ''
  }
}

export default function TeacherDashboard({ teacher, setTeacher, setView }) {
  const [students, setStudents] = useState([])
  const [monthsEarnings, setMonthsEarnings] = useState({})
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  const [acct, setAcct] = useState(teacher?.accountNumber || '')
  const [bank, setBank] = useState(teacher?.bankName || '')
  const [saving, setSaving] = useState(false)
  const [editingBank, setEditingBank] = useState(!(teacher?.accountNumber && teacher?.bankName))

  const load = async () => {
    setLoading(true)
    try {
      const res = await getTeacherDashboard()
      if (res && res.ok) {
        setStudents(res.students || [])
        setMonthsEarnings(res.monthsEarnings || {})
        const all = new Set(Object.keys(res.monthsEarnings || {}))
        ;(res.students || []).forEach((s) => Object.keys(s.monthlyCounts || {}).forEach((m) => all.add(m)))
        const ordered = [...all].sort()
        setMonths(ordered)
        setSelected((prev) => prev || ordered[ordered.length - 1])
      }
    } catch (e) {
      console.error('[TeacherDashboard] load error:', e?.message || e)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSaveBank = async () => {
    if (acct.replace(/\D/g, '').length < 10) {
      useToastStore.getState().showToast('Enter a valid account number', 'error')
      return
    }
    if (bank.trim().length < 2) {
      useToastStore.getState().showToast('Enter your bank name', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await teacherUpdateDetails({ accountNumber: acct.replace(/\D/g, ''), bankName: bank.trim() })
      if (res && res.ok) {
        setTeacher({ ...teacher, accountNumber: res.accountNumber, bankName: res.bankName })
        setEditingBank(false)
        useToastStore.getState().showToast('Bank details saved')
      }
    } catch (e) {
      useToastStore.getState().showToast((e?.message) || 'Could not save bank details', 'error')
    }
    setSaving(false)
  }

  const handleSignOut = async () => {
    await signOut(auth)
    setTeacher(null)
    setView('landing')
  }

  const goMonth = (dir) => {
    const idx = months.indexOf(selected)
    const next = months[idx + dir]
    if (next) setSelected(next)
  }

  const earnings = selected ? (monthsEarnings[selected] || 0) : 0
  const naira = (n) => `N${Number(n || 0).toLocaleString('en-NG')}`

  const selectedScores = useMemo(() => {
    const rows = []
    students.forEach((s) => {
      const count = (s.monthlyCounts || {})[selected] || 0
      const inMonth = (s.recentScores || []).filter((sc) => (sc.date || '').startsWith(selected || '____'))
      rows.push({ ...s, count, scores: inMonth })
    })
    return rows
  }, [students, selected])

  return (
    <>
      <SEO title="Teacher Panel" />
      <div className="min-h-screen bg-[#F8F8F7]">
        {/* Header */}
        <div className="bg-white border-b border-[#EBEBEB]">
          <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-[#111] rounded-xl flex items-center justify-center">
                <span className="text-[10px] font-bold text-white font-display leading-none">274</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#111] font-display leading-none">Teacher Panel</p>
                <p className="text-[10px] text-[#888] font-label mt-0.5 truncate max-w-[180px]">{teacher?.name}</p>
              </div>
            </div>
            <button onClick={handleSignOut} className="text-xs font-semibold text-[#888] hover:text-[#111] transition-colors font-label">
              Sign out
            </button>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-5 py-6 space-y-6">
          {/* Bank details */}
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[15px] font-bold text-[#111] font-display">Bank details</h2>
              {!editingBank && (
                <button onClick={() => setEditingBank(true)} className="text-xs font-semibold text-[#888] hover:text-[#111] transition-colors font-label">
                  Edit
                </button>
              )}
            </div>
            {editingBank ? (
              <div className="space-y-3 mt-3">
                <div>
                  <label className="text-[10px] font-semibold text-[#666] uppercase tracking-wide block mb-1 font-label">Account Number</label>
                  <input
                    value={acct}
                    onChange={(e) => setAcct(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    inputMode="numeric"
                    placeholder="0123456789"
                    className="w-full border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#666] uppercase tracking-wide block mb-1 font-label">Bank Name</label>
                  <input
                    value={bank}
                    onChange={(e) => setBank(e.target.value)}
                    maxLength={60}
                    placeholder="e.g. GTBank"
                    className="w-full border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] transition-colors bg-white"
                  />
                </div>
                <button
                  onClick={handleSaveBank}
                  disabled={saving}
                  className="w-full bg-[#111] text-white rounded-xl py-2.5 text-xs font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save bank details'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#555] font-body mt-1">
                {bank} — Acct ****{String(acct).slice(-4)}
              </p>
            )}
          </div>

          {/* Earnings banner */}
          <div className="bg-[#111] text-white rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => goMonth(-1)} disabled={!months.length || selected === months[0]}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-30 text-sm font-bold">
                ‹
              </button>
              <p className="text-sm font-bold font-display tracking-wide">
                {selected ? monthLabel(selected) : '—'}
              </p>
              <button onClick={() => goMonth(1)} disabled={!months.length || selected === months[months.length - 1]}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-30 text-sm font-bold">
                ›
              </button>
            </div>
            <p className="text-[11px] text-white/50 font-label">Earnings this month</p>
            <p className="text-3xl font-bold font-display mt-1">{naira(earnings)}</p>
            <p className="text-[10px] text-white/40 font-label mt-2">
              N300 per student who completes at least 3 tests in a month
            </p>
          </div>

          {/* Students */}
          <div>
            <h2 className="text-[15px] font-bold text-[#111] font-display mb-3">
              Your students <span className="text-[#AAA] text-sm font-label font-normal">({students.length})</span>
            </h2>
            {loading ? (
              <div className="bg-white border border-[#EBEBEB] rounded-2xl p-6 text-center">
                <p className="text-xs text-[#888] font-label">Loading…</p>
              </div>
            ) : students.length === 0 ? (
              <div className="bg-white border border-[#EBEBEB] rounded-2xl p-6 text-center space-y-1">
                <p className="text-2xl">👩‍🏫</p>
                <p className="text-sm font-semibold text-[#111] font-display">No students yet</p>
                <p className="text-xs text-[#888] font-label">
                  Students add your phone number in their Supporters step to make you their accountability partner.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedScores.map((s) => (
                  <div key={s.studentId} className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#111] font-display truncate">
                          {s.count} test{s.count === 1 ? '' : 's'} — {s.name}
                        </p>
                        <p className="text-[11px] text-[#888] font-label mt-0.5">{s.phone || 'No phone saved'}</p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg font-label ${
                        s.count >= 3 ? 'bg-green-50 text-green-700' : 'bg-[#F3F3F2] text-[#888]'
                      }`}>
                        {s.count >= 3 ? `+N300` : `${s.count}/3 tests`}
                      </span>
                    </div>
                    {s.scores.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[#F1F1F0]">
                        <p className="text-[10px] font-bold text-[#666] uppercase tracking-wide mb-2 font-label">Scores this month</p>
                        <div className="flex flex-wrap gap-2">
                          {s.scores.map((sc, i) => (
                            <span key={i} className="text-[10px] font-bold text-[#111] bg-[#F3F3F2] rounded-lg px-2 py-1 font-label">
                              {sc.subject}: {sc.score}%
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* History */}
          {months.length > 0 && students.length > 0 && (
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
              <h2 className="text-[15px] font-bold text-[#111] font-display mb-3">History</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[#888] font-label">
                      <th className="py-1.5 pr-3 font-semibold">Student</th>
                      {months.map((m) => (
                        <th key={m} className="py-1.5 px-2 font-semibold text-right">{monthShort(m)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.studentId} className="border-t border-[#F6F6F5]">
                        <td className="py-2 pr-3 font-semibold text-[#111]">
                          {s.name}
                          <span className="text-[#CCC] font-normal"> ({s.phone || 'no phone'})</span>
                        </td>
                        {months.map((m) => (
                          <td key={m} className={`py-2 px-2 text-right font-semibold ${(s.monthlyCounts || {})[m] >= 3 ? 'text-green-700' : 'text-[#111]'}`}>
                            {(s.monthlyCounts || {})[m] || 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-[#AAA] font-label mt-3">
                Cells show tests per month; green means the student qualified you for N300 that month.
              </p>
            </div>
          )}

          <p className="text-[11px] text-[#AAA] font-label leading-relaxed text-center pb-4">
            Monthly counts update as your students take quizzes. Powered by 274Lab.
          </p>
        </div>
      </div>
    </>
  )
}