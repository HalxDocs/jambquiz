const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const webpush = require('web-push');

// Cap total CPU — `us-central1` quota is ~8 vCPU. 30+ functions × 1 vCPU × 100 instances = 3000 vCPU > quota.
// Global cap keeps every service at max 3 instances, so 30 × 0.08 × 3 = ~7.2 vCPU → fits after per-function CPU cut below.
setGlobalOptions({ region: 'us-central1', maxInstances: 3 });

admin.initializeApp();
const db = admin.firestore();

const VAPID_PUBLIC_KEY = 'BJV0OfUDKqQg7gPD1BusnRjhhc1fhjnheW6Ghp2W9T5squ3RhMZMrNVqHiCM0M3lOeJLaq_4K_Z3WL_0PcUn_Bg';

const MAX_TIMES_PER_POINT = 3;

// Approved Termii alphanumeric sender ID. Termii rejects IDs that contain
// spaces, so the old hardcoded "Test 274Lab" would fail every send. Use an
// alphanumeric sender you have approved in the Termii dashboard. Pass the exact
// value verbatim via TERMII_SENDER_ID (no normalization), defaulting to 274Lab.
const TERMII_SENDER_ID = (process.env.TERMII_SENDER_ID || '274Lab').trim() || '274Lab';

const MIN_INTERVAL_BETWEEN_NOTIFICATIONS = 30 * 60 * 1000;

// ─── SCALE/SECURITY HELPERS (shared) ──────────────────────────────────────

// Shared config for the hot student-facing callables. `minInstances` keeps a
// small warm pool alive to avoid cold-start pileups at quiz start; raise it
// before an exam window. `maxInstances` is a hard cost circuit breaker.
const HOT = {
  region: 'us-central1',
  concurrency: 20,
  minInstances: 0,
  maxInstances: 2,
  timeoutSeconds: 60,
  run: { cpu: 0.25, memory: '256MiB' },
};

// Env-gated App Check enforcement. Callables must ship with enforceAppCheck
// on the deploy config, but until VITE_RECAPTCHA_SITE_KEY is set in the client
// we can't hard-enforce without breaking real users. Set APPCHECK_REQUIRED=true
// (Firebase env var) AFTER the reCAPTCHA site key is deployed to enable it.
function assertAppCheck(request) {
  if ((process.env.APPCHECK_REQUIRED || '').trim() === 'true' && !request.app) {
    throw new HttpsError('unauthenticated', 'App Check verification required');
  }
}

// Fixed-window rate limiter backed by Firestore. Non-transactional by design:
// a tiny over-count on race is acceptable for throttling, and it avoids paying
// transaction overhead on hot endpoints.
async function rateLimit(key, max, windowMs) {
  try {
    const now = Date.now();
    const bucket = Math.floor(now / windowMs);
    const ref = db.collection('rate_limits').doc(String(key).slice(0, 120));
    const s = await ref.get();
    const d = s.exists ? s.data() : {};
    if (d.bucket !== bucket) {
      await ref.set({ bucket, count: 1, expireAt: new Date(now + windowMs) });
      return true;
    }
    if ((d.count || 0) >= max) return false;
    await ref.update({ count: admin.firestore.FieldValue.increment(1), expireAt: new Date(now + windowMs) });
    return true;
  } catch (e) {
    return true; // fail-open during transient errors
  }
}

// Run an async fn over an array with bounded concurrency (used by push fan-out).
async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await fn(items[i], i); } catch (e) { results[i] = undefined; }
    }
  }
  const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(pool);
  return results;
}

// ─── QUIZ ENGINE (session-based, in-memory answer key) ─────────────────────

// Module-scope answer-key cache: each function instance loads a subject/week's
// answer key once and reuses it across submissions. Kills the read storm where
// every submission did getAll() over all question + answer docs.
const answerKeyCache = new Map(); // `${subject}|${week}` -> Map<questionId, answerIndex>
let answerKeyCacheLoadedAt = 0;
const ANSWER_KEY_TTL_MS = 10 * 60 * 1000;

async function getAnswerKey(subject, week) {
  const key = `${subject}|${week}`;
  if (answerKeyCache.has(key) && Date.now() - answerKeyCacheLoadedAt < ANSWER_KEY_TTL_MS) {
    return answerKeyCache.get(key);
  }
  const idsSnap = await db.collection('questions')
    .where('subject', '==', subject)
    .where('week', '==', week)
    .select('__name__')
    .get();
  const ids = idsSnap.docs.map((d) => d.id);
  const map = new Map();
  if (ids.length) {
    const answerSnaps = await db.getAll(...ids.map((id) => db.collection('questionAnswers').doc(id)));
    const questionSnaps = await db.getAll(...ids.map((id) => db.collection('questions').doc(id)));
    answerSnaps.forEach((s, i) => {
      let answer = -1;
      if (s.exists) answer = s.data().answer;
      else if (questionSnaps[i].exists && typeof questionSnaps[i].data().answer === 'number') answer = questionSnaps[i].data().answer;
      map.set(ids[i], answer);
    });
  }
  answerKeyCache.set(key, map);
  answerKeyCacheLoadedAt = Date.now();
  return map;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic seeded Fisher-Yates so each student gets a stable, unique set.
function pickQuestions(ids, count, seed) {
  const a = [...ids];
  let s = hashString(seed) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(count, a.length));
}

function limitDocId(subject, week) {
  const s = String(subject || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  const w = String(week || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  return `${s}__${w}`;
}

async function getQuestionLimitFor(subject, week) {
  const snap = await db.collection('question_limits').doc(limitDocId(subject, week)).get();
  if (!snap.exists) return subject === 'English Language' ? 40 : 25;
  return snap.data().limit || 25;
}

async function getQuizDatesForWeek(week) {
  // Doc id is deterministic (settings/quizDates_<week>) — read it directly
  // instead of scanning the whole settings collection on every hot request.
  const id = 'quizDates_' + String(week || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
  const snap = await db.collection('settings').doc(id).get()
  return snap.exists ? snap.data() : null
}

async function quizWindowOpen(week, now = Date.now()) {
  const qd = await getQuizDatesForWeek(week);
  if (!qd) return false;
  for (const key of ['date1', 'date2']) {
    if (!qd[key]) continue;
    const start = new Date(qd[key]).getTime();
    if (now >= start && now < start + 2 * 60 * 60 * 1000) return true;
  }
  return false;
}

// Whether corrections for a week may be shown: NOT during the live window.
async function correctionsReleased(week) {
  const releasedRef = db.collection('admin_settings').doc(`corrections_released_${week.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
  const releasedSnap = await releasedRef.get();
  if (releasedSnap.exists) return true;
  return !(await quizWindowOpen(week));
}

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
    run: { cpu: 0.08, memory: '256MiB' },
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
    const subs = subsSnap.docs;
    await mapWithConcurrency(subs, 20, async (subDoc) => {
      const studentId = subDoc.id;
      const subscription = subDoc.data();

      // Skip if subscription expired and no free attempts left
      const studentSnap = await db.collection('students').doc(studentId).get();
      if (!studentSnap.exists) return;
      const studentData = studentSnap.data();
      const subUntil = studentData.subscriptionUntil ? new Date(studentData.subscriptionUntil).getTime() : 0;
      const freeUsed = studentData.freeAttemptsUsed || 0;
      if (subUntil <= Date.now() && freeUsed >= 2) return;

      const subjects = await getStudentSubjects(studentId);
      if (!subjects.length) return;

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
        if (elapsed < MIN_INTERVAL_BETWEEN_NOTIFICATIONS) return;
      }

      const allPoints = await getAllKeyPoints(week, subjects);
      if (!allPoints.length) return;

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
        return;
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
    });

    console.log(`[CloudFn] Sent ${sent} push notifications`);
  }
);

exports.sendBroadcastPush = onDocumentCreated(
  {
    document: 'admin_broadcasts/{broadcastId}',
    region: 'us-central1',
    secrets: ['VAPID_PRIVATE_KEY'],
    run: { cpu: 0.08, memory: '256MiB' },
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
    const subs = subsSnap.docs;
    await mapWithConcurrency(subs, 20, async (subDoc) => {
      const studentId = subDoc.id;
      const subscription = subDoc.data();

      // Skip suspended students - no push notifications for red card accounts
      const s = studentsMap ? studentsMap[studentId] : null;
      if (s && (s.suspended || (s.missedStreak || 0) >= 6)) return;

      if (target === 'paid' || target === 'unpaid') {
        if (!s) return;
        const subUntil = s.subscriptionUntil ? new Date(s.subscriptionUntil).getTime() : 0;
        const isPaid = subUntil > now;
        if (target === 'paid' && !isPaid) return;
        if (target === 'unpaid' && isPaid) return;
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
    });

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
    run: { cpu: 0.08, memory: '256MiB', timeoutSeconds: 300 },
  },
  async () => {
    // Rank docs are maintained incrementally by submitQuiz (best-4 total,
    // session counts, gold medals). We only need to ORDER them, not re-scan
    // every score in the database.
    const qualified = await db.collection('leaderboard_student_ranks')
      .where('qualified', '==', true)
      .orderBy('total', 'desc')
      .limit(1000)
      .get();

    const ranked = qualified.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Overall top 100
    const overallTop = ranked.slice(0, 100).map((s) => ({
      id: s.id,
      name: s.name || 'Unknown',
      nickname: s.nickname || '',
      year: s.year || '',
      subjects: s.subjects || [],
      total: s.total || 0,
      sessionCount: s.sessionCount || 0,
      goldMedals: s.goldMedals || 0,
    }));
    await db.collection('leaderboard').doc('overall').set({
      top: overallTop,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Per-subject top 10 (from the incremental bestBySubject map)
    for (const subject of SUBJECTS) {
      const subjectBest = ranked
        .filter((s) => s.bestBySubject && s.bestBySubject[subject])
        .map((s) => ({
          id: s.id,
          name: s.name || 'Unknown',
          nickname: s.nickname || '',
          score: s.bestBySubject[subject].score,
          outOf: s.bestBySubject[subject].outOf || 100,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      await db.collection('leaderboard').doc(`subject_${subject.replace(/\s+/g, '_')}`).set({
        top: subjectBest,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Per-week top boards (cached so clients never scan the scores collection)
    const settingsSnap = await db.collection('settings').get();
    const weekDocs = settingsSnap.docs.map((d) => d.data());
    const weekEntries = {};
    for (const doc of weekDocs) {
      if (!doc.key || !doc.key.startsWith('quizDates_')) continue;
      const week = doc.key.replace('quizDates_', '');
      weekEntries[week] = true;
    }
    for (const week of Object.keys(weekEntries)) {
      const weekSnap = await db.collection('leaderboard_week_ranks')
        .where('week', '==', week)
        .orderBy('total', 'desc')
        .limit(100)
        .get();
      const top = weekSnap.docs.map((d) => {
        const s = d.data();
        return { id: d.id.split('_')[0], name: s.name || 'Unknown', nickname: s.nickname || '', total: s.total || 0, sessionCount: s.sessionCount || 0, goldMedals: s.goldMedals || 0 };
      });
      await db.collection('leaderboard').doc(`week_${week.replace(/\s+/g, '_')}`).set({
        top,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    console.log(`[Leaderboard] Computed for ${ranked.length} qualified students`);
  }
);

// Cheap, cache-friendly stats: counts via getCountFromServer (aggregate
// queries, no full collection scans) + a running average maintained by
// submitQuiz. getPortalStats just reads this doc.
exports.refreshPublicStats = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Africa/Lagos',
    run: { cpu: 0.08, memory: '256MiB' },
  },
  async () => {
    const activeWeek = await getActiveWeek();
    const [studentsCount, quizzesCount, weekCount] = await Promise.all([
      db.collection('students').count().get(),
      db.collection('scores').count().get(),
      db.collection('scores').where('week', '==', activeWeek).count().get(),
    ]);

    const counters = await db.collection('admin_settings').doc('stats_counters').get();
    const c = counters.exists ? counters.data() : {};

    // Highest JAMB total (0-400) — surfaced as "Top Score" on the marketing
    // page. Prefer the aggregated leaderboard total; fall back to the
    // single-subject max for early/bootstrapped deploys.
    let topScore = 0;
    let topScorePct = 0;
    try {
      const topRankSnap = await db.collection('leaderboard_student_ranks').orderBy('total', 'desc').limit(1).get();
      if (!topRankSnap.empty) {
        topScore = Math.round(topRankSnap.docs[0].data().total || 0);
      }
    } catch {}
    if (!topScore) {
      // Fallback: scan without index (works even while index builds) — finds 319 JAMB total
      try {
        const snap = await db.collection('leaderboard_student_ranks').limit(500).get();
        let max = 0;
        snap.docs.forEach((d) => { const t = d.data().total || 0; if (t > max) max = t; });
        if (max) topScore = Math.round(max);
      } catch {}
    }
    if (!topScore) {
      try {
        const topSnap = await db.collection('scores').orderBy('score', 'desc').limit(1).get();
        if (!topSnap.empty) {
          const v = Math.round(topSnap.docs[0].data().score || 0);
          topScorePct = v;
          topScore = v;
        }
      } catch {}
    } else {
      try {
        const topSnap = await db.collection('scores').orderBy('score', 'desc').limit(1).get();
        if (!topSnap.empty) topScorePct = Math.round(topSnap.docs[0].data().score || 0);
      } catch {}
    }

    // Last week's top (so Home can show the active week's best first, then all-time) — 319 was missing because index wasn't ready
    let topScoreLastWeek = 0;
    try {
      const weekSnap = await db.collection('scores').where('week', '==', activeWeek).orderBy('score', 'desc').limit(1).get();
      if (!weekSnap.empty) topScoreLastWeek = Math.round(weekSnap.docs[0].data().score || 0);
      if (!topScoreLastWeek) {
        const rankWeekSnap = await db.collection('leaderboard_week_ranks').where('week', '==', activeWeek).orderBy('total', 'desc').limit(1).get();
        if (!rankWeekSnap.empty) topScoreLastWeek = Math.round(rankWeekSnap.docs[0].data().total || 0);
      }
    } catch (e) {
      try {
        const snap = await db.collection('leaderboard_week_ranks').where('week', '==', activeWeek).limit(500).get();
        let max = 0;
        snap.docs.forEach((d) => { const t = d.data().total || 0; if (t > max) max = t; });
        topScoreLastWeek = Math.round(max);
        if (!topScoreLastWeek) {
          const sSnap = await db.collection('scores').where('week', '==', activeWeek).limit(200).get().catch(() => null);
          if (sSnap) { let m = 0; sSnap.docs.forEach((d) => { const s = d.data().score || 0; if (s > m) m = s; }); topScoreLastWeek = Math.round(m); }
        }
      } catch { topScoreLastWeek = 0; }
    }

    await db.collection('public_stats').doc('overview').set({
      totalStudents: studentsCount.data().count,
      activeSubscriptions: c.activeSubscriptions || 0,
      totalQuizzesTaken: quizzesCount.data().count,
      studentsActiveThisWeek: weekCount.data().count,
      averageScorePct: c.averageScorePct || 0,
      topScore,
      topScorePct,
      topScoreLastWeek,
      activeWeek,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
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

exports.computeAdminStats = onCall({ enforceAppCheck: false }, async (request) => {
  assertAdmin(request);
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
      // Revenue: for 'all' count every payment (even if student was deleted), for year groups only matching year
      const yrPayments = year === 'all' ? allPayments : allPayments.filter(p => ids.includes(p.studentId));

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
    run: { cpu: 0.08, memory: '256MiB' },
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
      const subs = subsSnap.docs;
      await mapWithConcurrency(subs, 20, async (subDoc) => {
        try {
          await webpush.sendNotification({ endpoint: subDoc.data().endpoint, keys: subDoc.data().keys }, payload);
          sent++;
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await db.collection('push_subscriptions').doc(subDoc.id).delete();
          }
        }
      });

      await guardRef.set({ sentAt: new Date().toISOString(), dateId: qd.id });
      console.log(`[QuizTimeReminder] Sent to ${sent} subscriber(s) for date${qd.id}`);
    }
  }
);

exports.testPushToAll = onCall(
  { secrets: ['VAPID_PRIVATE_KEY'], enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } },
  async (request) => {
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
  { secrets: ['TERMII_API_KEY', 'TERMII_SENDER_ID'], enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } },
  async (request) => {
    const TERMII_API_KEY = (process.env.TERMII_API_KEY || '').trim()
    if (!TERMII_API_KEY) return { ok: false, message: 'TERMII_API_KEY secret not set. Run: firebase functions:secrets:set TERMII_API_KEY' }

    const phone = normalizePhone(request.data?.phone || '')
    if (!phone) return { ok: false, message: 'Invalid phone number. Use international format (e.g. 2348012345678)' }

    const smsText = 'This is a test SMS from 274Lab. Your SMS integration is working correctly!'
    const resp = await fetch('https://api.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: TERMII_API_KEY, to: phone, from: TERMII_SENDER_ID, sms: smsText, type: 'plain', channel: 'generic' }),
    })
    const result = await resp.json()
    if (!resp.ok) return { ok: false, message: `Termii HTTP ${resp.status}: ${JSON.stringify(result)}` }
    if (result?.message?.err || result?.error) return { ok: false, message: result?.message?.err || result?.error }
    return { ok: true, message: `Test SMS sent to ${phone}` }
  }
);

exports.sendAccountabilityIntro = onCall(
  { secrets: ['TERMII_API_KEY', 'TERMII_SENDER_ID'], enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } },
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

exports.updateStudentProfile = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  const { studentId, ...fields } = request.data || {}
  if (!request.auth) throw new HttpsError('unauthenticated', 'Not authenticated')
  if (!studentId) throw new HttpsError('invalid-argument', 'Missing studentId')
  const allowed = ['parentPhone', 'teacherPhone', 'phone', 'subjects', 'nickname', 'email', 'name']
  const keys = Object.keys(fields)
  for (const k of keys) {
    if (!allowed.includes(k)) throw new HttpsError('invalid-argument', `Field not allowed: ${k}`)
  }
  // Store phones in the canonical form so teacher lookups (`where('teacherPhone',
  // '==', teacher.phone)`) match regardless of how the user typed them
  // (+234 prefix, spaces, dashes). Teacher phone matching depends on this.
  for (const k of ['parentPhone', 'teacherPhone', 'phone']) {
    if (k in fields && typeof fields[k] === 'string') {
      const n = normalizePhone(fields[k])
      fields[k] = n || null
    }
  }
  if (!keys.length) return { ok: true }
  const snap = await db.collection('students').doc(studentId).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Student not found')
  if (snap.data().uid !== request.auth.uid) throw new HttpsError('permission-denied', 'Not authorized')
  await snap.ref.update(fields)
  // Keep the public friend-search profile in sync (P2-1) — don't fail the whole save if this flakes.
  try { await syncStudentProfile(studentId) } catch (e) { console.error('[updateStudentProfile] sync failed:', e?.message || e) }
  return { ok: true }
});

// Write the public `student_profiles/{studentId}` doc (safe subset) used by the
// leaderboard friend-search, which must NOT read the full `students` docs
// (owner/admin-only). Owner or admin may call.
exports.syncStudentProfile = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  const { studentId } = request.data || {}
  if (!request.auth) throw new HttpsError('unauthenticated', 'Not authenticated')
  if (!studentId) throw new HttpsError('invalid-argument', 'Missing studentId')
  await syncStudentProfile(studentId, request.auth)
  return { ok: true }
});

// Admin-only backfill: (re)write every student_profiles doc from students.
exports.syncAllStudentProfiles = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  assertAdmin(request)
  const snap = await db.collection('students').get()
  const chunks = []
  for (let i = 0; i < snap.docs.length; i += 400) chunks.push(snap.docs.slice(i, i + 400))
  let count = 0
  for (const chunk of chunks) {
    const batch = db.batch()
    for (const d of chunk) {
      batch.set(db.collection('student_profiles').doc(d.id), buildStudentProfile(d.id, d.data()), { merge: true })
    }
    await batch.commit()
    count += chunk.length
  }
  return { ok: true, synced: count }
});

