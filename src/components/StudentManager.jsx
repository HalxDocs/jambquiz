import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PencilEdit01Icon, Delete01Icon, Cancel01Icon, Tick01Icon } from '@hugeicons/core-free-icons'
import { getAccessStatus, updateStudent, deleteStudent, extendSubscription, addPayment, SUBSCRIPTION_PRICE_NGN } from '../store/useStore'

export default function StudentManager({ students, scores }) {
  const [yearFilter, setYearFilter] = useState('all')
  const [editingStudentId, setEditingStudentId] = useState(null)
  const [editNameValue, setEditNameValue] = useState('')
  const [editNameErr, setEditNameErr] = useState('')
  const [editNameLoading, setEditNameLoading] = useState(false)
  const [success, setSuccess] = useState('')

  const currentYear = new Date().getFullYear()
  const jamb_years = ['SS3', ...Array.from({ length: 10 }, (_, i) => String(currentYear + i))]
  const filterYears = ['all', ...jamb_years]

  const filteredStudents = yearFilter === 'all' ? students : students.filter((s) => s.year === yearFilter)

  const getScoresFor = (studentId) => scores.filter((s) => s.studentId === studentId)

  const getAverage = (studentId) => {
    const s = getScoresFor(studentId)
    return s.length ? Math.round(s.reduce((a, b) => a + b.score, 0) / s.length) : 0
  }

  const getTotalScore = (studentId) => {
    const s = getScoresFor(studentId)
    if (!s.length) return null
    const best = {}
    s.forEach((sc) => {
      if (!best[sc.subject] || sc.score > best[sc.subject].score) best[sc.subject] = sc
    })
    const subjects = Object.values(best)
    if (subjects.length < 4) return null
    return subjects.slice(0, 4).reduce((a, sc) => a + sc.score, 0)
  }

  const handleDeleteStudent = async (studentId, studentName) => {
    if (!window.confirm(`Delete "${studentName}"? This cannot be undone.`)) return
    try {
      await deleteStudent(studentId)
    } catch {
      alert('Failed to delete student.')
    }
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
    try {
      await updateStudent(studentId, { name: trimmed })
      setEditingStudentId(null)
      setEditNameErr('')
    } catch {
      setEditNameErr('Failed to save. Try again.')
    }
    setEditNameLoading(false)
  }

  const handleMarkPaid = async (student) => {
    if (!window.confirm(`Mark ${student.name} as paid for ₦${SUBSCRIPTION_PRICE_NGN}? This extends access by 1 month.`)) return
    try {
      const newExpiry = await extendSubscription(student.id, 1)
      await addPayment({
        studentId: student.id,
        studentName: student.name,
        amount: SUBSCRIPTION_PRICE_NGN,
        currency: 'NGN',
        method: 'manual',
        reference: `MANUAL-${Date.now()}`,
        paidAt: new Date().toISOString(),
        extendsTo: newExpiry,
        recordedBy: 'admin',
      })
      setSuccess(`${student.name} extended by 1 month`)
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      alert('Failed to record payment.')
    }
  }

  const sendWhatsAppReport = (student, recipient) => {
    const phone = recipient === 'parent' ? student.parentPhone : student.teacherPhone
    if (!phone) return
    const cleanPhone = phone.replace(/[^0-9]/g, '')

    const myScores = getScoresFor(student.id)
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

    const message = `${greeting}

📊 *JAMB Total:* ${total}/${totalOut || 400} (${overallPct}%)
📝 *Tests taken:* ${myScores.length}

*Best score per subject:*
${subjectLines}

— 274Lab · Supported by Adeola Memorial College`

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank', 'noopener')
  }

  return (
    <div>
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {filterYears.map((y) => (
          <button
            key={y}
            onClick={() => setYearFilter(y)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors font-label ${
              yearFilter === y ? 'bg-[#111] text-white' : 'bg-white border border-[#E5E5E5] text-[#555]'
            }`}
          >
            {y === 'all' ? `All (${students.length})` : `${y} (${students.filter(s => s.year === y).length})`}
          </button>
        ))}
      </div>

      {filteredStudents.length === 0 ? (
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
          <p className="text-[#CCC] text-sm font-label">No students found</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredStudents.map((student) => {
            const avg = getAverage(student.id)
            const total = getTotalScore(student.id)
            const attempts = getScoresFor(student.id).length
            return (
              <div key={student.id} className="bg-white border border-[#EBEBEB] rounded-xl p-4">
                {editingStudentId === student.id ? (
                  <div className="mb-3">
                    <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label mb-1.5">Edit Name</p>
                    <div className="flex gap-2 items-center">
                      <input
                        value={editNameValue}
                        onChange={(e) => { setEditNameValue(e.target.value); setEditNameErr('') }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveName(student.id)}
                        className="flex-1 min-w-0 border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] focus:outline-none focus:border-[#111]"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveName(student.id)}
                        disabled={editNameLoading}
                        title="Save"
                        className="shrink-0 w-9 h-9 flex items-center justify-center bg-[#111] text-white rounded-xl hover:bg-[#222] transition-colors disabled:opacity-50"
                      >
                        {editNameLoading
                          ? <span className="text-xs font-bold font-label">…</span>
                          : <HugeiconsIcon icon={Tick01Icon} size={16} color="currentColor" />
                        }
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingStudentId(null); setEditNameErr('') }}
                        title="Cancel"
                        className="shrink-0 w-9 h-9 flex items-center justify-center border border-[#E5E5E5] text-[#888] rounded-xl hover:bg-[#F8F8F7] hover:text-[#111] transition-colors"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={16} color="currentColor" />
                      </button>
                    </div>
                    {editNameErr && <p className="text-red-500 text-xs mt-1.5 font-label">{editNameErr}</p>}
                  </div>
                ) : (
                  <div className="mb-3">
                    <div className="flex justify-between items-start gap-2 mb-1.5">
                      <p className="text-sm font-bold text-[#111] font-body min-w-0 break-words">{student.name}</p>
                      {total !== null && (
                        <p className="text-sm font-bold text-[#111] font-display shrink-0">
                          {total}<span className="text-[10px] text-[#AAA] font-label">/400</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      {student.year && (
                        <span className="text-[10px] font-bold text-white bg-[#111] px-2 py-0.5 rounded-full font-label">
                          {student.year}
                        </span>
                      )}
                      {(() => {
                        const access = getAccessStatus(student)
                        const cls = access.status === 'active'
                          ? 'bg-green-50 text-green-700 border border-green-100'
                          : access.status === 'trial'
                          ? 'bg-yellow-50 text-yellow-700 border border-yellow-100'
                          : 'bg-red-50 text-red-700 border border-red-100'
                        const label = access.status === 'active'
                          ? `Paid · ${access.daysLeft}d`
                          : access.status === 'trial'
                          ? `Trial · ${access.daysLeft}d`
                          : 'Expired'
                        return (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-label ${cls}`}>
                            {label}
                          </span>
                        )
                      })()}
                    </div>

                    <p className="text-[10px] text-[#AAA] font-label mb-2">
                      Joined {new Date(student.joinedAt).toLocaleDateString('en-NG')}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => handleMarkPaid(student)}
                        title={`Record ₦${SUBSCRIPTION_PRICE_NGN} payment (extends 1 month)`}
                        className="h-8 px-2.5 flex items-center justify-center rounded-xl border border-green-100 text-green-700 bg-green-50 hover:bg-green-100 transition-colors text-[11px] font-bold font-label"
                      >
                        + ₦{SUBSCRIPTION_PRICE_NGN}
                      </button>
                      <button
                        onClick={() => startEditName(student)}
                        title="Rename student"
                        className="w-8 h-8 flex items-center justify-center rounded-xl border border-[#E5E5E5] text-[#888] hover:text-[#111] hover:border-[#CCC] transition-colors"
                      >
                        <HugeiconsIcon icon={PencilEdit01Icon} size={15} color="currentColor" />
                      </button>
                      <button
                        onClick={() => handleDeleteStudent(student.id, student.name)}
                        title="Delete student"
                        className="w-8 h-8 flex items-center justify-center rounded-xl border border-red-100 text-red-400 hover:bg-red-50 hover:border-red-200 transition-colors"
                      >
                        <HugeiconsIcon icon={Delete01Icon} size={15} color="currentColor" />
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center mb-2">
                  <p className={`text-xs font-bold font-label ${avg >= 70 ? 'text-green-600' : avg >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                    avg {avg}
                  </p>
                  <p className="text-[10px] text-[#CCC] font-label">{attempts} attempt{attempts !== 1 ? 's' : ''}</p>
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
                        <button
                          onClick={() => sendWhatsAppReport(student, 'parent')}
                          className="inline-flex items-center gap-1 text-[11px] font-bold bg-green-50 text-green-700 border border-green-100 px-2.5 py-1 rounded-lg font-label hover:bg-green-100 transition-colors"
                          title={`Send report to parent: ${student.parentPhone}`}
                        >
                          💬 Parent
                        </button>
                      )}
                      {student.teacherPhone && (
                        <button
                          onClick={() => sendWhatsAppReport(student, 'teacher')}
                          className="inline-flex items-center gap-1 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-lg font-label hover:bg-blue-100 transition-colors"
                          title={`Send report to teacher: ${student.teacherPhone}`}
                        >
                          💬 Teacher
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {getScoresFor(student.id).length > 0 && (
                  <div className="border-t border-[#F3F3F2] pt-3">
                    <p className="text-[10px] text-[#AAA] font-label mb-2">Score history</p>
                    <div className="space-y-1">
                      {getScoresFor(student.id).sort((a, b) => new Date(b.date) - new Date(a.date)).map((sc, i) => (
                        <div key={i} className="flex justify-between items-center gap-2 py-0.5">
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
                )}
              </div>
            )
          })}
        </div>
      )}

      {success && (
        <div className="mt-3 px-3.5 py-2 bg-green-50 border border-green-100 rounded-xl">
          <p className="text-green-600 text-xs font-label">{success}</p>
        </div>
      )}
    </div>
  )
}
