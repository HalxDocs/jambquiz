// src/services/notificationScheduler.js
import { getTopics, normalizeTopic } from '../store/useStore'
import { useAdminNotificationStore, useUserNotificationStore } from '../store/notificationStore'
import { saveNotificationStateToFirestore } from './pushNotifications'

const NOTIFICATION_INTERVAL_MS = 2 * 60 * 60 * 1000 // 2 hours
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours (daily)
const MAX_TIMES_PER_POINT = 3
const MIN_INTERVAL_BETWEEN_NOTIFICATIONS = 30 * 60 * 1000 // 30 min

class NotificationScheduler {
  constructor() {
    this.intervalId = null
    this.currentWeek = null
    this.studentId = null
    this.subscribers = []
  }

  /**
   * Start the notification scheduler
   */
  start(week, studentSubjects, scores, studentId) {
    this.stop()
    this.currentWeek = week
    this.studentId = studentId

    // Do initial check immediately
    this.evaluateAndNotify(week, studentSubjects, scores).catch(() => {})

    // Determine interval: daily if patches active, 2-hour otherwise
    const userState = useUserNotificationStore.getState()
    const interval = userState.patchesActive ? DAILY_INTERVAL_MS : NOTIFICATION_INTERVAL_MS

    this.intervalId = setInterval(() => {
      const s = useUserNotificationStore.getState()
      const currentSubjects = this.studentId ? (s.subjects || studentSubjects) : studentSubjects
      const currentScores = s.scores || scores
      this.evaluateAndNotify(this.currentWeek, currentSubjects, currentScores).catch(() => {})
    }, interval)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * Subscribe to notification events (for in-app display)
   */
  onNotification(callback) {
    this.subscribers.push(callback)
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback)
    }
  }

  /**
   * Main evaluation — decides if and what to notify
   */
  async evaluateAndNotify(week, studentSubjects, scores) {
    // 1. Check admin master switch
    const adminState = useAdminNotificationStore.getState()
    if (!adminState.enabled) {
      console.log('[Scheduler] Notifications disabled by admin')
      return
    }

    // 2. Check minimum interval between notifications
    const userState = useUserNotificationStore.getState()
    if (userState.lastNotifiedAt) {
      const elapsed = Date.now() - userState.lastNotifiedAt
      if (elapsed < MIN_INTERVAL_BETWEEN_NOTIFICATIONS) {
        console.log('[Scheduler] Too soon since last notification')
        return
      }
    }

    // 3. Get all key points for this week
    const allPoints = await this.getAllKeyPoints(week, studentSubjects)

    if (!allPoints.length) {
      console.log('[Scheduler] No key points found for this week')
      return
    }

    // 4. Filter for patches mode (selected weak subjects only)
    let eligiblePoints
    if (userState.patchesActive) {
      const selectedSubjects = userState.selectedPatchSubjects.length > 0
        ? userState.selectedPatchSubjects
        : this.getWeakSubjects(studentSubjects, scores)
      eligiblePoints = allPoints.filter((p) => selectedSubjects.includes(p.subject))

      // Fallback: if no matching points, use all points
      if (!eligiblePoints.length) {
        eligiblePoints = allPoints
      }
    } else {
      eligiblePoints = allPoints
    }

    if (!eligiblePoints.length) return

    // 5. Select next point (cycle, respect max views)
    const nextPoint = this.selectNextPoint(eligiblePoints, userState.seenPoints)

    if (!nextPoint) {
      // All points seen max times — reset and start new cycle
      console.log('[Scheduler] All points seen max times, resetting cycle')
      const allIds = eligiblePoints.map((p) => p.id)
      useUserNotificationStore.getState().resetSeenPoints(allIds)
      return
    }

    // 6. Mark as seen and advance cycle
    useUserNotificationStore.getState().markSeen(nextPoint.id)
    useUserNotificationStore.getState().advanceCycle(eligiblePoints.length)

    // 7. Save updated notification state to Firestore for server-side push
    if (this.studentId) {
      const ns = useUserNotificationStore.getState()
      saveNotificationStateToFirestore(this.studentId, {
        seenPoints: ns.seenPoints,
        currentCycleIndex: ns.currentCycleIndex,
        patchesActive: ns.patchesActive,
        selectedPatchSubjects: ns.selectedPatchSubjects,
        lastNotifiedAt: ns.lastNotifiedAt,
      })
    }

    // 8. Notify all subscribers (in-app + push)
    this.subscribers.forEach((cb) => cb(nextPoint))
  }

  /**
   * Select next point in the cycle, skipping those seen max times
   */
  selectNextPoint(points, seenPoints) {
    const userState = useUserNotificationStore.getState()

    // Only consider points not yet seen MAX_TIMES_PER_POINT times
    const available = points.filter(
      (p) => (seenPoints[p.id] || 0) < MAX_TIMES_PER_POINT
    )

    if (!available.length) return null

    const index = userState.currentCycleIndex % available.length
    return available[index]
  }

  /**
   * Fetch all key points for the current week's topics
   */
  async getAllKeyPoints(week, studentSubjects) {
    try {
      const topics = await getTopics(week)
      if (!topics) return []

      const points = []

      studentSubjects.forEach((subject) => {
        const topic = normalizeTopic(topics[subject])
        if (!topic?.keyPoints) return

        topic.keyPoints
          .filter((kp) => kp?.trim())
          .forEach((kp, idx) => {
            points.push({
              id: `${week}-${subject}-${idx}`,
              subject,
              point: kp.trim(),
              week,
              isQuestion: kp.trim().endsWith('?'),
            })
          })
      })

      return points
    } catch (err) {
      console.error('[Scheduler] Failed to get key points')
      return []
    }
  }

  /**
   * Identify subjects where the student scored below 50%
   */
  getWeakSubjects(subjects, scores) {
    const bestBySubject = {}

    scores.forEach((s) => {
      const prev = bestBySubject[s.subject]
      if (!prev || s.score > prev.score) {
        bestBySubject[s.subject] = { score: s.score, outOf: s.outOf || 100 }
      }
    })

    return subjects.filter((sub) => {
      const best = bestBySubject[sub]
      if (!best) return true
      return best.outOf > 0 ? best.score / best.outOf < 0.5 : true
    })
  }
}

// Singleton
export const notificationScheduler = new NotificationScheduler()