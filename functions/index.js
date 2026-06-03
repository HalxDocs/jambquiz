const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();
const db = admin.firestore();

const VAPID_PUBLIC_KEY = 'BJV0OfUDKqQg7gPD1BusnRjhhc1fhjnheW6Ghp2W9T5squ3RhMZMrNVqHiCM0M3lOeJLaq_4K_Z3WL_0PcUn_Bg';

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

exports.sendKeyPointNotifications = onSchedule(
  {
    schedule: 'every 2 hours',
    timeZone: 'Africa/Lagos',
    secrets: ['VAPID_PRIVATE_KEY'],
  },
  async (event) => {
    const adminSnap = await db.collection('admin_settings').doc('notifications').get();
    if (adminSnap.exists && adminSnap.data().enabled === false) {
      console.log('[CloudFn] Notifications disabled by admin');
      return;
    }

    const vapidPrivateKeyValue = (process.env.VAPID_PRIVATE_KEY || '').trim();
    if (!vapidPrivateKeyValue) {
      console.error('[CloudFn] VAPID_PRIVATE_KEY not set');
      return;
    }

    const week = await getActiveWeek();
    webpush.setVapidDetails('mailto:admin@274lab.com', VAPID_PUBLIC_KEY, vapidPrivateKeyValue);

    const subsSnap = await db.collection('push_subscriptions').get();
    if (subsSnap.empty) {
      console.log('[CloudFn] No push subscriptions found');
      return;
    }

    let sent = 0;
    for (const subDoc of subsSnap.docs) {
      const studentId = subDoc.id;
      const subscription = subDoc.data();

      // Skip if subscription expired and no free attempts left
      const studentSnap = await db.collection('students').doc(studentId).get();
      if (!studentSnap.exists) continue;
      const studentData = studentSnap.data();
      const subUntil = studentData.subscriptionUntil ? new Date(studentData.subscriptionUntil).getTime() : 0;
      const freeUsed = studentData.freeAttemptsUsed || 0;
      if (subUntil <= Date.now() && freeUsed >= 2) continue;

      const subjects = await getStudentSubjects(studentId);
      if (!subjects.length) continue;

      const stateSnap = await db.collection('notification_state').doc(studentId).get();
      const state = stateSnap.exists ? stateSnap.data() : {};
      const seenPoints = state.seenPoints || {};
      let currentCycleIndex = state.currentCycleIndex || 0;
      const patchesActive = state.patchesActive || false;
      const selectedPatchSubjects = state.selectedPatchSubjects || [];
      const lastNotifiedAt = state.lastNotifiedAt || null;

      if (lastNotifiedAt) {
        const ts = lastNotifiedAt.seconds ? lastNotifiedAt.toDate() : new Date(lastNotifiedAt);
        const elapsed = Date.now() - ts.getTime();
        if (elapsed < MIN_INTERVAL_BETWEEN_NOTIFICATIONS) continue;
      }

      const allPoints = await getAllKeyPoints(week, subjects);
      if (!allPoints.length) continue;

      let eligiblePoints = allPoints;
      if (patchesActive && selectedPatchSubjects.length > 0) {
        eligiblePoints = allPoints.filter((p) => selectedPatchSubjects.includes(p.subject));
        if (!eligiblePoints.length) eligiblePoints = allPoints;
      } else if (patchesActive) {
        const weakSubjects = getWeakSubjects(subjects, await getStudentScores(studentId));
        eligiblePoints = allPoints.filter((p) => weakSubjects.includes(p.subject));
        if (!eligiblePoints.length) eligiblePoints = allPoints;
      }

      const nextPoint = selectNextPoint(eligiblePoints, seenPoints, currentCycleIndex);
      if (!nextPoint) {
        const reset = {};
        eligiblePoints.forEach((p) => { reset[p.id] = 0; });
        await db.collection('notification_state').doc(studentId).update({
          seenPoints: reset,
          currentCycleIndex: 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        continue;
      }

      const pushPayload = JSON.stringify({
        point: nextPoint.point,
        subject: nextPoint.subject,
        id: nextPoint.id,
        week: nextPoint.week,
        isQuestion: nextPoint.isQuestion,
      });

      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          pushPayload
        );
        sent++;

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

exports.sendBroadcastPush = onDocumentCreated(
  {
    document: 'admin_broadcasts/{broadcastId}',
    secrets: ['VAPID_PRIVATE_KEY'],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log('[Broadcast] No data');
      return;
    }

    const { title, message, target } = snapshot.data();
    if (!title || !message) return;

    const vapidPrivateKeyValue = (process.env.VAPID_PRIVATE_KEY || '').trim();
    if (!vapidPrivateKeyValue) {
      console.error('[Broadcast] VAPID_PRIVATE_KEY not set');
      return;
    }

    webpush.setVapidDetails('mailto:admin@274lab.com', VAPID_PUBLIC_KEY, vapidPrivateKeyValue);

    const broadcastId = event.params.broadcastId;
    const subsSnap = await db.collection('push_subscriptions').get();
    const now = Date.now();

    // Pre-fetch students map for filtering
    let studentsMap = null;
    if (target === 'paid' || target === 'unpaid') {
      const studSnap = await db.collection('students').get();
      studentsMap = {};
      studSnap.forEach((d) => { studentsMap[d.id] = d.data(); });
    }

    let sent = 0;
    for (const subDoc of subsSnap.docs) {
      const studentId = subDoc.id;
      const subscription = subDoc.data();

      if (target === 'paid' || target === 'unpaid') {
        const s = studentsMap ? studentsMap[studentId] : null;
        if (!s) continue;
        const subUntil = s.subscriptionUntil ? new Date(s.subscriptionUntil).getTime() : 0;
        const isPaid = subUntil > now;
        if (target === 'paid' && !isPaid) continue;
        if (target === 'unpaid' && isPaid) continue;
      }

      const pushPayload = JSON.stringify({
        type: 'broadcast',
        title,
        message,
        broadcastId,
      });

      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          pushPayload
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.collection('push_subscriptions').doc(studentId).delete();
        }
      }
    }

    console.log(`[Broadcast] Sent "${title}" to ${sent} subscriber(s) (target: ${target || 'all'})`);
  }
);

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'English Language', 'Government', 'Literature in English',
  'Christian Religious Studies', 'Islamic Religious Studies',
  'Commerce', 'Economics',
];

