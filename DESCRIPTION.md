# 274Lab JAMB Quiz — Full Product Description

## One-line pitch
274Lab is a structured, year-long JAMB/UTME practice platform that turns the
26 weeks before the exam into a measurable, feedback-driven training cycle
instead of random past-question grinding.

---

## The problem

JAMB/UTME is a single 4-subject, 200-minute exam that decides university
admission for ~2 million Nigerian students every year. The public statistics
from UTME 2025 paint a stark picture:

- **~1.95 million** candidates sat UTME 2025.
- **~1.5 million (78%)** scored below 200/400.
- The largest single band — **~983,000 students** — scored between 160 and 199.
- These students did not fail because they are unintelligent. They failed
  because they practiced randomly, never measured their weak topics, and
  walked into the exam with no idea which subjects were costing them points.

Why this happens, in concrete terms:

1. **No feedback loop.** Reading past questions in a PDF gives you an answer
   key, not a profile of *you*. Most students never see their per-subject
   average, never see their score trend, and never know that, say, "Acid-Base
   reactions in Chemistry" is what is pulling their score down.
2. **Inconsistent study windows.** Without a fixed weekly cadence,
   preparation happens in bursts — a few hours the night before a mock, then
   nothing for two weeks.
3. **Wrong scoring model in practice.** Many students practice with
   "+1 per correct, 0 per wrong," which trains the wrong risk-reward
   behavior. UTME is **+4 correct, −1 wrong**. Skipping beats guessing if
   your accuracy is low — but almost no one practices under that rule.
4. **No accountability.** Parents, guardians, and teachers have no window
   into how a student is actually performing week over week. Encouragement
   becomes guesswork.
5. **No concept of "weak topics."** A student who scores 85% in Physics and
   42% in Chemistry needs to spend 4× as much time on Chemistry, but
   without per-topic tracking, study time is split evenly and the weak
   subject stays weak.

274Lab exists to fix all five of these.

---

## What 274Lab is

A web app (Progressive Web App, installable on Android) that:

- Locks the **last 274 days before UTME** into a **26-week structured
  curriculum** of weekly timed tests.
- Lets a student pick **4 JAMB subjects** out of 11 (Mathematics, Physics,
  Chemistry, Biology, English, Government, Literature, CRS, IRS, Commerce,
  Economics).
- Runs the **active week's quiz** during a 60-minute window on Friday &
  Saturday (17:00–18:00 WAT), with shuffled questions and shuffled option
  order to prevent memorization.
- Scores every quiz using **JAMB's exact formula** — +4 correct, −1 wrong,
  0 unanswered — so what you practice is what you get on exam day.
- Shows the student, after each quiz, **exactly which questions they got
  wrong, the correct answer, and an explanation/key-point video** so a
  wrong answer becomes a learning event instead of a number going down.
- Tracks **per-subject best score, average, and attempt count** so the
  student can see "I'm strongest in Maths (avg 78%), weakest in Chemistry
  (avg 41%)" and act on it.
- Surfaces a **live leaderboard** so the student can see where they stand
  against their peers in real time.
- Ranks students into **6 Consistency Tiers** based on how many weeks of
  the 26 they've actually completed:
  - **GHOST** (0 quizzes) → **ROOKIE** (1) → **LEARNER** (6) →
    **CADET** (11) → **SCHOLAR** (16) → **ELITE** (21+)
- Awards **gold medals** for every week the student aces — a tangible
  26-medal yearly track.
- Supports an optional **"247 Chops"** push notification stream: small,
  high-density key points and mnemonics dropped to the student
  throughout the day, so revision continues even when they are not
  actively in the app.
- Activates **Patches Mode** from **June 21** onward: the app
  automatically flags any subject where the student's average is **below
  50%** and floods that subject's notification feed with the
  highest-yield key points for the remaining weeks. The UI switches to
  a dark theme with red accents so the urgency is visible.
- Provides a **"Find Friends"** search by name or nickname so students
  can add accountability partners.
- Sends a **weekly WhatsApp report** to a chosen parent/guardian or
  teacher with the student's JAMB total (/400), per-subject best scores,
  and a short message in the recipient's preferred voice (parent or
  teacher).
- Lets a student **retake any past quiz** to master what they missed
  without it counting against their "best score" record.

Pricing is intentionally low-friction: **2 free quizzes** for any new
student, then **₦800/month** (~$0.50 USD) — deliberately priced below a
single plate of rice so it is not the barrier.

---

## Who it is for

- **Primary:** SS3 Nigerian students writing UTME in the next 6–9 months
  who want a measurable, weekly structure rather than random past
  questions.
- **Secondary:** SS1/SS2 students who want a long runway and the
  consistency rank system to gamify their study habit.
- **Tertiary:** Parents, guardians, and teachers who want a weekly,
  plain-English status update on a student's progress without having to
  ask.

---

## How it works (student flow)

1. **Sign up** with a full name, nickname, JAMB year, and a password.
   Two free quizzes are unlocked instantly.
2. **Pick 4 subjects** from the 11 available.
3. The **Dashboard** shows the current active week, time until the quiz
   window opens, the student's consistency rank, medal count, and per-
   subject averages.
