import { db, collection, addDoc, getDocs, doc, updateDoc, onSnapshot } from '../../firebase'

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
  const snap = await getDocs(collection(db, 'students'))
  const found = snap.docs.find((d) => d.id === studentId)
  if (!found) return null
  const data = found.data()
  const now = Date.now()
  const current = data.subscriptionUntil ? new Date(data.subscriptionUntil).getTime() : 0
  const anchor = Math.max(now, current)
  const next = new Date(anchor)
  next.setMonth(next.getMonth() + months)
  const iso = next.toISOString()
  await updateDoc(doc(db, 'students', studentId), { subscriptionUntil: iso })
  return iso
}

export { addPayment, listenPayments, extendSubscription }
