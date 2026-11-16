#!/bin/sh
# The worker shares the API image but does not own migrations. The API applies
# pending migrations before it starts serving requests.
set -e
if [ "${SERVICE_ROLE:-api}" = "worker" ]; then
  exec /usr/local/bin/worker scheduler
fi
/usr/local/bin/migrate up
exec /usr/local/bin/api
