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

function walk(dir, out = [], isRoot = true) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (isRoot) throw err; // let loadVault turn this into a permission-denied response
    return out; // a locked-down subfolder just gets skipped, not fatal
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip .obsidian, .trash, etc.
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out, false);
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
  if (!vaultPath) {
    return { available: false, path: null, nodes: [], docs: {}, edges: [] };
  }

  let files;
  try {
    if (!fs.existsSync(vaultPath)) {
      return { available: false, path: vaultPath, nodes: [], docs: {}, edges: [] };
    }
    files = walk(vaultPath);
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      return {
        available: false, path: vaultPath, nodes: [], docs: {}, edges: [],
        error: 'permission-denied',
        message: `macOS is blocking access to "${vaultPath}". Open System Settings -> Privacy & Security -> Files and Folders (or Full Disk Access), grant Terminal access, then restart the server (Ctrl+C, then "npm start" again).`
      };
    }
    return { available: false, path: vaultPath, nodes: [], docs: {}, edges: [], error: 'read-error', message: err.message };
  }
  const byTitle = new Map();
  const docs = {};

  const parsed = files.map((file) => {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      return null; // one unreadable note shouldn't take down the whole graph
    }
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
  }).filter(Boolean);

  parsed.forEach((entry) => {
    docs[entry.id] = {
      title: entry.title,
      tags: entry.tags,
      created: entry.created,
      category: entry.category,
      body: renderBody(entry.body, (title) => byTitle.get(title) || null),
      links: entry.links.map((l) => ({ title: l, id: byTitle.get(l) || null }))
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

  const degree = new Map();
  edges.forEach((e) => {
    degree.set(e.from, (degree.get(e.from) || 0) + 1);
    degree.set(e.to, (degree.get(e.to) || 0) + 1);
  });

  const positions = forceLayout(parsed.map((e) => e.id), edges);

  const nodes = parsed.map((entry) => {
    const colorSlot = CATEGORY_COLORS[hashStr(entry.category) % CATEGORY_COLORS.length];
    const pos = positions.get(entry.id);
    return {
      id: entry.id,
      title: entry.title,
      category: entry.category,
      color: colorSlot,
      degree: degree.get(entry.id) || 0,
      x: Math.round(pos.x),
      y: Math.round(pos.y)
    };
  });

  return { available: true, path: vaultPath, nodes, docs, edges };
}

// A small Fruchterman-Reingold force simulation, the same family of physics
// sim Obsidian's own graph view uses: uniform repulsion between every pair
// of nodes + spring attraction along links + a light pull toward the
// center. No explicit "hub goes in the middle" rule is needed — a
// well-connected note gets pulled inward from many directions at once and
// settles near the center on its own, while leaves with one connection
// swing out to wherever their single spring lets them rest.
function forceLayout(ids, edges) {
  const W = 400, H = 420, PAD = 26;
  const cx = W / 2, cy = H / 2;
  const n = ids.length;
  const positions = new Map();
  if (n === 0) return positions;

  // Deterministic pseudo-random start (seeded by id) so the layout doesn't
  // jump around across page reloads for an unchanged vault.
  ids.forEach((id) => {
    const h = hashStr(id);
    const angle = (h % 360) * (Math.PI / 180);
    const radius = 40 + (h % 130);
    positions.set(id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  });
  if (n === 1) return positions;

  const area = (W - 2 * PAD) * (H - 2 * PAD);
  const k = Math.sqrt(area / n); // ideal distance between nodes
  let temp = W / 8;
  const iterations = 250;

  for (let iter = 0; iter < iterations; iter++) {
    const disp = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));

    for (let i = 0; i < n; i++) {
      const a = ids[i], pa = positions.get(a);
      for (let j = i + 1; j < n; j++) {
        const b = ids[j], pb = positions.get(b);
        let dx = pa.x - pb.x, dy = pa.y - pb.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const force = (k * k) / dist;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        disp.get(a).x += fx; disp.get(a).y += fy;
        disp.get(b).x -= fx; disp.get(b).y -= fy;
      }
    }

    edges.forEach((e) => {
      const pa = positions.get(e.from), pb = positions.get(e.to);
      if (!pa || !pb) return;
      let dx = pa.x - pb.x, dy = pa.y - pb.y;
      let dist = Math.hypot(dx, dy) || 0.01;
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      disp.get(e.from).x -= fx; disp.get(e.from).y -= fy;
      disp.get(e.to).x += fx; disp.get(e.to).y += fy;
    });

    ids.forEach((id) => {
      const p = positions.get(id), d = disp.get(id);
      // mild pull toward center so the whole graph doesn't drift off-canvas
      d.x += (cx - p.x) * 0.01;
      d.y += (cy - p.y) * 0.01;
      const dlen = Math.hypot(d.x, d.y) || 0.01;
      const capped = Math.min(dlen, temp);
      p.x += (d.x / dlen) * capped;
      p.y += (d.y / dlen) * capped;
      p.x = Math.min(W - PAD, Math.max(PAD, p.x));
      p.y = Math.min(H - PAD, Math.max(PAD, p.y));
    });

    temp *= 0.96; // cool down so it settles instead of oscillating
  }

  return positions;
}

module.exports = { loadVault };