function buildStudentProfile(studentId, student) {
  const nameLower = (student.name || '').toLowerCase()
  const nameLowerWords = [...new Set(nameLower.split(/\s+/).filter(Boolean))].slice(0, 20)
  const nicknameLower = (student.nickname || '').toLowerCase().trim()
  return {
    studentId,
    name: student.name || '',
    nickname: student.nickname || '',
    nameLowerWords,
    nicknameLower,
    year: student.year || '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
}

async function syncStudentProfile(studentId, auth) {
  const snap = await db.collection('students').doc(studentId).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Student not found')
  const student = snap.data()
  if (auth) {
    const isAdmin = !!(auth.token && auth.token.admin)
    if (!isAdmin && student.uid && student.uid !== auth.uid) {
      throw new HttpsError('permission-denied', 'Not authorized')
    }
  }
  await db.collection('student_profiles').doc(studentId).set(buildStudentProfile(studentId, student), { merge: true })
}

exports.getPortalStats = onRequest(
  { cors: true, run: { cpu: 0.08, memory: '256MiB' } },
  async (req, res) => {
    try {
      const snap = await db.collection('public_stats').doc('overview').get();
      if (!snap.exists) {
        res.json({ ok: true, stats: null });
        return;
      }
      const d = snap.data();
      res.json({
        ok: true,
        stats: {
          totalStudents: d.totalStudents || 0,
          activeSubscriptions: d.activeSubscriptions || 0,
          totalQuizzesTaken: d.totalQuizzesTaken || 0,
          studentsActiveThisWeek: d.studentsActiveThisWeek || 0,
          averageScorePct: d.averageScorePct || 0,
          topScore: d.topScore ?? d.topScorePct ?? 0,
          topScorePct: d.topScorePct || 0,
          topScoreLastWeek: d.topScoreLastWeek ?? 0,
          activeWeek: d.activeWeek || 'Week 1',
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
    run: { cpu: 0.08, memory: '256MiB' },
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
        const subs = subsSnap.docs;
        await mapWithConcurrency(subs, 20, async (subDoc) => {
          const studentSnap = await db.collection('students').doc(subDoc.id).get();
          if (!studentSnap.exists) return;
          const s = studentSnap.data();
          const subUntil = s.subscriptionUntil ? new Date(s.subscriptionUntil).getTime() : 0;
          if (subUntil <= now && (s.freeAttemptsUsed || 0) >= 2) return;

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
        });
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

      // P1-1: throttle guestbook writes per IP to stop spam.
      if (!(await rateLimit(`guestbook:${ip}`, 5, 60 * 60 * 1000))) {
        res.status(429).json({ ok: false, error: 'Too many entries. Try again later.' });
        return;
      }

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
    secrets: ['TERMII_API_KEY', 'TERMII_SENDER_ID'],
    run: { cpu: 0.08, memory: '256MiB' },
  },
  async () => {
    const now = Date.now()
    console.log(`[AbsentSms] pass start ${new Date(now).toISOString()} TERMII_SENDER_ID='${(process.env.TERMII_SENDER_ID || '').trim()}'`)
    const TERMII_API_KEY = (process.env.TERMII_API_KEY || '').trim()
    if (!TERMII_API_KEY) { console.log('[AbsentSms] no TERMII_API_KEY'); return }

    const week = await getActiveWeek()
    console.log(`[AbsentSms] week=${week}`)

    // Get quiz dates for this week
    const settingsSnap = await db.collection('settings').get()
    const quizDoc = settingsSnap.docs.find((d) => d.data().key === `quizDates_${week}`)
    if (!quizDoc) {
      console.log(`[AbsentSms] no quizDates doc for key=quizDates_${week}; docs=`, settingsSnap.docs.map(d => `${d.id}:${d.data().key}`).join(', '))
      return
    }

    const { date1, date2 } = quizDoc.data()
    const quizDates = []
    if (date1) quizDates.push(new Date(date1).getTime())
    if (date2) quizDates.push(new Date(date2).getTime())
    if (!quizDates.length) { console.log('[AbsentSms] quizDates empty'); return }

    // Find the last quiz end time (assume each quiz is 2 hours long)
    const lastQuizEnd = Math.max(...quizDates) + (2 * 60 * 60 * 1000)

    // Fire 5 minutes after the last quiz ends
    const fireTime = lastQuizEnd + (5 * 60 * 1000)
    console.log(`[AbsentSms] date1=${date1}, date2=${date2}, lastQuizEnd=${new Date(lastQuizEnd).toISOString()}, fireTime=${new Date(fireTime).toISOString()}, wait=${((fireTime - now) / 60000).toFixed(1)}min`)
    if (now < fireTime) return

    // A manual admin week (Admin panel) with long-past quiz dates must not fire:
    // every student would be reported absent for a week they never had a chance to take.
    const MAX_STALE_MS = 8 * 24 * 60 * 60 * 1000
    if (now - fireTime > MAX_STALE_MS) {
      const activeWeekDocSnap = await db.collection('settings').doc('activeWeek').get()
      const manualWeek = activeWeekDocSnap.exists && activeWeekDocSnap.data().source === 'manual'
      if (manualWeek) {
        console.log(`[AbsentSms] manual week ${week} with stale schedule — skipping absent SMS`)
        return
      }
    }

    // Guard: only send once per week. A guard written by a failed pass (0 sent)
    // must NOT block forever — clear and retry.
    const weekGuardRef = db.collection('admin_settings').doc(`absent_sms_${week.replace(/\s/g, '_')}`)
    const weekGuardSnap = await weekGuardRef.get()
    if (weekGuardSnap.exists) {
      const sentCount = weekGuardSnap.data().sent || 0
      if (sentCount > 0) { console.log(`[AbsentSms] guard ${weekGuardRef.id} exists (sent ${sentCount}) -> already sent`); return }
      console.log(`[AbsentSms] guard ${weekGuardRef.id} exists but sent=0 (failed pass), clearing to retry`)
      await weekGuardRef.delete()
    }

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
      if (student.suspended || (student.missedStreak || 0) >= 6) {
        skipped++; continue
      }

      const phones = [
        { label: 'parent', phone: normalizePhone(student.parentPhone) },
        { label: 'teacher', phone: normalizePhone(student.teacherPhone) },
      ].filter((p) => p.phone)
      if (!phones.length) { skipped++; continue }

      const guardId = `absent_${studentId}_${week.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      const guardRef = db.collection('reminder_sent').doc(guardId)
      const existingGuard = await guardRef.get()
      if (existingGuard.exists && existingGuard.data().status === 'sent') { skipped++; continue }
      if (existingGuard.exists) await guardRef.delete()
      try {
        await guardRef.create({ status: 'sending', studentId, week, reason: 'absent', createdAt: admin.firestore.FieldValue.serverTimestamp() })
      } catch { skipped++; continue }

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
        await guardRef.delete().catch(() => {})
        skipped++
      }
    }

    if (sent > 0) {
      await weekGuardRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp(), week, sent })
    } else {
      console.log(`[AbsentSms] ${week}: nothing delivered (${skipped} skipped), keeping guard open for retry`)
    }
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
  // Bare 10-digit Nigerian number (e.g. 8036428999, no leading 0, no
  // country code) — prefix the +234 so SMS/OTP and teacher matching work.
  else if (s.length === 10 && /^[789]/.test(s)) s = '234' + s
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
    lines.push(`${abbr}${smsLabel ? `: (${smsLabel})` : ''} - ${scorePart}`)
  })
  lines.push('', 'Powered by 274lab')
  return lines.join('\n')
}

async function sendSmsTermii(apiKey, to, text, context = {}) {
  const truncated = text.slice(0, 765)
  try {
    const resp = await fetch('https://api.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, to, from: TERMII_SENDER_ID, sms: truncated, type: 'plain', channel: 'generic' }),
    })
    const result = await resp.json()
    if (!resp.ok) {
      const err = `Termii HTTP ${resp.status}: ${JSON.stringify(result)}`
      await recordSmsFailure(to, text, err, context)
      return { ok: false, error: err }
    }
    if (result?.message?.err || result?.error) {
      const err = result?.message?.err || result?.error
      await recordSmsFailure(to, text, err, context)
      return { ok: false, error: err }
    }
    return { ok: true, result }
  } catch (e) {
    const err = (e?.message || String(e))
    await recordSmsFailure(to, text, err, context)
    return { ok: false, error: err }
  }
}

// Persist failed sends so they surface in the admin panel / logs instead of
// vanishing silently. Context carries studentId/week/label for triage.
async function recordSmsFailure(to, text, error, context = {}) {
  try {
    await db.collection('sms_failures').add({
      to,
      sms: (text || '').slice(0, 200),
      error: String(error || '').slice(0, 500),
      senderId: TERMII_SENDER_ID,
      studentId: context.studentId || null,
      week: context.week || null,
      label: context.label || null,
      source: context.source || 'sendSmsTermii',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  } catch (e) {
    console.error('[recordSmsFailure] could not persist:', e?.message || e)
  }
}

// Real-time result SMS on quiz submission. Covers ALL enrolled subjects — a
// subject the student didn't answer renders ABS. Idempotent per student-week
// via the same reminder_sent namespace as the scheduled batch pass.
async function sendRealtimeResultSms(studentId, week, studentData, results) {
  const TERMII_API_KEY = (process.env.TERMII_API_KEY || '').trim()
  if (!TERMII_API_KEY) { console.log('[RealtimeSms] no TERMII_API_KEY'); return }

  const name = studentData.name || 'Student'
  const resultBySubject = {}
  ;(results || []).forEach((r) => { resultBySubject[r.subject] = r.score })

  const subjectsWithScore = (studentData.subjects || []).map((subject) => ({
    subject,
    score: typeof resultBySubject[subject] === 'number' ? resultBySubject[subject] : null,
  }))
  if (!subjectsWithScore.length) { console.log(`[RealtimeSms] ${studentId} no enrolled subjects`); return }

  const topicNames = await getWeekTopicNames(week)
  const smsText = buildSmsBody(name, week, subjectsWithScore, topicNames)

  const guardId = `sms_${studentId}_${week.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const guardRef = db.collection('reminder_sent').doc(guardId)
  const existing = await guardRef.get()
  if (existing.exists && existing.data().status === 'sent') {
    console.log(`[RealtimeSms] guard exists for ${studentId} ${week} -> skipping (already sent)`)
    return
  }
  if (existing.exists) await guardRef.delete()
  try {
    await guardRef.create({ status: 'sending', studentId, week, reason: 'result', source: 'realtime', createdAt: admin.firestore.FieldValue.serverTimestamp() })
  } catch (e) { console.log(`[RealtimeSms] guard claim failed for ${studentId}:`, e?.message || e); return }

  const phones = [
    { label: 'parent', phone: normalizePhone(studentData.parentPhone) },
    { label: 'teacher', phone: normalizePhone(studentData.teacherPhone) },
  ].filter((p) => p.phone)
  if (!phones.length) { console.log(`[RealtimeSms] ${studentId} no valid phones`); await guardRef.delete().catch(() => {}); return }

  let sentCount = 0
  for (const { label, phone } of phones) {
    try {
      const r = await sendSmsTermii(TERMII_API_KEY, phone, smsText, { studentId, week, label, source: 'realtime-result' })
      if (r.ok) { sentCount++; console.log(`[RealtimeSms] Sent to ${label} (${phone}) for ${studentId} ${week}`) }
      else console.error(`[RealtimeSms] Error for ${label} (${phone}):`, r.error)
    } catch (e) {
      console.error(`[RealtimeSms] Failed to send to ${label} (${phone}):`, e?.message || e)
    }
  }

  if (sentCount > 0) {
    await guardRef.update({ sentAt: admin.firestore.FieldValue.serverTimestamp(), sentTo: phones.map((p) => p.label), sentCount, status: 'sent' })
    console.log(`[RealtimeSms] ${studentId} ${week}: sent to ${sentCount} recipient(s)`)
  } else {
    await guardRef.delete().catch(() => {})
  }
}

exports.advanceWeek = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'Africa/Lagos',
    secrets: ['TERMII_API_KEY', 'TERMII_SENDER_ID'],
    run: { cpu: 0.08, memory: '256MiB' },
  },
  async () => {
    const now = Date.now()
    const week = await getActiveWeek()
    console.log(`[AdvanceWeek] week=${week}, now=${new Date(now).toISOString()}`)

    // A manual admin week set (Admin panel) must not be overridden by the stale
    // fast-forward: re-selecting an older week (e.g. Week 2) whose quizDates still
    // hold old dates would otherwise be yanked forward again (Week 2 → Week 11).
    // A *non-stale* manual week still auto-advances normally after its quiz ends.
    const activeWeekDocRef = db.collection('settings').doc('activeWeek')
    const activeWeekDocSnap = await activeWeekDocRef.get()
    const manualWeek = activeWeekDocSnap.exists && activeWeekDocSnap.data().source === 'manual'

    // Get quiz dates for this week
    const settingsSnap = await db.collection('settings').get()
    const quizDoc = settingsSnap.docs.find((d) => d.data().key === `quizDates_${week}`)
    if (!quizDoc) {
      console.log(`[AdvanceWeek] No quizDates doc found for key=quizDates_${week}. Docs:`, settingsSnap.docs.map(d => `${d.id}:${d.data().key}`).join(', '))
      return
    }

    const { date1, date2 } = quizDoc.data()
    console.log(`[AdvanceWeek] Found quizDates: date1=${date1}, date2=${date2}`)
    const quizDates = []
    if (date1) quizDates.push(new Date(date1).getTime())
    if (date2) quizDates.push(new Date(date2).getTime())
    if (!quizDates.length) { console.log('[AdvanceWeek] quizDates empty'); return }

    // Fire 1 hour after the last quiz ends (assume 2 hours per quiz)
    const lastQuizEnd = Math.max(...quizDates) + (2 * 60 * 60 * 1000)
    const fireTime = lastQuizEnd + (1 * 60 * 60 * 1000)
    console.log(`[AdvanceWeek] lastQuizEnd=${new Date(lastQuizEnd).toISOString()}, fireTime=${new Date(fireTime).toISOString()}, now=${new Date(now).toISOString()}, wait=${((fireTime - now) / 60000).toFixed(1)}min`)
    if (now < fireTime) return

    // If the schedule goes stale (quiz ended long ago) DON'T hard-stop forever:
    // a frozen week stops every weekly rollout (absent SMS, quiz SMS, reminders).
    // Instead fast-forward to the current week in ONE pass, based on the full
    // weeks elapsed since the last quiz ended, and realign that week's quiz dates
    // one week AHEAD so it is upcoming. Missed-streak/suspension logic is skipped
    // for the weeks that never actually ran, so nobody is falsely penalized.
    const MAX_STALE_MS = 8 * 24 * 60 * 60 * 1000
    const staleMs = now - fireTime
    if (staleMs > MAX_STALE_MS) {
      if (manualWeek) {
        console.log(`[AdvanceWeek] manual week ${week} with stale schedule — respecting admin, skipping fast-forward`)
        return
      }
      const staleMatch = week.match(/^Week\s+(\d+)$/i)
      if (!staleMatch) { console.log('[AdvanceWeek] Week format mismatch:', week); return }
      const DAY = 24 * 60 * 60 * 1000
      const weeksElapsed = Math.min(25, Math.max(1, Math.round(staleMs / (7 * DAY))))
      const baseNum = parseInt(staleMatch[1], 10)
      const targetNum = Math.min(baseNum + weeksElapsed, 26)
      const target = `Week ${targetNum}`
      if (targetNum === baseNum) { console.log('[AdvanceWeek] stale but same week; no-op'); return }

      const realignMs = (weeksElapsed + 1) * 7 * DAY
      const realigned1 = new Date(new Date(date1).getTime() + realignMs).toISOString()
      const realigned2 = date2 ? new Date(new Date(date2).getTime() + realignMs).toISOString() : ''
      const targetId = 'quizDates_' + String(target).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
      await db.collection('settings').doc(targetId).set({
        key: `quizDates_${target}`,
        date1: realigned1,
        date2: realigned2,
        autoScheduled: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      const activeWeekRef = db.collection('settings').doc('activeWeek')
      const activeWeekSnap = await activeWeekRef.get()
      if (!activeWeekSnap.exists) return
      await activeWeekDocRef.update({ value: target, updatedAt: admin.firestore.FieldValue.serverTimestamp(), source: 'auto' })
      await db.collection('admin_settings').doc(`advance_week_${week.replace(/\s/g, '_')}`).set({
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        week,
        advancedTo: target,
        fastForward: true,
      }).catch(() => {})
      console.log(`[AdvanceWeek] Stale fast-forward ${week} → ${target} (realigned ${weeksElapsed} stale week(s) skipped, no penalties). New quiz dates: ${realigned1} / ${realigned2}`)
      return
    }

    // Guard: only advance once per week. Self-healing: a guard that claims it
    // advanced (advancedTo set) but activeWeek is still this week means the
    // advance never stuck — clear it so we retry instead of being stuck forever.
    const weekGuardRef = db.collection('admin_settings').doc(`advance_week_${week.replace(/\s/g, '_')}`)
    const weekGuardSnap = await weekGuardRef.get()
    if (weekGuardSnap.exists) {
      const guardData = weekGuardSnap.data()
      if (guardData && guardData.advancedTo && guardData.advancedTo !== week) {
        console.log(`[AdvanceWeek] stale guard (claims advanced to ${guardData.advancedTo} but activeWeek is still ${week}), clearing to retry`)
        await weekGuardRef.delete()
      } else {
        console.log('[AdvanceWeek] Week guard already exists')
        return
      }
    }

    const TERMII_API_KEY = (process.env.TERMII_API_KEY || '').trim()
    const match = week.match(/^Week\s+(\d+)$/i)
    if (!match) { console.log('[AdvanceWeek] Week format mismatch:', week); return }
    const num = parseInt(match[1], 10)
    if (num >= 26) { console.log('[AdvanceWeek] Week >= 26'); return }
    const next = `Week ${num + 1}`
    const activeWeekRef = db.collection('settings').doc('activeWeek')
    const activeWeekSnap = await activeWeekRef.get()
    if (!activeWeekSnap.exists) return
    await activeWeekRef.update({ value: next, updatedAt: admin.firestore.FieldValue.serverTimestamp(), source: 'auto' })
    console.log(`[AdvanceWeek] Advanced from ${week} → ${next}`)

    // Self-sustaining schedule: auto-create the NEXT week's quiz dates (+7
    // days) if not already set, so the weekly cycle continues without admin
    // re-entry. The doc id is settings/quizDates_<Week_N>, key is the display
    // string — both must be present for getQuizDatesForWeek + the schedulers.
    if (date1) {
      const nextId = 'quizDates_' + String(next).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
      const nextDoc = await db.collection('settings').doc(nextId).get()
      if (!nextDoc.exists) {
        const DAY = 7 * 24 * 60 * 60 * 1000
        const nextDate1 = new Date(new Date(date1).getTime() + DAY).toISOString()
        const nextDate2 = date2 ? new Date(new Date(date2).getTime() + DAY).toISOString() : ''
        await db.collection('settings').doc(nextId).set({
          key: `quizDates_${next}`,
          date1: nextDate1,
          date2: nextDate2,
          autoScheduled: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        console.log(`[AdvanceWeek] Auto-scheduled ${next} quiz dates: ${nextDate1} / ${nextDate2}`)
      } else {
        console.log(`[AdvanceWeek] ${next} quiz dates already set — leaving them`)
      }
    }

    // ── Track missed streaks ──
    const scoresSnap = await db.collection('scores').get()
    const studentsWithScores = new Set()
    scoresSnap.forEach((d) => {
      const s = d.data()
      if (s.week === week && s.studentId) studentsWithScores.add(s.studentId)
    })

    const allStudents = await db.collection('students').get()
    let suspended = 0
    let appealed = 0

    // A student only "misses" a week they were actually enrolled for. A brand-new
    // registration must start fully fresh: never penalize students who joined
    // after this week's quiz window opened, or who haven't finished onboarding
    // (no subjects picked yet). Otherwise new accounts instantly rack up
    // missedStreak for weeks they never had a chance to take.
    const weekStart = Math.min(...quizDates)

    for (const doc of allStudents.docs) {
      const studentId = doc.id
      const student = doc.data()
      const joinedAt = student.joinedAt || student.trialStartedAt || ''
      const joinedTs = joinedAt ? new Date(joinedAt).getTime() : null
      const enrolledThisWeek = (joinedTs == null || joinedTs <= weekStart)
        && (student.subjects || []).length > 0
      let missedStreak = student.missedStreak || 0

      if (studentsWithScores.has(studentId)) {
        if (missedStreak > 0) {
          await doc.ref.update({ missedStreak: 0 })
          appealed++
        }
      } else if (enrolledThisWeek) {
        missedStreak++
        const update = { missedStreak }

        if (missedStreak >= 6 && !student.suspended) {
          update.suspended = true
          suspended++

          // Send suspension SMS to accountability partners (only if SMS provider is configured)
          if (TERMII_API_KEY) {
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
        }

        await doc.ref.update(update)
      } else if (missedStreak > 0) {
        // Joined after this week's quiz window or still onboarding — they can
        // never be penalized for this week, so clear any stale streak left over
        // from before the join-date guard existed.
        await doc.ref.update({ missedStreak: 0 })
      }
    }

    console.log(`[AdvanceWeek] Missed streaks: ${appealed} reset, ${allStudents.docs.length - appealed - suspended + (allStudents.docs.filter(d => !studentsWithScores.has(d.id)).length)} incremented, ${suspended} suspended`)
    await weekGuardRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp(), week: week, advancedTo: next })
  }
)

exports.sendQuizSmsReport = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'Africa/Lagos',
    secrets: ['TERMII_API_KEY', 'TERMII_SENDER_ID'],
    run: { cpu: 0.08, memory: '256MiB' },
  },
  async () => {
    // P2-3: per-score trigger removed — a per-doc trigger would fire once per
    // score write (up to ~8x students at 100k concurrency). This scheduled pass
    // runs AFTER the window closes and sends ONE report per student-week.
    const now = Date.now()
    console.log(`[SmsReport] pass start ${new Date(now).toISOString()} TERMII_SENDER_ID='${(process.env.TERMII_SENDER_ID || '').trim()}'`)
    const TERMII_API_KEY = (process.env.TERMII_API_KEY || '').trim()
    if (!TERMII_API_KEY) { console.log('[SmsReport] no TERMII_API_KEY'); return }

    const week = await getActiveWeek()
    console.log(`[SmsReport] week=${week}`)

    // Get quiz dates for this week
    const settingsSnap = await db.collection('settings').get()
    const quizDoc = settingsSnap.docs.find((d) => d.data().key === `quizDates_${week}`)
    if (!quizDoc) {
      console.log(`[SmsReport] no quizDates doc for key=quizDates_${week}; docs=`, settingsSnap.docs.map(d => `${d.id}:${d.data().key}`).join(', '))
      return
    }

    const { date1, date2 } = quizDoc.data()
    const quizDates = []
    if (date1) quizDates.push(new Date(date1).getTime())
    if (date2) quizDates.push(new Date(date2).getTime())
    if (!quizDates.length) { console.log('[SmsReport] quizDates empty'); return }

    // Fire 5 minutes after the last quiz window ends (2h per quiz).
    const lastQuizEnd = Math.max(...quizDates) + (2 * 60 * 60 * 1000)
    const fireTime = lastQuizEnd + (5 * 60 * 1000)
    console.log(`[SmsReport] date1=${date1}, date2=${date2}, lastQuizEnd=${new Date(lastQuizEnd).toISOString()}, fireTime=${new Date(fireTime).toISOString()}, wait=${((fireTime - now) / 60000).toFixed(1)}min`)
    if (now < fireTime) return

    // A manual admin week (Admin panel) with long-past quiz dates must not fire:
    // every student with no score would be reported for a week that never ran.
    const MAX_STALE_MS = 8 * 24 * 60 * 60 * 1000
    if (now - fireTime > MAX_STALE_MS) {
      const activeWeekDocSnap = await db.collection('settings').doc('activeWeek').get()
      const manualWeek = activeWeekDocSnap.exists && activeWeekDocSnap.data().source === 'manual'
      if (manualWeek) {
        console.log(`[SmsReport] manual week ${week} with stale schedule — skipping quiz SMS`)
        return
      }
    }

    // Per-week guard so we only scan + send once. A guard written by a failed
    // pass (old code always wrote it even when 0 sent) must NOT block forever:
    // delete it and retry when it records zero deliveries.
    const weekGuardRef = db.collection('admin_settings').doc(`quiz_sms_${week.replace(/\s/g, '_')}`)
    const weekGuardSnap = await weekGuardRef.get()
    if (weekGuardSnap.exists) {
      const sentCount = weekGuardSnap.data().sent || 0
      if (sentCount > 0) { console.log(`[SmsReport] guard ${weekGuardRef.id} exists (sent ${sentCount}) -> already sent`); return }
      console.log(`[SmsReport] guard ${weekGuardRef.id} exists but sent=0 (failed pass), clearing to retry`)
      await weekGuardRef.delete()
    }

    const scoresSnap = await db.collection('scores').where('week', '==', week).get()
    console.log(`[SmsReport] ${week} scores=${scoresSnap.size}`)
    // Group scores by student; a report only sends once ALL enrolled subjects
    // have a score, mirroring the old per-trigger "complete set" check.
    const byStudent = {}
    scoresSnap.forEach((d) => {
      const s = d.data()
      if (!s.studentId) return
      if (!byStudent[s.studentId]) byStudent[s.studentId] = []
      byStudent[s.studentId].push(s)
    })
    console.log(`[SmsReport] ${week} studentsWithScores=${Object.keys(byStudent).length}`)

    const studentsMap = {}
    const studentIds = Object.keys(byStudent)
    if (studentIds.length) {
      const allStudents = await db.collection('students').get()
      allStudents.forEach((d) => { studentsMap[d.id] = d.data() })
    }

    const topicNames = await getWeekTopicNames(week)
    let sent = 0
    let skipped = 0

    for (const studentId of Object.keys(byStudent)) {
      const weekScores = byStudent[studentId]
      const student = studentsMap[studentId]
      if (!student) { skipped++; continue }
      if (student.suspended || (student.missedStreak || 0) >= 6) { skipped++; continue }

      const enrolledCount = (student.subjects || []).length
      const submittedSubjects = new Set(weekScores.map((s) => s.subject))
      if (submittedSubjects.size === 0) { skipped++; continue }

      const name = student.name || 'Student'

      // Guard: atomic claim prevents duplicate sends from overlapping passes.
      // A claim that never recorded a delivery (failed pass) is released.
      const guardId = `sms_${studentId}_${week.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      const guardRef = db.collection('reminder_sent').doc(guardId)
      const existingGuard = await guardRef.get()
      if (existingGuard.exists && (existingGuard.data().status === 'sent')) { skipped++; continue }
      if (existingGuard.exists) await guardRef.delete()
      try {
        await guardRef.create({ status: 'sending', studentId, week, createdAt: admin.firestore.FieldValue.serverTimestamp() })
      } catch { skipped++; continue }

      const subjectsWithScore = (student.subjects || []).map((subject) => {
        const found = weekScores.find((s) => s.subject === subject)
        return { subject, score: found ? found.score : null }
      })

      const smsText = buildSmsBody(name, week, subjectsWithScore, topicNames)
      const truncated = smsText.slice(0, 765)

      const phones = [
        { label: 'parent', phone: normalizePhone(student.parentPhone) },
        { label: 'teacher', phone: normalizePhone(student.teacherPhone) },
      ].filter((p) => p.phone)

      if (!phones.length) { skipped++; continue }

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
        await guardRef.update({
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          sentTo: phones.map((p) => p.label),
          sentCount,
          status: 'sent',
        })
        sent++
        console.log(`[SmsReport] ${studentId} ${week}: sent to ${sentCount} recipient(s)`)
      } else {
        // Nothing delivered (Termii error / no valid phone). Release the guard
        // so the next pass retries instead of skipping this student forever.
        await guardRef.delete().catch(() => {})
        skipped++
      }
    }

    // Only lock the week when at least one report was actually delivered. A
    // pass that sends 0 must NOT burn the week guard, otherwise a transient
    // Termii failure permanently kills the report for that week.
    if (sent > 0) {
      await weekGuardRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp(), week, sent })
    } else {
      console.log(`[SmsReport] ${week}: nothing delivered (${skipped} skipped), keeping guard open for retry`)
    }
    console.log(`[SmsReport] Done. Sent ${sent} reports. Skipped ${skipped}`)
  }
)

exports.clearSmsGuards = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async () => {
  const batch = db.batch()
  let count = 0
  const reminderSnap = await db.collection('reminder_sent').get()
  reminderSnap.forEach((d) => { batch.delete(d.ref); count++ })
  const weekSnap = await db.collection('admin_settings').get()
  weekSnap.forEach((d) => {
    if (/^quiz_sms_/i.test(d.id) || /^absent_sms_/i.test(d.id) || /^advance_week_/i.test(d.id)) { batch.delete(d.ref); count++ }
  })
  if (count > 0) await batch.commit()
  return { ok: true, deleted: count }
})

// Diagnostic helper (admin callable) — returns the exact data the scheduled SMS
// passes see, so "why is nothing sending" is answerable from the admin panel.
exports.debugSmsState = onCall({ secrets: ['TERMII_API_KEY', 'TERMII_SENDER_ID'], enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async () => {
  const week = await getActiveWeek()

  const settingsSnap = await db.collection('settings').get()
  const quizDoc = settingsSnap.docs.find((d) => d.data().key === `quizDates_${week}`)
  const { date1, date2 } = quizDoc ? quizDoc.data() : {}

  const scoresSnap = await db.collection('scores').where('week', '==', week).get()
  const byStudent = {}
  scoresSnap.forEach((d) => {
    const s = d.data()
    if (!s.studentId) return
    if (!byStudent[s.studentId]) byStudent[s.studentId] = []
    byStudent[s.studentId].push({ subject: s.subject, score: s.score, date: s.date || '' })
  })

  const allStudents = await db.collection('students').get()
  const students = allStudents.docs.map((d) => {
    const s = d.data()
    return {
      id: d.id,
      name: s.name || '',
      subjects: s.subjects || [],
      suspended: !!s.suspended,
      missedStreak: s.missedStreak || 0,
      parentPhone: normalizePhone(s.parentPhone),
      teacherPhone: normalizePhone(s.teacherPhone),
      hasScore: !!byStudent[d.id],
    }
  })

  // Orphan analysis: score.studentId values that don't match a students doc id.
  // Legacy imports often key scores by the auth UID or a pre-migration doc id.
  const studentDocIds = new Set(allStudents.docs.map((d) => d.id))
  const studentUids = new Set(allStudents.docs.map((d) => d.data().uid).filter(Boolean))
  const orphanIds = Object.keys(byStudent).filter((id) => !studentDocIds.has(id))
  const orphanDetail = orphanIds.map((id) => {
    const entries = byStudent[id]
    const dates = entries.map((e) => e.date).filter(Boolean).sort()
    return {
      studentId: id,
      isUid: studentUids.has(id),
      scores: entries.length,
      subjects: [...new Set(entries.map((e) => e.subject))],
      minScore: Math.min(...entries.map((e) => e.score)),
      maxScore: Math.max(...entries.map((e) => e.score)),
      firstDate: dates[0] || null,
      lastDate: dates[dates.length - 1] || null,
    }
  })

  const weekGuardRefs = ['quiz_sms', 'absent_sms', 'advance_week'].map((p) =>
    db.collection('admin_settings').doc(`${p}_${week.replace(/\s/g, '_')}`))
  const guards = {}
  for (const ref of weekGuardRefs) {
    const snap = await ref.get()
    guards[ref.id] = snap.exists ? snap.data() : null
  }
  const reminderSnap = await db.collection('reminder_sent').get()
  guards.perStudent = reminderSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  return {
    ok: true,
    activeWeek: week,
    quizDates: { date1, date2 },
    scores: { total: scoresSnap.size, students: Object.keys(byStudent).length, byStudent, orphanIds: orphanDetail },
    students: {
      total: students.length,
      withScore: students.filter((s) => s.hasScore).length,
      withoutScore: students.filter((s) => !s.hasScore).length,
      withPhone: students.filter((s) => s.parentPhone || s.teacherPhone).length,
      withoutPhone: students.filter((s) => !s.parentPhone && !s.teacherPhone).length,
      suspended: students.filter((s) => s.suspended || s.missedStreak >= 6).length,
    },
    guards,
    termii: { senderId: TERMII_SENDER_ID, hasApiKey: !!(process.env.TERMII_API_KEY || '').trim() },
  }
})

// ─── SECURE PAYMENT / PRIVILEGED WRITES ───
// These run with Admin SDK (bypass client rules) and verify via Bachs server-side
// so a client can NEVER grant itself premium or clear a suspension without paying.

const SUBSCRIPTION_PRICE_NGN = 800
const RESUME_PRICE_NGN = 800
const crypto = require('crypto')

function bachsApiHeaders() {
  const key = (process.env.BACHS_API_KEY || '').trim()
  if (!key) throw new HttpsError('failed-precondition', 'BACHS_API_KEY not configured. Set it with: firebase functions:secrets:set BACHS_API_KEY')
  return { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }
}

async function retrieveBachsCheckout(checkoutId) {
  const res = await fetch('https://api.bachs.io/v1/checkout-sessions/' + encodeURIComponent(checkoutId), {
    headers: bachsApiHeaders(),
  })
  if (!res.ok) throw new HttpsError('internal', 'Failed to retrieve checkout from Bachs')
  return res.json()
}

// Store checkout mapping so webhooks know which student/type this checkout belongs to.
async function saveBachsCheckoutMapping(checkoutId, studentId, type) {
  await db.collection('bachsCheckouts').doc(checkoutId).set({
    studentId,
    type,
    status: 'PENDING',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })
}

// Fulfill a paid Bachs checkout exactly once. The student update, payment record
// and status flip run inside ONE transaction and the status claim (PENDING →
// FULFILLED) makes concurrent webhook + client calls idempotent: whoever
// commits first wins, the other observes FULFILLED and returns early (P0-6).
async function fulfillBachsCheckout(checkoutId, chargeData) {
  const mapRef = db.collection('bachsCheckouts').doc(checkoutId)

  const mapSnap = await mapRef.get()
  if (!mapSnap.exists) throw new HttpsError('not-found', 'Checkout mapping not found')
  const map = mapSnap.data()
  if (map.status === 'FULFILLED') return { ok: true, alreadyFulfilled: true }

  // Fetch charge data from Bachs (network I/O stays OUTSIDE the transaction so
  // a retried transaction never re-hits the network).
  if (!chargeData) {
    const checkout = await retrieveBachsCheckout(checkoutId)
    if (!checkout.charge_id) throw new HttpsError('failed-precondition', 'Checkout has no associated charge')
    const chargeRes = await fetch('https://api.bachs.io/v1/payments/' + encodeURIComponent(checkout.charge_id), {
      headers: bachsApiHeaders(),
    })
    if (!chargeRes.ok) throw new HttpsError('internal', 'Failed to retrieve payment')
    chargeData = await chargeRes.json()
  }

  return db.runTransaction(async (t) => {
    const freshSnap = await t.get(mapRef)
    if (!freshSnap.exists) throw new HttpsError('not-found', 'Checkout mapping not found')
    const fresh = freshSnap.data()
    if (fresh.status === 'FULFILLED') return { ok: true, alreadyFulfilled: true }

    const studentSnap = await t.get(db.collection('students').doc(fresh.studentId))
    if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found')
    const student = studentSnap.data()

    // Verify amount/currency for Bachs as well — prevents underpayment
    const expectedBachsNgn = fresh.type === 'subscription' ? SUBSCRIPTION_PRICE_NGN : RESUME_PRICE_NGN
    const paidBachsNgn = Math.round(parseFloat(chargeData.amount || '0'))
    if (chargeData.currency && chargeData.currency !== 'NGN') throw new HttpsError('failed-precondition', 'Invalid currency')
    if (paidBachsNgn < expectedBachsNgn) throw new HttpsError('failed-precondition', `Underpayment: expected ₦${expectedBachsNgn}, got ₦${paidBachsNgn}`)

    const updates = {}
    const paymentRecord = {
      studentId: fresh.studentId,
      uid: student.uid || '',
      studentName: student.name,
      email: (chargeData.customer && chargeData.customer.email) || student.email || '',
      amount: paidBachsNgn,
      currency: chargeData.currency || 'NGN',
      method: 'bachs',
      reference: chargeData.reference || checkoutId,
      checkoutId,
      paidAt: new Date().toISOString(),
    }

    if (fresh.type === 'subscription') {
      const iso = computeExpiry(student.subscriptionUntil, 1)
      updates.subscriptionUntil = iso
      paymentRecord.extendsTo = iso
    } else if (fresh.type === 'resume') {
      updates.missedStreak = 0
      updates.suspended = false
      updates.appealedAt = admin.firestore.FieldValue.serverTimestamp()
      paymentRecord.type = 'account_resume'
    }

    t.update(studentSnap.ref, updates)
    t.set(db.collection('payments').doc(), paymentRecord)
    t.update(mapRef, { status: 'FULFILLED', fulfilledAt: admin.firestore.FieldValue.serverTimestamp() })
    return { ok: true }
  })
}

// Verify Bachs webhook signature (HMAC-SHA256).
function verifyBachsSignature(rawBody, timestampHeader, signatureHeader) {
  const secret = (process.env.BACHS_WEBHOOK_SECRET || '').trim()
  if (!secret) return false
  const timestamp = parseInt(timestampHeader, 10)
  if (isNaN(timestamp)) return false
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false
  const message = `${timestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', secret).update(message, 'utf8').digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader))
  } catch { return false }
}

function computeExpiry(currentIso, months) {
  const now = Date.now()
  const current = currentIso ? new Date(currentIso).getTime() : 0
  const anchor = Math.max(now, current)
  const next = new Date(anchor)
  next.setMonth(next.getMonth() + months)
  return next.toISOString()
}

    // ─── FIREBASE AUTH ───
    // Identity is Firebase Authentication. The web client signs in and the
    // security rules rely on request.auth.uid. Admin access is a custom claim.

    const AUTH_EMAIL_DOMAIN = '274lab.app'
    const ADMIN_EMAIL = 'admin@274lab.app'
    function studentAuthEmail(nameLower) {
      const safe = String(nameLower).replace(/\s+/g, '.').toLowerCase()
      return `${safe}@${AUTH_EMAIL_DOMAIN}`
    }

    // Kept only to verify legacy password hashes during account migration.
    function hashPasswordServer(password) {
      const salt = crypto.randomBytes(16).toString('hex')
      const hash = crypto.createHash('sha256').update(salt + password).digest('hex')
      return 'sha256$' + salt + '$' + hash
    }

    function verifyPasswordServer(password, storedHash) {
      if (!storedHash) return false
      if (storedHash.startsWith('sha256$')) {
        const parts = storedHash.split('$')
        if (parts.length !== 3) return false
        const salt = parts[1]
        const hash = crypto.createHash('sha256').update(salt + password).digest('hex')
        return storedHash === 'sha256$' + salt + '$' + hash
      }
      return password === storedHash
    }

    // One-time admin setup: create the admin Firebase Auth user (if needed) and
    // grant the `admin` custom claim. Admin sign-in then uses Firebase Auth and
    // the claim is checked by the security rules.
    exports.setupAdmin = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
      const { adminPassword } = request.data || {}
      if (!adminPassword || adminPassword.length < 8) throw new HttpsError('invalid-argument', 'Password must be at least 8 characters')
      try {
        let userRecord
        try {
          userRecord = await admin.auth().getUserByEmail(ADMIN_EMAIL)
        } catch (e) {
          userRecord = await admin.auth().createUser({ email: ADMIN_EMAIL, password: adminPassword, emailVerified: false })
        }
        await admin.auth().updateUser(userRecord.uid, { password: adminPassword })
        await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true })
      } catch (e) {
        throw new HttpsError('internal', e.message || 'Failed to configure admin')
      }
      return { ok: true }
    })

    exports.adminExists = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async () => {
      try {
        await admin.auth().getUserByEmail(ADMIN_EMAIL)
        return { exists: true }
      } catch (e) {
        return { exists: false }
      }
    })

    // Legacy-account bridge. Old accounts stored salted hashes (no Firebase user).
    // If name+password matches, create the Firebase user and sign in with a
    // custom token. Sets the Firebase password to the user's existing password
    // so the client can sign in directly next time without the legacy fallback.
    exports.verifyLegacyLogin = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
      assertAppCheck(request)
      const { name, password } = request.data || {}
      if (!name || !password) throw new HttpsError('invalid-argument', 'Missing name or password')
      const nameLower = name.toLowerCase().trim()

      // P1-1: throttle the password oracle — 5 attempts per 15 min per account
      // so legacy salted hashes can't be brute-forced through the public callable.
      const ip = (request.rawRequest && request.rawRequest.ip) || 'unknown'
      if (!(await rateLimit(`verifyLegacy:${nameLower}:${ip}`, 5, 15 * 60 * 1000))) {
        throw new HttpsError('resource-exhausted', 'Too many attempts. Try again in a few minutes.')
      }

      const snap = await db.collection('students').where('nameLower', '==', nameLower).limit(1).get()
      if (snap.empty) return { ok: false }
      const studentDoc = snap.docs[0]
      const student = studentDoc.data()
      let storedHash = student.password
      if (!storedHash) {
        const authSnap = await db.collection('student_auth').doc(studentDoc.id).get()
        if (!authSnap.exists) return { ok: false }
        storedHash = authSnap.data().password
      }
      if (!verifyPasswordServer(password, storedHash)) return { ok: false }
      const email = studentAuthEmail(nameLower)
      let userRecord
      try {
        userRecord = await admin.auth().getUserByEmail(email)
      } catch (e) {
        try {
          userRecord = await admin.auth().createUser({ email, password, emailVerified: false })
        } catch (e2) {
          // Password too short for Firebase min length — create with a random
          // password; the user will need to use the forgot-password flow.
          userRecord = await admin.auth().createUser({ email, password: crypto.randomBytes(16).toString('hex'), emailVerified: false })
        }
      }
      const updates = { uid: userRecord.uid }
      if (student.password) updates.password = admin.firestore.FieldValue.delete()
      await studentDoc.ref.update(updates)
      const customToken = await admin.auth().createCustomToken(userRecord.uid)
      return { ok: true, customToken }
    })

    // Stamp `uid` from any existing Firebase user onto legacy student docs.
    exports.migrateLegacyAuth = onCall({ enforceAppCheck: true, run: { cpu: 0.08, memory: '256MiB' } }, async () => {
      const BATCH = 500
      const snap = await db.collection('students').where('uid', '==', null).limit(BATCH).get()
      let migrated = 0
      for (const docSnap of snap.docs) {
        const data = docSnap.data()
        const nameLower = data.nameLower || (data.name || '').toLowerCase().trim()
        if (!nameLower) continue
        try {
          const user = await admin.auth().getUserByEmail(studentAuthEmail(nameLower))
          await docSnap.ref.update({ uid: user.uid })
          migrated++
        } catch (e) {
          // No Firebase user yet — created on first bridge login.
        }
      }
      return { migrated, remaining: Math.max(0, snap.size - migrated) }
    })

    // Forgot-password flow (no current password required). Creates/migrates the
    // Firebase account if needed, then sets the new password via Admin SDK.
    exports.resetPassword = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
      assertAppCheck(request)
      const { name, newPassword } = request.data || {}
      if (!name || !newPassword) throw new HttpsError('invalid-argument', 'Missing name or new password')
      if (newPassword.length < 8) throw new HttpsError('invalid-argument', 'Password must be at least 8 characters')
      const nameLower = name.toLowerCase().trim()

      // P1-1: throttle password resets (per account) to prevent mailbox flooding
      // and auth-user creation abuse.
      if (!(await rateLimit(`resetPassword:${nameLower}`, 3, 15 * 60 * 1000))) {
        throw new HttpsError('resource-exhausted', 'Too many reset attempts. Try again in a few minutes.')
      }

      const snap = await db.collection('students').where('nameLower', '==', nameLower).limit(1).get()
      if (snap.empty) throw new HttpsError('not-found', 'No account found with that name')
      const studentDoc = snap.docs[0]
      const student = studentDoc.data()
      const email = studentAuthEmail(nameLower)
      let uid = student.uid
      if (uid) {
        await admin.auth().updateUser(uid, { password: newPassword })
      } else {
        // No Firebase user yet — create one and stamp the uid.
        let userRecord
        try {
          userRecord = await admin.auth().getUserByEmail(email)
        } catch {
          userRecord = await admin.auth().createUser({ email, password: newPassword, emailVerified: false })
        }
        uid = userRecord.uid
        await studentDoc.ref.update({ uid })
      }
      return { ok: true }
    })

