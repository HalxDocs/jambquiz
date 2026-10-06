# Cutover: Firebase → Go (`server/`) + Postgres

Firebase stays live until the steps below are done. Nothing here touches it.

## 0. What exists where

| Firebase | Go equivalent |
|---|---|
| `functions/index.js` (~60 callables) | `server/internal/modules/*` |
| Firestore collections | `server/migrations/*.sql` (13 files, 34 tables) |
| Firebase Auth + custom claims | bcrypt + HS256 JWT (`role`: student/teacher/admin) |
| Schedulers (1m–15m–2h) | `server/cmd/worker <job>` on cron |
| `computeAdminStats`, `syncPaystackPayments` | `GET /api/admin/stats`, `GET /api/admin/payments/sync` |
| Firebase Hosting (static) | unchanged — only the API base moves |

## 1. Provision production

1. Postgres 16+ (managed recommended: Neon/Supabase/Railway). Note the
   connection string as `DATABASE_URL`.
2. Copy `server/.env.example` → production env and fill secrets from the
   Firebase console / secrets manager:
   `JWT_SECRET` (new random 32+ bytes), `PAYSTACK_SECRET_KEY`,
   `BACHS_*`, `VAPID_PRIVATE_KEY` (keep the existing public key —
   already the default), `TERMII_API_KEY`, `TERMII_SENDER_ID`.
3. Build + migrate + bootstrap:
   ```bash
   cd server
   go run ./cmd/migrate up
   go run ./cmd/bootstrap --name "Your Name" --password "<strong>"
   go build -o /tmp/api ./cmd/api
   PORT=8080 /tmp/api
   curl localhost:8080/healthz   # {"db":"up","ok":true,...}
   ```
4. Cron (every minute; jobs self-gate, so one line each is fine):
   ```
   * * * * * /opt/274lab/worker advance-week
   * * * * * /opt/274lab/worker quiz-reminders
   * * * * * /opt/274lab/worker quiz-time
   * * * * * /opt/274lab/worker absent-sms
   * * * * * /opt/274lab/worker quiz-sms
   */15 * * * * /opt/274lab/worker leaderboard
   */15 * * * * /opt/274lab/worker public-stats
   */2 * * * * /opt/274lab/worker keypoints
   ```

## 2. Backfill Firestore → Postgres

IDs are TEXT precisely so Firestore doc IDs survive 1:1.

1. In Firebase console: Firestore → Export (or per-collection `gcloud
   firestore export`), download as JSON.
2. Import order (parents first): `students` → `student_profiles`,
   `teachers`, `questions` + `question_answers`, `topics`,
   `question_limits`, `settings`, `scores`, `scoreDetails` →
   `score_details`, `payments`, `paystackCheckouts`, `bachsCheckouts`,
   `coin_packs`, `coinLedger`, `goats`, `goat_weeks`, `pioneerCodes`,
   `push_subscriptions`.
   Skip: `quiz_sessions` (ephemeral), `usage_logs` (optional),
   `rate_limits`, `admin_stats`/`leaderboard*`/`public_stats` (recomputed
   by workers), `reminder_sent` guards (expire naturally).
3. Field renames are camelCase → snake_case (`studentId` →
   `student_id`, `freeAttemptsUsed` → `free_attempts_used`, …).
   Timestamps: ISO strings → `timestamptz`.
4. After import: `UPDATE students SET coins = GREATEST(coins, 20)
   WHERE coins IS NULL OR referral_no IS NULL` + allocate missing
   referral numbers sequentially (`02`, `03`, … — the counter lives in
   `admin_settings/counter_referrals`, and `/api/coins/balance`
   self-heals stragglers anyway).

## 3. Passwords — the one hard break

Firebase passwords live in Firebase Auth and **cannot** be migrated
(one-way hashes under Google's keys). Every user must set a new password:

1. Before cutover, broadcast + SMS: "We're upgrading — tap this link to
   set a new password."
2. Simplest compliant path: admin sets each account's `recovery_code`
   (already supported by `verify-recovery`), user enters code +
   chooses password via a small reset screen calling
   `POST /api/students/verify-recovery` then a password-set endpoint.
   Until then, `password_hash` is `''` and login correctly rejects.
3. Teachers: same flow via their login (phone identity is preserved).

## 4. Frontend switch

1. Add `VITE_API_BASE` to the web app; route new API calls through it
   (auth → JWT in `localStorage`, replacing the Firebase session).
   Keep Firestore reads until the API covers a screen, then flip
   screen by screen: Auth → Subscribe → Quiz → Dashboard → Admin.
2. Push subscriptions: re-register against `/api/...` (existing
   `push_subscriptions` rows use the same VAPID public key, so they
   keep working once backfilled).
3. Point Paystack/Bachs webhook URLs at
   `/api/webhooks/paystack` and `/api/webhooks/bachs`.

## 5. Go-live + rollback

1. Deploy Go behind the domain, run one full weekly cycle in parallel
   (Firebase still primary). Compare leaderboards + revenue daily.
2. Flip `VITE_API_BASE`, monitor `/healthz` + `sms_failures` +
   `usage_logs`.
3. Rollback = point the frontend back at Firebase. Keep Firebase
   project (frozen) for one full 26-week cycle before decommissioning.

## 6. Deliberately not ported

- `teacher_otps` table + OTP flow (dead in Firebase too — no function
  reads it).
- Legacy coin top-up flags (`coinsSeeded`/`coinsBumpedTo20`) — backfill
  sets correct balances instead.
- `syncStudentProfile(s)` — profiles are written inline in Go.
- `setupAdmin`/`linkStudentUid`/`migrateLegacyAuth`/`verifyLegacyLogin`
  — Firebase-auth migration baggage; `cmd/bootstrap` replaces setup.
