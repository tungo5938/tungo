const express = require('express');
const store = require('../lib/store');

const router = express.Router();

// GET /api/products -> full list, dummy data until you edit it
router.get('/', (req, res) => {
  res.json(store.load().products);
});

// PATCH /api/products/:key/phases/:n  { goal?, deadline?, done? }
router.patch('/:key/phases/:n', (req, res) => {
  const { key } = req.params;
  const n = Number(req.params.n);
  const { goal, deadline, done } = req.body || {};

  let updated = null;
  store.update((s) => {
    const product = s.products.find((p) => p.key === key);
    if (!product) return;
    const phase = product.phases.find((ph) => ph.n === n);
    if (!phase) return;
    if (typeof goal === 'string') phase.goal = goal;
    if (typeof deadline === 'string') phase.deadline = deadline;
    if (typeof done === 'boolean') phase.done = done;
    updated = phase;
  });

  if (!updated) return res.status(404).json({ error: 'product or phase not found' });
  res.json(updated);
});

// POST /api/products { label, sub? } -> add a new product with no phases yet
router.post('/', (req, res) => {
  const { label, sub } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label is required' });
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `product-${Date.now()}`;

  const product = { key, label, sub: sub || null, phases: [] };
  store.update((s) => { s.products.push(product); });
  res.status(201).json(product);
});

// POST /api/products/:key/phases { goal, deadline? } -> append a phase
router.post('/:key/phases', (req, res) => {
  const { key } = req.params;
  const { goal, deadline } = req.body || {};
  if (!goal) return res.status(400).json({ error: 'goal is required' });

  let created = null;
  store.update((s) => {
    const product = s.products.find((p) => p.key === key);
    if (!product) return;
    const n = product.phases.length ? Math.max(...product.phases.map((p) => p.n)) + 1 : 1;
    created = { n, goal, deadline: deadline || '', done: false };
    product.phases.push(created);
  });

  if (!created) return res.status(404).json({ error: 'product not found' });
  res.status(201).json(created);
});

module.exports = router;
