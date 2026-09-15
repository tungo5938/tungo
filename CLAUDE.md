# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hermes Deck — a personal, single-user dashboard (health habit, coding-session
streak, expenses, product goals, and an Obsidian ideas graph). No database,
no auth, no multi-tenancy. Built for one person running it locally or on a
single hosted instance; do not add abstractions for multiple users.

## Commands

```bash
npm install
npm start        # node server.js, serves on http://localhost:4173 (or $PORT)
npm run dev       # node --watch server.js, auto-reload on file changes
npm run setup-hook  # one-time: wires the Claude Code rate-limit hook into ~/.claude/settings.json
```

There is no test suite, linter, or build step.

## Architecture

Plain Express app, no frontend framework/bundler — `public/` is served
statically and `public/app.js` talks to the JSON API via `fetch`.

- `server.js` — mounts one router per feature under `/api/*`. Adding a
  feature means adding a `routes/<name>.js` and mounting it here.
- `lib/store.js` — the entire "database": a single `data/store.json` file,
  read into an in-process cache and read-modify-written via `store.update(fn)`.
  All routes go through `store.load()` / `store.update()`, never touch the
  file directly. `withDefaults()` backfills any new top-level/`settings` keys
  into an existing `store.json` on load — when adding a new field to
  `defaultStore()`, no migration script is needed, this handles it.
  `DATA_DIR` (env var) controls where `store.json` lives — defaults to the
  repo's `data/` folder locally, but should point at a mounted persistent
  volume when hosted (e.g. Railway), since the container filesystem is wiped
  on redeploy.
- `lib/dates.js` — all dates are `'YYYY-MM-DD'` strings in local time; use
  these helpers (`todayStr`, `addDays`, `startOfWeek`, `isMonday`, etc.)
  rather than doing date math inline. Weeks start Monday; the health streak
  treats Monday as a rest day that neither breaks nor extends it.
  Weekly bonus rows are keyed by week-*ending* Sunday date.
- `lib/vault.js` — reads an Obsidian vault directly off disk (no caching, no
  writing back) to build the Ideas backlog: parses frontmatter, resolves
  `[[wikilinks]]` to note IDs, renders markdown to HTML, and lays out the
  link graph with a Fruchterman-Reingold force simulation (`forceLayout`)
  rather than a naive grid, to match Obsidian's own graph view. Surfaces
  `EACCES`/`EPERM` as a specific macOS permission-grant message rather than
  a generic not-found error.
- `lib/env.js` — minimal `.env` loader (no dependency), loaded once at the
  top of `server.js`.
- `routes/ideas.js` — when `RAILWAY_ENVIRONMENT` is set and no vault is
  reachable, returns a distinct "this is the hosted copy" message instead of
  the local "enter a vault path" prompt — a hosted instance has no access to
  the user's Mac filesystem, so the Ideas backlog is local-only by design.
- `hooks/on-rate-limit.sh` + `scripts/install-hook.js` — the coding-session
  counter is driven by Claude Code's own `StopFailure` hook (`matcher:
  "rate_limit"`), not by this app polling anything. The hook POSTs to
  `/api/coding-sessions/increment` and fails silently/fast if the server
  isn't running, so it never blocks Claude Code itself.

## Notes

- `ByGptTu.js`, root-level `index.html`, and `styles.css` (not
  `public/styles.css`) are an unrelated leftover weather-app demo, not part
  of Hermes Deck. The real frontend is entirely under `public/`.
- Data model, feature scope, and "what's wired up vs. still manual" are
  documented in `README.md` — keep both in sync when changing either.
