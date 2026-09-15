const express = require('express');
const { loadVault } = require('../lib/vault');

const router = express.Router();

// GET /api/ideas -> { available, path, nodes, docs, edges }
// Re-reads the vault from disk on every request — it's a handful of files
// on your own Mac, no need to cache it.
router.get('/', (req, res) => {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  res.json(loadVault(vaultPath));
});

module.exports = router;
