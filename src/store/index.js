export {
  SUBJECTS,
  WEEKS,
  SUBSCRIPTION_PRICE_NGN,
  LIFELINES_ENABLED,
  LIFELINES_START_WEEK_NUM,
  isLifelinesEnabled,
  RANK_TIERS,
} from './constants'

export { load, save } from './db'

export { normalizeTopic, setTopics, getTopics, listenTopics } from './topics'

export { LIFELINE_COST, LIFELINE_USES_PER_TEST, getCoinBalance, listCoinPacks, shareResult, updateSquad, useLifeline, peekStatus, createCoinsCheckout } from './coins'

export { sanitizeGoat, weekGoatDocId, listGoats, createGoat, updateGoat, deleteGoat, getWeekGoats, setWeekGoats } from './goats'

export { FREE_TRIAL_ATTEMPTS, FREE_TRIAL_DAYS, isTrialActive, trialDaysLeft, getAccessStatus, registerStudent, getStudentByUid, getStudentById, getStudentProfile, changePassword, verifyAdminSession, updateStudent, deleteStudent, listenStudents, getStudentsPage, getStudentsCount, stripSensitive, stripPersisted, incrementFreeAttempts, consumeFreeAttempt, studentAuthEmail, ADMIN_EMAIL, linkStudentUid } from './students'

export { startQuiz, submitQuiz, listenScores, getStudentScores, getStudentScoresAdmin, fetchDetails } from './scores'

export {
  addQuestion,
  editQuestion,
  deleteQuestion,
  getQuestions,
  getQuestionsWithAnswers,
  listenQuestions,
  copyQuestionsToWeek,
  saveQuestionLimit,
  getQuestionLimit,
  defaultQuestionLimit,
} from './questions'

export { setActiveWeek, getActiveWeek, listenActiveWeek, setQuizDates, getQuizDates, listenQuizDates, isStandardWindowDate, isBonusQuiz } from './settings'

export { addPayment, listenPayments, getPaymentsPage } from './payments'

export { getConsistencyRank } from './ranks'

export { logEvent } from './analytics'

export { registerTeacher, teacherSignIn, getTeacherByUid, teacherUpdateDetails, teacherUpdatePhone, getTeacherDashboard, adminGetTeachers, adminDeleteTeacher, makePioneer, removePioneer, getPioneerDashboard } from './teachers'
