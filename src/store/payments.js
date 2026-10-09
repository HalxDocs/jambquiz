// Payments store — Go backend.
import { apiGet } from '../lib/api'

async function addPayment() {
  // Payments are written server-side on fulfillment; no client writes.
}

function listenPayments(callback, studentId) {
  let stopped = false
  const poll = async () => {
    if (stopped) return
    try {
      const q = studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''
      const res = await apiGet(`/api/payments${q}`)
      if (!stopped) callback(res.payments || [])
    } catch { /* offline — retry on next poll */ }
    if (!stopped) setTimeout(poll, 20000)
  }
  poll()
  return () => { stopped = true }
}

async function getPaymentsPage(search, cursorDoc, pageSize = 20) {
  const page = typeof cursorDoc === 'number' ? cursorDoc : 1
  const res = await apiGet(`/api/admin/payments?search=${encodeURIComponent(search || '')}&page=${page}&pageSize=${pageSize}`)
  const payments = res.payments || []
  const total = res.total || 0
  return {
    payments,
    lastDoc: total > page * pageSize ? page + 1 : null,
    hasMore: total > page * pageSize,
  }
}

export { addPayment, listenPayments, getPaymentsPage }
