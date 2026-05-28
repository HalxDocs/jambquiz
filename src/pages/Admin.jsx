import { useState, useEffect, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserGroupIcon, Analytics01Icon, Wallet01Icon, HelpCircleIcon, Book01Icon, Notification02Icon } from '@hugeicons/core-free-icons'
import { db, getDoc, doc, httpsCallable, functions } from '../firebase'
import { SUBJECTS, WEEKS, listenQuestions, getStudentsPage, getPaymentsPage, getStudentScores, getActiveWeek, getQuestionLimit, setActiveWeek } from '../store/useStore'
import StudentManager from '../components/admin/StudentManager'
import StatsPanel from '../components/admin/StatsPanel'
import PaymentsPanel from '../components/admin/PaymentsPanel'
import QuestionForm from '../components/admin/QuestionForm'
import TopicEditor from '../components/admin/TopicEditor'
import AdminNotifications from '../components/admin/AdminNotifications'

export default function Admin({ setView }) {
  const [tab, setTab] = useState('students')

  // Student pagination
  const [students, setStudents] = useState([])
  const [studentPage, setStudentPage] = useState(0)
  const [studentHasMore, setStudentHasMore] = useState(false)
  const [studentYearFilter, setStudentYearFilter] = useState('all')
  const [studentLoading, setStudentLoading] = useState(false)
  const studentCursors = useRef([null])

  // Payment pagination
  const [payments, setPayments] = useState([])
  const [paymentPage, setPaymentPage] = useState(0)
  const [paymentHasMore, setPaymentHasMore] = useState(false)
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentLoading, setPaymentLoading] = useState(false)
  const paymentCursors = useRef([null])

  // On-demand student scores
  const [studentScoreCache, setStudentScoreCache] = useState({})

  // Admin stats
  const [adminStats, setAdminStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Questions (unchanged)
  const [currentQuestions, setCurrentQuestions] = useState([])
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0])
  const [selectedWeek, setSelectedWeek] = useState(WEEKS[0])
  const [questionLimit, setQuestionLimit] = useState(25)
  const [topics, setTopicsState] = useState({})
  const [topicInputs, setTopicInputs] = useState({})
  const [topicWeek, setTopicWeek] = useState(WEEKS[0])
  const [activeWeek, setActiveWeekState] = useState('Week 1')

  // Load students page
  useEffect(() => {
    (async () => {
      setStudentLoading(true)
      try {
        const cursor = studentCursors.current[studentPage] || null
        const yearFilter = studentYearFilter !== 'all' ? studentYearFilter : null
        const result = await getStudentsPage(yearFilter, cursor)
        setStudents(result.students)
        setStudentHasMore(result.hasMore)
        if (!studentCursors.current[studentPage + 1]) {
          studentCursors.current[studentPage + 1] = result.lastDoc
        }
      } catch { console.error('Failed to load students') }
      setStudentLoading(false)
    })()
  }, [studentPage, studentYearFilter])

  // Load payments page
  useEffect(() => {
    (async () => {
      setPaymentLoading(true)
      try {
        const cursor = paymentCursors.current[paymentPage] || null
        const result = await getPaymentsPage(paymentSearch, cursor)
        setPayments(result.payments)
        setPaymentHasMore(result.hasMore)
        if (!paymentCursors.current[paymentPage + 1]) {
          paymentCursors.current[paymentPage + 1] = result.lastDoc
        }
      } catch { console.error('Failed to load payments') }
      setPaymentLoading(false)
    })()
  }, [paymentPage, paymentSearch])

  // Load admin stats
  useEffect(() => {
    (async () => {
      setStatsLoading(true)
      try {
        const snap = await getDoc(doc(db, 'admin_stats', 'overview'))
        setAdminStats(snap.exists() ? snap.data() : null)
      } catch { console.error('Failed to load stats') }
      setStatsLoading(false)
    })()
  }, [])

  const computeStatsFn = httpsCallable(functions, 'computeAdminStats')
  const handleComputeStats = async () => {
    setStatsLoading(true)
    try {
      await computeStatsFn()
      const snap = await getDoc(doc(db, 'admin_stats', 'overview'))
      setAdminStats(snap.exists() ? snap.data() : null)
    } catch (e) { alert(e?.message || 'Failed to compute stats') }
    setStatsLoading(false)
  }

  const loadStudentScores = async (studentId) => {
    if (studentScoreCache[studentId]) return
    try {
      const scores = await getStudentScores(studentId)
      setStudentScoreCache(prev => ({ ...prev, [studentId]: scores }))
    } catch { console.error('Failed to load student scores') }
  }

  const handleStudentYearChange = (year) => {
    if (year === studentYearFilter) return
    studentCursors.current = [null]
    setStudentPage(0)
    setStudentYearFilter(year)
  }

  useEffect(() => {
    const unsubQ = listenQuestions(selectedSubject, selectedWeek, (qs) => setCurrentQuestions(qs))
    getQuestionLimit(selectedSubject, selectedWeek).then(setQuestionLimit)
    return () => unsubQ()
  }, [selectedSubject, selectedWeek])

  useEffect(() => {
    getActiveWeek().then((w) => { setActiveWeekState(w); setSelectedWeek(w) }).catch(() => {})
  }, [])

  const handleSetActiveWeek = async (week) => {
    try {
      await setActiveWeek(week)
      setActiveWeekState(week)
      setSelectedWeek(week)
    } catch (e) { alert(e?.message || 'Failed to set active week') }
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
    students: (
      <StudentManager
        students={students}
        loading={studentLoading}
        yearFilter={studentYearFilter}
        onYearFilterChange={handleStudentYearChange}
        page={studentPage}
        onPrevPage={() => setStudentPage(p => Math.max(0, p - 1))}
        onNextPage={() => { if (studentHasMore) setStudentPage(p => p + 1) }}
        hasMore={studentHasMore}
        scoreCache={studentScoreCache}
        onLoadScores={loadStudentScores}
      />
    ),
    stats: (
      <StatsPanel
        stats={adminStats}
        loading={statsLoading}
        onComputeStats={handleComputeStats}
        onRefresh={async () => { setStatsLoading(true); try { const snap = await getDoc(doc(db, 'admin_stats', 'overview')); setAdminStats(snap.exists() ? snap.data() : null) } catch { console.error('Refresh failed') }; setStatsLoading(false) }}
        onTabChange={setTab}
      />
    ),
    payments: (
      <PaymentsPanel
        payments={payments}
        loading={paymentLoading}
        search={paymentSearch}
        onSearch={(s) => { paymentCursors.current = [null]; setPaymentPage(0); setPaymentSearch(s) }}
        page={paymentPage}
        onPrevPage={() => setPaymentPage(p => Math.max(0, p - 1))}
        onNextPage={() => { if (paymentHasMore) setPaymentPage(p => p + 1) }}
        hasMore={paymentHasMore}
        stats={adminStats}
      />
    ),
    questions: (
      <QuestionForm
        questions={currentQuestions}
        selectedSubject={selectedSubject}
        selectedWeek={selectedWeek}
        onSubjectChange={setSelectedSubject}
        onWeekChange={setSelectedWeek}
        questionLimit={questionLimit}
        onSaveLimit={setQuestionLimit}
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
                <span className="text-[9px] font-bold font-label tracking-wide">{t.label}</span>
              </button>
            )
          })}
        </div>

        {TAB_COMPONENTS[tab]}

      </div>
    </div>
  )
}
