import { useState, useEffect } from 'react'
import { SUBJECTS, WEEKS, addQuestion, editQuestion, deleteQuestion, listenQuestions, listenScores, listenStudents, setTopics, getTopics, saveQuestionLimit, getQuestionLimit, setActiveWeek, getActiveWeek } from '../store/useStore'

export default function Admin({ setView }) {
  const [tab, setTab] = useState('students')
  const [students, setStudents] = useState([])
  const [scores, setScores] = useState([])
  const [currentQuestions, setCurrentQuestions] = useState([])
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0])
  const [selectedWeek, setSelectedWeek] = useState(WEEKS[0])
  const [form, setForm] = useState({
    question: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    answer: 0,
    explanation: '',
  })
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
    const unsubQ = listenQuestions(selectedSubject, selectedWeek, (qs) => {
      setCurrentQuestions(qs)
    })
    getQuestionLimit(selectedSubject, selectedWeek).then(setQuestionLimit)
    return () => unsubQ()
  }, [selectedSubject, selectedWeek])

  useEffect(() => {
    getTopics(topicWeek).then((t) => {
      setTopicsState(t || {})
      setTopicInputs(t || {})
    })
  }, [topicWeek])

  const resetForm = () => {
    setForm({ question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 0, explanation: '' })
    setEditingFirestoreId(null)
    setErr('')
  }

  const handleAddOrEdit = async () => {
    if (!form.question.trim()) { setErr('Enter a question'); return }
    if (!form.optionA.trim() || !form.optionB.trim() || !form.optionC.trim() || !form.optionD.trim()) {
      setErr('Fill in all 4 options'); return
    }
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
      console.error('Add/Edit error:', e)
      setErr('Failed. Check your connection.')
    }
  }

  const handleEdit = (q) => {
    setForm({
      question: q.question,
      optionA: q.options[0],
      optionB: q.options[1],
      optionC: q.options[2],
      optionD: q.options[3],
      answer: q.answer,
      explanation: q.explanation || '',
    })
    setEditingFirestoreId(q.firestoreId)
    setExpandedQuestion(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (firestoreId) => {
    if (!window.confirm('Delete this question?')) return
    try {
      await deleteQuestion(firestoreId)
      setSuccess('Question deleted!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      console.error('Delete error:', e)
      alert('Failed to delete. Check your connection.')
    }
  }

  const handleSaveTopics = async () => {
    try {
      await setTopics(topicWeek, topicInputs)
      setTopicsState(topicInputs)
      setTopicSuccess('Topics saved!')
      setTimeout(() => setTopicSuccess(''), 3000)
    } catch (e) {
      alert('Failed to save topics.')
    }
  }

  const handleSaveLimit = async () => {
    try {
      await saveQuestionLimit(selectedSubject, selectedWeek, questionLimit)
      setSuccess('Question limit saved!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      alert('Failed to save limit.')
    }
  }

  const handleSetActiveWeek = async (week) => {
    try {
      await setActiveWeek(week)
      setActiveWeekState(week)
      setSuccess(`Active week set to ${week}!`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      alert('Failed to set active week.')
    }
  }

  const getScoresFor = (studentId) => scores.filter((s) => s.studentId === studentId)

  const getAverage = (studentId) => {
    const s = getScoresFor(studentId)
    if (!s.length) return 0
    return Math.round(s.reduce((a, b) => a + b.score, 0) / s.length)
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

  const filteredStudents = yearFilter === 'all'
    ? students
    : students.filter((s) => s.year === yearFilter)

  const getYearStats = (yr) => {
    const grp = yr === 'all' ? students : students.filter((s) => s.year === yr)
    if (!grp.length) return null
    const grpScores = scores.filter((sc) => grp.find((s) => s.id === sc.studentId))
    const avg = grpScores.length
      ? Math.round(grpScores.reduce((a, b) => a + b.score, 0) / grpScores.length)
      : 0
    const top = grp
      .map((s) => ({ name: s.name, total: getTotalScore(s.id) }))
      .filter((s) => s.total !== null)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
    return { count: grp.length, attempts: grpScores.length, avg, top }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">

        <div className="flex justify-between items-center py-6">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest">Adeola Memorial College</p>
            <h2 className="text-xl font-bold text-gray-900">JAMB Quiz Manager</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-medium">
              Active: {activeWeek}
            </span>
            <button
              onClick={() => setView('home')}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-2"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
          {['students', 'stats', 'questions', 'topics'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 pb-3 text-sm font-medium transition-colors capitalize whitespace-nowrap px-2 ${
                tab === t
                  ? 'border-b-2 border-gray-900 text-gray-900'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'students' ? `Students (${students.length})` : t}
            </button>
          ))}
        </div>

        {tab === 'students' && (
          <div>
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {filterYears.map((y) => (
                <button
                  key={y}
                  onClick={() => setYearFilter(y)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    yearFilter === y
                      ? 'bg-gray-900 text-white'
                      : 'bg-white border border-gray-200 text-gray-600'
                  }`}
                >
                  {y === 'all'
                    ? `All (${students.length})`
                    : `${y} (${students.filter(s => s.year === y).length})`}
                </button>
              ))}
            </div>

            {filteredStudents.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
                <p className="text-gray-400 text-sm">No students found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStudents.map((student) => {
                  const avg = getAverage(student.id)
                  const total = getTotalScore(student.id)
                  const attempts = getScoresFor(student.id).length
                  return (
                    <div key={student.id} className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-gray-900">{student.name}</p>
                            {student.year && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg">{student.year}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Joined {new Date(student.joinedAt).toLocaleDateString('en-NG')}
                          </p>
                        </div>
                        <div className="text-right">
                          {total !== null && (
                            <p className="text-sm font-bold text-gray-900">{total}<span className="text-xs text-gray-400">/400</span></p>
                          )}
                          <p className={`text-xs font-semibold ${avg >= 70 ? 'text-green-600' : avg >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                            avg {avg}
                          </p>
                          <p className="text-xs text-gray-400">{attempts} attempt{attempts !== 1 ? 's' : ''}</p>
                        </div>
                      </div>

                      {student.subjects?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {student.subjects.map((s) => (
                            <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">{s}</span>
                          ))}
                        </div>
                      )}

                      {getScoresFor(student.id).length > 0 && (
                        <div className="border-t border-gray-100 pt-3">
                          <p className="text-xs text-gray-400 mb-2">All scores</p>
                          <div className="space-y-1">
                            {getScoresFor(student.id)
                              .sort((a, b) => new Date(b.date) - new Date(a.date))
                              .map((sc, i) => (
                                <div key={i} className="flex justify-between items-center py-0.5">
                                  <div>
                                    <p className="text-xs text-gray-600">{sc.subject} · {sc.week}</p>
                                    <p className="text-xs text-gray-400">{new Date(sc.date).toLocaleDateString('en-NG')}</p>
                                  </div>
                                  <div className="text-right">
                                    <span className={`text-xs font-semibold ${sc.score >= 70 ? 'text-green-600' : sc.score >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                                      {sc.score}/{sc.outOf || 160}
                                    </span>
                                    <p className="text-xs text-gray-400">{sc.correct}✓ {sc.wrong || 0}✗ {sc.unanswered || 0}–</p>
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

        {tab === 'stats' && (
          <div>
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
              {filterYears.map((y) => (
                <button
                  key={y}
                  onClick={() => setStatsYear(y)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    statsYear === y
                      ? 'bg-gray-900 text-white'
                      : 'bg-white border border-gray-200 text-gray-600'
                  }`}
                >
                  {y === 'all' ? 'All Years' : y}
                </button>
              ))}
            </div>

            {(() => {
              const stats = getYearStats(statsYear)
              if (!stats) return (
                <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
                  <p className="text-gray-400 text-sm">No data for this year yet</p>
                </div>
              )
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-gray-900">{stats.count}</p>
                      <p className="text-xs text-gray-400 mt-1">Students</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-blue-600">{stats.attempts}</p>
                      <p className="text-xs text-gray-400 mt-1">Total Attempts</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                      <p className={`text-2xl font-bold ${stats.avg >= 70 ? 'text-green-600' : stats.avg >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {stats.avg}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Avg Score</p>
                    </div>
                  </div>

                  {stats.top.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-5">
                      <p className="text-sm font-semibold text-gray-900 mb-3">
                        🏆 Top Performers {statsYear !== 'all' ? `— JAMB ${statsYear}` : ''}
                      </p>
                      <div className="space-y-2">
                        {stats.top.map((s, i) => (
                          <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                            <div className="flex items-center gap-3">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                i === 0 ? 'bg-yellow-100 text-yellow-700' :
                                i === 1 ? 'bg-gray-100 text-gray-600' :
                                'bg-orange-100 text-orange-600'
                              }`}>
                                {i + 1}
                              </span>
                              <p className="text-sm font-medium text-gray-900">{s.name}</p>
                            </div>
                            <p className="text-sm font-bold text-gray-900">{s.total}<span className="text-xs text-gray-400">/400</span></p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white border border-gray-200 rounded-2xl p-5">
                    <p className="text-sm font-semibold text-gray-900 mb-3">
                      Performance by Subject {statsYear !== 'all' ? `— JAMB ${statsYear}` : ''}
                    </p>
                    <div className="space-y-3">
                      {SUBJECTS.map((subject) => {
                        const grp = statsYear === 'all' ? students : students.filter((s) => s.year === statsYear)
                        const subScores = scores.filter((sc) =>
                          sc.subject === subject && grp.find((s) => s.id === sc.studentId)
                        )
                        if (!subScores.length) return null
                        const subAvg = Math.round(subScores.reduce((a, b) => a + b.score, 0) / subScores.length)
                        const subMax = subScores[0]?.outOf || 160
                        const pct = Math.round((subAvg / subMax) * 100)
                        return (
                          <div key={subject}>
                            <div className="flex justify-between items-center mb-1">
                              <p className="text-xs text-gray-700 font-medium">{subject}</p>
                              <p className="text-xs text-gray-500">{subAvg}/{subMax} avg · {subScores.length} attempts</p>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-400'}`}
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

        {tab === 'questions' && (
          <div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Subject</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => { setSelectedSubject(e.target.value); resetForm() }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 bg-white"
                >
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Week</label>
                <select
                  value={selectedWeek}
                  onChange={(e) => { setSelectedWeek(e.target.value); resetForm() }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 bg-white"
                >
                  {WEEKS.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-blue-700 font-medium">Pool: {currentQuestions.length} questions</p>
                  <p className="text-xs text-blue-500 mt-0.5">Each student gets {Math.min(questionLimit, currentQuestions.length)} random questions</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={currentQuestions.length || 100}
                    value={questionLimit}
                    onChange={(e) => setQuestionLimit(parseInt(e.target.value) || 25)}
                    className="w-14 border border-blue-200 rounded-lg px-2 py-1 text-xs text-center bg-white focus:outline-none"
                  />
                  <button
                    onClick={handleSaveLimit}
                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
              <p className="text-sm font-semibold text-gray-900 mb-4">
                {editingFirestoreId ? '✏️ Edit Question' : 'Add Question'} — {selectedSubject} · {selectedWeek}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Question</label>
                  <textarea
                    value={form.question}
                    onChange={(e) => setForm({ ...form, question: e.target.value })}
                    placeholder="Type the question here..."
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 resize-none"
                  />
                </div>
                {['A', 'B', 'C', 'D'].map((letter) => (
                  <div key={letter}>
                    <label className="text-xs text-gray-500 block mb-1">Option {letter}</label>
                    <input
                      value={form[`option${letter}`]}
                      onChange={(e) => setForm({ ...form, [`option${letter}`]: e.target.value })}
                      placeholder={`Option ${letter}`}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Correct Answer</label>
                  <select
                    value={form.answer}
                    onChange={(e) => setForm({ ...form, answer: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 bg-white"
                  >
                    <option value={0}>Option A</option>
                    <option value={1}>Option B</option>
                    <option value={2}>Option C</option>
                    <option value={3}>Option D</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Explanation / Solution <span className="text-gray-400">(optional)</span></label>
                  <textarea
                    value={form.explanation}
                    onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                    placeholder="Explain why this answer is correct..."
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 resize-none"
                  />
                </div>
              </div>

              {err && <p className="text-red-500 text-xs mt-3">{err}</p>}
              {success && <p className="text-green-600 text-xs mt-3">{success}</p>}

              <div className="flex gap-3 mt-4">
                {editingFirestoreId && (
                  <button
                    onClick={resetForm}
                    className="flex-1 border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleAddOrEdit}
                  className="flex-1 bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors"
                >
                  {editingFirestoreId ? 'Save Changes' : 'Add Question'}
                </button>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm font-semibold text-gray-900">Question Pool</p>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                  {currentQuestions.length} total
                </span>
              </div>
              {currentQuestions.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">
                  No questions for {selectedSubject} · {selectedWeek}
                </p>
              ) : (
                <div className="space-y-2">
                  {currentQuestions.map((q, i) => (
                    <div key={q.firestoreId} className="border border-gray-100 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedQuestion(expandedQuestion === q.firestoreId ? null : q.firestoreId)}
                        className="w-full flex justify-between items-center p-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <p className="text-sm text-gray-900 font-medium flex-1 pr-2">
                          {i + 1}. {q.question.length > 60 ? q.question.slice(0, 60) + '...' : q.question}
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-lg">
                            {String.fromCharCode(65 + q.answer)}
                          </span>
                          {q.explanation && (
                            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-lg">exp</span>
                          )}
                          <span className="text-gray-400 text-xs">{expandedQuestion === q.firestoreId ? '▲' : '▼'}</span>
                        </div>
                      </button>

                      {expandedQuestion === q.firestoreId && (
                        <div className="px-3 pb-3 border-t border-gray-100">
                          <p className="text-sm text-gray-900 font-medium mt-2 mb-3">{q.question}</p>
                          <div className="grid grid-cols-2 gap-1 mb-3">
                            {q.options.map((opt, oi) => (
                              <p key={oi} className={`text-xs px-2 py-1.5 rounded-lg ${
                                oi === q.answer
                                  ? 'bg-green-100 text-green-700 font-semibold'
                                  : 'bg-gray-50 text-gray-500'
                              }`}>
                                {String.fromCharCode(65 + oi)}. {opt}
                                {oi === q.answer && ' ✓'}
                              </p>
                            ))}
                          </div>
                          {q.explanation && (
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3">
                              <p className="text-xs text-blue-700 font-medium mb-1">Explanation</p>
                              <p className="text-xs text-blue-600">{q.explanation}</p>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(q)}
                              className="flex-1 text-blue-600 text-xs border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDelete(q.firestoreId)}
                              className="flex-1 text-red-500 text-xs border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
                            >
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

        {tab === 'topics' && (
          <div>
            <div className="bg-gray-900 text-white rounded-2xl p-5 mb-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Active Quiz Week</p>
              <p className="text-sm text-gray-300 mb-4">
                Controls which week students see when they take the quiz.
              </p>
              <div className="grid grid-cols-4 gap-2">
                {WEEKS.map((w) => (
                  <button
                    key={w}
                    onClick={() => handleSetActiveWeek(w)}
                    className={`py-2 rounded-xl text-sm font-semibold transition-colors ${
                      activeWeek === w
                        ? 'bg-white text-gray-900'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Currently active: <span className="text-white font-semibold">{activeWeek}</span>
              </p>
              {success && <p className="text-green-400 text-xs mt-2">{success}</p>}
            </div>

            <div className="mb-5">
              <label className="text-xs text-gray-500 block mb-1">Select Week for Topics</label>
              <select
                value={topicWeek}
                onChange={(e) => setTopicWeek(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 bg-white"
              >
                {WEEKS.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
              <p className="text-sm font-semibold text-gray-900 mb-1">Topics for {topicWeek}</p>
              <p className="text-xs text-gray-400 mb-4">
                Students will see these after completing their quiz as next week's topics to revise.
              </p>
              <div className="space-y-3">
                {SUBJECTS.map((subject) => (
                  <div key={subject}>
                    <label className="text-xs text-gray-500 block mb-1">{subject}</label>
                    <input
                      value={topicInputs[subject] || ''}
                      onChange={(e) => setTopicInputs({ ...topicInputs, [subject]: e.target.value })}
                      placeholder="e.g. Vectors, Adaptation..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                    />
                  </div>
                ))}
              </div>
              {topicSuccess && <p className="text-green-600 text-xs mt-3">{topicSuccess}</p>}
              <button
                onClick={handleSaveTopics}
                className="w-full mt-4 bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors"
              >
                Save Topics for {topicWeek}
              </button>
            </div>

            {Object.keys(topics).length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <p className="text-sm font-semibold text-blue-900 mb-3">Saved Topics — {topicWeek}</p>
                <div className="space-y-2">
                  {Object.entries(topics).map(([subject, topic]) => topic ? (
                    <div key={subject} className="flex justify-between items-center">
                      <p className="text-xs text-blue-700 font-medium">{subject}</p>
                      <p className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-lg">{topic}</p>
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