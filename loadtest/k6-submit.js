// k6 load test for the session-based quiz flow (P2-6).
//
// Ramp: 5k → 100k virtual users simulating the peak exam-window load. Each VU
// signs in via Firebase Identity Toolkit, then startQuiz → submitQuiz.
//
// Run:
//   k6 run --vus 100 --duration 2m loadtest/k6-submit.js
//
// Env vars (or edit below):
//   FIREBASE_API_KEY  — Web API key
//   FIREBASE_PROJECT  — projectId
//   EMAIL_DOMAIN      — students' auth email domain (default 274lab.app)
//
// Thresholds mirror the audit targets: p95 < 2000ms and error rate < 1%.
import http from 'k6/http'
import { check, sleep } from 'k6'

const API_KEY = __ENV.FIREBASE_API_KEY || 'REPLACE_ME'
const PROJECT = __ENV.FIREBASE_PROJECT || 'fitness-gym-fc040'
const DOMAIN = __ENV.EMAIL_DOMAIN || '274lab.app'
const FUNCTIONS_URL = `https://${PROJECT}-us-central1.cloudfunctions.net`
const WEEKS = ['Week 1', 'Week 2', 'Week 3', 'Week 4']

export const options = {
  stages: [
    { duration: '2m', target: 5000 },   // warm-up
    { duration: '5m', target: 50000 },  // climb
    { duration: '5m', target: 100000 }, // peak
    { duration: '2m', target: 0 },      // drain
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:startQuiz}': ['p(95)<1500'],
    'http_req_duration{name:submitQuiz}': ['p(95)<2500'],
  },
}

function authEmail(nameLower) {
  return `${nameLower.replace(/\s+/g, '.').toLowerCase()}@${DOMAIN}`
}

function signIn(nameLower, password) {
  const body = {
    email: authEmail(nameLower),
    password,
    returnSecureToken: true,
  }
  const res = http.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    JSON.stringify(body),
    { headers: { 'Content-Type': 'application/json' } }
  )
  if (res.status !== 200) return null
  return res.json().idToken
}

function callable(name, token, data) {
  const payload = { data }
  const res = http.post(`${FUNCTIONS_URL}/${name}`, JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    tags: { name },
  })
  return res
}

export default function () {
  const week = WEEKS[Math.floor(Math.random() * WEEKS.length)]
  const suffix = `${__VU}-${Date.now() % 100000}` // unique-ish account per VU
  const nameLower = `loadtest ${suffix}`
  const token = signIn(nameLower, 'Loadtest123!')

  // Pre-registered accounts fail sign-in; fall back to a seeded set. For a
  // full run, pre-seed accounts (see README notes) and set nameLower from a
  // fixed pool instead:
  //   const nameLower = `lt${__VU}`;
  if (!token) {
    // Still measure the failure path so thresholds include cold-start/4xx.
    check(null, { 'sign-in ok': false })
    sleep(0.2)
    return
  }

  const start = callable('startQuiz', token, { studentId: `student-${__VU}`, week, retakeSubject: undefined })
  check(start, { 'startQuiz 200': (r) => r.status === 200 })
  if (start.status !== 200) { sleep(0.5); return }

  const startData = start.json().result
  if (!startData || !startData.ok || !startData.sessionId) { sleep(0.5); return }

  // Answer every question with option 0 (server grades; latency is the metric).
  const answers = {}
  for (const [subject, qs] of Object.entries(startData.questions || {})) {
    answers[subject] = qs.map(() => 0)
  }

  const submit = callable('submitQuiz', token, { sessionId: startData.sessionId, answers })
  check(submit, { 'submitQuiz 200': (r) => r.status === 200 })

  sleep(1)
}