exports.computeLeaderboard = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Africa/Lagos',
  },
  async () => {
    const studentsSnap = await db.collection('students').get();
    const scoresSnap = await db.collection('scores').get();

    const scores = [];
    scoresSnap.forEach((d) => scores.push({ id: d.id, ...d.data() }));

    const students = {};
    studentsSnap.forEach((d) => { students[d.id] = d.data(); });

    // Compute per-student totals, session counts, and gold medals
    const totals = {};
    const sessions = {};
    const goldMedals = {};
    Object.keys(students).forEach((sid) => {
      const myScores = scores.filter((s) => s.studentId === sid);
      const best = {};
      const uniqueSessions = new Set();
      const uniqueWeeks = new Set();
      myScores.forEach((sc) => {
        if (!best[sc.subject] || sc.score > best[sc.subject].score) best[sc.subject] = sc;
        uniqueSessions.add(`${sc.week}::${sc.subject}`);
        uniqueWeeks.add(sc.week);
      });
      sessions[sid] = uniqueSessions.size;
      goldMedals[sid] = uniqueWeeks.size;
      const top = Object.values(best);
      if (top.length >= 4) {
        totals[sid] = top.slice(0, 4).reduce((a, sc) => a + sc.score, 0);
      }
    });

    // Overall top 100
    const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 100);
    const overallTop = ranked.map(([sid, total]) => ({
      id: sid,
      name: students[sid]?.name || 'Unknown',
      nickname: students[sid]?.nickname || '',
      year: students[sid]?.year || '',
      subjects: students[sid]?.subjects || [],
      total,
      sessionCount: sessions[sid] || 0,
      goldMedals: goldMedals[sid] || 0,
    }));
    await db.collection('leaderboard').doc('overall').set({
      top: overallTop,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Per-subject top 10
    for (const subject of SUBJECTS) {
      const subjectBest = [];
      Object.keys(students).forEach((sid) => {
        const myScores = scores.filter((s) => s.studentId === sid && s.subject === subject);
        if (!myScores.length) return;
        const best = myScores.reduce((a, b) => a.score > b.score ? a : b);
        subjectBest.push({ id: sid, name: students[sid]?.name || 'Unknown', nickname: students[sid]?.nickname || '', score: best.score, outOf: best.outOf || 100 });
      });
      const top10 = subjectBest.sort((a, b) => b.score - a.score).slice(0, 10);
      await db.collection('leaderboard').doc(`subject_${subject.replace(/\s+/g, '_')}`).set({
        top: top10,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Per-student rank
    const allRanked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    let writeBatch = db.batch();
    let count = 0;
    allRanked.forEach(([sid, total], i) => {
      const ref = db.collection('leaderboard_student_ranks').doc(sid);
      writeBatch.set(ref, { rank: i + 1, total, sessionCount: (sessions[sid] || 0), goldMedals: (goldMedals[sid] || 0), updatedAt: new Date().toISOString() });
      count++;
      if (count >= 400) {
        // Firestore batch limit is 500
        writeBatch.commit();
        writeBatch = db.batch();
        count = 0;
      }
    });
    if (count > 0) writeBatch.commit();

    console.log(`[Leaderboard] Computed for ${Object.keys(totals).length} students`);
  }
);

function getStatus(s) {
  const now = Date.now();
  const subUntil = s.subscriptionUntil ? new Date(s.subscriptionUntil).getTime() : 0;
  if (subUntil > now) return 'active';
  const freeUsed = s.freeAttemptsUsed || 0;
  if (freeUsed < 2) return 'freebie';
  return 'expired';
}

exports.computeAdminStats = onCall(async () => {
  try {
    const [studentsSnap, scoresSnap, paymentsSnap] = await Promise.all([
      db.collection('students').get(),
      db.collection('scores').get(),
      db.collection('payments').get(),
    ]);

  const allScores = [];
  scoresSnap.forEach(d => allScores.push({ id: d.id, ...d.data() }));

  const allPayments = [];
  paymentsSnap.forEach(d => allPayments.push({ id: d.id, ...d.data() }));

  const students = {};
  studentsSnap.forEach(d => { students[d.id] = { id: d.id, ...d.data() }; });

  const studentIds = Object.keys(students);

  const yearGroups = { all: studentIds };
  studentIds.forEach(sid => {
    const yr = students[sid].year || 'unknown';
    if (!yearGroups[yr]) yearGroups[yr] = [];
    yearGroups[yr].push(sid);
  });

  for (const [year, ids] of Object.entries(yearGroups)) {
    const yrStudents = ids.map(sid => students[sid]);
    const yrScores = allScores.filter(sc => ids.includes(sc.studentId));
    const yrPayments = allPayments.filter(p => ids.includes(p.studentId));

    const studentCount = yrStudents.length;
    const attemptCount = yrScores.length;
    const avgScore = attemptCount ? Math.round(yrScores.reduce((a, b) => a + b.score, 0) / attemptCount) : 0;

    const totals = {};
    ids.forEach(sid => {
      const myScores = yrScores.filter(sc => sc.studentId === sid);
      const best = {};
      myScores.forEach(sc => {
        if (!best[sc.subject] || sc.score > best[sc.subject].score) best[sc.subject] = sc;
      });
      const top = Object.values(best).slice(0, 4);
      if (top.length >= 4) totals[sid] = top.reduce((a, sc) => a + sc.score, 0);
    });

    const topOverall = Object.entries(totals)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([sid, total]) => ({ name: students[sid]?.name || 'Unknown', total }));

    const topBySubject = SUBJECTS.map(subject => {
      const subScores = yrScores.filter(sc => sc.subject === subject);
      if (!subScores.length) return null;
      const byStudent = {};
      subScores.forEach(sc => {
        const student = students[sc.studentId];
        if (!student) return;
        if (!byStudent[sc.studentId] || sc.score > byStudent[sc.studentId].score) {
          byStudent[sc.studentId] = { name: student.name, score: sc.score, outOf: sc.outOf || 100 };
        }
      });
      const ranked = Object.values(byStudent)
        .map(s => ({ ...s, pct: Math.round((s.score / s.outOf) * 100) }))
        .sort((a, b) => b.score - a.score).slice(0, 3);
      return { subject, ranked };
    }).filter(Boolean).filter(s => s.ranked.length > 0);

    const subjectAverages = SUBJECTS.map(subject => {
      const subScores = yrScores.filter(sc => sc.subject === subject);
      if (!subScores.length) return null;
      const avg = Math.round(subScores.reduce((a, b) => a + b.score, 0) / subScores.length);
      const outOf = subScores[0]?.outOf || 160;
      return { subject, avg, outOf, attemptCount: subScores.length };
    }).filter(Boolean);

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const last30Start = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const revenue = {
      total: yrPayments.reduce((a, p) => a + (p.amount || 0), 0),
      thisMonth: yrPayments.filter(p => new Date(p.paidAt).getTime() >= monthStart).reduce((a, p) => a + (p.amount || 0), 0),
      last30Days: yrPayments.filter(p => new Date(p.paidAt).getTime() >= last30Start).reduce((a, p) => a + (p.amount || 0), 0),
    };

    let active = 0, freebie = 0, expired = 0;
    yrStudents.forEach(s => { const st = getStatus(s); if (st === 'active') active++; else if (st === 'freebie') freebie++; else expired++; });

    const docId = year === 'all' ? 'overview' : `year_${year}`;
    await db.collection('admin_stats').doc(docId).set({
      year, studentCount, attemptCount, avgScore, topOverall, topBySubject,
      subjectAverages, revenue, statusCounts: { active, freebie, expired },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  console.log(`[AdminStats] Computed for ${Object.keys(yearGroups).length} groups`);
  return { ok: true };
  } catch (e) {
    console.error('[AdminStats] Error:', e);
    throw new HttpsError('internal', e.message || 'Failed to compute stats');
  }
});

exports.sendMockReminder = onSchedule(
  {
    schedule: '0 * * * *', // top of every hour
    timeZone: 'Africa/Lagos',
    secrets: ['VAPID_PRIVATE_KEY'],
  },
  async () => {
    // Read active week's quiz dates from Firestore
    const week = await getActiveWeek();
    const settingsSnap = await db.collection('settings').where('key', '==', `quizDates_${week}`).get();
    if (settingsSnap.empty) return;

    const { date1, date2 } = settingsSnap.docs[0].data();
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    // Check if current time falls inside any quiz date's 1-hour window
    const isQuizHour = [date1, date2].filter(Boolean).some((d) => {
      const t = new Date(d).getTime();
      return now >= t && now < t + ONE_HOUR;
    });

    if (!isQuizHour) return;

    // Guard: skip if we already sent a reminder in this same hour
    const guardRef = db.collection('admin_settings').doc('mock_reminder');
    const guardSnap = await guardRef.get();
    if (guardSnap.exists) {
      const lastSent = guardSnap.data().sentAt ? new Date(guardSnap.data().sentAt).getTime() : 0;
      if (now - lastSent < ONE_HOUR) {
        console.log('[MockReminder] Already sent this hour, skipping');
        return;
      }
    }

    const vapidPrivateKeyValue = (process.env.VAPID_PRIVATE_KEY || '').trim();
    if (!vapidPrivateKeyValue) { console.error('[MockReminder] VAPID_PRIVATE_KEY not set'); return; }

    webpush.setVapidDetails('mailto:admin@274lab.com', VAPID_PUBLIC_KEY, vapidPrivateKeyValue);

    const subsSnap = await db.collection('push_subscriptions').get();
    if (subsSnap.empty) { console.log('[MockReminder] No subscribers'); return; }

    let sent = 0;
    const payload = JSON.stringify({
      type: 'broadcast',
      title: '📝 Mock Test Time!',
      message: "It's 5PM — your weekly mock test is live! Open the app and start now.",
      broadcastId: 'mock-' + Date.now(),
    });

    for (const subDoc of subsSnap.docs) {
      const subscription = subDoc.data();
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.collection('push_subscriptions').doc(subDoc.id).delete();
        }
      }
    }

    // Mark as sent so we don't double-fire
    await guardRef.set({ sentAt: new Date().toISOString() });
    console.log(`[MockReminder] Sent mock reminder to ${sent} subscriber(s)`);
  }
);

exports.testPushToAll = onCall(
  { secrets: ['VAPID_PRIVATE_KEY'] },
  async () => {
    const vapidPrivateKeyValue = (process.env.VAPID_PRIVATE_KEY || '').trim();
    if (!vapidPrivateKeyValue) return { ok: false, reason: 'VAPID_PRIVATE_KEY secret not set in Firebase. Run: firebase functions:secrets:set VAPID_PRIVATE_KEY' };

    webpush.setVapidDetails('mailto:admin@274lab.com', VAPID_PUBLIC_KEY, vapidPrivateKeyValue);

    const subsSnap = await db.collection('push_subscriptions').get();
    if (subsSnap.empty) return { ok: false, reason: 'No devices registered. Open the app and tap Enable in the notification banner first.' };

    let sent = 0;
    const payload = JSON.stringify({ point: 'Push notifications are working! You will receive key points every 2 hours.', subject: 'Test', id: 'test-' + Date.now(), isQuestion: false });

    for (const subDoc of subsSnap.docs) {
      const subscription = subDoc.data();
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.collection('push_subscriptions').doc(subDoc.id).delete();
        }
      }
    }

    return { ok: true, sent, total: subsSnap.size };
  }
);

exports.getPortalStats = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      const [studentsSnap, scoresSnap] = await Promise.all([
        db.collection('students').get(),
        db.collection('scores').get(),
      ]);

      const now = Date.now();
      let totalStudents = 0;
      let activeSubscriptions = 0;
      const scoresThisWeek = [];
      const allScores = [];

      studentsSnap.forEach(d => {
        totalStudents++;
        const s = d.data();
        const subUntil = s.subscriptionUntil ? new Date(s.subscriptionUntil).getTime() : 0;
        if (subUntil > now) activeSubscriptions++;
      });

      scoresSnap.forEach(d => {
        const s = { id: d.id, ...d.data() };
        allScores.push(s);
      });

      const totalQuizzesTaken = allScores.length;

      const weekMap = {};
      allScores.forEach(s => {
        if (!weekMap[s.week]) weekMap[s.week] = 0;
        weekMap[s.week]++;
      });

      const activeWeek = await getActiveWeek();

      const weekScores = allScores.filter(s => s.week === activeWeek);
      const uniqueStudentsThisWeek = new Set(weekScores.map(s => s.studentId)).size;

      // Compute average score
      const latestScores = {};
      allScores.forEach(s => {
        const key = `${s.studentId}_${s.subject}`;
        if (!latestScores[key] || s.createdAt > latestScores[key].createdAt) {
          latestScores[key] = s;
        }
      });
      const latestList = Object.values(latestScores);
      const avgPct = latestList.length
        ? Math.round(latestList.reduce((a, s) => a + (s.score / (s.outOf || 100)) * 100, 0) / latestList.length)
        : 0;

      res.json({
        ok: true,
        stats: {
          totalStudents,
          activeSubscriptions,
          totalQuizzesTaken,
          studentsActiveThisWeek: uniqueStudentsThisWeek,
          averageScorePct: avgPct,
          activeWeek,
        },
      });
    } catch (e) {
      console.error('[getPortalStats] Error:', e);
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

exports.sendQuizReminders = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'Africa/Lagos',
    secrets: ['VAPID_PRIVATE_KEY'],
  },
  async () => {
    const vapidPrivateKeyValue = (process.env.VAPID_PRIVATE_KEY || '').trim();
    if (!vapidPrivateKeyValue) { console.log('[QuizReminder] No VAPID key'); return; }
    webpush.setVapidDetails('mailto:admin@274lab.com', VAPID_PUBLIC_KEY, vapidPrivateKeyValue);

    const adminSnap = await db.collection('admin_settings').doc('notifications').get();
    if (adminSnap.exists && adminSnap.data().enabled === false) { console.log('[QuizReminder] Disabled by admin'); return; }

    const week = await getActiveWeek();
    const settingsSnap = await db.collection('settings').get();
    const quizDoc = settingsSnap.docs.find((d) => d.data().key === `quizDates_${week}`);
    if (!quizDoc) { console.log(`[QuizReminder] No dates for ${week}`); return; }

    const { date1, date2 } = quizDoc.data();
    const quizDates = [];
    if (date1) quizDates.push({ id: '1', time: new Date(date1).getTime() });
    if (date2) quizDates.push({ id: '2', time: new Date(date2).getTime() });

    const now = Date.now();
    const INTERVALS = [
      { label: '2h', ms: 2 * 60 * 60 * 1000 },
      { label: '1.5h', ms: 90 * 60 * 1000 },
      { label: '15m', ms: 15 * 60 * 1000 },
      { label: '5m', ms: 5 * 60 * 1000 },
    ];
    const TOLERANCE = 60 * 1000;

    const subsSnap = await db.collection('push_subscriptions').get();
    if (subsSnap.empty) { console.log('[QuizReminder] No subscriptions'); return; }

    for (const qd of quizDates) {
      const timeUntil = qd.time - now;
      if (timeUntil <= 0) continue;

      for (const interval of INTERVALS) {
        if (Math.abs(timeUntil - interval.ms) > TOLERANCE) continue;

        const reminderKey = `${week}_date${qd.id}_${interval.label}`;
        const guardRef = db.collection('reminder_sent').doc(reminderKey);
        const guardSnap = await guardRef.get();
        if (guardSnap.exists) { console.log(`[QuizReminder] ${reminderKey} already sent`); continue; }

        const messages = {
          '2h': '📝 Your quiz starts in 2 hours! Time to review.',
          '1.5h': '⏰ Quiz in 1 hour 30 minutes! Get your notes ready.',
          '15m': '🔔 Quiz starts in 15 minutes! Log in now.',
          '5m': '🚀 5 minutes to quiz time! Find a quiet spot.',
        };

        const body = messages[interval.label] || `Quiz starts in ${interval.label}!`;
        let sent = 0;
        for (const subDoc of subsSnap.docs) {
          const studentSnap = await db.collection('students').doc(subDoc.id).get();
          if (!studentSnap.exists) continue;
          const s = studentSnap.data();
          const subUntil = s.subscriptionUntil ? new Date(s.subscriptionUntil).getTime() : 0;
          if (subUntil <= now && (s.freeAttemptsUsed || 0) >= 2) continue;

          try {
            await webpush.sendNotification(
              { endpoint: subDoc.data().endpoint, keys: subDoc.data().keys },
              JSON.stringify({ title: '📝 Quiz Reminder', body, icon: '/icon-192.png', badge: '/badge-72.png', data: { url: '/' } })
            );
            sent++;
          } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              await db.collection('push_subscriptions').doc(subDoc.id).delete();
            }
          }
        }
        await guardRef.set({ sentAt: new Date().toISOString(), sent });
        console.log(`[QuizReminder] ${reminderKey}: sent to ${sent} students`);
      }
    }
  }
);

