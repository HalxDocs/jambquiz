const functions = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();
const db = admin.firestore();

const VAPID_PUBLIC_KEY = 'BDjWG8ZcgvC2OmcHjvxRUak4DVafBt-RFjMQLqRNobFvnfKZGETpOpu6XrhLuJ5i9690jgPnO3HvAdcdD-Shruw';
const VAPID_PRIVATE_KEY = functions.definedSecret('VAPID_PRIVATE_KEY');

const MAX_TIMES_PER_POINT = 3;
const MIN_INTERVAL_BETWEEN_NOTIFICATIONS = 30 * 60 * 1000;

function normalizeTopic(t) {
  if (!t) return null;
  if (typeof t === 'string') return { name: t, video: '', keyPoints: [] };
  return { name: t.name || '', video: t.video || '', keyPoints: Array.isArray(t.keyPoints) ? t.keyPoints : [] };
}

async function getAllKeyPoints(week, studentSubjects) {
  const snap = await db.collection('topics').where('week', '==', week).get();
  if (snap.empty) return [];
  const topics = snap.docs[0].data().topics || {};
  const points = [];
  studentSubjects.forEach((subject) => {
    const topic = normalizeTopic(topics[subject]);
    if (!topic || !topic.keyPoints) return;
    topic.keyPoints.filter((kp) => kp && kp.trim()).forEach((kp, idx) => {
      points.push({
        id: `${week}-${subject}-${idx}`,
        subject,
        point: kp.trim(),
        week,
        isQuestion: kp.trim().endsWith('?'),
      });
    });
  });
  return points;
}

async function getActiveWeek() {
  const snap = await db.collection('settings').where('key', '==', 'activeWeek').get();
  if (snap.empty) return 'Week 1';
  return snap.docs[0].data().value;
}

async function getStudentSubjects(studentId) {
  const snap = await db.collection('students').doc(studentId).get();
  if (!snap.exists) return [];
  return snap.data().subjects || [];
}

async function getStudentScores(studentId) {
  const snap = await db.collection('scores').where('studentId', '==', studentId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function getWeakSubjects(subjects, scores) {
  const bestBySubject = {};
  scores.forEach((s) => {
    const prev = bestBySubject[s.subject];
    if (!prev || s.score > prev.score) {
      bestBySubject[s.subject] = { score: s.score, outOf: s.outOf || 100 };
    }
  });
  return subjects.filter((sub) => {
    const best = bestBySubject[sub];
    if (!best) return true;
    return best.score / best.outOf < 0.5;
  });
}

function selectNextPoint(points, seenPoints, currentCycleIndex) {
  const available = points.filter((p) => (seenPoints[p.id] || 0) < MAX_TIMES_PER_POINT);
  if (!available.length) return null;
  return available[currentCycleIndex % available.length];
}

exports.sendKeyPointNotifications = functions.onSchedule(
  {
    schedule: 'every 2 hours',
    timeZone: 'Africa/Lagos',
    secrets: ['VAPID_PRIVATE_KEY'],
  },
  async (event) => {
    // Check admin master switch
    const adminSnap = await db.collection('admin_settings').doc('notifications').get();
    if (adminSnap.exists && adminSnap.data().enabled === false) {
      console.log('[CloudFn] Notifications disabled by admin');
      return;
    }

    // Get current week and VAPID key
    const week = await getActiveWeek();
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPrivateKey) {
      console.error('[CloudFn] VAPID_PRIVATE_KEY not set');
      return;
    }
    webpush.setVapidDetails('mailto:admin@274lab.com', VAPID_PUBLIC_KEY, vapidPrivateKey);

    // Get all push subscriptions
    const subsSnap = await db.collection('push_subscriptions').get();
    if (subsSnap.empty) {
      console.log('[CloudFn] No push subscriptions found');
      return;
    }

    let sent = 0;
    for (const subDoc of subsSnap.docs) {
      const studentId = subDoc.id;
      const subscription = subDoc.data();

      // Get student's subjects
      const subjects = await getStudentSubjects(studentId);
      if (!subjects.length) continue;

      // Get notification state
      const stateSnap = await db.collection('notification_state').doc(studentId).get();
      const state = stateSnap.exists ? stateSnap.data() : {};
      const seenPoints = state.seenPoints || {};
      let currentCycleIndex = state.currentCycleIndex || 0;
      const patchesActive = state.patchesActive || false;
      const selectedPatchSubjects = state.selectedPatchSubjects || [];
      const lastNotifiedAt = state.lastNotifiedAt || null;

      // Check minimum interval
      if (lastNotifiedAt) {
        const elapsed = Date.now() - new Date(lastNotifiedAt).getTime();
        if (elapsed < MIN_INTERVAL_BETWEEN_NOTIFICATIONS) continue;
      }

      // Get all key points for this week
      const allPoints = await getAllKeyPoints(week, subjects);
      if (!allPoints.length) continue;

      // Filter for patches or selected subjects
      let eligiblePoints = allPoints;
      if (patchesActive && selectedPatchSubjects.length > 0) {
        eligiblePoints = allPoints.filter((p) => selectedPatchSubjects.includes(p.subject));
        if (!eligiblePoints.length) eligiblePoints = allPoints;
      } else if (patchesActive) {
        const weakSubjects = getWeakSubjects(subjects, await getStudentScores(studentId));
        eligiblePoints = allPoints.filter((p) => weakSubjects.includes(p.subject));
        if (!eligiblePoints.length) eligiblePoints = allPoints;
      }

      // Select next point
      const nextPoint = selectNextPoint(eligiblePoints, seenPoints, currentCycleIndex);
      if (!nextPoint) {
        // Reset cycle
        const reset = {};
        eligiblePoints.forEach((p) => { reset[p.id] = 0; });
        await db.collection('notification_state').doc(studentId).update({
          seenPoints: reset,
          currentCycleIndex: 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        continue;
      }

      // Send push notification
      const pushPayload = JSON.stringify({
        point: nextPoint.point,
        subject: nextPoint.subject,
        id: nextPoint.id,
        week: nextPoint.week,
        isQuestion: nextPoint.isQuestion,
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          pushPayload
        );
        sent++;

        // Update state
        const updatedSeen = { ...seenPoints, [nextPoint.id]: (seenPoints[nextPoint.id] || 0) + 1 };
        const updatedCycle = (currentCycleIndex + 1) % eligiblePoints.length;

        await db.collection('notification_state').doc(studentId).set({
          seenPoints: updatedSeen,
          currentCycleIndex: updatedCycle,
          patchesActive,
          selectedPatchSubjects,
          lastNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          studentId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired or gone — remove it
          console.log(`[CloudFn] Removing expired subscription for ${studentId}`);
          await db.collection('push_subscriptions').doc(studentId).delete();
        } else {
          console.error(`[CloudFn] Failed to send to ${studentId}:`, err.message);
        }
      }
    }

    console.log(`[CloudFn] Sent ${sent} push notifications`);
  }
);
