const express = require('express');
const store = require('../lib/store');
const { todayStr, addDays, startOfWeek } = require('../lib/dates');

const router = express.Router();

const DAILY_LABEL = 'Salary';
const DAILY_AMOUNT = -100;

// Backfill the automatic daily entry for every day from the store's creation
// date up to (and including) today that doesn't have one yet. Idempotent —
// safe to call on every request.
function ensureDailyEntries() {
  const data = store.load();
  const existing = new Set(
    data.expenses.filter((e) => e.label === DAILY_LABEL).map((e) => e.date)
  );
  let cursor = data.meta.createdAt;
  const today = todayStr();
  const toAdd = [];
  while (cursor <= today) {
    if (!existing.has(cursor)) toAdd.push({ date: cursor, label: DAILY_LABEL, amount: DAILY_AMOUNT });
    cursor = addDays(cursor, 1);
  }
  if (toAdd.length) {
    store.update((s) => { s.expenses.push(...toAdd); });
  }
}

function sumBetween(expenses, fromDate, toDate) {
  return expenses
    .filter((e) => e.date >= fromDate && e.date <= toDate)
    .reduce((sum, e) => sum + e.amount, 0);
}

// GET /api/expenses/summary -> today/week/month/lifetime net totals + today's breakdown
router.get('/summary', (req, res) => {
  ensureDailyEntries();
  const data = store.load();
  const today = todayStr();
  const weekStart = startOfWeek(today);
  const monthStart = today.slice(0, 7) + '-01';

  res.json({
    today: sumBetween(data.expenses, today, today),
    weekToDate: sumBetween(data.expenses, weekStart, today),
    monthToDate: sumBetween(data.expenses, monthStart, today),
    lifetime: sumBetween(data.expenses, '0000-01-01', today),
    todayBreakdown: data.expenses.filter((e) => e.date === today)
  });
});

// POST /api/expenses { date?, label, amount } -> add a manual entry
router.post('/', (req, res) => {
  const { label, amount } = req.body || {};
  const date = (req.body && req.body.date) || todayStr();
  if (!label || typeof amount !== 'number') {
    return res.status(400).json({ error: 'label (string) and amount (number) are required' });
  }
  store.update((s) => { s.expenses.push({ date, label, amount }); });
  res.status(201).json({ date, label, amount });
});

module.exports = router;
