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
  if (typeof t === 'string') return { name: t, smsName: '', video: '', keyPoints: [] };
  return { name: t.name || '', smsName: t.smsName || '', video: t.video || '', keyPoints: Array.isArray(t.keyPoints) ? t.keyPoints : [] };
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
  const snap = await db.collection('settings').doc('activeWeek').get();
  if (!snap.exists) return 'Week 1';
  return snap.data().value || 'Week 1';
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
        await db.collection('notification_state').doc(studentId).set({
          seenPoints: reset,
          currentCycleIndex: 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
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
          console.error(`[CloudFn] Failed to send to ${studentId}:`, err.message || err);
        }
      }
    }

    console.log(`[CloudFn] Sent ${sent} push notifications`);
  }
);

exports.sendBroadcastPush = onDocumentCreated(
  {
    document: 'admin_broadcasts/{broadcastId}',
    region: 'us-central1',
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

      // Skip suspended students - no push notifications for red card accounts
      const s = studentsMap ? studentsMap[studentId] : null;
      if (s && (s.suspended || (s.missedStreak || 0) >= 3)) continue;

      if (target === 'paid' || target === 'unpaid') {
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
        } else {
          console.error(`[Broadcast] Failed to send to ${studentId}:`, err.message || err);
        }
      }
    }

    console.log(`[Broadcast] Sent "${title}" to ${sent}/${subsSnap.size} subscriber(s) (target: ${target || 'all'})`);
  }
);

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'English Language', 'Government', 'Literature in English',
  'Christian Religious Studies', 'Islamic Religious Studies',
  'Commerce', 'Economics',
];

const SUBJECT_ABBREVIATIONS = {
  'Mathematics': 'MTH',
  'Physics': 'PHY',
  'Chemistry': 'CHM',
  'Biology': 'BIO',
  'English Language': 'ENG',
  'Government': 'GOV',
  'Literature in English': 'LIT',
  'Christian Religious Studies': 'CRS',
  'Islamic Religious Studies': 'IRS',
  'Commerce': 'COM',
  'Economics': 'ECO',
};

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
    });
    await writeBatch.commit();
    if (count > 0) await writeBatch.commit();

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

exports.computeAdminStats = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required')
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

exports.sendQuizTimeReminder = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'Africa/Lagos',
    secrets: ['VAPID_PRIVATE_KEY'],
  },
  async () => {
    const now = Date.now();

    const vapidPrivateKeyValue = (process.env.VAPID_PRIVATE_KEY || '').trim();
    if (!vapidPrivateKeyValue) { return; }

    const adminSnap = await db.collection('admin_settings').doc('notifications').get();
    if (adminSnap.exists && adminSnap.data().enabled === false) return;

    const week = await getActiveWeek();
    const settingsSnap = await db.collection('settings').get();
    const quizDoc = settingsSnap.docs.find((d) => d.data().key === `quizDates_${week}`);
    if (!quizDoc) return;

    const { date1, date2 } = quizDoc.data();
    const quizDates = [];
    if (date1) quizDates.push({ id: '1', time: new Date(date1).getTime() });
    if (date2) quizDates.push({ id: '2', time: new Date(date2).getTime() });
    if (!quizDates.length) return;

    for (const qd of quizDates) {
      // Fire within 5 minutes after quiz start time
      const diff = now - qd.time;
      if (diff < 0 || diff > 5 * 60 * 1000) continue;

      const guardRef = db.collection('admin_settings').doc(`quiz_time_reminder_${week}_date${qd.id}`);
      const guardSnap = await guardRef.get();
      if (guardSnap.exists) continue;

      webpush.setVapidDetails('mailto:admin@274lab.com', VAPID_PUBLIC_KEY, vapidPrivateKeyValue);
      const subsSnap = await db.collection('push_subscriptions').get();
      if (subsSnap.empty) return;

      const payload = JSON.stringify({
        type: 'broadcast',
        title: 'Quiz Time!',
        message: "Your weekly mock test is live! Open the app and start now.",
        broadcastId: 'quiz-time-' + Date.now(),
      });

      let sent = 0;
      for (const subDoc of subsSnap.docs) {
        try {
          await webpush.sendNotification({ endpoint: subDoc.data().endpoint, keys: subDoc.data().keys }, payload);
          sent++;
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await db.collection('push_subscriptions').doc(subDoc.id).delete();
          }
        }
      }

      await guardRef.set({ sentAt: new Date().toISOString(), dateId: qd.id });
      console.log(`[QuizTimeReminder] Sent to ${sent} subscriber(s) for date${qd.id}`);
    }
  }
);

