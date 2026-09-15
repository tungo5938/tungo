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
  try {
    fs.accessSync(trimmed, fs.constants.R_OK);
    if (!fs.statSync(trimmed).isDirectory()) {
      return res.status(400).json({ error: `That's not a folder: ${trimmed}` });
    }
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      return res.status(400).json({
        error: `macOS is blocking access to "${trimmed}". Open System Settings -> Privacy & Security -> Files and Folders (or Full Disk Access), grant Terminal access, then restart the server and try again.`
      });
    }
    return res.status(400).json({ error: `That folder doesn't exist on this machine: ${trimmed}` });
  }
  const data = store.update((s) => { s.settings.obsidianVaultPath = trimmed; });
  res.json(data.settings);
});

module.exports = router;
