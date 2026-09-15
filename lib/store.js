// A tiny JSON-file "database". Fine for a single-user local app —
// no server process, no native deps, just read-modify-write with a lock
// to avoid concurrent writes from stepping on each other.

const fs = require('fs');
const path = require('path');

// DATA_DIR lets a deployed instance point this at a mounted persistent
// volume (e.g. Railway) instead of the container's own ephemeral disk,
// which gets wiped on every redeploy. Defaults to the repo's own data/
// folder for local use.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

function defaultStore() {
  const today = new Date();
  return {
    meta: {
      createdAt: today.toISOString().slice(0, 10)
    },
    settings: {
      obsidianVaultPath: null // set from the Ideas backlog card in the app, or OBSIDIAN_VAULT_PATH in .env
    },
    health: {},        // { 'YYYY-MM-DD': 'done' | 'miss' }
    codingSessions: {}, // { 'YYYY-MM-DD': count }
    expenses: [],       // [{ date, label, amount }]
    bonuses: {},         // { 'YYYY-MM-DD' (week-ending Sunday): { name, achieved } }
    products: [
      {
        key: 'product-1',
        label: 'New product',
        sub: null,
        phases: [
          { n: 1, goal: 'Define the first milestone', deadline: '', done: false },
          { n: 2, goal: 'Ship an MVP', deadline: '', done: false }
        ]
      }
    ]
  };
}

let cache = null;

// Fills in any top-level (and settings-level) keys missing from a store
// loaded off disk — e.g. an older store.json from before `settings` existed.
function withDefaults(data) {
  const defaults = defaultStore();
  let changed = false;
  for (const key of Object.keys(defaults)) {
    if (!(key in data)) { data[key] = defaults[key]; changed = true; }
  }
  for (const key of Object.keys(defaults.settings)) {
    if (!data.settings || !(key in data.settings)) {
      data.settings = data.settings || {};
      data.settings[key] = defaults.settings[key];
      changed = true;
    }
  }
  return changed;
}

function load() {
  if (cache) return cache;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    cache = defaultStore();
    save(cache);
    return cache;
  }
  cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  if (withDefaults(cache)) save(cache);
  return cache;
}

function save(data) {
  cache = data;
  const tmp = STORE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

// Read-modify-write helper: fn receives the live store object, mutates it in place.
function update(fn) {
  const data = load();
  fn(data);
  save(data);
  return data;
}

module.exports = { load, save, update };