// ─── PRIVILEGED WRITES ───
// These verify the caller's Firebase identity (request.auth) instead of a
// password. Admin actions require the `admin` custom claim; student payment
// actions require the caller to be the owner of the student doc (uid match).

function assertAdmin(request) {
  if (!request.auth || !request.auth.token || !request.auth.token.admin) {
    throw new HttpsError('permission-denied', 'Admin access required')
  }
}

function assertOwnsStudent(request, student) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required')
  if (student.uid && student.uid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'This account does not match the signed-in user')
  }
}

exports.adminGrantSubscription = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  assertAdmin(request)
  const { studentId, expiry } = request.data || {}
  if (!studentId || !expiry) throw new HttpsError('invalid-argument', 'Missing studentId or expiry')
  const parsed = new Date(expiry)
  if (isNaN(parsed.getTime()) || parsed.toISOString() !== expiry) {
    throw new HttpsError('invalid-argument', 'Invalid expiry date')
  }
  const studentSnap = await db.collection('students').doc(studentId).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found')
  await studentSnap.ref.update({ subscriptionUntil: expiry })
  return { ok: true, subscriptionUntil: expiry }
})

exports.adminDeleteStudent = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  assertAdmin(request)
  const { studentId } = request.data || {}
  if (!studentId) throw new HttpsError('invalid-argument', 'Missing studentId')
  const studentSnap = await db.collection('students').doc(studentId).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found')
  const uid = studentSnap.data().uid

  // Cascade-clean every collection that holds data for this student so nothing
  // (scores, profiles, subscriptions, push subs) survives the deletion.
  await Promise.allSettled([
    db.collection('students').doc(studentId).delete(),
    uid ? db.collection('student_profiles').doc(studentId).delete() : Promise.resolve(),
    uid ? db.collection('push_subscriptions').doc(studentId).delete() : Promise.resolve(),
    uid ? db.collection('notification_state').doc(studentId).delete() : Promise.resolve(),
    uid ? db.collection('leaderboard_student_ranks').doc(studentId).delete() : Promise.resolve(),
    uid ? db.collection('scores').where('studentId', '==', studentId).get()
      .then((s) => Promise.allSettled(s.docs.map((d) => d.ref.delete()))) : Promise.resolve(),
    uid ? db.collection('scoreDetails').where('studentId', '==', studentId).get()
      .then((s) => Promise.allSettled(s.docs.map((d) => d.ref.delete()))) : Promise.resolve(),
    uid ? db.collection('payments').where('studentId', '==', studentId).get()
      .then((s) => Promise.allSettled(s.docs.map((d) => d.ref.delete()))) : Promise.resolve(),
  ])

  // Revoke the Firebase Auth account so the student can no longer sign in.
  if (uid) {
    try {
      await admin.auth().deleteUser(uid)
    } catch (e) {
      console.error(`[AdminDeleteStudent] Auth delete skipped for ${uid}:`, e?.message || e)
    }
  }
  return { ok: true }
})