const MAX_MESSAGE_LENGTH = 500;
const MAX_NAME_LENGTH = 60;

exports.guestbook = onRequest({ cors: true }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Max-Age', '3600').status(204).send('');
    return;
  }

  if (req.method === 'GET') {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const snap = await db.collection('guestbook')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const entries = [];
      snap.forEach(d => {
        const data = d.data();
        entries.push({
          id: d.id,
          name: data.name,
          message: data.message,
          signature: data.signature || '',
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        });
      });

      res.json({ ok: true, entries });
    } catch (e) {
      console.error('[Guestbook] GET error:', e);
      res.status(500).json({ ok: false, error: 'Failed to fetch entries' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const { name, message, signature } = req.body || {};
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';

      if (!name || !name.trim()) {
        res.status(400).json({ ok: false, error: 'Name is required' });
        return;
      }

      const cleanName = name.trim().slice(0, MAX_NAME_LENGTH);
      const cleanMessage = message ? message.trim().slice(0, MAX_MESSAGE_LENGTH) : '';

      const docRef = await db.collection('guestbook').add({
        name: cleanName,
        message: cleanMessage,
        signature: signature || '',
        ip,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.status(201).json({ ok: true, id: docRef.id });
    } catch (e) {
      console.error('[Guestbook] POST error:', e);
      res.status(500).json({ ok: false, error: 'Failed to save entry' });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
});

exports.sendAbsentSmsReport = onSchedule(
  {
    schedule: '5 18 * * 6',
    timeZone: 'Africa/Lagos',
    secrets: ['TERMII_API_KEY'],
  },
  async () => {
    const TERMII_API_KEY = (process.env.TERMII_API_KEY || '').trim()
    if (!TERMII_API_KEY) {
      console.log('[AbsentSms] TERMII_API_KEY not set — skipping')
      return
    }

    const week = await getActiveWeek()
    console.log(`[AbsentSms] Checking absences for ${week}`)

    // Get all students who have scores for this week
    const scoresSnap = await db.collection('scores').get()
    const studentsWithScores = new Set()
    scoresSnap.forEach((d) => {
      const s = d.data()
      if (s.week === week && s.studentId) studentsWithScores.add(s.studentId)
    })
    console.log(`[AbsentSms] ${studentsWithScores.size} students have scores for ${week}`)

    // Get all students with phone numbers
    const allStudents = await db.collection('students').get()
    let sent = 0
    let skipped = 0

    for (const doc of allStudents.docs) {
      const student = doc.data()
      const studentId = doc.id
      const name = student.name || 'Student'

      // Skip if student already has scores this week
      if (studentsWithScores.has(studentId)) {
        skipped++
        continue
      }

      // Collect valid phones
      const phones = [
        { label: 'parent', phone: normalizePhone(student.parentPhone) },
        { label: 'teacher', phone: normalizePhone(student.teacherPhone) },
      ].filter((p) => p.phone)
      if (!phones.length) {
        skipped++
        continue
      }

      // Guard: skip if already notified for this week
      const guardId = `absent_${studentId}_${week.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      const guardRef = db.collection('reminder_sent').doc(guardId)
      const guardSnap = await guardRef.get()
      if (guardSnap.exists) {
        skipped++
        continue
      }

      const smsText = `274Lab — ${week}\n${name} was absent for this week's quiz. Please remind them to check in next week.\n— 274Lab`
      const truncated = smsText.slice(0, 765)
      let sentCount = 0

      for (const { label, phone } of phones) {
        try {
          const resp = await fetch('https://api.termii.com/api/sms/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: TERMII_API_KEY,
              to: phone,
              from: '274Lab',
              sms: truncated,
              type: 'plain',
              channel: 'generic',
            }),
          })
          const result = await resp.json()
          if (result?.message?.err || result?.error) {
            console.error(`[AbsentSms] Termii error for ${label} (${phone}):`, result?.message?.err || result?.error)
          } else {
            sentCount++
            console.log(`[AbsentSms] Sent to ${label} (${phone}) for ${studentId}`)
          }
        } catch (e) {
          console.error(`[AbsentSms] Failed to send to ${label} (${phone}):`, e?.message || e)
        }
      }

      if (sentCount > 0) {
        await guardRef.set({
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          studentId,
          week,
          reason: 'absent',
          sentTo: phones.map((p) => p.label),
          sentCount,
        })
        sent++
      } else {
        skipped++
      }
    }

    console.log(`[AbsentSms] Done. Sent ${sent} absent alerts. Skipped ${skipped} (already had scores / no phone / already notified)`)
  }
)

