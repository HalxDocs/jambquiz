import { useState, useEffect } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserGroupIcon, Analytics01Icon, Wallet01Icon, HelpCircleIcon, Book01Icon, Notification02Icon } from '@hugeicons/core-free-icons'
import { SUBJECTS, WEEKS, listenQuestions, listenScores, listenStudents, getActiveWeek, getQuestionLimit, setActiveWeek, listenPayments, getQuizDates } from '../store/useStore'
import StudentManager from '../components/admin/StudentManager'
import StatsPanel from '../components/admin/StatsPanel'
import PaymentsPanel from '../components/admin/PaymentsPanel'
import QuestionForm from '../components/admin/QuestionForm'
import TopicEditor from '../components/admin/TopicEditor'
import AdminNotifications from '../components/admin/AdminNotifications'

export default function Admin({ setView }) {
  const [tab, setTab] = useState('students')
  const [students, setStudents] = useState([])
  const [scores, setScores] = useState([])
  const [currentQuestions, setCurrentQuestions] = useState([])
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0])
  const [selectedWeek, setSelectedWeek] = useState(WEEKS[0])
  const [questionLimit, setQuestionLimit] = useState(25)
  const [topics, setTopicsState] = useState({})
  const [topicInputs, setTopicInputs] = useState({})
  const [topicWeek, setTopicWeek] = useState(WEEKS[0])
  const [activeWeek, setActiveWeekState] = useState('Week 1')
  const [payments, setPayments] = useState([])
  const [quizDate1, setQuizDate1] = useState('')
  const [quizDate2, setQuizDate2] = useState('')

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

  const handleSetActiveWeek = async (week) => {
    try {
      await setActiveWeek(week)
      setActiveWeekState(week)
    } catch { alert('Failed.') }
  }

  const TABS = [
    { key: 'students',  icon: UserGroupIcon,    label: 'Students' },
    { key: 'stats',     icon: Analytics01Icon,  label: 'Stats' },
    { key: 'payments',  icon: Wallet01Icon,     label: 'Payments' },
    { key: 'questions', icon: HelpCircleIcon,   label: 'Questions' },
    { key: 'topics',    icon: Book01Icon,       label: 'Topics' },
    { key: 'notifications', icon: Notification02Icon, label: 'Notifications' },
  ]

  const TAB_COMPONENTS = {
    students: <StudentManager students={students} scores={scores} />,
    stats: <StatsPanel students={students} scores={scores} payments={payments} onTabChange={setTab} />,
    payments: <PaymentsPanel payments={payments} students={students} />,
    questions: (
      <QuestionForm
        questions={currentQuestions}
        selectedSubject={selectedSubject}
        selectedWeek={selectedWeek}
        onSubjectChange={setSelectedSubject}
        onWeekChange={setSelectedWeek}
        questionLimit={questionLimit}
        onSaveLimit={setQuestionLimit}
        quizDate1={quizDate1}
        quizDate2={quizDate2}
        onSetQuizDates={(d1, d2) => { setQuizDate1(d1); setQuizDate2(d2) }}
      />
    ),
    topics: (
      <TopicEditor
        activeWeek={activeWeek}
        onSetActiveWeek={handleSetActiveWeek}
        topicWeek={topicWeek}
        onTopicWeekChange={setTopicWeek}
        topicInputs={topicInputs}
        onSetTopicInputs={setTopicInputs}
        topics={topics}
        onSetTopics={setTopicsState}
      />
    ),
    notifications: <AdminNotifications />,
  }

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

        {TAB_COMPONENTS[tab]}

      </div>
    </div>
  )
}