// Create a Bachs checkout session and store the student mapping for webhook fulfillment.
exports.createBachsCheckout = onCall({ enforceAppCheck: false, secrets: ['BACHS_API_KEY'], run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required')
  assertAppCheck(request)
  const { studentId, type, successUrl, cancelUrl } = request.data || {}
  if (!studentId || !type) throw new HttpsError('invalid-argument', 'Missing studentId or type')
  if (!['subscription', 'resume'].includes(type)) throw new HttpsError('invalid-argument', 'Type must be "subscription" or "resume"')

  // P1-1: throttle checkout creation (free endpoints at Bachs otherwise become
  // a spam surface).
  if (!(await rateLimit(`checkout:${request.auth.uid}`, 10, 60 * 60 * 1000))) {
    throw new HttpsError('resource-exhausted', 'Too many checkouts. Try again later.')
  }

  const studentSnap = await db.collection('students').doc(studentId).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found')
  const student = studentSnap.data()
  assertOwnsStudent(request, student)

  const productIdEnv = type === 'subscription' ? 'BACHS_SUBSCRIPTION_PRODUCT_ID' : 'BACHS_RESUME_PRODUCT_ID'
  const productId = (process.env[productIdEnv] || '').trim()
  if (!productId) {
    throw new HttpsError('failed-precondition', `${productIdEnv} not configured. Create a product in your Bachs dashboard and set this env var.`)
  }

  const body = {
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: {
      email: student.email || `${student.name.toLowerCase().replace(/\s+/g, '.')}@274lab.com`,
      name: student.name,
    },
    metadata: { studentId, type },
    reference: `${type === 'subscription' ? 'SUB' : 'RES'}-${studentId}-${Date.now()}`,
  }
  if (successUrl) body.success_url = successUrl
  if (cancelUrl) body.cancel_url = cancelUrl

  const res = await fetch('https://api.bachs.io/v1/checkout-sessions', {
    method: 'POST',
    headers: bachsApiHeaders(),
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok || !data.checkout_url) {
    throw new HttpsError('internal', 'Failed to create Bachs checkout: ' + (data.detail || res.statusText))
  }

  await saveBachsCheckoutMapping(data.checkout_id, studentId, type)
  return { checkout_url: data.checkout_url, checkout_id: data.checkout_id }
})

// Called from the client after the overlay completes or on redirect return.
exports.completeBachsCheckout = onCall({ enforceAppCheck: false, secrets: ['BACHS_API_KEY'], run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required')
  const { checkoutId } = request.data || {}
  if (!checkoutId) throw new HttpsError('invalid-argument', 'Missing checkoutId')

  // Ownership check: the caller may only fulfill their OWN checkout, not one
  // they received or guessed from a friend/network request (P0-6).
  const mapSnap = await db.collection('bachsCheckouts').doc(checkoutId).get()
  if (!mapSnap.exists) throw new HttpsError('not-found', 'Checkout mapping not found')
  const map = mapSnap.data()
  const studentSnap = await db.collection('students').doc(map.studentId).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found')
  assertOwnsStudent(request, studentSnap.data())

  const result = await fulfillBachsCheckout(checkoutId, null)
  return result
})

// Webhook endpoint — Bachs delivers collection.succeeded here.
// TODO: Add HMAC signature verification (X-Bachs-Signature header) using
// BACHS_WEBHOOK_SECRET once req.rawBody is reliably available in this runtime.
exports.bachsWebhook = onRequest({ cors: true, secrets: ['BACHS_API_KEY', 'BACHS_WEBHOOK_TOKEN', 'BACHS_WEBHOOK_SECRET'], run: { cpu: 0.08, memory: '256MiB' } }, async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).end(); return }

  const tokenVal = (process.env.BACHS_WEBHOOK_TOKEN || '').trim()
  const tokenOk = req.query.token === tokenVal || req.headers['x-bachs-token'] === tokenVal

  const secretVal = (process.env.BACHS_WEBHOOK_SECRET || '').trim()
  let sigOk = false
  if (secretVal) {
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body)
    sigOk = verifyBachsSignature(rawBody, (req.headers['x-bachs-timestamp'] || ''), (req.headers['x-bachs-signature'] || ''))
  }

  if (!tokenOk && !sigOk) {
    res.status(401).send('Unauthorized')
    return
  }

  try {
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (event.type === 'collection.succeeded' && event.data && event.data.checkout_id) {
      await fulfillBachsCheckout(event.data.checkout_id, event.data)
    }
    res.status(200).send('ok')
  } catch (e) {
    console.error('bachsWebhook error:', e)
    res.status(500).send('error')
  }
})

