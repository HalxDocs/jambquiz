export {
  SUBJECTS,
  WEEKS,
  SUBSCRIPTION_PRICE_NGN,
  RANK_TIERS,
} from './constants'

export { db, load, save } from './db'

export { normalizeTopic, setTopics, getTopics, listenTopics } from './topics'

export { getAccessStatus, registerStudent, getStudentByUid, getStudentById, changePassword, verifyAdminSession, updateStudent, deleteStudent, listenStudents, getStudentsPage, getStudentsCount, stripSensitive, stripPersisted, incrementFreeAttempts, studentAuthEmail, ADMIN_EMAIL } from './students'

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

export { setActiveWeek, getActiveWeek, listenActiveWeek, setQuizDates, getQuizDates, listenQuizDates } from './settings'

export { addPayment, listenPayments, getPaymentsPage } from './payments'

export { getConsistencyRank } from './ranks'

export { logEvent } from './analytics'

export { sendTeacherOtp, registerTeacher, teacherSignIn, getTeacherByUid, teacherUpdateDetails, getTeacherDashboard, adminGetTeachers } from './teachers'
