const express = require('express');
const fs = require('fs');
const store = require('../lib/store');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(store.load().settings);
});

// PUT /api/settings { obsidianVaultPath }
router.put('/', (req, res) => {
  const { obsidianVaultPath } = req.body || {};
  if (typeof obsidianVaultPath !== 'string' || !obsidianVaultPath.trim()) {
    return res.status(400).json({ error: 'obsidianVaultPath is required' });
  }
  const trimmed = obsidianVaultPath.trim();
  if (!fs.existsSync(trimmed)) {
    return res.status(400).json({ error: `That folder doesn't exist on this machine: ${trimmed}` });
  }
  const data = store.update((s) => { s.settings.obsidianVaultPath = trimmed; });
  res.json(data.settings);
});

module.exports = router;