// ─── PAYSTACK (PRIMARY) — BACHS IS THE BACKUP ────────────────────────────
// Paystack is the main checkout. Bachs remains as a fallback if Paystack is
// not configured or the initialize call fails. Both gateways fulfill the same
// way (extend subscription, write a payments doc, mark the checkout mapping).

function paystackSecretOrThrow() {
  const k = (process.env.PAYSTACK_SECRET_KEY || '').trim()
  if (!k) throw new HttpsError('failed-precondition', 'PAYSTACK_SECRET_KEY not configured. Set it with: firebase functions:secrets:set PAYSTACK_SECRET_KEY')
  return k
}

async function savePaystackCheckoutMapping(reference, studentId, type, accessCode) {
  await db.collection('paystackCheckouts').doc(reference).set({
    reference,
    studentId,
    type,
    accessCode: accessCode || '',
    status: 'PENDING',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })
}

async function fulfillPaystackCheckout(reference, paystackData) {
  const mapRef = db.collection('paystackCheckouts').doc(reference)
  const mapSnap = await mapRef.get()
  if (!mapSnap.exists) throw new HttpsError('not-found', 'Paystack checkout not found')
  const map = mapSnap.data()
  if (map.status === 'FULFILLED') return { ok: true, alreadyFulfilled: true }

  // Paystack verify payload shape: data = { reference, amount (kobo), currency, status, customer:{email}, paid_at, ... }
  // When called from the webhook we already have that `data` object — no extra fetch needed.
  let data = paystackData
  if (!data) {
    const secret = paystackSecretOrThrow()
    const res = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(reference), {
      headers: { Authorization: 'Bearer ' + secret },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.status) throw new HttpsError('internal', body.message || 'Paystack verification failed')
    data = body.data
  }
  if (!data || data.status !== 'success') throw new HttpsError('failed-precondition', 'Payment not successful yet')

  // Verify amount and currency match what we charged — prevents underpayment attacks (P0)
  const expectedNgn = map.type === 'subscription' ? SUBSCRIPTION_PRICE_NGN : RESUME_PRICE_NGN
  const paidNgn = Math.round((Number(data.amount) || 0) / 100)
  if (data.currency && data.currency !== 'NGN') throw new HttpsError('failed-precondition', 'Invalid currency')
  if (paidNgn < expectedNgn) throw new HttpsError('failed-precondition', `Underpayment: expected ₦${expectedNgn}, got ₦${paidNgn}`)
  // Paystack may include fees; allow slight overpayment but log it
  if (paidNgn !== expectedNgn) console.warn(`[Paystack] Amount mismatch for ${reference}: expected ${expectedNgn}, got ${paidNgn}`)

  return db.runTransaction(async (t) => {
    const freshSnap = await t.get(mapRef)
    if (!freshSnap.exists) throw new HttpsError('not-found', 'Paystack checkout not found')
    const fresh = freshSnap.data()
    if (fresh.status === 'FULFILLED') return { ok: true, alreadyFulfilled: true }

    const studentSnap = await t.get(db.collection('students').doc(fresh.studentId))
    if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found')
    const student = studentSnap.data()

    const updates = {}
    const paymentRecord = {
      studentId: fresh.studentId,
      uid: student.uid || '',
      studentName: student.name,
      email: (data.customer && data.customer.email) || student.email || '',
      amount: paidNgn,
      currency: data.currency || 'NGN',
      method: 'paystack',
      reference: data.reference || reference,
      checkoutId: reference,
      paidAt: data.paid_at || data.paidAt || new Date().toISOString(),
    }

    if (fresh.type === 'subscription') {
      const iso = computeExpiry(student.subscriptionUntil, 1)
      updates.subscriptionUntil = iso
      paymentRecord.extendsTo = iso
    } else if (fresh.type === 'resume') {
      updates.missedStreak = 0
      updates.suspended = false
      updates.appealedAt = admin.firestore.FieldValue.serverTimestamp()
      paymentRecord.type = 'account_resume'
    }

    t.update(studentSnap.ref, updates)
    t.set(db.collection('payments').doc(), paymentRecord)
    t.update(mapRef, { status: 'FULFILLED', fulfilledAt: admin.firestore.FieldValue.serverTimestamp() })
    return { ok: true }
  })
}

