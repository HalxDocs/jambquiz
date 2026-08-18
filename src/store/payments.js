import { db, auth, collection, addDoc, getDocs, doc, onSnapshot, query, where, orderBy, limit, startAfter } from '../firebase'

async function addPayment(payment) {
  await addDoc(collection(db, 'payments'), {
    ...payment,
    createdAt: new Date().toISOString(),
  })
}

function listenPayments(callback) {
  const uid = auth.currentUser && auth.currentUser.uid
  const q = uid
    ? query(collection(db, 'payments'), where('uid', '==', uid), orderBy('paidAt', 'desc'))
    : collection(db, 'payments')
  return onSnapshot(q, (snapshot) => {
    const payments = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(payments)
  })
}

async function getPaymentsPage(search, cursorDoc, pageSize = 20) {
  let constraints = [orderBy('paidAt', 'desc'), limit(pageSize)]
  if (search) {
    constraints.push(
      where('studentName', '>=', search),
      where('studentName', '<=', search + '\uf8ff')
    )
  }
  if (cursorDoc) constraints.push(startAfter(cursorDoc))
  const q = query(collection(db, 'payments'), ...constraints)
  const snap = await getDocs(q)
  const payments = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  return {
    payments,
    lastDoc: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.docs.length === pageSize,
  }
}

export { addPayment, listenPayments, getPaymentsPage }
