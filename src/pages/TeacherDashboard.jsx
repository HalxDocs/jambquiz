import { useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { CrownIcon } from '@hugeicons/core-free-icons'
import { signOut, auth } from '../firebase'
import { getTeacherDashboard, teacherUpdateDetails, teacherUpdatePhone, getPioneerDashboard } from '../store/useStore'
import { useToastStore } from '../store/toast'
import SEO from '../components/seo/SEO'

function stripPhoneForInput(p) {
  if (!p) return ''
  let v = String(p).replace(/\D/g, '')
  if (v.startsWith('234')) v = v.slice(3)
  if (v.startsWith('0')) v = v.replace(/^0+/, '')
  return v.slice(0, 10)
}

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
  const [qualifiedCounts, setQualifiedCounts] = useState({})
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [pioneerReferred, setPioneerReferred] = useState([])
  const [pioneerBonus, setPioneerBonus] = useState({})
  const [pioneerQualified, setPioneerQualified] = useState({})

  const [acct, setAcct] = useState(teacher?.accountNumber || '')
  const [bank, setBank] = useState(teacher?.bankName || '')
  const [saving, setSaving] = useState(false)
  const [editingBank, setEditingBank] = useState(!(teacher?.accountNumber && teacher?.bankName))
  const [phoneInput, setPhoneInput] = useState(stripPhoneForInput(teacher?.phone))
  const [editingPhone, setEditingPhone] = useState(false)
  const [savingPhone, setSavingPhone] = useState(false)

  const handleSavePhone = async () => {
    if (phoneInput.replace(/\D/g, '').length < 10) {
      useToastStore.getState().showToast('Enter a valid phone number', 'error')
      return
    }
    setSavingPhone(true)
    try {
      const res = await teacherUpdatePhone(phoneInput)
      if (res && res.ok) {
        setTeacher({ ...teacher, phone: res.phone })
        setPhoneInput(stripPhoneForInput(res.phone))
        setEditingPhone(false)
        useToastStore.getState().showToast(
          res.migrated ? `Phone updated. ${res.migrated} student${res.migrated === 1 ? '' : 's'} re-linked.` : 'Phone number updated',
          'success'
        )
      }
    } catch (e) {
      useToastStore.getState().showToast((e?.message) || 'Could not update phone number', 'error')
    }
    setSavingPhone(false)
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await getTeacherDashboard()
      if (res && res.ok) {
        setStudents(res.students || [])
        setMonthsEarnings(res.monthsEarnings || {})
        setQualifiedCounts(res.qualifiedCounts || {})
        if (res.pioneerEarnings) setPioneerBonus(res.pioneerEarnings)
        if (res.pioneerQualifiedCounts) setPioneerQualified(res.pioneerQualifiedCounts)
        // Update teacher object with fresh pioneer info (code etc)
        if (res.teacher) setTeacher((prev) => ({ ...prev, ...res.teacher }))
        const now = new Date()
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const all = new Set([thisMonth, ...Object.keys(res.monthsEarnings || {})])
        ;(res.students || []).forEach((s) => Object.keys(s.monthlyCounts || {}).forEach((m) => all.add(m)))
        if (res.pioneerEarnings) Object.keys(res.pioneerEarnings).forEach((m) => all.add(m))
        const ordered = [...all].sort()
        setMonths(ordered)
        setSelected((prev) => prev || thisMonth)
        // If pioneer, load referred teachers
        const isPio = res.teacher?.isPioneer || teacher?.isPioneer
        if (isPio) {
          try {
            const pr = await getPioneerDashboard()
            if (pr && pr.ok) setPioneerReferred(pr.referred || [])
          } catch {}
        }
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
        setTeacher({
          ...teacher,
          accountNumber: res.accountNumber,
          bankName: res.bankName,
          accountName: res.accountName,
          bankVerified: res.bankVerified,
        })
        setEditingBank(false)
        useToastStore.getState().showToast(
          res.accountName ? `Verified: ${res.accountName}` : 'Bank details saved and verified',
          'success'
        )
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
  const qualified = selected ? (qualifiedCounts[selected] || 0) : 0
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
          {/* Pioneer badge */}
          {teacher?.isPioneer && teacher?.pioneerCode && (
            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-2xl p-5 flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-400 rounded-xl flex items-center justify-center">
                <HugeiconsIcon icon={CrownIcon} size={20} color="#111" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-yellow-800 uppercase tracking-widest font-label">PIONEER</p>
                <p className="text-sm font-bold text-[#111] font-display">Code: {teacher.pioneerCode}</p>
              </div>
              <button
                onClick={() => { navigator.clipboard?.writeText(teacher.pioneerCode); useToastStore.getState().showToast(`Code ${teacher.pioneerCode} copied`, 'success') }}
                className="ml-auto text-xs font-bold bg-[#111] text-white rounded-lg px-3 py-2 hover:bg-[#222] font-label"
              >
                Copy
              </button>
            </div>
          )}

          {/* Phone number */}
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[15px] font-bold text-[#111] font-display">Phone number</h2>
              {!editingPhone && (
                <button onClick={() => { setPhoneInput(stripPhoneForInput(teacher?.phone)); setEditingPhone(true) }} className="text-xs font-semibold text-[#888] hover:text-[#111] transition-colors font-label">
                  Edit
                </button>
              )}
            </div>
            {editingPhone ? (
              <div className="space-y-3 mt-3">
                <div className="flex border border-[#E5E5E5] rounded-xl overflow-hidden focus-within:border-[#111] transition-colors bg-white">
                  <span className="px-3 py-2.5 text-sm font-semibold text-[#555] bg-[#F8F8F7] border-r border-[#E5E5E5] select-none font-label">+234</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={phoneInput}
                    onChange={(e) => {
                      let v = e.target.value.replace(/\D/g, '')
                      if (v.startsWith('234')) v = v.slice(3)
                      if (v.startsWith('0')) v = v.replace(/^0+/, '')
                      setPhoneInput(v.slice(0, 10))
                    }}
                    placeholder="803 000 0000"
                    className="flex-1 px-4 py-2.5 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none bg-white"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSavePhone}
                    disabled={savingPhone}
                    className="flex-1 bg-[#111] text-white rounded-xl py-2.5 text-xs font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display disabled:opacity-50"
                  >
                    {savingPhone ? 'Saving…' : 'Save phone number'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingPhone(false); setPhoneInput(stripPhoneForInput(teacher?.phone)) }}
                    disabled={savingPhone}
                    className="px-4 rounded-xl py-2.5 text-xs font-bold text-[#555] border border-[#E5E5E5] hover:text-[#111] hover:border-[#CCC] transition-all font-label disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-[11px] text-[#888] font-label">Your linked students stay linked — they move with the new number.</p>
              </div>
            ) : (
              <p className="text-sm text-[#111] font-semibold font-display mt-1">
                +{String(teacher?.phone || '').replace(/^\+/, '') || '—'}
              </p>
            )}
          </div>

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
                  {saving ? 'Checking bank account…' : 'Save & verify bank details'}
                </button>
                {saving && (
                  <p className="text-[11px] text-[#888] font-label text-center">
                    Verifying this account with the bank…
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-1 space-y-1">
                <p className="text-xs text-[#555] font-body">
                  {bank} — Acct ****{String(acct).slice(-4)}
                </p>
                {teacher?.accountName && (
                  <p className="text-[11px] font-semibold text-green-700 font-label">
                    Verified account: {teacher.accountName}
                  </p>
                )}
              </div>
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
              N500 per student who completes at least 3 tests in a month · max 30 students counted · Minimum payout N5,000
            </p>
            {selected && (
              <p className="text-[10px] text-white/40 font-label mt-1">
                {qualified}/30 students met the target this month
              </p>
            )}
            {teacher?.isPioneer && selected && pioneerBonus[selected] > 0 && (
              <p className="text-[10px] text-yellow-300 font-label mt-1.5 flex items-center gap-1">
                <HugeiconsIcon icon={CrownIcon} size={12} color="#FDE047" /> Pioneer bonus {naira(pioneerBonus[selected])} ({pioneerQualified[selected] || 0}/20) — Oct-Dec only
              </p>
            )}
          </div>

          {/* Teachers WhatsApp community */}
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
            <p className="text-[11px] font-bold text-[#888] uppercase tracking-widest mb-1 font-label">Community</p>
            <p className="text-sm font-semibold text-[#111] font-display">Discuss with other teachers &amp; admin</p>
            <p className="text-xs text-[#666] font-body mt-1">Join our WhatsApp page to share tips, get updates and ask questions.</p>
            <a
              href="https://chat.whatsapp.com/BK82GJQaQnt0hLf3MC5Am4?s=cl&p=a&ilr=4"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center justify-center w-full bg-[#25D366] text-white rounded-xl py-2.5 text-sm font-bold hover:bg-[#1FB955] active:scale-[0.99] transition-all font-display"
            >
              JOIN WhatsApp
            </a>
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
                        {s.count >= 3 ? `+N500` : `${s.count}/3 tests`}
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

          {/* Teachers under you (Pioneer only) */}
          {teacher?.isPioneer && (
            <div>
              <h2 className="text-[15px] font-bold text-[#111] font-display mb-3">
                Teachers under you <span className="text-[#AAA] text-sm font-label font-normal">({pioneerReferred.length})</span>
              </h2>
              {pioneerReferred.length === 0 ? (
                <div className="bg-white border border-[#EBEBEB] rounded-2xl p-6 text-center">
                  <p className="text-xs text-[#888] font-label">No teachers yet — share your code {teacher?.pioneerCode} on signup.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pioneerReferred.map((rt) => (
                    <div key={rt.teacherId} className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
                      <p className="text-sm font-bold text-[#111] font-display truncate">{rt.name}</p>
                      <p className="text-[11px] text-[#888] font-label">{rt.email} · +{rt.phone}</p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] font-label">
                        <span className="bg-[#F3F3F2] rounded-lg px-2 py-1">{rt.totalStudents} students</span>
                        <span className="bg-[#F3F3F2] rounded-lg px-2 py-1">{rt.totalTests} tests</span>
                      </div>
                      {rt.students?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[#F1F1F0] space-y-1">
                          {rt.students.slice(0, 5).map((s) => (
                            <div key={s.studentId} className="flex justify-between text-xs">
                              <span className="text-[#333] font-body">{s.name}</span>
                              <span className="text-[#888] font-label">{s.totalTests} tests</span>
                            </div>
                          ))}
                          {rt.students.length > 5 && <p className="text-[10px] text-[#AAA] font-label">+{rt.students.length - 5} more</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* History — one month at a time (follows the ‹ › selector above) */}
          {months.length > 0 && students.length > 0 && selected && (
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
              <h2 className="text-[15px] font-bold text-[#111] font-display mb-3">History · {monthLabel(selected)}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[#888] font-label">
                      <th className="py-1.5 pr-3 font-semibold">Student</th>
                      <th className="py-1.5 px-2 font-semibold text-right">{monthShort(selected)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.studentId} className="border-t border-[#F6F6F5]">
                        <td className="py-2 pr-3 font-semibold text-[#111]">
                          {s.name}
                          <span className="text-[#CCC] font-normal"> ({s.phone || 'no phone'})</span>
                        </td>
                        <td className={`py-2 px-2 text-right font-semibold ${(s.monthlyCounts || {})[selected] >= 3 ? 'text-green-700' : 'text-[#111]'}`}>
                          {(s.monthlyCounts || {})[selected] || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-[#AAA] font-label mt-3">
                Tests in {monthShort(selected)} only — use ‹ › above to change month. Green means the student qualified you for N500.
              </p>
            </div>
          )}

                    {/* Teacher program */}
          <div className="space-y-3">
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
              <p className="text-[10px] font-bold text-[#888] uppercase tracking-widest mb-2 font-label">Your Role</p>
              <p className="text-sm text-[#555] font-body leading-relaxed">
                Encourage your students take at least 3 tests monthly. <span className="italic">A simple WhatsApp Group makes it easy</span>
              </p>
              <p className="text-sm text-[#555] font-body leading-relaxed mt-2">
                You'd receive weekly updates on your students performance.
              </p>
            </div>
            <div className="bg-[#111] text-white rounded-2xl p-5">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 font-label">Your Reward</p>
              <p className="text-sm text-white/85 font-body leading-relaxed">
                You earn N500 every time a student completes 3 tests a month.
              </p>
              <p className="text-sm text-white font-body leading-relaxed mt-2 italic font-semibold">
                Minimum payout is N5,000.
              </p>
            </div>
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
              <p className="text-[10px] font-bold text-[#888] uppercase tracking-widest mb-2 font-label">Your Student's Reward</p>
              <p className="text-sm text-[#555] font-body leading-relaxed">
                They identify strengths &amp; weaknesses in each topic if they consistently take tests. They are well prepared for JAMB as 274Lab highlights weak topics they should focus on starting February till exam day.
              </p>
            </div>
          </div>

          <p className="text-[11px] text-[#AAA] font-label leading-relaxed text-center pb-4">
            Monthly counts update as your students take quizzes. Powered by 274Lab.
          </p>
        </div>
      </div>
    </>
  )
}