exports.createPaystackCheckout = onCall({ enforceAppCheck: false, secrets: ['PAYSTACK_SECRET_KEY'], run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required')
  assertAppCheck(request)
  const { studentId, type, callbackUrl: clientCallbackUrl } = request.data || {}
  if (!studentId || !type) throw new HttpsError('invalid-argument', 'Missing studentId or type')
  if (!['subscription', 'resume'].includes(type)) throw new HttpsError('invalid-argument', 'Type must be "subscription" or "resume"')

  if (!(await rateLimit(`paystack:${request.auth.uid}`, 10, 60 * 60 * 1000))) {
    throw new HttpsError('resource-exhausted', 'Too many checkouts. Try again later.')
  }

  const studentSnap = await db.collection('students').doc(studentId).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found')
  const student = studentSnap.data()
  assertOwnsStudent(request, student)

  const secret = paystackSecretOrThrow()
  const amountNgn = type === 'subscription' ? SUBSCRIPTION_PRICE_NGN : RESUME_PRICE_NGN
  const amountKobo = amountNgn * 100
  const reference = `274L-${type === 'subscription' ? 'SUB' : 'RES'}-${studentId}-${Date.now()}`
  const email = (student.email || '').trim() || `${student.name.toLowerCase().replace(/\s+/g, '.')}@274lab.app`

  let callbackUrl = (clientCallbackUrl || '').trim() || (process.env.PAYSTACK_CALLBACK_URL || '').trim() || 'https://www.274lab.com/'
  // Validate callback URL is on an allowed 274Lab origin — prevents open-redirect abuse
  try {
    const u = new URL(callbackUrl)
    const allowed = ['www.274lab.com', '274lab.com', 'fitness-gym-fc040.web.app', 'fitness-gym-fc040.firebaseapp.com']
    if (!allowed.includes(u.hostname)) callbackUrl = 'https://www.274lab.com/'
  } catch { callbackUrl = 'https://www.274lab.com/' }

  const body = {
    email,
    amount: String(amountKobo),
    reference,
    currency: 'NGN',
    metadata: { studentId, type, studentName: student.name },
  }
  if (callbackUrl) body.callback_url = callbackUrl

  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.status) {
    throw new HttpsError('internal', 'Paystack initialize failed: ' + (data.message || res.statusText))
  }

  await savePaystackCheckoutMapping(data.data.reference, studentId, type, data.data.access_code)
  return {
    authorization_url: data.data.authorization_url,
    access_code: data.data.access_code,
    reference: data.data.reference,
  }
})

exports.completePaystackCheckout = onCall({ enforceAppCheck: false, secrets: ['PAYSTACK_SECRET_KEY'], run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required')
  if (!(await rateLimit(`completePaystack:${request.auth.uid}`, 20, 60 * 1000))) {
    throw new HttpsError('resource-exhausted', 'Too many verification attempts. Try again later.')
  }
  const { reference } = request.data || {}
  if (!reference) throw new HttpsError('invalid-argument', 'Missing reference')
  // Basic reference format check — prevents probing random IDs
  if (!/^274L-(SUB|RES)-[a-zA-Z0-9_-]+-\d+$/.test(reference)) {
    throw new HttpsError('invalid-argument', 'Invalid reference format')
  }

  const mapSnap = await db.collection('paystackCheckouts').doc(reference).get()
  if (!mapSnap.exists) throw new HttpsError('not-found', 'Checkout not found')
  const map = mapSnap.data()
  const studentSnap = await db.collection('students').doc(map.studentId).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found')
  assertOwnsStudent(request, studentSnap.data())

  return fulfillPaystackCheckout(reference, null)
})

exports.paystackWebhook = onRequest({ cors: true, secrets: ['PAYSTACK_SECRET_KEY'], run: { cpu: 0.08, memory: '256MiB' } }, async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).end(); return }

  const secret = (process.env.PAYSTACK_SECRET_KEY || '').trim()
  if (!secret) { res.status(500).send('PAYSTACK_SECRET_KEY not configured'); return }

  // Paystack signs the raw body with HMAC SHA512 using the secret
  const signature = (req.headers['x-paystack-signature'] || '').toString().trim()
  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body)
  const expected = crypto.createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex')
  let sigOk = false
  try { sigOk = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) } catch { sigOk = false }
  if (!sigOk) { res.status(401).send('Invalid signature'); return }

  try {
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    // Paystack sends { event: 'charge.success', data: { reference, status, amount, ... } }
    if (event.event === 'charge.success' && event.data && event.data.reference) {
      await fulfillPaystackCheckout(event.data.reference, event.data)
    }
    res.status(200).send('ok')
  } catch (e) {
    console.error('paystackWebhook error:', e)
    res.status(500).send('error')
  }
})

// Sync missing Paystack payments into Firestore — run when Paystack shows payments but admin revenue is 0
// (webhook was down due to quota). Pulls last 100 successful Paystack transactions with 274L- refs.
exports.syncPaystackPayments = onCall({ secrets: ['PAYSTACK_SECRET_KEY'], enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  assertAdmin(request)
  const secret = paystackSecretOrThrow()
  const res = await fetch('https://api.paystack.co/transaction?perPage=100', { headers: { Authorization: 'Bearer ' + secret } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.status) throw new HttpsError('internal', body.message || 'Paystack fetch failed')
  let synced = 0, skipped = 0, failed = 0
  for (const trx of (body.data || [])) {
    if (trx.status !== 'success' || !trx.reference || !String(trx.reference).startsWith('274L-')) continue
    const existingPay = await db.collection('payments').where('reference', '==', trx.reference).limit(1).get().catch(() => null)
    if (existingPay && !existingPay.empty) { skipped++; continue }
    let mapSnap = await db.collection('paystackCheckouts').doc(trx.reference).get().catch(() => null)
    if (!mapSnap || !mapSnap.exists) {
      const meta = trx.metadata || {}
      const sid = meta.studentId || (trx.reference.split('-')[2] || '')
      const type = meta.type || (trx.reference.includes('-SUB-') ? 'subscription' : 'subscription')
      if (!sid) { failed++; continue }
      const stuSnap = await db.collection('students').doc(sid).get().catch(() => null)
      if (!stuSnap || !stuSnap.exists) { failed++; continue }
      await db.collection('paystackCheckouts').doc(trx.reference).set({
        reference: trx.reference,
        studentId: sid,
        type,
        status: 'PENDING',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
    try { await fulfillPaystackCheckout(trx.reference, trx); synced++ } catch (e) { console.error('[syncPaystack] fulfill failed for', trx.reference, e?.message); failed++ }
  }
  return { ok: true, synced, skipped, failed }
})

exports.verifyRecoveryCode = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required')
  const { studentId, code } = request.data || {}
  if (!studentId || !code) throw new HttpsError('invalid-argument', 'Missing studentId or code')
  const MAX_ATTEMPTS = 5
  const COOLDOWN_MS = 15 * 60 * 1000
  const studentSnap = await db.collection('students').doc(studentId).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found')
  const student = studentSnap.data()
  assertOwnsStudent(request, student)
  const attempts = student.recoveryAttempts || 0
  const lastAttempt = student.lastRecoveryAttempt ? new Date(student.lastRecoveryAttempt).getTime() : 0
  if (attempts >= MAX_ATTEMPTS && Date.now() - lastAttempt < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - lastAttempt)) / 60000)
    throw new HttpsError('resource-exhausted', `Too many attempts. Try again in ${remaining}m.`)
  }
  if ((student.recoveryCode || '') !== code.toString().trim()) {
    const newAttempts = (Date.now() - lastAttempt > COOLDOWN_MS) ? 1 : attempts + 1
    await studentSnap.ref.update({ recoveryAttempts: newAttempts, lastRecoveryAttempt: new Date().toISOString() })
    return { ok: false }
  }
  await studentSnap.ref.update({ missedStreak: 0, suspended: false, appealedAt: admin.firestore.FieldValue.serverTimestamp(), recoveryAttempts: 0, lastRecoveryAttempt: null })
  return { ok: true }
})

// ─── TEACHERS ───────────────────────────────────────────────────────────
// Teachers sign up with full name + email + phone (SMS OTP). Identity is
// Firebase Auth with a derived email (`{phone}@teacher.274lab.app`) so the
// standard email/password sign-in works unchanged. Students link a teacher by
// entering the teacher's phone as their accountability partner
// (`students.teacherPhone` — Supporters step). The teacher panel lists those
// students, their monthly test counts + scores, and computes earnings: N500
// per month per student who completes at least 3 tests that month, capped at
// 30 qualifying students (N15,000) per teacher per month.

const RATE_PER_QUALIFYING_STUDENT_MONTH = 500
const MIN_TESTS_PER_MONTH = 3
const MAX_PAID_STUDENTS_PER_MONTH = 30

// Pioneer referral bonus: N200 per qualifying student under a referred teacher, Oct-Dec only, cap 20/month
const PIONEER_BONUS_PER_STUDENT = 200
const PIONEER_MAX_BONUS_STUDENTS = 20
const PIONEER_BONUS_START = '2026-10'
const PIONEER_BONUS_END = '2026-12'

function isPioneerBonusMonth(month) {
  return month >= PIONEER_BONUS_START && month <= PIONEER_BONUS_END
}

function generatePioneerCode() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

// Resolve the signed-in caller to their teacher doc. Throws if not a teacher.
async function assertTeacher(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required')
  const snap = await db.collection('teachers').where('uid', '==', request.auth.uid).limit(1).get()
  if (snap.empty) throw new HttpsError('permission-denied', 'Teacher account required')
  return { teacherId: snap.docs[0].id, teacher: snap.docs[0].data() }
}

async function findTeacherByPhone(phone) {
  const snap = await db.collection('teachers').where('phone', '==', phone).limit(1).get()
  return snap.empty ? null : snap.docs[0]
}

// Per-student monthly test counts + recent scores from one query. A "test"
// is a weekly quiz session (all 4 subjects for that week count as ONE test).
// 12 subject docs across 3 weeks = 3 tests, not 12. Sorted in memory
// so no extra composite index is required.
async function studentScoreSummary(studentId) {
  const snap = await db.collection('scores').where('studentId', '==', studentId).limit(300).get()
  const monthTests = {} // month -> Set<week|date>
  const recent = []
  const docs = snap.docs.map((d) => d.data())
  docs.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  docs.forEach((sc) => {
    const month = (sc.date || '').slice(0, 7)
    if (month) {
      if (!monthTests[month]) monthTests[month] = new Set()
      // Distinct test = distinct week (fallback to date day). 4 subject docs
      // in the same week share the same `week` value, so they count as 1.
      const testKey = (sc.week || '').trim() || (sc.date || '').slice(0, 10)
      if (testKey) monthTests[month].add(testKey)
    }
    if (recent.length < 15) recent.push({ week: sc.week, subject: sc.subject, score: sc.score, date: sc.date })
  })
  const counts = {}
  for (const [m, set] of Object.entries(monthTests)) counts[m] = set.size
  return { counts, recent }
}

// Monthly earnings from a list of per-student monthly count maps: a student
// qualifies their teacher for N500 in a given month by taking >= 3 tests. The
// number of paid students is capped at MAX_PAID_STUDENTS_PER_MONTH per month.
function earningsFromCounts(countsList) {
  const perMonth = {}
  const qualified = {}
  for (const counts of countsList) {
    for (const [month, count] of Object.entries(counts || {})) {
      if (count >= MIN_TESTS_PER_MONTH) {
        qualified[month] = (qualified[month] || 0) + 1
        if (qualified[month] <= MAX_PAID_STUDENTS_PER_MONTH) {
          perMonth[month] = (perMonth[month] || 0) + RATE_PER_QUALIFYING_STUDENT_MONTH
        }
      }
    }
  }
  return { earnings: perMonth, qualifiedCounts: qualified }
}

// Pioneer bonus: N200 per qualifying student (3+ tests) of referred teachers, Oct-Dec only, cap 20/month
function pioneerBonusFromCounts(countsList) {
  const perMonth = {}
  const qualified = {}
  for (const counts of countsList) {
    for (const [month, count] of Object.entries(counts || {})) {
      if (!isPioneerBonusMonth(month)) continue
      if (count >= MIN_TESTS_PER_MONTH) {
        qualified[month] = (qualified[month] || 0) + 1
        if (qualified[month] <= PIONEER_MAX_BONUS_STUDENTS) {
          perMonth[month] = (perMonth[month] || 0) + PIONEER_BONUS_PER_STUDENT
        }
      }
    }
  }
  return { earnings: perMonth, qualifiedCounts: qualified }
}

// Every student who added this teacher as an accountability partner. Matches on
// `students.teacherPhone` (the teacher's phone) plus any legacy explicit
// `teacherId` links.
async function findTeacherStudents(teacherId, teacherPhone) {
  const students = new Map()
  const queries = []
  if (teacherPhone) {
    // Students may have stored their teacher's number with a +234 prefix (or
    // spacing that the caller normalized away), so query the canonical phone
    // AND the '+' variant. Firestore `in` keeps this to one extra query.
    const canonical = normalizePhone(teacherPhone)
    if (canonical) queries.push(db.collection('students').where('teacherPhone', 'in', [canonical, `+${canonical}`]).limit(500))
  }
  queries.push(db.collection('students').where('teacherId', '==', teacherId).limit(500))
  const snaps = await Promise.all(queries.map((q) => q.get().catch(() => null)))
  snaps.forEach((snap) => {
    if (!snap) return
    snap.docs.forEach((d) => students.set(d.id, d.data()))
  })
  return students
}

