// Analytics store — Go backend.
import { apiPost } from '../lib/api'

export async function logEvent(studentId, eventType, metadata = {}) {
  try {
    await apiPost('/api/analytics/log', { studentId, eventType, meta: metadata || {} })
  } catch {
    console.error('analytics: failed to log', eventType)
  }
}
