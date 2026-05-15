// src/pages/Admin.jsx
import { useState, useEffect } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PencilEdit01Icon, Delete01Icon, Cancel01Icon, Tick01Icon, UserGroupIcon, Analytics01Icon, Wallet01Icon, HelpCircleIcon, Book01Icon, Notification02Icon } from '@hugeicons/core-free-icons'
import { SUBJECTS, WEEKS, addQuestion, editQuestion, deleteQuestion, listenQuestions, listenScores, listenStudents, setTopics, getTopics, saveQuestionLimit, getQuestionLimit, setActiveWeek, getActiveWeek, updateStudent, deleteStudent, normalizeTopic, listenPayments, addPayment, extendSubscription, getAccessStatus, SUBSCRIPTION_PRICE_NGN, copyQuestionsToWeek, setQuizDates, getQuizDates } from '../store/useStore'
import { useAdminNotificationStore } from '../store/notificationStore'

async function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ratio = Math.min(maxWidth / img.width, 1)
        canvas.width = Math.round(img.width * ratio)
        canvas.height = Math.round(img.height * ratio)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function Admin({ setView }) {
  const [tab, setTab] = useState('students')
  const [students, setStudents] = useState([])
  const [scores, setScores] = useState([])
  const [currentQuestions, setCurrentQuestions] = useState([])
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0])
  const [selectedWeek, setSelectedWeek] = useState(WEEKS[0])
  const [form, setForm] = useState({ question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 0, explanation: '', explanationImage: '', image: '', optionImages: ['', '', '', ''] })
  const [uploadingImg, setUploadingImg] = useState(null)
  const [editingFirestoreId, setEditingFirestoreId] = useState(null)
  const [expandedQuestion, setExpandedQuestion] = useState(null)
  const [questionLimit, setQuestionLimit] = useState(25)
  const [topics, setTopicsState] = useState({})
  const [topicInputs, setTopicInputs] = useState({})
  const [topicWeek, setTopicWeek] = useState(WEEKS[0])
  const [activeWeek, setActiveWeekState] = useState('Week 1')
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [topicSuccess, setTopicSuccess] = useState('')
  const [yearFilter, setYearFilter] = useState('all')
  const [statsYear, setStatsYear] = useState('all')
  const [editingStudentId, setEditingStudentId] = useState(null)
  const [editNameValue, setEditNameValue] = useState('')
  const [editNameErr, setEditNameErr] = useState('')
  const [editNameLoading, setEditNameLoading] = useState(false)
  const [payments, setPayments] = useState([])
  const [paymentSearch, setPaymentSearch] = useState('')
  const [quizDate1, setQuizDate1] = useState('')
  const [quizDate2, setQuizDate2] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [openKeyPoints, setOpenKeyPoints] = useState(new Set())

  const currentYear = new Date().getFullYear()
  const jamb_years = ['SS3', ...Array.from({ length: 10 }, (_, i) => String(currentYear + i))]
  const filterYears = ['all', ...jamb_years]

  useEffect(() => {
    const unsubStudents = listenStudents((all) => setStudents(all))
    const unsubScores = listenScores((allScores) => setScores(allScores))
    const unsubPayments = listenPayments((all) => setPayments(all))
    getActiveWeek().then((w) => setActiveWeekState(w))
    getQuizDates().then(({ date1, date2 }) => { setQuizDate1(date1); setQuizDate2(date2) })
    return () => { unsubStudents(); unsubScores(); unsubPayments() }
  }, [])

  useEffect(() => {
    const unsubQ = listenQuestions(selectedSubject, selectedWeek, (qs) => setCurrentQuestions(qs))
    getQuestionLimit(selectedSubject, selectedWeek).then(setQuestionLimit)
    return () => unsubQ()
  }, [selectedSubject, selectedWeek])

  useEffect(() => {
    getTopics(topicWeek).then((raw) => {
      const normalized = {}
      Object.entries(raw || {}).forEach(([sub, val]) => {
        const t = normalizeTopic(val)
        if (t) normalized[sub] = t
      })
      setTopicsState(normalized)
      setTopicInputs(normalized)
    })
  }, [topicWeek])

  const resetForm = () => {
    setForm({ question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 0, explanation: '', explanationImage: '', image: '', optionImages: ['', '', '', ''] })
    setEditingFirestoreId(null)
    setErr('')
  }

  const handleImageUpload = async (file, target, index = null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file'); return }
    setUploadingImg(target + (index !== null ? index : ''))
    try {
      const dataUrl = await compressImage(file)
      if (target === 'question') setForm((f) => ({ ...f, image: dataUrl }))
      else if (target === 'explanation') setForm((f) => ({ ...f, explanationImage: dataUrl }))
      else if (target === 'option' && index !== null) {
        setForm((f) => {
          const next = [...f.optionImages]
          next[index] = dataUrl
          return { ...f, optionImages: next }
        })
      }
    } catch {
      setErr('Failed to process image')
    }
    setUploadingImg(null)
  }

  const handleAddOrEdit = async () => {
    if (!form.question.trim()) { setErr('Enter a question'); return }
    if (!form.optionA.trim() || !form.optionB.trim() || !form.optionC.trim() || !form.optionD.trim()) { setErr('Fill in all 4 options'); return }
    const qData = {
      question: form.question.trim(),
      options: [form.optionA.trim(), form.optionB.trim(), form.optionC.trim(), form.optionD.trim()],
      answer: parseInt(form.answer),
      explanation: form.explanation.trim(),
      explanationImage: form.explanationImage || '',
      image: form.image || '',
      optionImages: form.optionImages || ['', '', '', ''],
    }
    try {
      if (editingFirestoreId) {
        await editQuestion(editingFirestoreId, qData)
        setSuccess('Question updated!')
      } else {
        await addQuestion(selectedSubject, selectedWeek, qData)
        setSuccess('Question added!')
      }
      resetForm()
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      console.error(e)
      setErr('Failed. Check your connection.')
    }
  }

  const handleEdit = (q) => {
    setForm({
      question: q.question,
      optionA: q.options[0], optionB: q.options[1], optionC: q.options[2], optionD: q.options[3],
      answer: q.answer,
      explanation: q.explanation || '',
      explanationImage: q.explanationImage || '',
      image: q.image || '',
      optionImages: q.optionImages && q.optionImages.length === 4 ? q.optionImages : ['', '', '', ''],
    })
    setEditingFirestoreId(q.firestoreId)
    setExpandedQuestion(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (firestoreId) => {
    if (!window.confirm('Delete this question?')) return
    try {
      await deleteQuestion(firestoreId)
      setSuccess('Deleted!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      console.error(e)
      alert('Failed to delete.')
    }
  }

  const handleSaveTopics = async () => {
    try {
      await setTopics(topicWeek, topicInputs)
      setTopicsState(topicInputs)
      setTopicSuccess('Topics saved!')
      setTimeout(() => setTopicSuccess(''), 3000)
    } catch { alert('Failed to save topics.') }
  }

  const handleCopyTopicsFrom = async (sourceWeek) => {
    if (sourceWeek === topicWeek) return
    if (!window.confirm(`Copy topics from ${sourceWeek} → ${topicWeek}? This replaces current inputs (you still need to Save).`)) return
    try {
      const raw = await getTopics(sourceWeek)
      const normalized = {}
      Object.entries(raw || {}).forEach(([sub, val]) => {
        const t = normalizeTopic(val)
        if (t) normalized[sub] = t
      })
      setTopicInputs(normalized)
      setTopicSuccess(`Copied from ${sourceWeek} — review and Save`)
      setTimeout(() => setTopicSuccess(''), 4000)
    } catch { alert('Failed to copy topics.') }
  }

  const handleSaveLimit = async () => {
    try {
      await saveQuestionLimit(selectedSubject, selectedWeek, questionLimit)
      setSuccess('Limit saved!')
      setTimeout(() => setSuccess(''), 3000)
    } catch { alert('Failed to save limit.') }
  }

  const handleTransferQuestions = async (fromWeek) => {
    if (!window.confirm(`Copy all ${selectedSubject} questions from ${fromWeek} → ${selectedWeek}?`)) return
    setTransferring(true)
    try {
      const count = await copyQuestionsToWeek(selectedSubject, fromWeek, selectedWeek)
      setSuccess(`${count} question(s) transferred from ${fromWeek}!`)
      setTimeout(() => setSuccess(''), 4000)
    } catch { alert('Transfer failed. Check your connection.') }
    setTransferring(false)
  }

  const handleSaveQuizDates = async () => {
    try {
      await setQuizDates(
        quizDate1 ? new Date(quizDate1).toISOString() : '',
        quizDate2 ? new Date(quizDate2).toISOString() : '',
      )
      setSuccess('Quiz dates saved!')
      setTimeout(() => setSuccess(''), 3000)
    } catch { alert('Failed to save quiz dates.') }
  }

  const toggleKeyPoints = (subject) => {
    setOpenKeyPoints((prev) => {
      const next = new Set(prev)
      if (next.has(subject)) next.delete(subject)
      else next.add(subject)
      return next
    })
  }

  const handleSetActiveWeek = async (week) => {
    try {
      await setActiveWeek(week)
      setActiveWeekState(week)
      setSuccess(`Active week → ${week}`)
      setTimeout(() => setSuccess(''), 3000)
    } catch { alert('Failed.') }
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

  const getScoresFor = (studentId) => scores.filter((s) => s.studentId === studentId)
  const getAverage = (studentId) => {
    const s = getScoresFor(studentId)
    return s.length ? Math.round(s.reduce((a, b) => a + b.score, 0) / s.length) : 0
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

  const filteredStudents = yearFilter === 'all' ? students : students.filter((s) => s.year === yearFilter)

  const getYearStats = (yr) => {
    const grp = yr === 'all' ? students : students.filter((s) => s.year === yr)
    if (!grp.length) return null
    const grpScores = scores.filter((sc) => grp.find((s) => s.id === sc.studentId))
    const avg = grpScores.length ? Math.round(grpScores.reduce((a, b) => a + b.score, 0) / grpScores.length) : 0

    const top = grp
      .map((s) => ({ name: s.name, total: getTotalScore(s.id) }))
      .filter((s) => s.total !== null)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)

    const topBySubject = SUBJECTS.map((subject) => {
      const subScores = grpScores.filter((sc) => sc.subject === subject)
      if (!subScores.length) return null

      const byStudent = {}
      subScores.forEach((sc) => {
        const student = grp.find((s) => s.id === sc.studentId)
        if (!student) return
        if (!byStudent[sc.studentId] || sc.score > byStudent[sc.studentId].score) {
          byStudent[sc.studentId] = { name: student.name, score: sc.score, outOf: sc.outOf || 100 }
        }
      })

      const ranked = Object.values(byStudent)
        .map((s) => ({ ...s, pct: Math.round((s.score / s.outOf) * 100) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)

      return { subject, ranked }
    }).filter(Boolean).filter((s) => s.ranked.length > 0)

    return { count: grp.length, attempts: grpScores.length, avg, top, topBySubject }
  }

  const TABS = [
    { key: 'students',  icon: UserGroupIcon,    label: 'Students' },
    { key: 'stats',     icon: Analytics01Icon,  label: 'Stats' },
    { key: 'payments',  icon: Wallet01Icon,     label: 'Payments' },
    { key: 'questions', icon: HelpCircleIcon,   label: 'Questions' },
    { key: 'topics',    icon: Book01Icon,       label: 'Topics' },
    { key: 'notifications', icon: Notification02Icon, label: 'Notifications' },
  ]

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="max-w-2xl mx-auto px-4 pb-10">

        {/* Header */}
        <div className="flex justify-between items-center gap-2 pt-8 pb-6">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-[#888] uppercase tracking-[0.2em] font-label mb-0.5">
              274Lab
            </p>
            <h2 className="text-lg sm:text-xl font-bold text-[#111] font-display truncate">Quiz Manager</h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] sm:text-[11px] font-bold text-white bg-[#111] px-2 sm:px-3 py-1.5 rounded-full font-label whitespace-nowrap">
              {activeWeek}
            </span>
            <button
              onClick={() => setView('home')}
              className="text-[11px] sm:text-xs text-[#888] hover:text-[#111] border border-[#E5E5E5] bg-white rounded-xl px-2.5 sm:px-3 py-2 font-label transition-colors whitespace-nowrap"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-[#EBEBEB] rounded-xl mb-6 overflow-x-auto">
          {TABS.map((t) => {
            const isActive = tab === t.key
            const isStudents = t.key === 'students'
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                title={t.label}
                aria-label={t.label}
                className={`flex-1 min-w-[64px] py-2.5 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all ${
                  isActive
                    ? 'bg-white text-[#111] shadow-sm'
                    : 'text-[#999] hover:text-[#555]'
                }`}
              >
                <HugeiconsIcon icon={t.icon} size={18} color="currentColor" strokeWidth={isActive ? 2 : 1.5} />
                <span className="text-[9px] font-bold font-label tracking-wide">
                  {isStudents ? `${t.label} (${students.length})` : t.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── STUDENTS ── */}
        {tab === 'students' && (
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
          </div>
        )}

        {/* ── STATS ── */}
        {tab === 'stats' && (
          <div>
            <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
              {filterYears.map((y) => (
                <button
                  key={y}
                  onClick={() => setStatsYear(y)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors font-label ${
                    statsYear === y ? 'bg-[#111] text-white' : 'bg-white border border-[#E5E5E5] text-[#555]'
                  }`}
                >
                  {y === 'all' ? 'All Years' : y}
                </button>
              ))}
            </div>

            {(() => {
              const stats = getYearStats(statsYear)
              if (!stats) return (
                <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
                  <p className="text-[#CCC] text-sm font-label">No data yet</p>
                </div>
              )
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { value: stats.count, label: 'Students', color: 'text-[#111]' },
                      { value: stats.attempts, label: 'Attempts', color: 'text-blue-600' },
                      { value: stats.avg, label: 'Avg Score', color: stats.avg >= 70 ? 'text-green-600' : stats.avg >= 50 ? 'text-yellow-600' : 'text-red-500' },
                    ].map(({ value, label, color }) => (
                      <div key={label} className="bg-white border border-[#EBEBEB] rounded-xl p-4 text-center">
                        <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
                        <p className="text-[10px] text-[#AAA] font-label mt-1">{label}</p>
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const grpStudents = statsYear === 'all' ? students : students.filter((s) => s.year === statsYear)
                    const grpStudentIds = new Set(grpStudents.map((s) => s.id))
                    const grpPayments = payments.filter((p) => grpStudentIds.has(p.studentId))
                    const totalRev = grpPayments.reduce((a, p) => a + (p.amount || 0), 0)
                    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
                    const monthRev = grpPayments.filter((p) => new Date(p.paidAt).getTime() >= monthStart).reduce((a, p) => a + (p.amount || 0), 0)
                    let active = 0, trial = 0, expired = 0
                    grpStudents.forEach((s) => {
                      const st = getAccessStatus(s).status
                      if (st === 'active') active++
                      else if (st === 'trial') trial++
                      else expired++
                    })
                    return (
                      <button
                        onClick={() => setTab('payments')}
                        className="w-full text-left bg-[#111] text-white rounded-2xl p-5 hover:bg-[#222] transition-colors"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-1">Revenue {statsYear !== 'all' ? `— ${statsYear}` : ''}</p>
                            <div className="flex items-end gap-1.5">
                              <span className="text-3xl font-bold font-display">₦{totalRev.toLocaleString()}</span>
                              <span className="text-[#666] text-xs mb-1 font-label">all time</span>
                            </div>
                            <p className="text-[11px] text-[#AAA] font-label mt-1">₦{monthRev.toLocaleString()} this month</p>
                          </div>
                          <span className="text-[10px] font-semibold text-[#888] hover:text-white font-label">View →</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10">
                          <div className="text-center">
                            <p className="text-base font-bold text-green-400 font-display">{active}</p>
                            <p className="text-[10px] text-[#666] font-label">Active</p>
                          </div>
                          <div className="text-center border-x border-white/10">
                            <p className="text-base font-bold text-yellow-400 font-display">{trial}</p>
                            <p className="text-[10px] text-[#666] font-label">Trial</p>
                          </div>
                          <div className="text-center">
                            <p className="text-base font-bold text-red-400 font-display">{expired}</p>
                            <p className="text-[10px] text-[#666] font-label">Expired</p>
                          </div>
                        </div>
                      </button>
                    )
                  })()}

                  {stats.top.length > 0 && (
                    <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
                      <p className="text-sm font-bold text-[#111] font-display mb-3">
                        Top Performers {statsYear !== 'all' ? `— ${statsYear}` : ''}
                      </p>
                      <div className="space-y-2">
                        {stats.top.map((s, i) => (
                          <div key={i} className="flex justify-between items-center py-2.5 border-b border-[#F3F3F2] last:border-0">
                            <div className="flex items-center gap-3">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-display ${
                                i === 0 ? 'bg-yellow-100 text-yellow-700' :
                                i === 1 ? 'bg-[#F3F3F2] text-[#555]' :
                                'bg-orange-50 text-orange-600'
                              }`}>
                                {i + 1}
                              </span>
                              <p className="text-sm font-semibold text-[#111] font-body">{s.name}</p>
                            </div>
                            <p className="text-sm font-bold text-[#111] font-display">
                              {s.total}<span className="text-[10px] text-[#AAA] font-label">/400</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {stats.topBySubject && stats.topBySubject.length > 0 && (
                    <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
                      <p className="text-sm font-bold text-[#111] font-display mb-4">
                        Top Performers by Subject {statsYear !== 'all' ? `— ${statsYear}` : ''}
                      </p>
                      <div className="space-y-5">
                        {stats.topBySubject.map(({ subject, ranked }) => (
                          <div key={subject}>
                            <p className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] font-label mb-2">{subject}</p>
                            <div className="space-y-1.5">
                              {ranked.map((s, i) => (
                                <div key={i} className="flex justify-between items-center py-2 px-3 bg-[#F8F8F7] rounded-xl">
                                  <div className="flex items-center gap-2.5">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-display shrink-0 ${
                                      i === 0 ? 'bg-yellow-100 text-yellow-700' :
                                      i === 1 ? 'bg-[#E5E5E5] text-[#555]' :
                                      'bg-orange-50 text-orange-600'
                                    }`}>
                                      {i + 1}
                                    </span>
                                    <p className="text-xs font-semibold text-[#111] font-body">{s.name}</p>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs font-bold font-display text-[#111]">{s.score}</span>
                                    <span className="text-[10px] text-[#AAA] font-label">/{s.outOf}</span>
                                    <span className={`ml-2 text-[10px] font-bold font-label ${
                                      s.pct >= 70 ? 'text-green-600' : s.pct >= 50 ? 'text-yellow-600' : 'text-red-500'
                                    }`}>{s.pct}%</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
                    <p className="text-sm font-bold text-[#111] font-display mb-4">Performance by Subject</p>
                    <div className="space-y-4">
                      {SUBJECTS.map((subject) => {
                        const grp = statsYear === 'all' ? students : students.filter((s) => s.year === statsYear)
                        const subScores = scores.filter((sc) => sc.subject === subject && grp.find((s) => s.id === sc.studentId))
                        if (!subScores.length) return null
                        const subAvg = Math.round(subScores.reduce((a, b) => a + b.score, 0) / subScores.length)
                        const subMax = subScores[0]?.outOf || 160
                        const pct = Math.round((subAvg / subMax) * 100)
                        return (
                          <div key={subject}>
                            <div className="flex justify-between items-center mb-1.5">
                              <p className="text-xs font-semibold text-[#333] font-body">{subject}</p>
                              <p className="text-[11px] text-[#888] font-label">{subAvg}/{subMax} · {subScores.length} attempts</p>
                            </div>
                            <div className="w-full bg-[#F3F3F2] rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-400'}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── PAYMENTS ── */}
        {tab === 'payments' && (() => {
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
        })()}

        {/* ── QUESTIONS ── */}
        {tab === 'questions' && (
          <div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Subject</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => { setSelectedSubject(e.target.value); resetForm() }}
                  className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white"
                >
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Week</label>
                <select
                  value={selectedWeek}
                  onChange={(e) => { setSelectedWeek(e.target.value); resetForm() }}
                  className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white"
                >
                  {WEEKS.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-white border border-[#EBEBEB] rounded-xl p-4 mb-4">
              <p className="text-xs font-bold text-[#111] font-body mb-0.5">Quiz Schedule</p>
              <p className="text-[11px] text-[#AAA] font-label mb-3">Set 2 dates when students can take the quiz</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-[10px] font-bold text-[#888] uppercase tracking-wide block mb-1 font-label">Date 1</label>
                  <input
                    type="datetime-local"
                    value={quizDate1 ? (() => { try { const d = new Date(quizDate1); const p = (n) => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` } catch { return '' } })() : ''}
                    onChange={(e) => setQuizDate1(e.target.value)}
                    className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs text-[#111] focus:outline-none focus:border-[#111] bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#888] uppercase tracking-wide block mb-1 font-label">Date 2</label>
                  <input
                    type="datetime-local"
                    value={quizDate2 ? (() => { try { const d = new Date(quizDate2); const p = (n) => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` } catch { return '' } })() : ''}
                    onChange={(e) => setQuizDate2(e.target.value)}
                    className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs text-[#111] focus:outline-none focus:border-[#111] bg-white"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveQuizDates}
                className="text-xs bg-[#111] text-white px-3 py-1.5 rounded-lg font-label hover:bg-[#222] transition-colors"
              >
                Save Dates
              </button>
            </div>

            <div className="bg-white border border-[#EBEBEB] rounded-xl p-4 mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-[#111] font-body">{currentQuestions.length} questions in pool</p>
                  <p className="text-[11px] text-[#AAA] font-label mt-0.5">
                    Each student gets {Math.min(questionLimit, currentQuestions.length)} random questions
                    <span className="text-[#CCC]"> · default {selectedSubject === 'English Language' ? 40 : 25}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={currentQuestions.length || 100}
                    value={questionLimit}
                    onChange={(e) => setQuestionLimit(parseInt(e.target.value) || (selectedSubject === 'English Language' ? 40 : 25))}
                    className="w-14 border border-[#E5E5E5] rounded-lg px-2 py-1.5 text-xs text-center bg-white focus:outline-none focus:border-[#111]"
                  />
                  <button
                    onClick={handleSaveLimit}
                    className="text-xs bg-[#111] text-white px-3 py-1.5 rounded-lg font-label hover:bg-[#222] transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#EBEBEB] rounded-xl p-4 mb-4">
              <p className="text-xs font-bold text-[#111] font-body mb-0.5">Transfer Questions → {selectedWeek}</p>
              <p className="text-[11px] text-[#AAA] font-label mb-2">Copy {selectedSubject} questions from another week into this one</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKS.filter((w) => w !== selectedWeek).map((w) => (
                  <button
                    key={w}
                    onClick={() => handleTransferQuestions(w)}
                    disabled={transferring}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-[#E5E5E5] text-[#555] bg-white hover:border-[#111] hover:text-[#111] disabled:opacity-40 transition-colors font-label"
                  >
                    {w} +
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
              <p className="text-sm font-bold text-[#111] font-display mb-4">
                {editingFirestoreId ? '✏️ Edit Question' : 'Add Question'}
                <span className="text-[#AAA] text-xs font-label font-normal ml-2">
                  {selectedSubject} · {selectedWeek}
                </span>
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Question</label>
                  <textarea
                    value={form.question}
                    onChange={(e) => setForm({ ...form, question: e.target.value })}
                    placeholder="Type the question here…"
                    rows={3}
                    className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] resize-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">
                    Question Image <span className="text-[#CCC] normal-case tracking-normal">optional · auto-compressed</span>
                  </label>
                  {form.image ? (
                    <div className="relative inline-block">
                      <img src={form.image} alt="Question" className="max-h-40 rounded-xl border border-[#E5E5E5]" />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, image: '' })}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-[#E5E5E5] rounded-full flex items-center justify-center text-[#555] hover:text-red-500 hover:border-red-200 shadow-sm"
                        title="Remove image"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={12} color="currentColor" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-[#CCC] rounded-xl cursor-pointer hover:border-[#111] hover:bg-[#FAFAF9] transition-colors">
                      <span className="text-xs text-[#888] font-label">
                        {uploadingImg === 'question' ? 'Uploading…' : '📷 Upload image'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e.target.files?.[0], 'question')}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                {['A', 'B', 'C', 'D'].map((letter, idx) => (
                  <div key={letter}>
                    <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Option {letter}</label>
                    <input
                      value={form[`option${letter}`]}
                      onChange={(e) => setForm({ ...form, [`option${letter}`]: e.target.value })}
                      placeholder={`Option ${letter}`}
                      className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] mb-1.5"
                    />
                    {form.optionImages[idx] ? (
                      <div className="relative inline-block mt-1">
                        <img src={form.optionImages[idx]} alt={`Option ${letter}`} className="max-h-24 rounded-lg border border-[#E5E5E5]" />
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...form.optionImages]
                            next[idx] = ''
                            setForm({ ...form, optionImages: next })
                          }}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-white border border-[#E5E5E5] rounded-full flex items-center justify-center text-[#555] hover:text-red-500 hover:border-red-200 shadow-sm"
                          title="Remove image"
                        >
                          <HugeiconsIcon icon={Cancel01Icon} size={10} color="currentColor" />
                        </button>
                      </div>
                    ) : (
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-[#DDD] rounded-lg cursor-pointer hover:border-[#111] transition-colors">
                        <span className="text-[10px] text-[#888] font-label">
                          {uploadingImg === 'option' + idx ? 'Uploading…' : '📷 Add image'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(e.target.files?.[0], 'option', idx)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                ))}
                <div>
                  <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Correct Answer</label>
                  <select
                    value={form.answer}
                    onChange={(e) => setForm({ ...form, answer: e.target.value })}
                    className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white"
                  >
                    {['A', 'B', 'C', 'D'].map((l, i) => <option key={l} value={i}>Option {l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">
                    Explanation <span className="text-[#CCC] normal-case tracking-normal">optional</span>
                  </label>
                  <textarea
                    value={form.explanation}
                    onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                    placeholder="Why is this the correct answer?"
                    rows={2}
                    className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] resize-none mb-1.5"
                  />
                  {form.explanationImage ? (
                    <div className="relative inline-block mt-1">
                      <img src={form.explanationImage} alt="Explanation" className="max-h-32 rounded-xl border border-[#E5E5E5]" />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, explanationImage: '' })}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-[#E5E5E5] rounded-full flex items-center justify-center text-[#555] hover:text-red-500 hover:border-red-200 shadow-sm"
                        title="Remove image"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={12} color="currentColor" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-[#CCC] rounded-xl cursor-pointer hover:border-[#111] hover:bg-[#FAFAF9] transition-colors">
                      <span className="text-xs text-[#888] font-label">
                        {uploadingImg === 'explanation' ? 'Uploading…' : '📷 Add explanation image (optional)'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e.target.files?.[0], 'explanation')}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {err && <div className="mt-3 px-3.5 py-2 bg-red-50 border border-red-100 rounded-xl"><p className="text-red-600 text-xs font-label">{err}</p></div>}
              {success && <div className="mt-3 px-3.5 py-2 bg-green-50 border border-green-100 rounded-xl"><p className="text-green-600 text-xs font-label">{success}</p></div>}

              <div className="flex gap-2.5 mt-4">
                {editingFirestoreId && (
                  <button onClick={resetForm} className="flex-1 border border-[#E5E5E5] rounded-xl py-3 text-sm font-semibold text-[#555] hover:bg-[#F8F8F7] font-label">
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleAddOrEdit}
                  className="flex-1 bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] transition-colors font-display"
                >
                  {editingFirestoreId ? 'Save Changes' : 'Add Question'}
                </button>
              </div>
            </div>

            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm font-bold text-[#111] font-display">Question Pool</p>
                <span className="text-[11px] font-semibold bg-[#F3F3F2] text-[#555] px-2.5 py-1 rounded-lg font-label">
                  {currentQuestions.length} total
                </span>
              </div>
              {currentQuestions.length === 0 ? (
                <p className="text-[#CCC] text-sm text-center py-6 font-label">
                  No questions for {selectedSubject} · {selectedWeek}
                </p>
              ) : (
                <div className="space-y-2">
                  {currentQuestions.map((q, i) => (
                    <div key={q.firestoreId} className="border border-[#F0F0F0] rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedQuestion(expandedQuestion === q.firestoreId ? null : q.firestoreId)}
                        className="w-full flex justify-between items-center p-3 text-left hover:bg-[#FAFAF9] transition-colors"
                      >
                        <p className="text-xs text-[#111] font-semibold font-body flex-1 pr-2 leading-snug">
                          {i + 1}. {q.question.length > 60 ? q.question.slice(0, 60) + '…' : q.question}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] font-bold text-white bg-[#111] w-5 h-5 rounded-full flex items-center justify-center font-label">
                            {String.fromCharCode(65 + q.answer)}
                          </span>
                          {q.explanation && (
                            <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-label">exp</span>
                          )}
                          <span className="text-[#CCC] text-xs">{expandedQuestion === q.firestoreId ? '▲' : '▼'}</span>
                        </div>
                      </button>

                      {expandedQuestion === q.firestoreId && (
                        <div className="px-3 pb-3 border-t border-[#F0F0F0]">
                          <p className="text-xs text-[#111] font-semibold font-body mt-2 mb-2 leading-snug">{q.question}</p>
                          {q.image && <img src={q.image} alt="Question" className="max-h-32 rounded-lg border border-[#E5E5E5] mb-3" />}
                          <div className="grid grid-cols-2 gap-1 mb-3">
                            {q.options.map((opt, oi) => (
                              <div key={oi} className={`text-xs px-2.5 py-1.5 rounded-lg font-label ${
                                oi === q.answer ? 'bg-green-100 text-green-700 font-semibold' : 'bg-[#F8F8F7] text-[#888]'
                              }`}>
                                <p>{String.fromCharCode(65 + oi)}. {opt}{oi === q.answer && ' ✓'}</p>
                                {q.optionImages?.[oi] && <img src={q.optionImages[oi]} alt={`Option ${oi}`} className="max-h-16 rounded mt-1" />}
                              </div>
                            ))}
                          </div>
                          {q.explanation && (
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 mb-3">
                              <p className="text-[10px] font-bold text-blue-700 font-label mb-0.5">Explanation</p>
                              <p className="text-xs text-blue-600 font-label whitespace-pre-line leading-relaxed">{q.explanation}</p>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => handleEdit(q)} className="flex-1 text-blue-600 text-xs border border-blue-100 rounded-lg px-3 py-2 hover:bg-blue-50 font-label transition-colors">
                              ✏️ Edit
                            </button>
                            <button onClick={() => handleDelete(q.firestoreId)} className="flex-1 text-red-500 text-xs border border-red-100 rounded-lg px-3 py-2 hover:bg-red-50 font-label transition-colors">
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TOPICS ── */}
        {tab === 'topics' && (
          <div>
            <div className="bg-[#111] text-white rounded-2xl p-5 mb-5">
              <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-0.5">
                Active Quiz Week
              </p>
              <p className="text-xs text-[#666] mb-4 font-label">
                Controls which week students quiz on.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {WEEKS.map((w) => (
                  <button
                    key={w}
                    onClick={() => handleSetActiveWeek(w)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all font-display ${
                      activeWeek === w ? 'bg-white text-[#111]' : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {w.replace('Week ', 'W')}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#555] font-label">
                Active: <span className="text-white font-semibold">{activeWeek}</span>
              </p>
              {success && <p className="text-green-400 text-xs mt-2 font-label">{success}</p>}
            </div>

            <div className="mb-4">
              <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Set Topics for Week</label>
              <select
                value={topicWeek}
                onChange={(e) => setTopicWeek(e.target.value)}
                className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white"
              >
                {WEEKS.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>

            <div className="bg-white border border-[#EBEBEB] rounded-xl p-3 mb-4 flex items-center gap-2">
              <p className="text-[11px] text-[#888] font-label shrink-0">Copy from:</p>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {WEEKS.filter((w) => w !== topicWeek).map((w) => (
                  <button
                    key={w}
                    onClick={() => handleCopyTopicsFrom(w)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-[#E5E5E5] text-[#555] bg-white hover:border-[#111] hover:text-[#111] transition-colors font-label"
                  >
                    ↺ {w}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
              <p className="text-sm font-bold text-[#111] font-display mb-1">Topics for {topicWeek}</p>
              <p className="text-xs text-[#AAA] font-label mb-4">
                Shown to students after completing their quiz as next week's revision guide.
              </p>
              <div className="space-y-5">
                {SUBJECTS.map((subject) => {
                  const cur = topicInputs[subject] || { name: '', video: '', keyPoints: [] }
                  const kps = Array.from({ length: 10 }, (_, i) => cur.keyPoints?.[i] || '')
                  const filledKps = kps.filter((k) => k.trim()).length
                  const isOpen = openKeyPoints.has(subject)
                  return (
                    <div key={subject}>
                      <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">{subject}</label>
                      <input
                        value={cur.name || ''}
                        onChange={(e) => setTopicInputs({ ...topicInputs, [subject]: { ...cur, name: e.target.value } })}
                        placeholder="e.g. Vectors, Adaptation…"
                        className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] mb-1.5"
                      />
                      <input
                        type="url"
                        value={cur.video || ''}
                        onChange={(e) => setTopicInputs({ ...topicInputs, [subject]: { ...cur, video: e.target.value } })}
                        placeholder="YouTube URL (optional)"
                        className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs text-[#555] focus:outline-none focus:border-[#111] placeholder:text-[#CCC] mb-1.5"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyPoints(subject)}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-[#555] hover:text-[#111] transition-colors font-label"
                      >
                        <span>{isOpen ? '▲' : '▼'}</span>
                        <span>Key Points</span>
                        {filledKps > 0 && (
                          <span className="bg-[#111] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full font-label">{filledKps}</span>
                        )}
                      </button>
                      {isOpen && (
                        <div className="mt-2 space-y-1.5 pl-1">
                          {kps.map((kp, kpIdx) => (
                            <div key={kpIdx} className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-[#CCC] font-label w-4 shrink-0">{kpIdx + 1}</span>
                              <input
                                value={kp}
                                onChange={(e) => {
                                  const newKps = [...kps]
                                  newKps[kpIdx] = e.target.value
                                  setTopicInputs({ ...topicInputs, [subject]: { ...cur, keyPoints: newKps } })
                                }}
                                placeholder={`Key point ${kpIdx + 1}…`}
                                className="flex-1 border border-[#E5E5E5] rounded-lg px-2.5 py-1.5 text-xs text-[#111] focus:outline-none focus:border-[#111] placeholder:text-[#DDD]"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {topicSuccess && (
                <div className="mt-3 px-3.5 py-2 bg-green-50 border border-green-100 rounded-xl">
                  <p className="text-green-600 text-xs font-label">{topicSuccess}</p>
                </div>
              )}
              <button
                onClick={handleSaveTopics}
                className="w-full mt-4 bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] transition-colors font-display"
              >
                Save Topics for {topicWeek}
              </button>
            </div>

            {Object.keys(topics).some((k) => topics[k]?.name) && (
              <div className="bg-[#F3F3F2] border border-[#EBEBEB] rounded-2xl p-4">
                <p className="text-xs font-bold text-[#555] font-display mb-3">Saved — {topicWeek}</p>
                <div className="space-y-2">
                  {Object.entries(topics).map(([subject, t]) => t?.name ? (
                    <div key={subject} className="flex justify-between items-center gap-2">
                      <p className="text-xs text-[#555] font-body shrink-0">{subject}</p>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-xs font-semibold text-[#111] bg-white border border-[#E5E5E5] px-2.5 py-1 rounded-lg font-label truncate">{t.name}</p>
                        {t.video && (
                          <a href={t.video} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg font-label hover:bg-red-100 shrink-0" title={t.video}>
                            ▶ Video
                          </a>
                        )}
                      </div>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── NOTIFICATIONS ── */}
        {tab === 'notifications' && <NotificationsPanel />}

      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Notifications sub-component
// ────────────────────────────────────────────────────────────
function NotificationsPanel() {
  const { enabled, enabledSince, lastModifiedBy, enable, disable } = useAdminNotificationStore()
  const [testStatus, setTestStatus] = useState(null)

  const adminName = 'Admin'

  const handleToggle = () => {
    if (enabled) {
      if (confirm('Disable notifications for ALL users? This will stop all scheduled key point deliveries immediately.')) {
        disable(adminName)
      }
    } else {
      if (confirm('Enable notifications for ALL users? This will start delivering key points every 2 hours.')) {
        enable(adminName)
      }
    }
  }

  const handleTestNotification = () => {
    setTestStatus('Sending test...')

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('📚 Test Key Point', {
        body: 'This is a test notification. Key points will look like this for your students!',
        icon: '/icon-192.png',
        tag: 'test-notification',
      })
    } else if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          new Notification('📚 Test Key Point', {
            body: 'This is a test notification. Key points will look like this for your students!',
            icon: '/icon-192.png',
            tag: 'test-notification',
          })
        }
      })
    }

    setTimeout(() => setTestStatus('Test sent! Check your notifications.'), 500)
    setTimeout(() => setTestStatus(null), 3000)
  }

  return (
    <div className="space-y-4">
      {/* Master Toggle */}
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-sm font-bold text-[#111] font-display">Notification Service</p>
            <p className="text-xs text-[#888] font-label mt-0.5">
              {enabled
                ? 'Notifications are LIVE — users receive key points every 2 hours'
                : 'Notifications are OFF — no key points are being sent'}
            </p>
          </div>
          <button
            onClick={handleToggle}
            className={`relative w-14 h-7 rounded-full shrink-0 transition-colors ${
              enabled ? 'bg-green-500' : 'bg-[#DDD]'
            }`}
          >
            <div
              className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                enabled ? 'translate-x-7' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Status Details */}
        {enabled && (
          <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <p className="text-sm font-bold text-green-800 font-display">Service Active</p>
            </div>
            <div className="space-y-1 text-xs text-green-700 font-label">
              <p>• Enabled since: {enabledSince ? new Date(enabledSince).toLocaleString() : 'Unknown'}</p>
              <p>• Last modified by: {lastModifiedBy || 'Unknown'}</p>
              <p>• Interval: Every 2 hours</p>
              <p>• Max views per point: 3 times</p>
              <p>• Points cycle: Yes (resets when all seen 3×)</p>
              <p>• Week-based: Content auto-updates each week</p>
            </div>
          </div>
        )}

        {!enabled && (
          <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
            <p className="text-sm text-yellow-800 font-label">
              ⚠️ Notifications are currently disabled. Users will not receive key point deliveries.
              Enable this when you're ready to start engaging users.
            </p>
          </div>
        )}

        {/* Test Button */}
        <button
          onClick={handleTestNotification}
          className="w-full bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display mt-4"
        >
          {testStatus || 'Send Test Notification'}
        </button>
      </div>

      {/* How It Works */}
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[#111] font-display mb-4">How It Works</h3>
        <div className="space-y-4">
          {[
            {
              emoji: '1️⃣',
              title: 'Scheduled Delivery',
              desc: 'Key points for the current week\'s topics are delivered every 2 hours via push notification to students\' devices.',
            },
            {
              emoji: '2️⃣',
              title: 'Smart Cycling',
              desc: 'Each point is shown up to 3 times before cycling to the next. After all points have been seen, the cycle resets. Repetition reinforces learning.',
            },
            {
              emoji: '3️⃣',
              title: 'Patches Mode',
              desc: 'When users activate Patches on Feb 14, notifications switch to only show key points from subjects where they scored below 50%. Laser-focused on weak areas.',
            },
            {
              emoji: '4️⃣',
              title: 'Week-Based Content',
              desc: 'Content automatically updates when the week changes. No manual intervention needed — old notifications stop, new ones begin for the new week.',
            },
            {
              emoji: '5️⃣',
              title: 'In-App + Push',
              desc: 'When the app is open, a pop-in card appears. When closed, a native push notification delivers the key point. Both work together.',
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="text-lg shrink-0">{item.emoji}</span>
              <div>
                <p className="text-xs font-bold text-[#111] font-label">{item.title}</p>
                <p className="text-[11px] text-[#888] font-label leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-red-800 font-display mb-2">Danger Zone</h3>
        <p className="text-xs text-red-600 font-label mb-4">
          Disabling notifications will stop ALL scheduled deliveries immediately. Users will not
          receive any more key points until re-enabled.
        </p>
        {enabled && (
          <button
            onClick={() => {
              if (confirm('Are you sure? This stops all notifications for all users.')) {
                disable(adminName)
              }
            }}
            className="w-full bg-red-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-red-700 active:scale-[0.99] transition-all font-display"
          >
            ⚠️ Emergency Stop — Disable All Notifications
          </button>
        )}
      </div>
    </div>
  )
}