exports.sendTeacherOtp = onCall(
  { secrets: ['TERMII_API_KEY', 'TERMII_SENDER_ID'], enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } },
  async (request) => {
    const TERMII_API_KEY = (process.env.TERMII_API_KEY || '').trim()
    if (!TERMII_API_KEY) throw new HttpsError('failed-precondition', 'SMS service not configured')
    const { phone } = request.data || {}
    const normalized = normalizePhone(phone)
    if (!normalized) throw new HttpsError('invalid-argument', 'Enter a valid phone number')
    if (!(await rateLimit(`teacherOtp:${normalized}`, 5, 15 * 60 * 1000))) {
      throw new HttpsError('resource-exhausted', 'Too many requests. Try again in a few minutes.')
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    await db.collection('teacher_otps').doc(normalized).set({
      code,
      phone: normalized,
      used: false,
      attempts: 0,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    const text = `Your 274Lab teacher verification code is ${code}. It expires in 10 minutes. Do not share it. - 274Lab`
    const r = await sendSmsTermii(TERMII_API_KEY, normalized, text, { phone: normalized, source: 'teacher-otp' })
    if (!r.ok) {
      throw new HttpsError('aborted', 'Could not send the code. Check the number and try again.')
    }
    return { ok: true }
  }
)

exports.registerTeacher = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  const { name, email, phone, otp, password, pioneerCode } = request.data || {}
  const tName = (name || '').trim()
  if (tName.length < 3) throw new HttpsError('invalid-argument', 'Name must be at least 3 characters')
  const tEmail = (email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tEmail)) throw new HttpsError('invalid-argument', 'Enter a valid email address')
  const normalized = normalizePhone(phone)
  if (!normalized) throw new HttpsError('invalid-argument', 'Enter a valid phone number')
  if (!password || password.length < 8) throw new HttpsError('invalid-argument', 'Password must be at least 8 characters')
  const code = String(otp || '').trim()
  if (!/^\d{6}$/.test(code)) throw new HttpsError('invalid-argument', 'Enter the 6-digit verification code')
  // Validate pioneer referral code if supplied (4-digit random, 2-level only, no self-referral)
  let referredByPioneerId = null
  const rawPioneerCode = String(pioneerCode || '').trim()
  if (rawPioneerCode) {
    if (!/^\d{4}$/.test(rawPioneerCode)) throw new HttpsError('invalid-argument', 'Pioneer code must be 4 digits')
    const codeSnap = await db.collection('pioneerCodes').doc(rawPioneerCode).get()
    if (!codeSnap.exists) throw new HttpsError('invalid-argument', 'Invalid pioneer code')
    const pid = codeSnap.data().teacherId
    const pioneerSnap = await db.collection('teachers').doc(pid).get()
    if (!pioneerSnap.exists || !pioneerSnap.data().isPioneer) throw new HttpsError('invalid-argument', 'Invalid pioneer code')
    referredByPioneerId = pid
  }

  const otpSnap = await db.collection('teacher_otps').doc(normalized).get()
  if (!otpSnap.exists) throw new HttpsError('failed-precondition', 'Request a verification code first')
  const otpData = otpSnap.data()
  if (otpData.used) throw new HttpsError('failed-precondition', 'This code was already used')
  if (new Date(otpData.expiresAt || 0).getTime() < Date.now()) {
    throw new HttpsError('failed-precondition', 'This code has expired. Request a new one.')
  }
  if ((otpData.code || '') !== code) {
    const attempts = (otpData.attempts || 0) + 1
    await otpSnap.ref.update({ attempts })
    if (attempts >= 5) await otpSnap.ref.update({ used: true })
    throw new HttpsError('unauthenticated', 'Incorrect verification code')
  }

  const existing = await findTeacherByPhone(normalized)
  if (existing) throw new HttpsError('already-exists', 'A teacher with this phone is already registered')

  let userRecord
  try {
    userRecord = await admin.auth().createUser({
      email: tEmail,
      password,
      displayName: tName,
    })
  } catch (e) {
    throw new HttpsError('already-exists', 'This email is already registered')
  }
  try {
    await admin.auth().setCustomUserClaims(userRecord.uid, { teacher: true })
  } catch (e) {
    console.error('[registerTeacher] setCustomUserClaims failed:', e?.message || e)
  }

  const ref = db.collection('teachers').doc()
  const payload = {
    uid: userRecord.uid,
    name: tName,
    email: tEmail,
    phone: normalized,
    accountNumber: '',
    bankName: '',
    isPioneer: false,
    pioneerCode: null,
    referredByPioneerId: referredByPioneerId || null,
    createdAt: new Date().toISOString(),
  }
  await ref.set(payload)
  await otpSnap.ref.update({ used: true })
  return { ok: true, teacherId: ref.id, teacher: payload }
})

// ─── PIONEER REFERRAL SYSTEM ───
// Two-level only: Admin makes a teacher PIONEER (random 4-digit code). New teachers
// can enter that code on signup; they appear under the pioneer. Pioneer earns
// N200 per qualifying student (3+ tests) of their referrals, Oct-Dec only, cap 20.

exports.makePioneer = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  assertAdmin(request)
  const { teacherId } = request.data || {}
  if (!teacherId) throw new HttpsError('invalid-argument', 'Missing teacherId')
  const tRef = db.collection('teachers').doc(teacherId)
  const tSnap = await tRef.get()
  if (!tSnap.exists) throw new HttpsError('not-found', 'Teacher not found')
  const t = tSnap.data()
  if (t.isPioneer && t.pioneerCode) throw new HttpsError('already-exists', 'Teacher is already a Pioneer')
  // Generate 4 random digits, retry on collision
  let code = null
  for (let i = 0; i < 5; i++) {
    const c = generatePioneerCode()
    const exists = await db.collection('pioneerCodes').doc(c).get()
    if (!exists.exists) { code = c; break }
  }
  if (!code) throw new HttpsError('internal', 'Could not generate code, try again')
  await tRef.update({ isPioneer: true, pioneerCode: code, pioneerSince: new Date().toISOString() })
  await db.collection('pioneerCodes').doc(code).set({ teacherId, code, createdAt: new Date().toISOString() })
  return { ok: true, code }
})

exports.removePioneer = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  assertAdmin(request)
  const { teacherId } = request.data || {}
  if (!teacherId) throw new HttpsError('invalid-argument', 'Missing teacherId')
  const tRef = db.collection('teachers').doc(teacherId)
  const tSnap = await tRef.get()
  if (!tSnap.exists) throw new HttpsError('not-found', 'Teacher not found')
  const t = tSnap.data()
  if (t.pioneerCode) {
    await db.collection('pioneerCodes').doc(t.pioneerCode).delete().catch(() => {})
  }
  await tRef.update({ isPioneer: false, pioneerCode: null, pioneerSince: null })
  return { ok: true }
})

exports.getPioneerDashboard = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  const { teacherId, teacher } = await assertTeacher(request)
  if (!teacher.isPioneer) throw new HttpsError('permission-denied', 'Not a Pioneer')
  const refSnap = await db.collection('teachers').where('referredByPioneerId', '==', teacherId).get()
  const referred = []
  for (const doc of refSnap.docs) {
    const rt = doc.data()
    const studentsMap = await findTeacherStudents(doc.id, rt.phone)
    const countsList = []
    const studentRows = []
    for (const [sid, data] of studentsMap) {
      const { counts } = await studentScoreSummary(sid)
      countsList.push(counts)
      const totalTests = Object.values(counts).reduce((a, n) => a + n, 0)
      studentRows.push({ studentId: sid, name: data.name || 'Student', totalTests })
    }
    const totalStudents = studentsMap.size
    const totalTests = studentRows.reduce((a, s) => a + s.totalTests, 0)
    referred.push({
      teacherId: doc.id,
      name: rt.name || '—',
      email: rt.email || '',
      phone: rt.phone || '',
      students: studentRows,
      totalStudents,
      totalTests,
    })
  }
  return { ok: true, referred }
})

// ─── PAYSTACK BANK ACCOUNT VERIFICATION ───
// Live checker: resolves an account number + bank code to the real account
// holder's name via Paystack's /bank/resolve. The bank-name → code mapping is
// pulled fresh from Paystack /bank (cached per instance) so new institutions
// are supported without code changes. Requires the PAYSTACK_SECRET_KEY secret.

let paystackBanksCache = null
let paystackBanksCacheAt = 0

function paystackHeaders(secret) {
  return { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' }
}

// Normalize a bank name for fuzzy matching ("guaranty trust bank" == "GTBank").
function bankNameKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim()
}

// Cache the NGN bank list for 6 hours (callable instances are short-lived, so
// this is effectively a per-deploy refresh; it avoids a /bank round-trip on
// every teacher save).
async function fetchPaystackBanks(secret) {
  const now = Date.now()
  if (paystackBanksCache && now - paystackBanksCacheAt < 6 * 60 * 60 * 1000) {
    return paystackBanksCache
  }
  const banks = []
  let page = 1
  let total = 999
  while (banks.length < total && page <= 10) {
    const res = await fetch(`https://api.paystack.co/bank?currency=NGN&perPage=100&page=${page}`, {
      headers: paystackHeaders(secret),
    })
    if (!res.ok) throw new HttpsError('internal', 'Could not reach Paystack bank list')
    const body = await res.json()
    if (!body.status) break
    total = body.meta?.total ?? banks.length
    banks.push(...(body.data || []))
    page += 1
  }
  paystackBanksCache = banks
  paystackBanksCacheAt = now
  return banks
}

// Map the teacher's free-text bank name to a Paystack bank code (best match by
// slug, then by normalized name).
async function resolveBankCode(secret, bankName) {
  const banks = await fetchPaystackBanks(secret)
  const wanted = bankNameKey(bankName)
  let scored = banks
    .filter((b) => b.code && (b.name || b.slug))
    .map((b) => {
      const slugKey = bankNameKey(b.slug)
      const nameKey = bankNameKey(b.name)
      let score = 0
      if (slugKey && (slugKey === wanted || wanted.includes(slugKey) || slugKey.includes(wanted))) score += 3
      if (nameKey === wanted) score += 5
      else if (nameKey.includes(wanted) || wanted.includes(nameKey)) score += 2
      return { bank: b, score }
    })
  scored.sort((a, b) => b.score - a.score)
  const top = scored[0]
  if (!top || top.score < 2) return null
  return top.bank
}

async function resolvePaystackAccount(secret, bank) {
  const url = 'https://api.paystack.co/bank/resolve?account_number=' +
    encodeURIComponent(bank.accountNumber) + '&bank_code=' + encodeURIComponent(bank.bankCode)
  const res = await fetch(url, { headers: paystackHeaders(secret) })
  const body = await res.json().catch(() => ({}))
  if (res.status === 404 || (body.status === false && /Does not exist|invalid|not found/i.test(body.message || ''))) {
    throw new HttpsError('invalid-argument', 'This account number was not found on ' + bank.bankName + '. Double-check the number and try again.')
  }
  if (!res.ok || !body.status) {
    throw new HttpsError('internal', body.message || 'Could not verify the account right now. Try again.')
  }
  return body.data
}

// Teacher fills in / updates the payout bank details (account number + bank).
// Verifies the account lives before saving — a live Paystack /bank/resolve.
exports.teacherUpdateDetails = onCall(
  { secrets: ['PAYSTACK_SECRET_KEY'], enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } },
  async (request) => {
    const { accountNumber, bankName } = request.data || {}
    const acct = (accountNumber || '').replace(/\D/g, '')
    if (acct.length < 10) throw new HttpsError('invalid-argument', 'Enter a valid account number')
    const bank = (bankName || '').trim()
    if (bank.length < 2) throw new HttpsError('invalid-argument', 'Enter your bank name')
    const secret = (process.env.PAYSTACK_SECRET_KEY || '').trim()
    if (!secret) throw new HttpsError('failed-precondition', 'Bank verification is not configured. Set PAYSTACK_SECRET_KEY with: firebase functions:secrets:set PAYSTACK_SECRET_KEY')
    const { teacherId } = await assertTeacher(request)

    // Resolve the typed bank name to a Paystack bank code, then verify the
    // account number really exists under that bank.
    const bankInfo = await resolveBankCode(secret, bank)
    if (!bankInfo) throw new HttpsError('invalid-argument', 'Could not recognize the bank "' + bank + '". Check the spelling and try again.')

    const resolved = await resolvePaystackAccount(secret, {
      accountNumber: acct,
      bankCode: bankInfo.code,
      bankName: bankInfo.name,
    })
    const accountName = (resolved.account_name || '').trim()

    await db.collection('teachers').doc(teacherId).update({
      accountNumber: acct,
      bankName: bankInfo.name,
      bankCode: bankInfo.code,
      accountName,
      bankVerified: true,
      bankVerifiedAt: new Date().toISOString(),
      bankUpdatedAt: new Date().toISOString(),
    })
    return { ok: true, accountNumber: acct, bankName: bankInfo.name, accountName, bankVerified: true }
  }
)

exports.getTeacherDashboard = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  const { teacherId, teacher } = await assertTeacher(request)
  const studentsMap = await findTeacherStudents(teacherId, teacher.phone)
  const countsList = []
  const students = []
  for (const [studentId, data] of studentsMap) {
    const { counts, recent } = await studentScoreSummary(studentId)
    countsList.push(counts)
    students.push({
      studentId,
      name: data.name || 'Student',
      phone: data.phone || data.parentPhone || '',
      monthlyCounts: counts,
      recentScores: recent,
    })
  }
  students.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const { earnings: monthsEarnings, qualifiedCounts } = earningsFromCounts(countsList)
  // Pioneer bonus (if this teacher is a pioneer, check their referred teachers)
  let pioneerEarnings = {}
  let pioneerQualifiedCounts = {}
  let isPioneer = !!teacher.isPioneer
  let pioneerCode = teacher.pioneerCode || null
  if (isPioneer) {
    const refSnap = await db.collection('teachers').where('referredByPioneerId', '==', teacherId).get()
    const refCountsList = []
    for (const doc of refSnap.docs) {
      const rt = doc.data()
      const sMap = await findTeacherStudents(doc.id, rt.phone)
      for (const [sid] of sMap) {
        const { counts } = await studentScoreSummary(sid)
        refCountsList.push(counts)
      }
    }
    const pb = pioneerBonusFromCounts(refCountsList)
    pioneerEarnings = pb.earnings
    pioneerQualifiedCounts = pb.qualifiedCounts
  }
  return {
    ok: true,
    linkedCount: students.length,
    teacher: {
      name: teacher.name || '',
      email: teacher.email || '',
      phone: teacher.phone || '',
      accountNumber: teacher.accountNumber || '',
      bankName: teacher.bankName || '',
      isPioneer,
      pioneerCode,
      referredByPioneerId: teacher.referredByPioneerId || null,
    },
    monthsEarnings,
    qualifiedCounts,
    pioneerEarnings,
    pioneerQualifiedCounts,
    students,
  }
})

// Admin tracking: every teacher, how many students linked them, their payout
// bank details, and monthly earnings.
exports.adminTeacherDashboard = onCall({ enforceAppCheck: false, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  assertAdmin(request)
  const snap = await db.collection('teachers').get()
  const teachers = []
  for (const d of snap.docs) {
    const t = d.data()
    const studentsMap = await findTeacherStudents(d.id, t.phone)
    const countsList = []
    const studentRows = []
    for (const [studentId, data] of studentsMap) {
      const { counts } = await studentScoreSummary(studentId)
      countsList.push(counts)
      studentRows.push({
        studentId,
        name: data.name || 'Student',
        phone: data.phone || data.parentPhone || '',
        monthlyCounts: counts,
      })
    }
    studentRows.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    const { earnings, qualifiedCounts } = earningsFromCounts(countsList)
    // Pioneer bonus for admin view
    let pioneerEarnings = {}
    let pioneerQualifiedCounts = {}
    if (t.isPioneer) {
      const refSnap = await db.collection('teachers').where('referredByPioneerId', '==', d.id).get()
      const refCountsList = []
      for (const doc of refSnap.docs) {
        const rt = doc.data()
        const sMap = await findTeacherStudents(doc.id, rt.phone)
        for (const [sid] of sMap) {
          const { counts } = await studentScoreSummary(sid)
          refCountsList.push(counts)
        }
      }
      const pb = pioneerBonusFromCounts(refCountsList)
      pioneerEarnings = pb.earnings
      pioneerQualifiedCounts = pb.qualifiedCounts
    }
    teachers.push({
      teacherId: d.id,
      name: t.name || '—',
      email: t.email || '',
      phone: t.phone || '',
      accountNumber: t.accountNumber || '',
      bankName: t.bankName || '',
      accountName: t.accountName || '',
      bankVerified: t.bankVerified || false,
      isPioneer: !!t.isPioneer,
      pioneerCode: t.pioneerCode || null,
      referredByPioneerId: t.referredByPioneerId || null,
      linkedCount: studentsMap.size,
      monthsEarnings: earnings,
      qualifiedCounts,
      pioneerEarnings,
      pioneerQualifiedCounts,
      students: studentRows,
      createdAt: t.createdAt || '',
    })
  }
  teachers.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  const allMonths = new Set()
  teachers.forEach((t) => Object.keys(t.monthsEarnings || {}).forEach((m) => allMonths.add(m)))
  const latestMonth = [...allMonths].sort().pop() || new Date().toISOString().slice(0, 7)
  return { ok: true, count: teachers.length, latestMonth, months: [...allMonths].sort(), teachers }
})

