const express = require('express');
const store = require('../lib/store');
const { isMonday, todayStr, addDays } = require('../lib/dates');

const router = express.Router();

// GET /api/health/streak -> consecutive tracked days ending today, skipping
// Mondays (a Monday neither breaks nor extends the streak).
router.get('/streak', (req, res) => {
  const data = store.load();
  const today = todayStr();
  let streak = 0;
  let cursor = today;
  for (let i = 0; i < 3660; i++) {
    if (!isMonday(cursor)) {
      const status = data.health[cursor];
      if (status === 'done') streak += 1;
      else if (status === 'miss') break;
      else if (cursor !== today) break; // an un-answered past day breaks the streak
      // else: today just hasn't been answered yet — don't break, don't count
    }
    cursor = addDays(cursor, -1);
  }
  res.json({ streak });
});

// GET /api/health?month=YYYY-MM  -> { '2026-09-01': 'done', ... } for that month
router.get('/', (req, res) => {
  const month = req.query.month || todayStr().slice(0, 7);
  const data = store.load();
  const out = {};
  for (const [date, status] of Object.entries(data.health)) {
    if (date.startsWith(month)) out[date] = status;
  }
  res.json({ month, days: out });
});

// POST /api/health/toggle { date }  -> toggles done/miss for that date (rejects Mondays)
router.post('/toggle', (req, res) => {
  const { date } = req.body || {};
  if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
  if (isMonday(date)) return res.status(400).json({ error: 'Monday is a rest day, nothing to track' });

  const data = store.update((s) => {
    const current = s.health[date];
    s.health[date] = current === 'done' ? 'miss' : 'done';
  });
  res.json({ date, status: data.health[date] });
});

module.exports = router;
