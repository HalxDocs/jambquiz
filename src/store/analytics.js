import { db, collection, addDoc } from '../firebase'

export async function logEvent(studentId, eventType, metadata = {}) {
  try {
    await addDoc(collection(db, 'usage_logs'), {
      studentId,
      eventType,
      metadata,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
    })
  } catch {
    console.error('analytics: failed to log', eventType)
  }
}
