import { db, collection, addDoc, getDocs, doc, updateDoc, getDoc, onSnapshot } from '../firebase'

async function addPayment(payment) {
  await addDoc(collection(db, 'payments'), {
    ...payment,
    createdAt: new Date().toISOString(),
  })
}

function listenPayments(callback) {
  return onSnapshot(collection(db, 'payments'), (snapshot) => {
    const payments = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(payments)
  })
}

async function extendSubscription(studentId, months = 1) {
  const ref = doc(db, 'students', studentId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data()
  const now = Date.now()
  const current = data.subscriptionUntil ? new Date(data.subscriptionUntil).getTime() : 0
  const anchor = Math.max(now, current)
  const next = new Date(anchor)
  next.setMonth(next.getMonth() + months)
  const iso = next.toISOString()
  await updateDoc(ref, { subscriptionUntil: iso })
  return iso
}

export { addPayment, listenPayments, extendSubscription }
