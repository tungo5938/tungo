const express = require('express');
const store = require('../lib/store');

const router = express.Router();

// GET /api/bonus?month=YYYY-MM -> { '2026-09-13': { name, achieved }, ... }
router.get('/', (req, res) => {
  const month = req.query.month;
  const data = store.load();
  if (!month) return res.json(data.bonuses);
  const out = {};
  for (const [date, bonus] of Object.entries(data.bonuses)) {
    if (date.startsWith(month)) out[date] = bonus;
  }
  res.json(out);
});

// PUT /api/bonus/:weekEndingDate { name, achieved }
router.put('/:weekEndingDate', (req, res) => {
  const { weekEndingDate } = req.params;
  const { name, achieved } = req.body || {};
  const data = store.update((s) => {
    const existing = s.bonuses[weekEndingDate] || { name: 'Reward', achieved: false };
    s.bonuses[weekEndingDate] = {
      name: typeof name === 'string' ? name : existing.name,
      achieved: typeof achieved === 'boolean' ? achieved : existing.achieved
    };
  });
  res.json(data.bonuses[weekEndingDate]);
});

module.exports = router;
