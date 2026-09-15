# Hermes Deck

A personal, local dashboard for daily habits, product goals, and an ideas
graph read straight from your Obsidian vault. Single user, runs on your own
machine, no cloud service required.

## Setup

```bash
npm install
cp .env.example .env   # then edit OBSIDIAN_VAULT_PATH
npm start
```

Open http://localhost:4173

Data is stored in `data/store.json` (created automatically on first run,
gitignored). Back it up like any other file — there's no database server.

## What's wired up vs. still manual

| Feature | How |
|---|---|
| **Health habit** | Fully manual — click a day's cell in the table to toggle done/miss. No bot, no reminders. |
| **Coding sessions** | Counted automatically each time Claude Code hits your usage limit — see "Coding-session hook" below. |
| **Expenses** | A `-$100` entry is added automatically for every day (backfilled on server start if you skip a day). Add more manual entries via `POST /api/expenses`. |
| **Ideas backlog** | Read-only, straight from your Obsidian vault on disk (`OBSIDIAN_VAULT_PATH`). Edit notes in Obsidian — this view re-reads the vault on every page load, nothing is cached or written back. |
| **Product goals** | Seeded with one dummy product — edit the goal text, deadline, and Done/To-do checkbox directly in the table. Add more products/phases with the "+" buttons. |

## Coding-session hook

Claude Code has a `StopFailure` hook that fires when a turn ends in an API
error, with a `rate_limit` error type when you've hit your usage limit. Add
this to your global `~/.claude/settings.json` (merge with whatever hooks you
already have):

```json
{
  "hooks": {
    "StopFailure": [
      {
        "matcher": "rate_limit",
        "hooks": [
          { "type": "command", "command": "/home/user/tungo/hooks/on-rate-limit.sh" }
        ]
      }
    ]
  }
}
```

Use the real absolute path to this repo on your machine. The script just
POSTs to `http://localhost:4173/api/coding-sessions/increment` and fails
silently if the server isn't running, so it never gets in the way of a
Claude Code session.

## Notes

- No GitHub/PR tracking — that row was dropped from the habits table.
- No Telegram/Hermes bot — health check-ins are a manual click in the UI.
- Keep `npm start` running (or use `npm run dev` for auto-reload while you
  edit) whenever you want the coding-session hook to actually record hits.