4. During the **Fri/Sat 5–6pm window**, the student enters the quiz,
   answers 25 questions per subject under JAMB timing, and submits.
5. **Results** show score, JAMB total (/400), per-subject breakdown,
   every question they got wrong with the right answer and an
   explanation, and a key-point video for each weak topic.
6. The student's **rank, medal, leaderboard position, and average
   scores** all update immediately.
7. From **June 21**, if any subject average drops below 50%, that
   subject enters **Patches** — its key points become the priority in
   the push notification feed, and the dashboard highlights it in red.
8. The student's chosen **parent/teacher gets a WhatsApp message** the
   same evening with a clean weekly summary.

---

## Admin / teacher side

A separate Admin panel is used by 274Lab operators to:

- **Add, edit, and delete students**, grant subscription access in
  1/3/6-month windows, and reset passwords.
- **View a live "Total Students" count** filtered by year (e.g. all
  years, SS3 only, 2026 candidates only) — updated in real time as
  students register or are removed.
- **Compose and edit quizzes** for any (subject, week) pair: question
  text, options A–D, correct answer, optional explanation video URL.
- **Copy questions** between weeks so teachers don't re-type the same
  curriculum.
- **Set the active week** for all students globally.
- **View computed statistics** — total students, total attempts,
  average score, total revenue, active/free/expired subscription
  counts, top 3 performers overall, top 3 per subject, per-subject
  average bars.
- **View payments** with pagination and search.
- **View analytics** (per-page usage events) to see which screens are
  being used.
- **Send push notifications** (server-pushed via FCM cloud function)
  for ad-hoc announcements, with optional Patch-mode targeting.

---

## Technical description

### Stack
- **Frontend:** React 19 + Vite, Tailwind CSS for layout, custom CSS
  design tokens, Hugeicons for the icon set, `react-helmet-async` for
  per-page SEO.
- **Backend / data:** Firebase Firestore (NoSQL document store) for all
  student, score, question, payment, and analytics data; Firebase
  Cloud Functions for `computeAdminStats` and
  `sendKeyPointNotifications`; Firebase Hosting for static delivery.
- **Auth model:** Lightweight name + password sign-in (no Firebase
  Auth), passwords hashed client-side (SHA-256 + per-user salt),
  session stored in `localStorage` with a 30-day expiry. This is a
  deliberate trade-off — see "Known limitations" below.
- **Payments:** Paystack inline checkout, initiated from the browser,
  with a webhook-free "manual extension" fallback for the admin
  (Paystack server-side verification is the planned upgrade).
- **Push notifications:** FCM via service worker, with subscription
  records stored in the `push_subscriptions` collection. Background
  delivery is handled by a scheduled cloud function.
- **Offline / PWA:** Service worker (Workbox via `vite-plugin-pwa`)
  pre-caches the app shell and static assets so the app boots offline;
  a local IndexedDB cache (`idb`) holds students, questions, and
  scores for offline use, and writes are queued and replayed when the
  network returns.

### Data model (Firestore collections)
- `students` — one document per registered student. Fields: `name`,
  `nameLower` (for case-insensitive search), `passwordHash`, `passwordSalt`,
  `nickname`, `year`, `email`, `parentPhone`, `teacherPhone`, `subjects`,
  `subscriptionUntil` (ISO date string), `freeAttemptsUsed` (0/1/2),
  `createdAt`.
- `scores` — one document per (student, week, subject) attempt. Fields:
  `studentId`, `studentName`, `week`, `subject`, `score`, `total`, `pct`,
  `correct`, `wrong`, `skipped`, `answers`, `createdAt`.
- `questions` — keyed by `week` and `subject`. Fields: `week`, `subject`,
  `text`, `options` (array of 4), `answer` (0–3), `videoUrl`, `createdAt`.
- `payments` — one document per Paystack transaction.
- `admin_stats/overview` — single document with pre-computed aggregates
  (student count, attempt count, average score, top performers,
  revenue).
- `settings/activeWeek` — the currently active week string.
- `settings/quizDates` — Fri/Sat window times.
- `question_limits/{week}` — per-week question count override.
- `topics/{week}` — array of key-point topics per week, with optional
  video URL.
- `reminder_sent/{week}` — flag so each week's reminder is sent once.
- `push_subscriptions` — FCM endpoint + keys per device.
- `notification_state/{deviceId}` — last-seen notification IDs for
  idempotency.
- `usage_logs` — per-page, per-event analytics log (read-only, kept
  lean).

### Security hardening (penetration-test pass)

The app was put through a full pen-test pass before public launch.
Fixes shipped:

- **Postinstall backdoor removed.** A malicious `postinstall` script
  in `package.json` that was attempting to fetch a payload from a
  remote GitHub repo and execute it was deleted; `package-lock.json`
  was verified clean.
- **Firestore rules tightened.** Public read is preserved (open data
  model), but writes are now restricted to whitelisted fields with
  type and length validation, `students.delete` is locked down, and
  role-escalation paths (`role: 'admin'`) are explicitly blocked at
  create time.
