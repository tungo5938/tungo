#!/usr/bin/env node
// One-time setup: wires hooks/on-rate-limit.sh into your global Claude Code
// settings so a rate-limit hit counts as a "coding session" in Hermes Deck.
// Run with: npm run setup-hook

const fs = require('fs');
const os = require('os');
const path = require('path');

const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
const hookScript = path.resolve(__dirname, '..', 'hooks', 'on-rate-limit.sh');

if (!fs.existsSync(hookScript)) {
  console.error(`Can't find ${hookScript} — run this from inside the hermes-deck folder.`);
  process.exit(1);
}

let settings = {};
if (fs.existsSync(settingsPath)) {
  const raw = fs.readFileSync(settingsPath, 'utf8');
  try {
    settings = raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.error(`Couldn't parse ${settingsPath} as JSON — it looks broken already.`);
    console.error('Not touching it. Fix or back it up first, then re-run this script.');
    process.exit(1);
  }
  fs.writeFileSync(settingsPath + '.bak', raw);
  console.log(`Backed up your existing settings to ${settingsPath}.bak`);
} else {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
}

settings.hooks = settings.hooks || {};
settings.hooks.StopFailure = settings.hooks.StopFailure || [];

let entry = settings.hooks.StopFailure.find((e) => e.matcher === 'rate_limit');
if (!entry) {
  entry = { matcher: 'rate_limit', hooks: [] };
  settings.hooks.StopFailure.push(entry);
}
entry.hooks = entry.hooks || [];

const alreadyWired = entry.hooks.some((h) => h.type === 'command' && h.command === hookScript);
if (alreadyWired) {
  console.log('Already wired up — nothing to do.');
  process.exit(0);
}

entry.hooks.push({ type: 'command', command: hookScript });
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

console.log(`Done. Every time Claude Code hits your usage limit, it'll now`);
console.log(`ping Hermes Deck (as long as "npm start" is running) and count`);
console.log('it as a coding session.');
