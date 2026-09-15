const express = require('express');
const store = require('../lib/store');
const { todayStr, addDays } = require('../lib/dates');

const router = express.Router();

// GET /api/coding-sessions?month=YYYY-MM -> { '2026-09-01': 2, ... }
router.get('/', (req, res) => {
  const month = req.query.month || todayStr().slice(0, 7);
  const data = store.load();
  const out = {};
  for (const [date, count] of Object.entries(data.codingSessions)) {
    if (date.startsWith(month)) out[date] = count;
  }
  res.json({ month, days: out });
});

// POST /api/coding-sessions/increment { date? } -> +1 session for that date (default today)
// This is what the local Claude Code hook (hooks/on-rate-limit.sh) calls each time
// Claude Code hits its usage limit — see README for the hooks/settings.json wiring.
router.post('/increment', (req, res) => {
  const date = (req.body && req.body.date) || todayStr();
  const data = store.update((s) => {
    s.codingSessions[date] = (s.codingSessions[date] || 0) + 1;
  });
  res.json({ date, count: data.codingSessions[date] });
});

// GET /api/coding-sessions/streak -> current consecutive-day streak ending today
router.get('/streak', (req, res) => {
  const data = store.load();
  let streak = 0;
  let cursor = todayStr();
  while ((data.codingSessions[cursor] || 0) > 0) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  res.json({ streak });
});

module.exports = router;