- **Password reset gated.** A password change now requires the
  current password to be supplied and verified; failed attempts count
  against the rate limiter.
- **Login rate limit persisted.** Attempts and cooldown timestamps are
  stored in `localStorage` so a hard refresh does not reset the
  limit. 5 failed attempts trigger a 30-second cooldown.
- **Session expiry.** Sessions older than 30 days are auto-cleared on
  app boot.
- **Input length caps.** Name (50), password (64), contact form
  fields all enforced with `maxLength` to prevent oversized-write
  attacks.
- **XSS guards.** A `safeUrl` utility validates that any URL rendered
  in an `<a href>` uses only `http:`, `https:`, `mailto:`, `tel:`,
  or `whatsapp:` protocols — blocking `javascript:` and `data:`
  payloads. All `target="_blank"` links carry `rel="noopener noreferrer"`.
- **CSP meta tag** in `index.html` restricts script, image, connect,
  and frame sources to known origins (self, Paystack, Firebase).
- **SEO infrastructure.** `react-helmet-async` powers per-page
  `<title>`, `<meta>`, OpenGraph, Twitter cards, and canonical URLs;
  a `robots.txt` and `sitemap.xml` are served from the site root;
  Organization JSON-LD is emitted on the home page.
- **`alert()` removed.** All `alert()` calls were replaced with a
  custom in-app toast system (`useToastStore` + `<GlobalToast />`)
  with success / error / info variants and a manual dismiss.

### Browser support
- Modern Chromium-based browsers (Chrome, Edge, Brave, Opera, Samsung
  Internet) on desktop and Android.
- Safari 15+ on macOS and iOS (with the service worker providing
  limited offline support on iOS).
- Installable as a PWA on Android via "Add to Home Screen."

---

## Known limitations (and the planned fixes)

- **No real authentication.** The app uses name + password with
  client-side hashing and public Firestore rules. Anyone with the
  rules can read all data. A migration to **Firebase Authentication**
  is planned; until that ships, sensitive data (parent phone, email)
  is treated as non-sensitive UI-only and the leaderboard is filtered
  to safe fields.
- **Paystack verification is client-side.** A full migration to
  **Paystack server-side webhook** + a cloud function that extends
  `subscriptionUntil` is on the roadmap; today the admin can grant
  access manually, and a successful client-side payment also
  auto-extends.
- **Self-service password reset** is gated by knowing the current
  password; email-based reset is not yet wired up (would require
  Firebase Auth's `sendPasswordResetEmail`).
- **Analytics are coarse.** Page-view and event counts only; no
  per-user funnel, no retention cohorts. Upgrade path: BigQuery export
  of `usage_logs` + a Looker Studio dashboard.
- **The 247 Chops push feed is curated by hand.** A future pass will
  pull key points from the `topics/{week}` collection and rotate
  them automatically based on the student's weak subjects.
- **No native iOS app.** The PWA covers the iOS use case at
  feature parity except for background push notifications, which iOS
  restricts for non-native apps.

---

## Brand and tone

- Name: **274Lab** (a play on the 274 days students get between
  starting serious prep and writing UTME).
- Tagline: **"Stop guessing. Start tracking."**
- Color: predominantly black / off-white / yellow accents on
  marketing surfaces, a clean white app shell in the product, and a
  red-accented dark theme inside the in-app "Patches" mode for
  urgency.
- Supported by **A.M.C** (Adeola Memorial College) on all admin-side
  communications.
- Contact: **contact@274lab.com**.

---

## File map (for engineers picking this up)

- `src/App.jsx` — top-level routing, session bootstrap, Helmet
  provider, global toast mount.
- `src/firebase.js` — Firebase app init and Firestore export
  re-exports.
- `src/store/` — Zustand-style store split by domain:
  `students.js`, `scores.js`, `questions.js`, `topics.js`,
  `settings.js`, `payments.js`, `analytics.js`, `toast.js`,
  `constants.js`.
- `src/pages/` — top-level routes: `Home`, `Intro`, `Dashboard`,
  `Quiz` (7 internal branches), `Results`, `Subscribe`,
  `Leaderboard`, `Contact`, `SubjectSelect`, `Supporters`,
  `SubjectDetail`, `Admin`.
- `src/components/admin/` — `Admin`, `StudentManager`, `StatsPanel`,
  `PaymentsPanel`, `QuestionForm`, `TopicEditor`,
  `AdminNotifications`, `AnalyticsPanel`.
- `src/components/quiz/` — quiz UI shell and per-question rendering.
- `src/components/seo/SEO.jsx` — Helmet wrapper used on every page.
- `src/components/ui/GlobalToast.jsx` — top-center toast renderer.
- `src/lib/safeUrl.js` — URL-protocol allow-list.
- `public/robots.txt`, `public/sitemap.xml` — SEO surface.
- `firestore.rules` — tightened security rules (deployed).
- `firebase.json` — hosting + Firestore + Functions config.
- `functions/index.js` — `computeAdminStats` and
  `sendKeyPointNotifications` cloud functions.
- `index.html` — root document, includes CSP, meta tags, manifest
  link.
