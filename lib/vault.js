// Reads a local Obsidian vault from disk (read-only) and turns it into
// graph nodes + rendered docs. No writing back — Obsidian itself, or Claude
// running locally on the vault folder, remains the place notes are authored.

const fs = require('fs');
const path = require('path');

const CATEGORY_COLORS = ['cat-1', 'cat-2', 'cat-3', 'cat-4'];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue; // skip .obsidian, .trash, etc.
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.toLowerCase().endsWith('.md')) out.push(full);
  }
  return out;
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { frontmatter: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, body: raw };
  const block = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\n/, '');
  const frontmatter = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      value = value.replace(/^["']|["']$/g, '');
    }
    frontmatter[key] = value;
  }
  return { frontmatter, body };
}

function extractLinks(body) {
  const links = new Set();
  const re = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(body))) links.add(m[1].trim());
  return [...links];
}

function extractTitle(body, fallback) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

// Very small markdown -> HTML: paragraphs, **bold**, *italic*, and wikilinks
// turned into clickable spans the frontend wires up to jump between docs.
// `resolveId` maps a wikilink's display title to the note id it points at
// (or null if that note doesn't exist), since the frontend navigates by id.
function renderBody(body, resolveId) {
  const withoutTitle = body.replace(/^#\s+.+$/m, '').trim();
  const escaped = withoutTitle
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const withLinks = escaped.replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, (_m, target, label) => {
    const title = target.trim();
    const id = resolveId(title);
    const text = (label || title).trim();
    return id
      ? `<a class="wikilink" data-target="${id}">${text}</a>`
      : `<span class="wikilink-missing" title="note not found">${text}</span>`;
  });
  const withBold = withLinks.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>');
  return withBold.split(/\n\s*\n/).map((p) => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`).join('');
}

function loadVault(vaultPath) {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    return { available: false, path: vaultPath || null, nodes: [], docs: {}, edges: [] };
  }

  const files = walk(vaultPath);
  const byTitle = new Map();
  const docs = {};

  const parsed = files.map((file) => {
    const raw = fs.readFileSync(file, 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const fallbackTitle = path.basename(file, '.md');
    const title = extractTitle(body, fallbackTitle);
    const id = path.relative(vaultPath, file);
    const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : (frontmatter.tags ? [frontmatter.tags] : []);
    const category = tags[0] || 'personal';
    const created = frontmatter.created || fs.statSync(file).birthtime.toISOString().slice(0, 10);
    const links = extractLinks(body);
    const entry = { id, title, fallbackTitle, tags, category, created, links, body };
    byTitle.set(title, id);
    byTitle.set(fallbackTitle, id);
    return entry;
  });

  const cols = Math.max(1, Math.ceil(Math.sqrt(parsed.length)));
  const nodes = parsed.map((entry, i) => {
    const h = hashStr(entry.id);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jitterX = (h % 21) - 10;
    const jitterY = ((h >> 8) % 21) - 10;
    const colorSlot = CATEGORY_COLORS[hashStr(entry.category) % CATEGORY_COLORS.length];
    docs[entry.id] = {
      title: entry.title,
      tags: entry.tags,
      created: entry.created,
      category: entry.category,
      body: renderBody(entry.body, (title) => byTitle.get(title) || null),
      links: entry.links.map((l) => ({ title: l, id: byTitle.get(l) || null }))
    };
    return {
      id: entry.id,
      title: entry.title,
      category: entry.category,
      color: colorSlot,
      x: Math.round((col + 0.5) * (400 / cols) + jitterX),
      y: Math.round((row + 0.5) * (420 / Math.max(1, Math.ceil(parsed.length / cols))) + jitterY)
    };
  });

  const edges = [];
  const seen = new Set();
  for (const entry of parsed) {
    for (const link of entry.links) {
      const targetId = byTitle.get(link);
      if (!targetId || targetId === entry.id) continue;
      const key = [entry.id, targetId].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: entry.id, to: targetId });
    }
  }

  return { available: true, path: vaultPath, nodes, docs, edges };
}

module.exports = { loadVault };
