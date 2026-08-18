import { db, collection, query, where, getDocs, signInWithEmailAndPassword, functions, httpsCallable, auth } from '../firebase'

// Teacher accounts mirror the student pattern: students enter a teacher's phone
// as their accountability partner (`students.teacherPhone`), and the teacher
// dashboard shows those students with monthly test counts + scores. Teachers
// sign up with name + email + phone (SMS OTP) and later add bank details for
// payout. All teacher docs are written server-side and read back by the
// caller's Firebase UID.
export async function sendTeacherOtp(phone) {
  const res = await httpsCallable(functions, 'sendTeacherOtp')({ phone })
  return res.data
}

export async function registerTeacher(data) {
  const res = await httpsCallable(functions, 'registerTeacher')(data)
  return res.data
}

export async function teacherSignIn(email, password) {
  await signInWithEmailAndPassword(auth, email, password)
  try { await auth.currentUser.getIdToken(true) } catch {}
}

export async function getTeacherByUid(uid) {
  if (!uid) return null
  const snap = await getDocs(query(collection(db, 'teachers'), where('uid', '==', uid)))
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

export async function teacherUpdateDetails({ accountNumber, bankName }) {
  const res = await httpsCallable(functions, 'teacherUpdateDetails')({ accountNumber, bankName })
  return res.data
}

export async function getTeacherDashboard() {
  const res = await httpsCallable(functions, 'getTeacherDashboard')()
  return res.data
}

export async function adminGetTeachers() {
  const res = await httpsCallable(functions, 'adminTeacherDashboard')()
  return res.data
}