// ─── SCORE SUBMISSION / RETRIEVAL ───
// Grading is done SERVER-SIDE. A quiz session is created by `startQuiz` which
// (a) validates the quiz window on the server, (b) assigns a random, seeded
// subset of questions per student, and (c) stores the exact question set in the
// session doc. `submitQuiz` grades ONLY the exact assigned set (exact-set
// validation) so a client can never enumerate the answer key question-by-
// question. The session is one-shot (idempotent via a transaction), so retries
// can never double-count. The answer key is read from the in-memory cache.

function gradeSubject(questionAnswers, submittedAnswers) {
  let correct = 0, wrong = 0, unanswered = 0
  const answerKey = []
  questionAnswers.forEach((ans, i) => {
    answerKey.push(ans)
    const chosen = submittedAnswers[i]
    if (chosen === null || chosen === undefined || chosen === -1) unanswered++
    else if (chosen === ans) correct++
    else wrong++
  })
  const total = questionAnswers.length
  const score = total > 0
    ? Math.round((Math.max(0, correct * 4 - wrong) / (total * 4)) * 100)
    : 0
  return { correct, wrong, unanswered, total, score, answerKey }
}

// Start a graded quiz session. Returns the sessionId + the student's assigned
// questions (public content only — the answer key never leaves the server).
exports.startQuiz = onCall({ ...HOT }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required')
  assertAppCheck(request)
  const uid = request.auth.uid
  const { studentId, week, retakeSubject } = request.data || {}
  if (!studentId || !week) throw new HttpsError('invalid-argument', 'Missing studentId or week')

  // Rate limit session creation per user.
  if (!(await rateLimit(`startQuiz:${uid}`, 20, 60 * 60 * 1000))) {
    throw new HttpsError('resource-exhausted', 'Too many quiz sessions started. Try again later.')
  }

  const studentSnap = await db.collection('students').doc(studentId).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found')
  const student = studentSnap.data()
  if (student.uid && student.uid !== uid) {
    throw new HttpsError('permission-denied', 'This account does not match the signed-in user')
  }

  // Server-side window enforcement (NOT trusted to the client).
  const isRetake = !!retakeSubject
  if (!isRetake && !(await quizWindowOpen(week))) {
    throw new HttpsError('failed-precondition', 'Quiz is locked')
  }

  const subjects = isRetake ? [retakeSubject] : (student.subjects || [])
  if (!subjects.length) throw new HttpsError('invalid-argument', 'No subjects enrolled')

  const assignments = {} // subject -> [questionId, ...]
  const questions = {}   // subject -> [{ id, question, options, image }]  (no answer)

  for (const subject of subjects) {
    const bank = await db.collection('questions')
      .where('subject', '==', subject)
      .where('week', '==', week)
      .select('__name__')
      .get()
    const ids = bank.docs.map((d) => d.id)
    if (!ids.length) continue
    const limit = await getQuestionLimitFor(subject, week)
    const picked = pickQuestions(ids, limit, `${uid}|${week}|${subject}`)
    if (!picked.length) continue
    assignments[subject] = picked

    const qSnaps = await db.getAll(...picked.map((id) => db.collection('questions').doc(id)))
    questions[subject] = qSnaps.map((s, i) => {
      const d = s.exists ? s.data() : {}
      return {
        id: picked[i],
        question: d.question || '',
        options: d.options || [],
        image: d.image || '',
        optionImages: d.optionImages || ['', '', '', ''],
      }
    })
  }

  if (!Object.keys(assignments).length) {
    throw new HttpsError('not-found', `No questions available for ${week}`)
  }

  const sessionRef = db.collection('quiz_sessions').doc()
  await sessionRef.set({
    uid,
    studentId,
    week,
    isRetake,
    assignments,
    status: 'started',
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    deadline: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  })

  return { ok: true, sessionId: sessionRef.id, week, questions, isRetake }
})

// Grade + persist a quiz submission. Idempotent: once a session is `submitted`,
// replays return the same results without writing again (transaction on the
// session doc guards the race). Writes are reduced by collapsing per-subject
// scoreDetails into one doc per student-week.
exports.submitQuiz = onCall({ ...HOT, secrets: ['TERMII_API_KEY', 'TERMII_SENDER_ID'] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required')
  assertAppCheck(request)
  const uid = request.auth.uid
  const { sessionId, answers } = request.data || {}
  if (!sessionId || !answers || typeof answers !== 'object') {
    throw new HttpsError('invalid-argument', 'Missing sessionId or answers')
  }

  const sessionRef = db.collection('quiz_sessions').doc(sessionId)

  // READ PHASE (outside the transaction — Firestore forbids non-transactional
  // reads inside a transaction callback).
  const pre = await sessionRef.get()
  if (!pre.exists) throw new HttpsError('not-found', 'Quiz session not found')
  const session = pre.data()
  if (session.uid !== uid) throw new HttpsError('permission-denied', 'Not your session')

  const studentSnap = await db.collection('students').doc(session.studentId).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found')
  const studentData = studentSnap.data() || {}
  const studentName = studentData.name || ''

  const released = await correctionsReleased(session.week)
  const results = []
  const detailSubjects = []
  const detailAnswers = []
  const scoreDocs = [] // { ref, data }

  for (const subject of Object.keys(session.assignments)) {
    const questionIds = session.assignments[subject]
    const submitted = answers[subject]
    if (!Array.isArray(submitted) || submitted.length !== questionIds.length) {
      throw new HttpsError('invalid-argument', `Malformed answers for ${subject}`)
    }

    // In-memory answer key (no per-submission read storm).
    const key = await getAnswerKey(subject, session.week)
    const correctAnswers = questionIds.map((qid) => key.has(qid) ? key.get(qid) : -1)
    const { correct, wrong, unanswered, total, score, answerKey } = gradeSubject(correctAnswers, submitted)

    // Per-subject score doc — the shape the results/leaderboard/SMS flows read.
    const scoreRef = db.collection('scores').doc()
    scoreDocs.push({ ref: scoreRef, data: {
      studentId: session.studentId,
      uid,
      studentName,
      subject,
      week: session.week,
      score,
      outOf: 100,
      correct,
      wrong,
      unanswered,
      total,
      isRetake: session.isRetake || false,
      date: new Date().toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    } })

    // Question content for corrections (only attached when released).
    const questionSnaps = await db.getAll(...questionIds.map((id) => db.collection('questions').doc(id)))
    const qContent = questionSnaps.map((qs, i) => {
      const q = qs.exists ? qs.data() : {}
      return {
        question: q.question || '',
        options: q.options || [],
        answer: answerKey[i],
        explanation: q.explanation || '',
        image: q.image || '',
        optionImages: q.optionImages || ['', '', '', ''],
        explanationImage: q.explanationImage || '',
      }
    })

    results.push({ subject, week: session.week, score, outOf: 100, correct, wrong, unanswered, total, released, questions: released ? qContent : null, answers: released ? submitted : null })
    // Persist question content WITHOUT the answer key (scoreDetails is
    // owner-readable via rules). The correct index is served only through the
    // `getScoreDetails` callable once correctionsReleased(week) is true.
    detailSubjects.push({
      subject,
      questions: qContent.map((q, i) => ({
        id: questionIds[i],
        question: q.question,
        options: q.options,
        answer: null,
        explanation: q.explanation,
        image: q.image,
        optionImages: q.optionImages,
        explanationImage: q.explanationImage,
      })),
    })
    detailAnswers.push({ subject, answers: submitted })
  }

  const detailId = `${session.studentId}_${session.week.replace(/\s+/g, '_')}`
  const detailData = {
    studentId: session.studentId,
    uid,
    week: session.week,
    subjects: detailSubjects,
    answers: detailAnswers,
    released,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }
  const sessionUpdate = {
    status: 'submitted',
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    scoreIds: scoreDocs.map((r) => r.ref.id),
    results,
  }

  // WRITE PHASE: a short transaction that re-reads the session for idempotency
  // (prevents double-grading on concurrent replays) and applies all writes
  // atomically. All reads here go through the transaction object.
  const outcome = await db.runTransaction(async (t) => {
    const s = await t.get(sessionRef)
    if (!s.exists) throw new HttpsError('not-found', 'Quiz session not found')
    const fresh = s.data()

    // Idempotency: already-submitted sessions return stored results.
    if (fresh.status === 'submitted') {
      return { ok: true, alreadySubmitted: true, results: fresh.results || [], scoreId: fresh.scoreId || null }
    }

    // Deadline check (server clock).
    const deadline = fresh.deadline ? fresh.deadline.toMillis() : Date.now()
    if (Date.now() > deadline) {
      throw new HttpsError('deadline-exceeded', 'Time is up')
    }

    for (const { ref, data } of scoreDocs) t.set(ref, data)
    t.set(db.collection('scoreDetails').doc(detailId), detailData)
    t.update(sessionRef, sessionUpdate)

    return { ok: true, results, scoreId: detailId }
  })

  // Update incremental leaderboard aggregates (best-effort, after the txn).
  try {
    await updateLeaderboardAggregates(session.studentId, session.week, results)
  } catch (e) {
    console.error('[submitQuiz] aggregate update failed:', e.message || e)
  }

  // Real-time result SMS: fire when a student submits, whether they answered
  // all or only some of their subjects. Subjects without a score render ABS.
  // Skips retakes and re-submissions (per-student-week guard shared with the
  // scheduled batch pass so nothing double-sends).
  if (!outcome.alreadySubmitted) {
    try {
      await sendRealtimeResultSms(session.studentId, session.week, studentData, results)
    } catch (e) {
      console.error('[submitQuiz] realtime SMS failed:', e?.message || e)
    }
  }

  return outcome
})

// Serve stored corrections ONLY once the week is released. Reads the collapsed
// scoreDetails doc (questions without answers) and attaches the correct option
// index per question from the in-memory answer key cache. During the live
// window this returns released:false and no answer data (server-gated, not
// client-gated). Owner or admin only.
exports.getScoreDetails = onCall({ ...HOT }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required')
  assertAppCheck(request)
  const { studentId, week } = request.data || {}
  if (!studentId || !week) throw new HttpsError('invalid-argument', 'Missing studentId or week')

  const studentSnap = await db.collection('students').doc(studentId).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found')
  const student = studentSnap.data()
  const isAdmin = !!(request.auth.token && request.auth.token.admin)
  if (!isAdmin && student.uid && student.uid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Not your results')
  }

  const released = await correctionsReleased(week)
  const detailId = `${studentId}_${week.replace(/\s+/g, '_')}`
  const snap = await db.collection('scoreDetails').doc(detailId).get()
  if (!snap.exists || !released) {
    return { ok: true, released: false, subjects: [], answers: [] }
  }

  const details = snap.data()
  const subjects = []
  const answers = []
  for (const sub of details.subjects || []) {
    const qs = sub.questions || []
    const ids = qs.map((q) => q.id)
    const key = await getAnswerKey(sub.subject, week)
    const studentAns = {}
    for (const subA of details.answers || []) {
      if (subA.subject === sub.subject) studentAns.answers = subA.answers || []
    }
    const questions = qs.map((q, i) => ({
      question: q.question,
      options: q.options,
      answer: key.has(ids[i]) ? key.get(ids[i]) : -1,
      explanation: q.explanation,
      image: q.image,
      optionImages: q.optionImages,
      explanationImage: q.explanationImage,
    }))
    subjects.push({ subject: sub.subject, questions })
    answers.push({ subject: sub.subject, answers: studentAns.answers || [] })
  }

  return { ok: true, released: true, subjects, answers }
})

// Incremental per-student leaderboard aggregate + per-week rank. Replaces the
// full-collection rescan in computeLeaderboard.
async function updateLeaderboardAggregates(studentId, week, results) {
  const studentSnap = await db.collection('students').doc(studentId).get()
  if (!studentSnap.exists) return
  const student = studentSnap.data()

  const rankRef = db.collection('leaderboard_student_ranks').doc(studentId)
  await db.runTransaction(async (t) => {
    const s = await t.get(rankRef)
    const prev = s.exists ? s.data() : {}
    const best = prev.bestBySubject ? { ...prev.bestBySubject } : {}
    const sessions = prev.sessions ? { ...prev.sessions } : {}
    const weeks = prev.weeks ? { ...prev.weeks } : {}

    results.forEach((r) => {
      if (!best[r.subject] || r.score > best[r.subject].score) {
        best[r.subject] = { score: r.score, outOf: r.outOf || 100 }
      }
      sessions[`${week}::${r.subject}`] = true
      weeks[week] = true
    })

    const top = Object.values(best).sort((a, b) => b.score - a.score).slice(0, 4)
    const total = top.length >= 4 ? top.reduce((a, b) => a + b.score, 0) : 0

    t.set(rankRef, {
      id: studentId,
      name: student.name || 'Unknown',
      nickname: student.nickname || '',
      year: student.year || '',
      subjects: student.subjects || [],
      bestBySubject: best,
      sessions,
      weeks,
      total,
      sessionCount: Object.keys(sessions).length,
      goldMedals: Object.keys(weeks).length,
      qualified: Object.keys(best).length >= 4,
      updatedAt: new Date().toISOString(),
    })
  })

  // Per-week rank doc (for the cached weekly leaderboard).
  const weekKey = `${studentId}_${week.replace(/\s+/g, '_')}`
  await db.collection('leaderboard_week_ranks').doc(weekKey).set({
    studentId,
    week,
    name: student.name || 'Unknown',
    nickname: student.nickname || '',
    total: (results || []).reduce((a, r) => a + r.score, 0),
    sessionCount: results.length,
    updatedAt: new Date().toISOString(),
  })
}

// Migrate existing questions: copy each question's inline `answer` field into the
// admin-only `questionAnswers/{questionId}` doc, then strip `answer` from the
// public question doc. Run repeatedly until `remaining` is 0.
exports.migrateQuestionAnswers = onCall({ enforceAppCheck: true, run: { cpu: 0.08, memory: '256MiB' } }, async (request) => {
  assertAdmin(request)
  const BATCH = 300
  const snap = await db.collection('questions').where('answer', '>=', 0).limit(BATCH).get()
  let migrated = 0
  for (const docSnap of snap.docs) {
    const data = docSnap.data()
    if (typeof data.answer !== 'number') continue
    await db.collection('questionAnswers').doc(docSnap.id).set({ answer: data.answer })
    await docSnap.ref.update({ answer: admin.firestore.FieldValue.delete() })
    migrated++
  }
  return { migrated, remaining: snap.size === BATCH ? 'more' : 0 }
})

