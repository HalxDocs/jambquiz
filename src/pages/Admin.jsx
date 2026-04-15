import { useState, useEffect } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PencilEdit01Icon, Delete01Icon, Cancel01Icon, Tick01Icon } from '@hugeicons/core-free-icons'
import { SUBJECTS, WEEKS, addQuestion, editQuestion, deleteQuestion, listenQuestions, listenScores, listenStudents, setTopics, getTopics, saveQuestionLimit, getQuestionLimit, setActiveWeek, getActiveWeek, updateStudent, deleteStudent } from '../store/useStore'

export default function Admin({ setView }) {
  const [tab, setTab] = useState('students')
  const [students, setStudents] = useState([])
  const [scores, setScores] = useState([])
  const [currentQuestions, setCurrentQuestions] = useState([])
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0])
  const [selectedWeek, setSelectedWeek] = useState(WEEKS[0])
  const [form, setForm] = useState({ question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 0, explanation: '' })
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

  const currentYear = new Date().getFullYear()
  const jamb_years = ['SS3', ...Array.from({ length: 10 }, (_, i) => String(currentYear + i))]
  const filterYears = ['all', ...jamb_years]

  useEffect(() => {
    const unsubStudents = listenStudents((all) => setStudents(all))
    const unsubScores = listenScores((allScores) => setScores(allScores))
    getActiveWeek().then((w) => setActiveWeekState(w))
    return () => { unsubStudents(); unsubScores() }
  }, [])

  useEffect(() => {
    const unsubQ = listenQuestions(selectedSubject, selectedWeek, (qs) => setCurrentQuestions(qs))
    getQuestionLimit(selectedSubject, selectedWeek).then(setQuestionLimit)
    return () => unsubQ()
  }, [selectedSubject, selectedWeek])

  useEffect(() => {
    getTopics(topicWeek).then((t) => { setTopicsState(t || {}); setTopicInputs(t || {}) })
  }, [topicWeek])

  const resetForm = () => {
    setForm({ question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 0, explanation: '' })
    setEditingFirestoreId(null)
    setErr('')
  }

  const handleAddOrEdit = async () => {
    if (!form.question.trim()) { setErr('Enter a question'); return }
    if (!form.optionA.trim() || !form.optionB.trim() || !form.optionC.trim() || !form.optionD.trim()) { setErr('Fill in all 4 options'); return }
    const qData = {
      question: form.question.trim(),
      options: [form.optionA.trim(), form.optionB.trim(), form.optionC.trim(), form.optionD.trim()],
      answer: parseInt(form.answer),
      explanation: form.explanation.trim(),
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
    setForm({ question: q.question, optionA: q.options[0], optionB: q.options[1], optionC: q.options[2], optionD: q.options[3], answer: q.answer, explanation: q.explanation || '' })
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

  const handleSaveLimit = async () => {
    try {
      await saveQuestionLimit(selectedSubject, selectedWeek, questionLimit)
      setSuccess('Limit saved!')
      setTimeout(() => setSuccess(''), 3000)
    } catch { alert('Failed to save limit.') }
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
  const getTotalScore = (studentId) => {
    const s = getScoresFor(studentId)
    if (!s.length) return null
    const bySubject = {}
    s.forEach((sc) => { if (!bySubject[sc.subject]) bySubject[sc.subject] = sc })
    const subjects = Object.values(bySubject)
    if (subjects.length < 4) return null
    return subjects.slice(0, 4).reduce((a, sc) => a + sc.score, 0)
  }

  const filteredStudents = yearFilter === 'all' ? students : students.filter((s) => s.year === yearFilter)

  const getYearStats = (yr) => {
    const grp = yr === 'all' ? students : students.filter((s) => s.year === yr)
    if (!grp.length) return null
    const grpScores = scores.filter((sc) => grp.find((s) => s.id === sc.studentId))
    const avg = grpScores.length ? Math.round(grpScores.reduce((a, b) => a + b.score, 0) / grpScores.length) : 0

    // Overall top performers — students who have scores in all 4 of their subjects
    const top = grp
      .map((s) => ({ name: s.name, total: getTotalScore(s.id) }))
      .filter((s) => s.total !== null)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)

    // Per-subject top performers
    const topBySubject = SUBJECTS.map((subject) => {
      const subScores = grpScores.filter((sc) => sc.subject === subject)
      if (!subScores.length) return null

      // For each student, take their best score on this subject
      const byStudent = {}
      subScores.forEach((sc) => {
        const student = grp.find((s) => s.id === sc.studentId)
        if (!student) return
        if (!byStudent[sc.studentId] || sc.score > byStudent[sc.studentId].score) {
          byStudent[sc.studentId] = { name: student.name, score: sc.score, outOf: sc.outOf || 160 }
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

  const TABS = ['students', 'stats', 'questions', 'topics']

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="max-w-2xl mx-auto px-4 pb-10">

        {/* Header */}
        <div className="flex justify-between items-center pt-8 pb-6">
          <div>
            <p className="text-[10px] font-semibold text-[#888] uppercase tracking-[0.2em] font-label mb-0.5">
              Adeola Memorial College
            </p>
            <h2 className="text-xl font-bold text-[#111] font-display">Quiz Manager</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-white bg-[#111] px-3 py-1.5 rounded-full font-label">
              {activeWeek}
            </span>
            <button
              onClick={() => setView('home')}
              className="text-xs text-[#888] hover:text-[#111] border border-[#E5E5E5] bg-white rounded-xl px-3 py-2 font-label transition-colors"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-[#EBEBEB] rounded-xl mb-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all capitalize font-label whitespace-nowrap ${
                tab === t
                  ? 'bg-white text-[#111] shadow-sm'
                  : 'text-[#999] hover:text-[#555]'
              }`}
            >
              {t === 'students' ? `Students (${students.length})` : t}
            </button>
          ))}
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
                      {/* Name row — normal or edit mode */}
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
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-[#111] font-body">{student.name}</p>
                              {student.year && (
                                <span className="text-[10px] font-bold text-white bg-[#111] px-2 py-0.5 rounded-full font-label">
                                  {student.year}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-[#AAA] font-label mt-0.5">
                              Joined {new Date(student.joinedAt).toLocaleDateString('en-NG')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 ml-2">
                            {total !== null && (
                              <p className="text-sm font-bold text-[#111] font-display mr-2">
                                {total}<span className="text-[10px] text-[#AAA] font-label">/400</span>
                              </p>
                            )}
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

                      {getScoresFor(student.id).length > 0 && (
                        <div className="border-t border-[#F3F3F2] pt-3">
                          <p className="text-[10px] text-[#AAA] font-label mb-2">Score history</p>
                          <div className="space-y-1">
                            {getScoresFor(student.id).sort((a, b) => new Date(b.date) - new Date(a.date)).map((sc, i) => (
                              <div key={i} className="flex justify-between items-center py-0.5">
                                <div>
                                  <p className="text-xs text-[#555] font-body">{sc.subject} · {sc.week}</p>
                                  <p className="text-[10px] text-[#CCC] font-label">{new Date(sc.date).toLocaleDateString('en-NG')}</p>
                                </div>
                                <div className="text-right">
                                  <span className={`text-xs font-bold font-display ${sc.score / (sc.outOf || 160) >= 0.7 ? 'text-green-600' : sc.score / (sc.outOf || 160) >= 0.5 ? 'text-yellow-600' : 'text-red-500'}`}>
                                    {sc.score}/{sc.outOf || 160}
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

            {/* Question limit */}
            <div className="bg-white border border-[#EBEBEB] rounded-xl p-4 mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-[#111] font-body">{currentQuestions.length} questions in pool</p>
                  <p className="text-[11px] text-[#AAA] font-label mt-0.5">Each student gets {Math.min(questionLimit, currentQuestions.length)} random questions</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={currentQuestions.length || 100}
                    value={questionLimit}
                    onChange={(e) => setQuestionLimit(parseInt(e.target.value) || 25)}
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

            {/* Add/Edit form */}
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
                {['A', 'B', 'C', 'D'].map((letter) => (
                  <div key={letter}>
                    <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Option {letter}</label>
                    <input
                      value={form[`option${letter}`]}
                      onChange={(e) => setForm({ ...form, [`option${letter}`]: e.target.value })}
                      placeholder={`Option ${letter}`}
                      className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111]"
                    />
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
                    className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] resize-none"
                  />
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

            {/* Question pool */}
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
                          <p className="text-xs text-[#111] font-semibold font-body mt-2 mb-3 leading-snug">{q.question}</p>
                          <div className="grid grid-cols-2 gap-1 mb-3">
                            {q.options.map((opt, oi) => (
                              <p key={oi} className={`text-xs px-2.5 py-1.5 rounded-lg font-label ${
                                oi === q.answer ? 'bg-green-100 text-green-700 font-semibold' : 'bg-[#F8F8F7] text-[#888]'
                              }`}>
                                {String.fromCharCode(65 + oi)}. {opt}{oi === q.answer && ' ✓'}
                              </p>
                            ))}
                          </div>
                          {q.explanation && (
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 mb-3">
                              <p className="text-[10px] font-bold text-blue-700 font-label mb-0.5">Explanation</p>
                              <p className="text-xs text-blue-600 font-label">{q.explanation}</p>
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
            {/* Active week control */}
            <div className="bg-[#111] text-white rounded-2xl p-5 mb-5">
              <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-0.5">
                Active Quiz Week
              </p>
              <p className="text-xs text-[#666] mb-4 font-label">
                Controls which week students quiz on.
              </p>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {WEEKS.map((w) => (
                  <button
                    key={w}
                    onClick={() => handleSetActiveWeek(w)}
                    className={`py-2.5 rounded-xl text-sm font-bold transition-all font-display ${
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

            {/* Topic week selector */}
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

            {/* Topic inputs */}
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
              <p className="text-sm font-bold text-[#111] font-display mb-1">Topics for {topicWeek}</p>
              <p className="text-xs text-[#AAA] font-label mb-4">
                Shown to students after completing their quiz as next week's revision guide.
              </p>
              <div className="space-y-3">
                {SUBJECTS.map((subject) => (
                  <div key={subject}>
                    <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">{subject}</label>
                    <input
                      value={topicInputs[subject] || ''}
                      onChange={(e) => setTopicInputs({ ...topicInputs, [subject]: e.target.value })}
                      placeholder="e.g. Vectors, Adaptation…"
                      className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111]"
                    />
                  </div>
                ))}
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

            {/* Saved topics preview */}
            {Object.keys(topics).some((k) => topics[k]) && (
              <div className="bg-[#F3F3F2] border border-[#EBEBEB] rounded-2xl p-4">
                <p className="text-xs font-bold text-[#555] font-display mb-3">Saved — {topicWeek}</p>
                <div className="space-y-2">
                  {Object.entries(topics).map(([subject, topic]) => topic ? (
                    <div key={subject} className="flex justify-between items-center">
                      <p className="text-xs text-[#555] font-body">{subject}</p>
                      <p className="text-xs font-semibold text-[#111] bg-white border border-[#E5E5E5] px-2.5 py-1 rounded-lg font-label">{topic}</p>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