exports.testPushToAll = onCall(
  { secrets: ['VAPID_PRIVATE_KEY'] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required')
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
        } else {
          console.error('[TestPush] Failed to send:', err.message || err);
        }
      }
    }

    console.log(`[TestPush] Sent to ${sent}/${subsSnap.size} device(s)`);
  }
);

exports.testSms = onCall(
  { secrets: ['TERMII_API_KEY'] },
  async (request) => {
    const TERMII_API_KEY = (process.env.TERMII_API_KEY || '').trim()
    if (!TERMII_API_KEY) return { ok: false, message: 'TERMII_API_KEY secret not set. Run: firebase functions:secrets:set TERMII_API_KEY' }

    const phone = normalizePhone(request.data?.phone || '')
    if (!phone) return { ok: false, message: 'Invalid phone number. Use international format (e.g. 2348012345678)' }

    const smsText = 'This is a test SMS from 274Lab. Your SMS integration is working correctly!'
    const resp = await fetch('https://api.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: TERMII_API_KEY, to: phone, from: 'Test 274Lab', sms: smsText, type: 'plain', channel: 'generic' }),
    })
    const result = await resp.json()
    if (!resp.ok) return { ok: false, message: `Termii HTTP ${resp.status}: ${JSON.stringify(result)}` }
    if (result?.message?.err || result?.error) return { ok: false, message: result?.message?.err || result?.error }
    return { ok: true, message: `Test SMS sent to ${phone}` }
  }
);

exports.sendAccountabilityIntro = onCall(
  { secrets: ['TERMII_API_KEY'] },
  async (request) => {
    const TERMII_API_KEY = (process.env.TERMII_API_KEY || '').trim()
    if (!TERMII_API_KEY) return { ok: false, message: 'TERMII_API_KEY not set' }

    const { studentId, phones } = request.data || {}
    if (!studentId || !phones?.length) return { ok: false, message: 'Missing studentId or phones' }

    const studentSnap = await db.collection('students').doc(studentId).get()
    if (!studentSnap.exists) return { ok: false, message: 'Student not found' }
    const student = studentSnap.data()
    const name = student.name || 'Student'

    const recoveryCode = Math.floor(1000 + Math.random() * 9000).toString()
    await studentSnap.ref.update({ recoveryCode })

    const introText = [
      'Hi,',
      '',
      `${name} has started preparing for JAMB with 274Lab weekly topic-based tests and chose you as accountability partner.`,
      '',
      'Your role is to support them as we update you on their weekly progress.',
      '',
      'You make the difference.',
      '',
      'Powered by 274Lab.',
    ].join('\n')

    let sentCount = 0
    for (const phone of phones) {
      const p = normalizePhone(phone)
      if (!p) continue
      try {
        const r = await sendSmsTermii(TERMII_API_KEY, p, introText)
        if (r.ok) sentCount++
        else console.error(`[AccountabilityIntro] Failed to send to ${p}:`, r.error)
      } catch (e) { console.error('[AccountabilityIntro] Error:', e?.message || e) }
    }
    return { ok: true, sentCount }
  }
);

