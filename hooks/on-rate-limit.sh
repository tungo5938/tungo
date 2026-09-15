#!/bin/sh
# Fired by Claude Code's StopFailure hook (matcher: rate_limit) — see README.md
# for the settings.json wiring. Counts one "coding session" each time you hit
# your usage limit. Fails silently and fast if the Hermes Deck server isn't
# running, so it never blocks or slows down Claude Code.
curl -s -m 2 -X POST http://localhost:4173/api/coding-sessions/increment \
  -H 'Content-Type: application/json' -d '{}' > /dev/null 2>&1 || true
