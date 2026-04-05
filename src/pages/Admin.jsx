import { useState, useEffect } from 'react'
import { SUBJECTS, WEEKS, load, addQuestion, deleteQuestion, listenQuestions, listenScores, setTopics, getTopics } from '../store/useStore'

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
  })
  const [topics, setTopicsState] = useState({})
  const [topicInputs, setTopicInputs] = useState({})
  const [topicWeek, setTopicWeek] = useState(WEEKS[0])
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [topicSuccess, setTopicSuccess] = useState('')

  useEffect(() => {
    setStudents(load('jamb_students', []))
    const unsubScores = listenScores((allScores) => setScores(allScores))
    return () => unsubScores()
  }, [])

  useEffect(() => {
    const unsubQ = listenQuestions(selectedSubject, selectedWeek, (qs) => {
      setCurrentQuestions(qs)
    })
    return () => unsubQ()
  }, [selectedSubject, selectedWeek])

  useEffect(() => {
    getTopics(topicWeek).then((t) => {
      setTopicsState(t || {})
      setTopicInputs(t || {})
    })
  }, [topicWeek])

  const handleAddQuestion = async () => {
    if (!form.question.trim()) { setErr('Enter a question'); return }
    if (!form.optionA.trim() || !form.optionB.trim() || !form.optionC.trim() || !form.optionD.trim()) {
      setErr('Fill in all 4 options')
      return
    }
    const newQ = {
      id: Date.now(),
      question: form.question.trim(),
      options: [form.optionA.trim(), form.optionB.trim(), form.optionC.trim(), form.optionD.trim()],
      answer: parseInt(form.answer),
    }
    try {
      await addQuestion(selectedSubject, selectedWeek, newQ)
      setForm({ question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 0 })
      setErr('')
      setSuccess('Question added!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      setErr('Failed to add question. Check your connection.')
    }
  }

  const handleDeleteQuestion = async (qId) => {
    try {
      await deleteQuestion(qId)
    } catch (e) {
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
      alert('Failed to save topics. Check your connection.')
    }
  }

  const getStudentScores = (studentId) => scores.filter((s) => s.studentId === studentId)

  const getAverage = (studentId) => {
    const s = getStudentScores(studentId)
    if (!s.length) return 0
    return Math.round(s.reduce((a, b) => a + b.score, 0) / s.length)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">

        <div className="flex justify-between items-center py-6">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest">Admin Panel</p>
            <h2 className="text-xl font-bold text-gray-900">JAMB Quiz Manager</h2>
          </div>
          <button
            onClick={() => setView('home')}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-2"
          >
            Logout
          </button>
        </div>

        <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
          {['students', 'questions', 'topics'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 pb-3 text-sm font-medium transition-colors capitalize whitespace-nowrap px-2 ${
                tab === t
                  ? 'border-b-2 border-gray-900 text-gray-900'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'students' ? `Students (${students.length})` : t === 'questions' ? 'Questions' : 'Topics'}
            </button>
          ))}
        </div>

        {tab === 'students' && (
          <div>
            {students.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
                <p className="text-gray-400 text-sm">No students registered yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {students.map((student) => {
                  const avg = getAverage(student.id)
                  const attempts = getStudentScores(student.id).length
                  return (
                    <div key={student.id} className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-sm font-bold text-gray-900">{student.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Joined {new Date(student.joinedAt).toLocaleDateString('en-NG')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-bold ${
                            avg >= 70 ? 'text-green-600' : avg >= 50 ? 'text-yellow-600' : 'text-red-500'
                          }`}>
                            {avg}
                          </p>
                          <p className="text-xs text-gray-400">{attempts} attempt{attempts !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      {student.subjects?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {student.subjects.map((s) => (
                            <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                      {getStudentScores(student.id).length > 0 && (
                        <div className="border-t border-gray-100 pt-3">
                          <p className="text-xs text-gray-400 mb-2">Recent scores</p>
                          <div className="space-y-1">
                            {getStudentScores(student.id).slice(-3).reverse().map((sc, i) => (
                              <div key={i} className="flex justify-between items-center">
                                <p className="text-xs text-gray-600">{sc.subject} · {sc.week}</p>
                                <span className={`text-xs font-semibold ${
                                  sc.score >= 70 ? 'text-green-600' : sc.score >= 50 ? 'text-yellow-600' : 'text-red-500'
                                }`}>
                                  {sc.score}/{sc.outOf || 160}
                                </span>
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

        {tab === 'questions' && (
          <div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Subject</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 bg-white"
                >
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Week</label>
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 bg-white"
                >
                  {WEEKS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
              <p className="text-sm font-semibold text-gray-900 mb-4">
                Add Question — {selectedSubject} · {selectedWeek}
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
              </div>
              {err && <p className="text-red-500 text-xs mt-3">{err}</p>}
              {success && <p className="text-green-600 text-xs mt-3">{success}</p>}
              <button
                onClick={handleAddQuestion}
                className="w-full mt-4 bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors"
              >
                Add Question
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm font-semibold text-gray-900">Existing Questions</p>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                  {currentQuestions.length} questions
                </span>
              </div>
              {currentQuestions.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">
                  No questions for {selectedSubject} · {selectedWeek}
                </p>
              ) : (
                <div className="space-y-3">
                  {currentQuestions.map((q, i) => (
                    <div key={q.id} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-sm text-gray-900 font-medium flex-1">
                          {i + 1}. {q.question}
                        </p>
                        <button
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="text-red-400 hover:text-red-600 text-xs shrink-0"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1">
                        {q.options.map((opt, oi) => (
                          <p
                            key={oi}
                            className={`text-xs px-2 py-1 rounded-lg ${
                              oi === q.answer
                                ? 'bg-green-100 text-green-700 font-semibold'
                                : 'bg-gray-50 text-gray-500'
                            }`}
                          >
                            {String.fromCharCode(65 + oi)}. {opt}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'topics' && (
          <div>
            <div className="mb-5">
              <label className="text-xs text-gray-500 block mb-1">Select Week</label>
              <select
                value={topicWeek}
                onChange={(e) => setTopicWeek(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 bg-white"
              >
                {WEEKS.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
              <p className="text-sm font-semibold text-gray-900 mb-1">
                Topics for {topicWeek}
              </p>
              <p className="text-xs text-gray-400 mb-4">
                Enter the topic for each subject. Students will see these after completing their quiz.
              </p>
              <div className="space-y-3">
                {SUBJECTS.map((subject) => (
                  <div key={subject}>
                    <label className="text-xs text-gray-500 block mb-1">{subject}</label>
                    <input
                      value={topicInputs[subject] || ''}
                      onChange={(e) =>
                        setTopicInputs({ ...topicInputs, [subject]: e.target.value })
                      }
                      placeholder={`e.g. Vectors, Adaptation...`}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                    />
                  </div>
                ))}
              </div>
              {topicSuccess && (
                <p className="text-green-600 text-xs mt-3">{topicSuccess}</p>
              )}
              <button
                onClick={handleSaveTopics}
                className="w-full mt-4 bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors"
              >
                Save Topics for {topicWeek}
              </button>
            </div>

            {Object.keys(topics).length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <p className="text-sm font-semibold text-blue-900 mb-3">Current Topics — {topicWeek}</p>
                <div className="space-y-2">
                  {Object.entries(topics).map(([subject, topic]) => (
                    <div key={subject} className="flex justify-between items-center">
                      <p className="text-xs text-blue-700 font-medium">{subject}</p>
                      <p className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-lg">{topic}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}