exports.verifyRecoveryCode = onCall(
  async (request) => {
    const { studentId, code } = request.data || {}
    if (!studentId || !code) return { ok: false }

    const studentSnap = await db.collection('students').doc(studentId).get()
    if (!studentSnap.exists) return { ok: false }

    const student = studentSnap.data()
    if ((student.recoveryCode || '') !== code.toString().trim()) return { ok: false }

    await studentSnap.ref.update({
      missedStreak: 0,
      suspended: false,
      appealedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    return { ok: true }
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
    schedule: 'every 1 minutes',
    timeZone: 'Africa/Lagos',
    secrets: ['TERMII_API_KEY'],
  },
  async () => {
    const TERMII_API_KEY = (process.env.TERMII_API_KEY || '').trim()
    if (!TERMII_API_KEY) return

    const now = Date.now()
    const week = await getActiveWeek()

    // Get quiz dates for this week
    const settingsSnap = await db.collection('settings').get()
    const quizDoc = settingsSnap.docs.find((d) => d.data().key === `quizDates_${week}`)
    if (!quizDoc) return

    const { date1, date2 } = quizDoc.data()
    const quizDates = []
    if (date1) quizDates.push(new Date(date1).getTime())
    if (date2) quizDates.push(new Date(date2).getTime())
    if (!quizDates.length) return

    // Find the last quiz end time (assume each quiz is 2 hours long)
    const lastQuizEnd = Math.max(...quizDates) + (2 * 60 * 60 * 1000)

    // Fire 5 minutes after the last quiz ends
    const fireTime = lastQuizEnd + (5 * 60 * 1000)
    if (now < fireTime) return

    // Guard: only send once per week
    const weekGuardRef = db.collection('admin_settings').doc(`absent_sms_${week.replace(/\s/g, '_')}`)
    const weekGuardSnap = await weekGuardRef.get()
    if (weekGuardSnap.exists) return

    console.log(`[AbsentSms] Checking absences for ${week}`)

    const scoresSnap = await db.collection('scores').where('week', '==', week).get()
    const studentsWithScores = new Set()
    scoresSnap.forEach((d) => {
      const s = d.data()
      if (s.week === week && s.studentId) studentsWithScores.add(s.studentId)
    })

    const allStudents = await db.collection('students').get()
    const topicNames = await getWeekTopicNames(week)
    let sent = 0
    let skipped = 0

    for (const doc of allStudents.docs) {
      const student = doc.data()
      const studentId = doc.id
      const name = student.name || 'Student'

      if (studentsWithScores.has(studentId)) { skipped++; continue }

      // Skip suspended students - no SMS for red card accounts
      if (student.suspended || (student.missedStreak || 0) >= 3) {
        skipped++; continue
      }

      const phones = [
        { label: 'parent', phone: normalizePhone(student.parentPhone) },
        { label: 'teacher', phone: normalizePhone(student.teacherPhone) },
      ].filter((p) => p.phone)
      if (!phones.length) { skipped++; continue }

      const guardId = `absent_${studentId}_${week.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      const guardRef = db.collection('reminder_sent').doc(guardId)
      const guardSnap = await guardRef.get()
      if (guardSnap.exists) { skipped++; continue }

      const subjects = (student.subjects || []).map((s) => ({ subject: s, score: null }))
      const smsText = buildSmsBody(name, week, subjects, topicNames)
      const truncated = smsText.slice(0, 765)
      let sentCount = 0

      for (const { label, phone } of phones) {
        try {
          const r = await sendSmsTermii(TERMII_API_KEY, phone, truncated)
          if (r.ok) {
            sentCount++
            console.log(`[AbsentSms] Sent to ${label} (${phone}) for ${studentId}`)
          } else {
            console.error(`[AbsentSms] Error for ${label} (${phone}):`, r.error)
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

    await weekGuardRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp(), week, sent })
    console.log(`[AbsentSms] Done. Sent ${sent} absent alerts. Skipped ${skipped}`)
  }
)

function truncateTopic(name, maxLen = 14) {
  if (!name) return ''
  const s = String(name)
  return s.length > maxLen ? s.slice(0, maxLen) : s
}

function normalizePhone(p) {
  if (!p || !p.trim()) return null
  let s = p.replace(/[\s\-\(\)]/g, '')
  if (s.startsWith('+')) s = s.slice(1)
  if (s.startsWith('0')) s = '234' + s.slice(1)
  if (s.length >= 10 && s.length <= 14) return s
  return null
}

async function getWeekTopicNames(week) {
  try {
    const snap = await db.collection('topics').where('week', '==', week).get()
    if (snap.empty) { console.log(`[getWeekTopicNames] No topics found for ${week}`); return {} }
    const topicsData = snap.docs[0].data().topics || {}
    const names = {}
    Object.entries(topicsData).forEach(([subject, t]) => {
      const n = normalizeTopic(t)
      if (n && n.name) {
        names[subject] = { name: n.name, smsName: n.smsName || '' }
      }
    })
    console.log(`[getWeekTopicNames] ${week}:`, JSON.stringify(names))
    return names
  } catch (e) {
    console.error('[getWeekTopicNames] Error:', e?.message || e)
    return {}
  }
}

function buildSmsBody(name, week, subjectsWithScore, topicNames) {
  const lines = ['Hi,', `Here's a weekly report for ${name} from 274Lab.`, '', 'PERFORMANCE:']
  subjectsWithScore.forEach(({ subject, score }) => {
    const abbr = SUBJECT_ABBREVIATIONS[subject] || subject.slice(0, 3).toUpperCase()
    const topic = topicNames[subject] || {}
    const smsLabel = topic.smsName || truncateTopic(topic.name || '')
    const scorePart = score !== null ? `${score}%` : 'ABS'
    lines.push(`${abbr}${smsLabel ? `: (${smsLabel})` : ''} – ${scorePart}`)
  })
  lines.push('', 'Powered by 274lab')
  return lines.join('\n')
}

async function sendSmsTermii(apiKey, to, text) {
  const truncated = text.slice(0, 765)
  const resp = await fetch('https://api.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, to, from: 'Test 274Lab', sms: truncated, type: 'plain', channel: 'generic' }),
  })
  const result = await resp.json()
  if (!resp.ok) return { ok: false, error: `Termii HTTP ${resp.status}: ${JSON.stringify(result)}` }
  if (result?.message?.err || result?.error) return { ok: false, error: result?.message?.err || result?.error }
  return { ok: true, result }
}

exports.advanceWeek = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'Africa/Lagos',
    secrets: ['TERMII_API_KEY'],
  },
  async () => {
    const now = Date.now()
    const week = await getActiveWeek()

    // Get quiz dates for this week
    const settingsSnap = await db.collection('settings').get()
    const quizDoc = settingsSnap.docs.find((d) => d.data().key === `quizDates_${week}`)
    if (!quizDoc) return

    const { date1, date2 } = quizDoc.data()
    const quizDates = []
    if (date1) quizDates.push(new Date(date1).getTime())
    if (date2) quizDates.push(new Date(date2).getTime())
    if (!quizDates.length) return

    // Fire 1 hour after the last quiz ends (assume 2 hours per quiz)
    const lastQuizEnd = Math.max(...quizDates) + (2 * 60 * 60 * 1000)
    const fireTime = lastQuizEnd + (1 * 60 * 60 * 1000)
    if (now < fireTime) return

    // Guard: only advance once per week
    const weekGuardRef = db.collection('admin_settings').doc(`advance_week_${week.replace(/\s/g, '_')}`)
    const weekGuardSnap = await weekGuardRef.get()
    if (weekGuardSnap.exists) return

    const TERMII_API_KEY = (process.env.TERMII_API_KEY || '').trim()
    const match = week.match(/^Week\s+(\d+)$/i)
    if (!match) return
    const num = parseInt(match[1], 10)
    if (num >= 26) return
    const next = `Week ${num + 1}`
    const activeWeekRef = db.collection('settings').doc('activeWeek')
    const activeWeekSnap = await activeWeekRef.get()
    if (!activeWeekSnap.exists) return
    await activeWeekRef.update({ value: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
    console.log(`[AdvanceWeek] Advanced from ${week} → ${next}`)

    // ── Track missed streaks ──
    if (!TERMII_API_KEY) {
      console.log('[AdvanceWeek] TERMII_API_KEY not set — skipping missed streak tracking')
      return
    }

    const scoresSnap = await db.collection('scores').get()
    const studentsWithScores = new Set()
    scoresSnap.forEach((d) => {
      const s = d.data()
      if (s.week === week && s.studentId) studentsWithScores.add(s.studentId)
    })

    const allStudents = await db.collection('students').get()
    let suspended = 0
    let appealed = 0

    for (const doc of allStudents.docs) {
      const studentId = doc.id
      const student = doc.data()
      let missedStreak = student.missedStreak || 0

      if (studentsWithScores.has(studentId)) {
        if (missedStreak > 0) {
          await doc.ref.update({ missedStreak: 0 })
          appealed++
        }
      } else {
        missedStreak++
        const update = { missedStreak }

        // TEMP: testing period threshold (3 = red). Revert to 6 after test.
        if (missedStreak >= 3 && !student.suspended) {
          update.suspended = true
          suspended++

          // Send suspension SMS to accountability partners
          const phones = [
            normalizePhone(student.parentPhone),
            normalizePhone(student.teacherPhone),
          ].filter(Boolean)

          if (phones.length > 0 && student.recoveryCode) {
            const suspendText = [
              'Hi,',
              '',
              `${student.name} account was suspended for missing ${missedStreak} weekly tests.`,
              '',
              `To recover account, let him enter the code: ${student.recoveryCode}. But don't give them until they show readiness to study.`,
              '',
              'Powered by 274Lab',
            ].join('\n')

            for (const phone of phones) {
              try {
                const r = await sendSmsTermii(TERMII_API_KEY, phone, suspendText)
                if (!r.ok) console.error(`[AdvanceWeek] Suspension SMS failed for ${phone}:`, r.error)
              } catch (e) { console.error('[AdvanceWeek] Suspension SMS error:', e?.message || e) }
            }
          }
        }

        await doc.ref.update(update)
      }
    }

    console.log(`[AdvanceWeek] Missed streaks: ${appealed} reset, ${allStudents.docs.length - appealed - suspended + (allStudents.docs.filter(d => !studentsWithScores.has(d.id)).length)} incremented, ${suspended} suspended`)
    await weekGuardRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp(), week: week, advancedTo: next })
  }
)

exports.sendQuizSmsReport = onDocumentCreated(
  {
    document: 'scores/{scoreId}',
    region: 'us-central1',
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

    // Skip suspended students - no SMS for red card accounts
    if (student.suspended || (student.missedStreak || 0) >= 3) {
      console.log(`[SmsReport] ${studentId} is suspended — skipping SMS`)
      return
    }

    // Get all scores for this student + week
    const scoresSnap = await db.collection('scores')
      .where('studentId', '==', studentId)
      .where('week', '==', week)
      .get()

    if (scoresSnap.empty) { console.log('[SmsReport] No scores found'); return }

    const weekScores = scoresSnap.docs.map((d) => d.data())
    const submittedSubjects = new Set(weekScores.map((s) => s.subject))

    // Guard: skip if already sent for this student+week
    const guardId = `sms_${studentId}_${week.replace(/[^a-zA-Z0-9_-]/g, '_')}`
    const guardRef = db.collection('reminder_sent').doc(guardId)
    const guardSnap = await guardRef.get()
    if (guardSnap.exists) { console.log(`[SmsReport] ${guardId} already sent`); return }

    // Build report
    const name = student.name || 'Student'
    const topicNames = await getWeekTopicNames(week)
    const subjectsWithScore = studentSubjects.map((subject) => {
      const found = weekScores.find((s) => s.subject === subject)
      return { subject, score: found ? found.score : null }
    })

    const smsText = buildSmsBody(name, week, subjectsWithScore, topicNames)
    const truncated = smsText.slice(0, 765)

    const phones = [
      { label: 'parent', phone: normalizePhone(student.parentPhone) },
      { label: 'teacher', phone: normalizePhone(student.teacherPhone) },
    ].filter((p) => p.phone)

    if (!phones.length) { console.log(`[SmsReport] ${studentId} has no valid phone numbers`); return }

    let sentCount = 0
    for (const { label, phone } of phones) {
      try {
        const r = await sendSmsTermii(TERMII_API_KEY, phone, truncated)
        if (r.ok) {
          sentCount++
          console.log(`[SmsReport] Sent to ${label} (${phone})`)
        } else {
          console.error(`[SmsReport] Error for ${label} (${phone}):`, r.error)
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
        sentCount,
      })
      console.log(`[SmsReport] ${studentId} ${week}: sent to ${sentCount} recipient(s)`)
    }
  }
)

exports.clearSmsGuards = onCall(async () => {
  const snap = await db.collection('reminder_sent').get()
  const batch = db.batch()
  let count = 0
  snap.forEach((d) => { batch.delete(d.ref); count++ })
  if (count > 0) await batch.commit()
  return { ok: true, deleted: count }
})