function normalizePhone(p) {
  if (!p || !p.trim()) return null
  let s = p.replace(/[\s\-\(\)]/g, '')
  if (s.startsWith('+')) s = s.slice(1)
  if (s.startsWith('0')) s = '234' + s.slice(1)
  if (s.length >= 10 && s.length <= 14) return s
  return null
}

exports.sendQuizSmsReport = onDocumentCreated(
  {
    document: 'scores/{scoreId}',
    secrets: ['TERMII_API_KEY'],
  },
  async (event) => {
    const TERMII_API_KEY = (process.env.TERMII_API_KEY || '').trim()
    if (!TERMII_API_KEY) {
      console.log('[SmsReport] TERMII_API_KEY not set — skipping')
      return
    }

    const scoreSnap = event.data
    if (!scoreSnap) { console.log('[SmsReport] No data'); return }
    const score = scoreSnap.data()
    if (!score || !score.studentId || !score.week) { console.log('[SmsReport] Missing studentId or week'); return }

    const { studentId, week } = score
    const studentSnap = await db.collection('students').doc(studentId).get()
    if (!studentSnap.exists) { console.log(`[SmsReport] Student ${studentId} not found`); return }

    const student = studentSnap.data()
    const studentSubjects = student.subjects || []
    if (!studentSubjects.length) { console.log(`[SmsReport] ${studentId} has no subjects`); return }

    // Get all scores for this student + week
    const scoresSnap = await db.collection('scores')
      .where('studentId', '==', studentId)
      .get()

    if (scoresSnap.empty) { console.log('[SmsReport] No scores found'); return }

    const weekScores = scoresSnap.docs.map((d) => d.data()).filter((s) => s.week === week)
    const submittedSubjects = new Set(weekScores.map((s) => s.subject))

    // Only send if ALL student subjects are represented in this week's scores
    const allDone = studentSubjects.every((sub) => submittedSubjects.has(sub))
    if (!allDone) {
      console.log(`[SmsReport] ${studentId} ${week}: ${submittedSubjects.size}/${studentSubjects.length} subjects done — waiting`)
      return
    }

    // Guard: skip if already sent for this student+week
    const guardId = `sms_${studentId}_${week.replace(/[^a-zA-Z0-9_-]/g, '_')}`
    const guardRef = db.collection('reminder_sent').doc(guardId)
    const guardSnap = await guardRef.get()
    if (guardSnap.exists) { console.log(`[SmsReport] ${guardId} already sent`); return }

    // Build report
    const name = student.name || 'Student'
    const total = weekScores.reduce((a, s) => a + (s.score || 0), 0)
    const maxTotal = weekScores.length * 100
    const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0

    const lines = []
    weekScores.forEach((s) => {
      const sp = s.score || 0
      const flag = sp < 50 ? '⚠️' : ''
      lines.push(`${s.subject} ${sp}%${flag}`)
    })

    const smsText = `274Lab — ${week}\n${name}: ${total}/${maxTotal} (${pct}%)\n${lines.join(', ')}\nKeep going!`
    const truncated = smsText.slice(0, 765)

    const phones = [
      { label: 'parent', phone: normalizePhone(student.parentPhone) },
      { label: 'teacher', phone: normalizePhone(student.teacherPhone) },
    ].filter((p) => p.phone)

    if (!phones.length) { console.log(`[SmsReport] ${studentId} has no valid phone numbers`); return }

    let sentCount = 0
    for (const { label, phone } of phones) {
      try {
        const body = {
          api_key: TERMII_API_KEY,
          to: phone,
          from: '274Lab',
          sms: truncated,
          type: 'plain',
          channel: 'generic',
        }
        const resp = await fetch('https://api.termii.com/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const result = await resp.json()
        if (result?.message?.err || result?.error) {
          console.error(`[SmsReport] Termii error for ${label} (${phone}):`, result?.message?.err || result?.error)
        } else {
          sentCount++
          console.log(`[SmsReport] Sent to ${label} (${phone})`)
        }
      } catch (e) {
        console.error(`[SmsReport] Failed to send to ${label} (${phone}):`, e?.message || e)
      }
    }

    if (sentCount > 0) {
      await guardRef.set({
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        studentId,
        week,
        sentTo: phones.map((p) => p.label),
        total,
        pct,
        sentCount,
      })
      console.log(`[SmsReport] ${studentId} ${week}: sent to ${sentCount} recipient(s)`)
    }
  }
)
