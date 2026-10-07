#!/bin/sh
# Migrate first (safe to re-run: only pending files apply), then serve.
set -e
/usr/local/bin/migrate up
exec /usr/local/bin/api
