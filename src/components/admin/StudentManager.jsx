import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PencilEdit01Icon, Delete01Icon, Cancel01Icon, Tick01Icon, ArrowRight01Icon, ArrowLeft01Icon, UserAdd01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { getAccessStatus, updateStudent, deleteStudent, registerStudent } from '../../store/useStore'
import { useToastStore } from '../../store/toast'

const ACCESS_OPTIONS = [
  { label: 'This Month', months: null, desc: 'Until end of this month' },
  { label: 'Next Month', months: null, desc: 'Until end of next month' },
  { label: '1 Month', months: 1, desc: '+30 days' },
  { label: '3 Months', months: 3, desc: '+90 days' },
  { label: '6 Months', months: 6, desc: '+180 days' },
]

function endOfMonth(date) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1)
  d.setDate(0)
  d.setHours(23, 59, 59, 999)
  return d
}

export default function StudentManager({ students, loading, yearFilter, onYearFilterChange, page, onPrevPage, onNextPage, hasMore, scoreCache, onLoadScores, total, onCountChange }) {
  const [editingStudentId, setEditingStudentId] = useState(null)
  const [editNameValue, setEditNameValue] = useState('')
  const [editNameErr, setEditNameErr] = useState('')
  const [editNameLoading, setEditNameLoading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [success, setSuccess] = useState('')
  const [grantOpenFor, setGrantOpenFor] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', nickname: '', password: '', year: String(new Date().getFullYear()), email: '', parentPhone: '', teacherPhone: '' })
  const [addErr, setAddErr] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const currentYear = new Date().getFullYear()
  const jamb_years = ['SS3', ...Array.from({ length: 10 }, (_, i) => String(currentYear + i))]
  const filterYears = ['all', ...jamb_years]

  const handleAddStudent = async () => {
    const trimmed = addForm.name.trim()
    if (trimmed.length < 3) { setAddErr('Name must be at least 3 characters'); return }
    if (addForm.password.length < 4) { setAddErr('Password must be at least 4 characters'); return }
    setAddLoading(true); setAddErr('')
    try {
      const saved = await registerStudent({
        name: trimmed,
        nickname: addForm.nickname.trim(),
        password: addForm.password,
        year: addForm.year,
        email: addForm.email.trim().toLowerCase(),
        parentPhone: addForm.parentPhone.trim(),
        teacherPhone: addForm.teacherPhone.trim(),
        subjects: [],
      })
      if (!saved) { setAddErr('A student with this name already exists'); setAddLoading(false); return }
      setAddForm({ name: '', nickname: '', password: '', year: String(new Date().getFullYear()), email: '', parentPhone: '', teacherPhone: '' })
      setShowAddForm(false)
      onCountChange && onCountChange()
    } catch { setAddErr('Failed to add student. Check your connection.') }
    setAddLoading(false)
  }

  const handleDeleteStudent = async (studentId, studentName) => {
    if (!window.confirm(`Delete "${studentName}"? This cannot be undone.`)) return
    try { await deleteStudent(studentId); useToastStore.getState().showToast(`Deleted "${studentName}"`, 'success'); onCountChange && onCountChange() } catch (e) { useToastStore.getState().showToast(e?.message || 'Failed to delete student. They may have existing quiz data.') }
  }

  const startEditName = (student) => {
    setEditingStudentId(student.id)
    setEditNameValue(student.name)
    setEditNameErr('')
  }

  const handleSaveName = async (studentId) => {
    const trimmed = editNameValue.trim()
    if (trimmed.length < 3) { setEditNameErr('Name must be at least 3 characters'); return }
    setEditNameLoading(true)
    try { await updateStudent(studentId, { name: trimmed }); setEditingStudentId(null); setEditNameErr('') }
    catch { setEditNameErr('Failed to save.') }
    setEditNameLoading(false)
  }

  const handleGrantAccess = async (student, option) => {
    let expiry
    const now = new Date()
    if (option.months) {
      const current = student.subscriptionUntil ? new Date(student.subscriptionUntil).getTime() : 0
      const anchor = Math.max(now.getTime(), current)
      const next = new Date(anchor)
      next.setMonth(next.getMonth() + option.months)
      expiry = next.toISOString()
    } else if (option.label === 'This Month') {
      const anchor = student.subscriptionUntil && new Date(student.subscriptionUntil) > now
        ? new Date(student.subscriptionUntil) : now
      expiry = endOfMonth(anchor).toISOString()
    } else {
      const anchor = student.subscriptionUntil && new Date(student.subscriptionUntil) > now
        ? new Date(student.subscriptionUntil) : now
      const nextMonth = new Date(anchor)
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      expiry = endOfMonth(nextMonth).toISOString()
    }
    try {
      await updateStudent(student.id, { subscriptionUntil: expiry })
      useToastStore.getState().showToast(`${student.name} granted access until ${new Date(expiry).toLocaleDateString('en-NG')}`, 'success')
    } catch (e) { useToastStore.getState().showToast(e?.message || 'Failed to grant access. Check connection and try again.') }
    setGrantOpenFor(null)
  }

  const sendWhatsAppReport = (student, recipient, myScores) => {
    const phone = recipient === 'parent' ? student.parentPhone : student.teacherPhone
    if (!phone) return
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    const best = {}
    myScores.forEach((sc) => {
      if (!best[sc.subject] || sc.score > best[sc.subject].score) best[sc.subject] = sc
    })
    const bestList = Object.values(best)
    const total = bestList.reduce((a, sc) => a + sc.score, 0)
    const totalOut = bestList.reduce((a, sc) => a + (sc.outOf || 100), 0)
    const overallPct = totalOut ? Math.round((total / totalOut) * 100) : 0
    const subjectLines = bestList.length
      ? bestList.map((sc) => {
          const pct = Math.round((sc.score / (sc.outOf || 100)) * 100)
          const tag = pct >= 70 ? '🟢' : pct >= 50 ? '🟡' : '🔴'
          return `${tag} ${sc.subject}: ${sc.score}/${sc.outOf || 100} (${pct}%)`
        }).join('\n')
      : 'No tests taken yet.'
    const greeting = recipient === 'parent'
      ? `Hello, this is a weekly performance update for *${student.name}* from 274Lab.`
      : `Hello, weekly performance update for your student *${student.name}* from 274Lab.`
    const message = `${greeting}\n\n📊 *JAMB Total:* ${total}/${totalOut || 400} (${overallPct}%)\n📝 *Tests taken:* ${myScores.length}\n\n*Best score per subject:*\n${subjectLines}\n\n— 274Lab · Supported by A.M.C`
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener')
  }

  const toggleExpand = (studentId) => {
    if (expandedId === studentId) { setExpandedId(null); return }
    setExpandedId(studentId)
    onLoadScores(studentId)
  }

  const scores = expandedId ? (scoreCache[expandedId] || []) : []

  const getAvg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b.score, 0) / arr.length) : 0
  const getTotal = (arr) => {
    if (!arr.length) return null
    const best = {}
    arr.forEach((sc) => { if (!best[sc.subject] || sc.score > best[sc.subject].score) best[sc.subject] = sc })
    const top = Object.values(best).slice(0, 4)
    return top.length >= 4 ? top.reduce((a, sc) => a + sc.score, 0) : null
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[#111] text-white flex items-center justify-center shrink-0">
            <HugeiconsIcon icon={UserGroupIcon} size={18} color="currentColor" />
          </div>
          <div>
            <p className="text-[10px] text-[#888] font-label uppercase tracking-wide leading-none mb-0.5">Total Students</p>
            <p className="text-xl font-bold font-display text-[#111] leading-none">{total === null ? '—' : total.toLocaleString()}</p>
          </div>
        </div>
        <span className="ml-auto text-[10px] text-[#AAA] font-label">
          {yearFilter === 'all' ? 'All years' : yearFilter}
        </span>
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {filterYears.map((y) => (
          <button key={y} onClick={() => onYearFilterChange(y)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors font-label ${
              yearFilter === y ? 'bg-[#111] text-white' : 'bg-white border border-[#E5E5E5] text-[#555]'
            }`}
          >
            {y === 'all' ? 'All Years' : y}
          </button>
        ))}
      </div>

      <button onClick={() => { setShowAddForm(!showAddForm); setAddErr('') }}
        className={`mb-4 w-full h-10 flex items-center justify-center gap-1.5 rounded-xl text-xs font-bold font-label transition-colors ${
          showAddForm ? 'bg-[#F3F3F2] text-[#555]' : 'bg-[#111] text-white hover:bg-[#222]'
        }`}>
        <HugeiconsIcon icon={UserAdd01Icon} size={16} color="currentColor" />
        {showAddForm ? 'Cancel' : 'Add Student'}
      </button>

      {showAddForm && (
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-4 space-y-3">
          <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label">New Student</p>
          <input value={addForm.name} onChange={(e) => setAddForm({...addForm, name: e.target.value})}
            placeholder="Full Name" className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111]" />
          <input value={addForm.nickname} onChange={(e) => setAddForm({...addForm, nickname: e.target.value})}
            placeholder="Nickname (optional)" className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111]" />
          <input type="password" value={addForm.password} onChange={(e) => setAddForm({...addForm, password: e.target.value})}
            placeholder="Password (min 4 chars)" className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111]" />
          <select value={addForm.year} onChange={(e) => setAddForm({...addForm, year: e.target.value})}
            className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white">
            {['SS3', ...Array.from({ length: 10 }, (_, i) => String(currentYear + i))].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <input value={addForm.email} onChange={(e) => setAddForm({...addForm, email: e.target.value})}
            placeholder="Email (optional)" type="email" className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111]" />
          <input value={addForm.parentPhone} onChange={(e) => setAddForm({...addForm, parentPhone: e.target.value})}
            placeholder="Parent / Guardian / Sibling Phone (optional)" className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111]" />
          <input value={addForm.teacherPhone} onChange={(e) => setAddForm({...addForm, teacherPhone: e.target.value})}
            placeholder="Teacher / Tutor / Friend Phone (optional)" className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111]" />
          {addErr && <p className="text-red-500 text-xs font-label">{addErr}</p>}
          <button onClick={handleAddStudent} disabled={addLoading}
            className="w-full bg-[#111] text-white rounded-xl py-2.5 text-xs font-bold hover:bg-[#222] transition-all font-display disabled:opacity-40">
            {addLoading ? 'Adding…' : 'Add Student →'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
          <div className="w-6 h-6 border-2 border-[#111] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-[#CCC] text-sm font-label">Loading…</p>
        </div>
      ) : students.length === 0 ? (
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
          <p className="text-[#CCC] text-sm font-label">No students found</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {students.map((student) => {
            const isExpanded = expandedId === student.id
            return (
              <div key={student.id} className="bg-white border border-[#EBEBEB] rounded-xl p-4">
                {editingStudentId === student.id ? (
                  <div className="mb-3">
                    <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label mb-1.5">Edit Name</p>
                    <div className="flex gap-2 items-center">
                      <input value={editNameValue} onChange={(e) => { setEditNameValue(e.target.value); setEditNameErr('') }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveName(student.id)}
                        className="flex-1 min-w-0 border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] focus:outline-none focus:border-[#111]" autoFocus />
                      <button onClick={() => handleSaveName(student.id)} disabled={editNameLoading}
                        title="Save" className="shrink-0 w-9 h-9 flex items-center justify-center bg-[#111] text-white rounded-xl hover:bg-[#222] transition-colors disabled:opacity-50">
                        {editNameLoading ? <span className="text-xs font-bold font-label">…</span> : <HugeiconsIcon icon={Tick01Icon} size={16} color="currentColor" />}
                      </button>
                      <button onClick={() => { setEditingStudentId(null); setEditNameErr('') }}
                        className="shrink-0 w-9 h-9 flex items-center justify-center border border-[#E5E5E5] text-[#888] rounded-xl hover:bg-[#F8F8F7] transition-colors">
                        <HugeiconsIcon icon={Cancel01Icon} size={16} color="currentColor" />
                      </button>
                    </div>
                    {editNameErr && <p className="text-red-500 text-xs mt-1.5 font-label">{editNameErr}</p>}
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-1.5">
                      <button onClick={() => toggleExpand(student.id)} className="text-left flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#111] font-body truncate">{student.name}</p>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      {student.year && (
                        <span className="text-[10px] font-bold text-white bg-[#111] px-2 py-0.5 rounded-full font-label">{student.year}</span>
                      )}
                      {(() => {
                        const access = getAccessStatus(student)
                        const cls = access.status === 'active' ? 'bg-green-50 text-green-700 border-green-100'
                          : access.status === 'freebie' ? 'bg-yellow-50 text-yellow-700 border-yellow-100'
                          : 'bg-red-50 text-red-700 border-red-100'
                        const label = access.status === 'active' ? `Paid · ${access.daysLeft}d`
                          : access.status === 'freebie' ? `${access.freeAttemptsLeft} free left` : 'Expired'
                        return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-label ${cls}`}>{label}</span>
                      })()}
                    </div>

                    <p className="text-[10px] text-[#AAA] font-label mb-2">
                      Joined {new Date(student.joinedAt).toLocaleDateString('en-NG')}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="relative">
                        <button onClick={() => setGrantOpenFor(grantOpenFor === student.id ? null : student.id)}
                          className="h-8 px-2.5 flex items-center gap-1 rounded-xl border border-green-100 text-green-700 bg-green-50 hover:bg-green-100 transition-colors text-[11px] font-bold font-label">
                          🎓 Grant Access ▾
                        </button>
                        {grantOpenFor === student.id && (
                          <div className="absolute bottom-full left-0 mb-1 z-10 bg-white border border-[#E5E5E5] rounded-xl shadow-lg py-1 min-w-[160px]">
                            {ACCESS_OPTIONS.map((opt) => (
                              <button key={opt.label} onClick={() => handleGrantAccess(student, opt)}
                                className="w-full text-left px-3.5 py-2 hover:bg-[#F8F8F7] transition-colors text-xs font-label text-[#333]">
                                <span className="font-semibold text-[#111]">{opt.label}</span>
                                <span className="block text-[10px] text-[#999]">{opt.desc}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => startEditName(student)} title="Rename"
                        className="w-8 h-8 flex items-center justify-center rounded-xl border border-[#E5E5E5] text-[#888] hover:text-[#111] transition-colors">
                        <HugeiconsIcon icon={PencilEdit01Icon} size={15} color="currentColor" />
                      </button>
                      <button onClick={() => handleDeleteStudent(student.id, student.name)} title="Delete"
                        className="w-8 h-8 flex items-center justify-center rounded-xl border border-red-100 text-red-400 hover:bg-red-50 transition-colors">
                        <HugeiconsIcon icon={Delete01Icon} size={15} color="currentColor" />
                      </button>
                      <button onClick={() => toggleExpand(student.id)}
                        className="h-8 px-2.5 flex items-center gap-1 rounded-xl border border-[#E5E5E5] text-[#555] hover:text-[#111] transition-colors text-[11px] font-bold font-label ml-auto">
                        {isExpanded ? '▲ Hide' : '▼ View Scores'}
                      </button>
                    </div>
                  </div>
                )}

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-[#F3F3F2]">
                    {!scoreCache[student.id] ? (
                      <div className="flex items-center gap-2 py-2">
                        <div className="w-4 h-4 border-2 border-[#111] border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-[#AAA] font-label">Loading scores…</span>
                      </div>
                    ) : scores.length === 0 ? (
                      <p className="text-xs text-[#AAA] font-label py-2">No scores yet</p>
                    ) : (
                      <>
                        <div className="flex gap-3 mb-3">
                          <div className="text-center">
                            <p className="text-base font-bold font-display text-[#111]">{getAvg(scores)}</p>
                            <p className="text-[10px] text-[#AAA] font-label">Avg</p>
                          </div>
                          <div className="text-center">
                            <p className="text-base font-bold font-display text-[#111]">{getTotal(scores) ?? '—'}</p>
                            <p className="text-[10px] text-[#AAA] font-label">Total</p>
                          </div>
                          <div className="text-center">
                            <p className="text-base font-bold font-display text-[#111]">{scores.length}</p>
                            <p className="text-[10px] text-[#AAA] font-label">Attempts</p>
                          </div>
                        </div>

                        {student.subjects?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {student.subjects.map((s) => (
                              <span key={s} className="text-[10px] font-semibold bg-[#F3F3F2] text-[#555] px-2 py-0.5 rounded-lg font-label">{s}</span>
                            ))}
                          </div>
                        )}

                        {(student.parentPhone || student.teacherPhone) && (
                          <div className="border-t border-[#F3F3F2] pt-3 mb-3">
                            <p className="text-[10px] text-[#AAA] font-label mb-1.5">Send weekly report via WhatsApp</p>
                            <div className="flex flex-wrap gap-1.5">
                              {student.parentPhone && (
                                <button onClick={() => sendWhatsAppReport(student, 'parent', scores)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold bg-green-50 text-green-700 border border-green-100 px-2.5 py-1 rounded-lg font-label hover:bg-green-100 transition-colors">
                                  💬 Parent
                                </button>
                              )}
                              {student.teacherPhone && (
                                <button onClick={() => sendWhatsAppReport(student, 'teacher', scores)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-lg font-label hover:bg-blue-100 transition-colors">
                                  💬 Teacher
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="border-t border-[#F3F3F2] pt-3">
                          <p className="text-[10px] text-[#AAA] font-label mb-2">Score history</p>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {[...scores].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20).map((sc, i) => (
                              <div key={i} className="flex justify-between items-center gap-2 py-1">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-[#555] font-body truncate">{sc.subject} · {sc.week}</p>
                                  <p className="text-[10px] text-[#CCC] font-label">{new Date(sc.date).toLocaleDateString('en-NG')}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className={`text-xs font-bold font-display ${sc.score / (sc.outOf || 100) >= 0.7 ? 'text-green-600' : sc.score / (sc.outOf || 100) >= 0.5 ? 'text-yellow-600' : 'text-red-500'}`}>
                                    {sc.score}/{sc.outOf || 100}
                                  </span>
                                  <p className="text-[10px] text-[#CCC] font-label">{sc.correct}✓ {sc.wrong || 0}✗ {sc.unanswered || 0}–</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
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

      {success && (
        <div className="mt-3 px-3.5 py-2 bg-green-50 border border-green-100 rounded-xl">
          <p className="text-green-600 text-xs font-label">{success}</p>
        </div>
      )}
    </div>
  )
}