const express = require('express');
const store = require('../lib/store');
const { loadVault } = require('../lib/vault');

const router = express.Router();

// GET /api/ideas -> { available, path, nodes, docs, edges }
// Re-reads the vault from disk on every request — it's a handful of files
// on your own Mac, no need to cache it.
router.get('/', (req, res) => {
  const vaultPath = store.load().settings.obsidianVaultPath || process.env.OBSIDIAN_VAULT_PATH;
  const result = loadVault(vaultPath);
  // Running on a host (Railway etc.) means there's no local Mac filesystem
  // to read a vault from at all — say so plainly instead of implying a
  // path would work if you just typed the right one.
  if (!result.available && process.env.RAILWAY_ENVIRONMENT) {
    result.error = 'hosted';
    result.message = "This is the hosted copy — it can't read a folder on your Mac. Ideas backlog only works when you run Hermes Deck locally (npm start on your own machine).";
  }
  res.json(result);
});

module.exports = router;
