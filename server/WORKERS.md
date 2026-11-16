# Railway background worker

The API image includes a long-running scheduler worker. It shares the same
PostgreSQL advisory locks as the API scheduler, so both processes can safely
run during a rolling migration.

## Create the worker service

1. In Railway, create a second service from the same `HalxDocs/jambquiz`
   repository and branch.
2. Set its Railway config file to `railway.worker.toml` (same Dockerfile,
   without the API's HTTP health check).
3. Copy the API's runtime variables needed by scheduled jobs, especially
   `DATABASE_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
   `TERMII_API_KEY`, and `TERMII_SENDER_ID`.
4. Set `SERVICE_ROLE=worker`. The shared container entrypoint will run
   `/usr/local/bin/worker scheduler` instead of starting the HTTP API.
5. Leave `RUN_SCHEDULER=true` on the API until the worker is up. Both can run
   safely because of the PostgreSQL advisory locks. Confirm the worker has
   heartbeat and job-run rows, then set `RUN_SCHEDULER=false` on the API if
   you want the API process to stop running background work.
6. Monitor `https://jambquiz-production.up.railway.app/schedulerz` with an
   uptime monitor. It returns HTTP 503 if no scheduler worker is alive, a job
   is stale/failed, or permanent push deliveries are waiting for review.

The API runs pending database migrations at startup. Start or redeploy the
worker after the API deploy has applied the migration.

## Operations

The worker image also supports one-shot jobs:

```sh
/usr/local/bin/worker push-outbox
/usr/local/bin/worker retry-pushes
/usr/local/bin/worker keypoints
```

`retry-pushes` requeues up to 100 failed/stale push deliveries after the
underlying issue is fixed. The outbox retries transient delivery failures up
to eight times with increasing delays, limits active sends to eight, and
retains completed/failed records for 90 days.
