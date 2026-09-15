(function () {
  'use strict';

  /* ---------- date helpers (mirror lib/dates.js, client-side) ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function monthKey(year, month0) { return `${year}-${pad(month0 + 1)}`; }
  function daysInMonth(year, month0) { return new Date(year, month0 + 1, 0).getDate(); }
  function weekdayMon0(year, month0, day) { return (new Date(year, month0, day).getDay() + 6) % 7; }
  function monthLabel(year, month0) {
    return new Date(year, month0, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }
  function fmtShort(year, month0, day) {
    return new Date(year, month0, day).toLocaleString('en-US', { month: 'short', day: '2-digit' });
  }
  const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  function weekGroupsFor(year, month0) {
    const days = daysInMonth(year, month0);
    const groups = [];
    let count = 0, wn = 1;
    for (let d = 1; d <= days; d++) {
      count++;
      if (weekdayMon0(year, month0, d) === 6 || d === days) { groups.push({ n: wn, count, endDay: d }); wn++; count = 0; }
    }
    return groups;
  }

  // Week number ("W#") + short date for a full ISO date string, computed
  // against that date's own month grouping (matches the habits table's rule).
  function weekLabelFor(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const groups = weekGroupsFor(y, m - 1);
    const group = groups.find((g) => d <= g.endDay);
    const wn = group ? group.n : groups.length;
    return `W${wn} - ${fmtShort(y, m - 1, d)}`;
  }

  async function api(path, opts) {
    const res = await fetch('/api' + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.status === 204 ? null : res.json();
  }

  /* ================= HABITS + MONTH TABLE ================= */
  const todayReal = new Date();
  let viewYear = todayReal.getFullYear();
  let viewMonth0 = todayReal.getMonth();
  const MIN_OFFSET = -2, MAX_OFFSET = 3;
  const baseYear = todayReal.getFullYear(), baseMonth0 = todayReal.getMonth();

  function currentOffset() {
    return (viewYear - baseYear) * 12 + (viewMonth0 - baseMonth0);
  }
  function shiftMonth(delta) {
    const next = currentOffset() + delta;
    if (next < MIN_OFFSET || next > MAX_OFFSET) return;
    const d = new Date(baseYear, baseMonth0 + next, 1);
    viewYear = d.getFullYear(); viewMonth0 = d.getMonth();
    renderTable();
  }
  document.getElementById('month-prev').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('month-next').addEventListener('click', () => shiftMonth(1));

  async function toggleHealth(dateStr) {
    await api('/health/toggle', { method: 'POST', body: JSON.stringify({ date: dateStr }) });
    renderTable();
  }

  let bonusModalWeekEnd = null;
  function openBonusModal(weekEndDate, existing) {
    bonusModalWeekEnd = weekEndDate;
    document.getElementById('bonus-name-input').value = (existing && existing.name) || 'Reward';
    document.getElementById('bonus-achieved-input').checked = !!(existing && existing.achieved);
    document.getElementById('bonus-modal').hidden = false;
  }
  document.getElementById('bonus-cancel').addEventListener('click', () => { document.getElementById('bonus-modal').hidden = true; });
  document.getElementById('bonus-save').addEventListener('click', async () => {
    const name = document.getElementById('bonus-name-input').value || 'Reward';
    const achieved = document.getElementById('bonus-achieved-input').checked;
    await api('/bonus/' + bonusModalWeekEnd, { method: 'PUT', body: JSON.stringify({ name, achieved }) });
    document.getElementById('bonus-modal').hidden = true;
    renderTable();
  });

  let goalModalKey = null, goalModalPhases = [];
  function openGoalWeek(key, label, phases) {
    goalModalKey = key; goalModalPhases = phases;
    document.getElementById('goal-modal-title').textContent = label;
    const list = document.getElementById('goal-modal-list');
    if (!phases.length) {
      list.innerHTML = '<div class="goal-modal-empty">No goals scheduled this week.</div>';
    } else {
      list.innerHTML = phases.map((ph, i) =>
        `<label class="goal-modal-row"><input type="checkbox" data-i="${i}" ${ph.done ? 'checked' : ''}> ${escapeHtml(ph.goal)}<span class="g-date">${weekLabelFor(ph.deadline)}</span></label>`
      ).join('');
    }
    document.getElementById('goal-modal').hidden = false;
  }
  document.getElementById('goal-cancel').addEventListener('click', () => { document.getElementById('goal-modal').hidden = true; });
  document.getElementById('goal-save').addEventListener('click', async () => {
    const checks = document.querySelectorAll('#goal-modal-list input[type=checkbox]');
    await Promise.all([...checks].map((cb) => {
      const ph = goalModalPhases[Number(cb.dataset.i)];
      return api(`/products/${goalModalKey}/phases/${ph.n}`, { method: 'PATCH', body: JSON.stringify({ done: cb.checked }) });
    }));
    document.getElementById('goal-modal').hidden = true;
    renderTable();
    renderRoadmap();
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  async function renderTable() {
    const year = viewYear, month0 = viewMonth0;
    const days = daysInMonth(year, month0);
    const isCurrentMonth = year === todayReal.getFullYear() && month0 === todayReal.getMonth();
    const today = isCurrentMonth ? todayReal.getDate() : -1;

    document.getElementById('month-label').textContent = monthLabel(year, month0);
    document.getElementById('month-prev').disabled = currentOffset() <= MIN_OFFSET;
    document.getElementById('month-next').disabled = currentOffset() >= MAX_OFFSET;

    const mk = monthKey(year, month0);
    const [healthResp, codingResp, bonusResp, products, codingStreakResp, healthStreakResp] = await Promise.all([
      api(`/health?month=${mk}`),
      api(`/coding-sessions?month=${mk}`),
      api(`/bonus?month=${mk}`),
      api('/products'),
      api('/coding-sessions/streak'),
      api('/health/streak')
    ]);
    const health = healthResp.days, coding = codingResp.days, bonuses = bonusResp;

    document.getElementById('stat-coding-streak').textContent = codingStreakResp.streak;
    document.getElementById('stat-health-streak').textContent = healthStreakResp.streak;

    const isMon = (d) => weekdayMon0(year, month0, d) === 0;
    const isSun = (d) => weekdayMon0(year, month0, d) === 6;
    const groups = weekGroupsFor(year, month0);

    function cellsAcrossDays(builder) {
      let out = '';
      for (let d = 1; d <= days; d++) {
        out += `<td class="cell${isMon(d) ? ' mon-col' : ''}${d === today ? ' today-col' : ''}${isSun(d) ? ' week-end' : ''}">${builder(d)}</td>`;
      }
      return out;
    }

    const weekRow = '<tr><th class="rowlabel" rowspan="2"></th>' +
      groups.map((g) => `<th class="week-label week-end" colspan="${g.count}">W${g.n}</th>`).join('') + '</tr>';
    let dayRow = '<tr>';
    for (let d = 1; d <= days; d++) {
      dayRow += `<th class="${d === today ? 'today-col' : ''}${isSun(d) ? ' week-end' : ''}">${d}<span class="dow">${DOW[weekdayMon0(year, month0, d)]}</span></th>`;
    }
    dayRow += '</tr>';
    const thead = `<thead>${weekRow}${dayRow}</thead>`;

    const healthRow = '<tr><th class="rowlabel">Health</th>' + cellsAcrossDays((d) => {
      if (isMon(d)) return '<div class="in rest">–</div>';
      if (d > today && today > 0) return '<div class="in future">·</div>';
      const dateStr = `${year}-${pad(month0 + 1)}-${pad(d)}`;
      const s = health[dateStr] || (d === today ? 'pending' : 'miss');
      if (s === 'pending') return `<div class="in pending editable" title="click to check in" data-date="${dateStr}">?</div>`;
      return `<div class="in ${s === 'done' ? 'done' : 'miss'} editable" title="click to edit" data-date="${dateStr}">${s === 'done' ? '✓' : '✗'}</div>`;
    }) + '</tr>';

    const codingRow = '<tr><th class="rowlabel">Coding sessions</th>' + cellsAcrossDays((d) => {
      if (d > today && today > 0) return '<div class="in future">·</div>';
      const dateStr = `${year}-${pad(month0 + 1)}-${pad(d)}`;
      const n = Math.min(3, coding[dateStr] || 0);
      let dots = '';
      for (let i = 0; i < 3; i++) dots += `<i class="${i < n ? 'on' : ''}"></i>`;
      return `<div class="dots" title="${coding[dateStr] || 0} session(s)">${dots}</div>`;
    }) + '</tr>';

    let productRows = '';
    if (isCurrentMonth) {
      productRows = products.map((p) => {
        const cells = groups.map((g) => {
          const weekStart = `${year}-${pad(month0 + 1)}-${pad(g.endDay - g.count + 1)}`;
          const weekEnd = `${year}-${pad(month0 + 1)}-${pad(g.endDay)}`;
          const inWeek = p.phases.filter((ph) => ph.deadline && ph.deadline >= weekStart && ph.deadline <= weekEnd);
          if (!inWeek.length) return `<td class="cell week-end" colspan="${g.count}"><div class="prod-cell none">–</div></td>`;
          const doneCount = inWeek.filter((ph) => ph.done).length;
          return `<td class="cell week-end" colspan="${g.count}"><div class="prod-cell has-goals" title="click to view/edit" data-key="${p.key}" data-label="${escapeHtml(p.label)} — week of ${weekLabelFor(weekStart)}"><span class="pc-count">${doneCount}/${inWeek.length}</span></div></td>`;
        }).join('');
        return `<tr><th class="rowlabel">${escapeHtml(p.label)}</th>${cells}</tr>`;
      }).join('');
    }

    const bonusRow = '<tr class="bonus-row"><th class="rowlabel">Weekly bonus</th>' + groups.map((g) => {
      // Only a group that actually ends on a Sunday within this month has a
      // real week-ending date to key a bonus on (a trailing partial week
      // that hasn't reached its Sunday yet doesn't).
      if (weekdayMon0(year, month0, g.endDay) !== 6) {
        return `<td class="cell week-end" colspan="${g.count}"><div class="bonus-cell disabled">—</div></td>`;
      }
      const dateStr = `${year}-${pad(month0 + 1)}-${pad(g.endDay)}`;
      const b = bonuses[dateStr];
      const cls = !b ? 'none' : (b.achieved ? 'done' : 'miss');
      const icon = !b ? '·' : (b.achieved ? '🎁' : '✗');
      const label = b ? escapeHtml(b.name) : 'no reward set yet';
      return `<td class="cell week-end" colspan="${g.count}"><div class="bonus-cell ${cls}" title="click to view/edit" data-week-end="${dateStr}"><span>${icon}</span><span class="bc-text">${label}</span></div></td>`;
    }).join('') + '</tr>';

    const table = document.getElementById('month-table');
    table.innerHTML = thead + '<tbody>' + healthRow + codingRow + productRows + bonusRow + '</tbody>';

    table.querySelectorAll('.in[data-date]').forEach((el) => {
      el.addEventListener('click', () => toggleHealth(el.dataset.date));
    });
    table.querySelectorAll('.bonus-cell[data-week-end]').forEach((el) => {
      el.addEventListener('click', () => openBonusModal(el.dataset.weekEnd, bonuses[el.dataset.weekEnd]));
    });
    table.querySelectorAll('.prod-cell[data-key]').forEach((el) => {
      el.addEventListener('click', () => {
        const p = products.find((pp) => pp.key === el.dataset.key);
        openGoalWeek(el.dataset.key, el.dataset.label, phasesForCell(p, el.dataset.label));
      });
    });

    // Re-derive a cell's week window from the label stashed on it at render time.
    function phasesForCell(p, label) {
      const weekStartLabel = label.split('week of ')[1];
      for (const g of groups) {
        const weekStart = `${year}-${pad(month0 + 1)}-${pad(g.endDay - g.count + 1)}`;
        if (weekLabelFor(weekStart) === weekStartLabel) {
          const weekEnd = `${year}-${pad(month0 + 1)}-${pad(g.endDay)}`;
          return p.phases.filter((ph) => ph.deadline && ph.deadline >= weekStart && ph.deadline <= weekEnd);
        }
      }
      return [];
    }
  }

  /* ================= PRODUCT GOALS ROADMAP ================= */
  async function renderRoadmap() {
    const products = await api('/products');
    const body = document.getElementById('roadmap-body');
    let html = '';
    products.forEach((p) => {
      p.phases.forEach((ph, i) => {
        html += '<tr>';
        if (i === 0) {
          html += `<td class="rm-product" rowspan="${Math.max(1, p.phases.length)}">${escapeHtml(p.label)}${p.sub ? `<br><span class="rm-sub">${escapeHtml(p.sub)}</span>` : ''}</td>`;
        }
        html += `<td class="mono">${ph.n}</td>`;
        html += `<td class="rm-goal" contenteditable="true" data-key="${p.key}" data-n="${ph.n}" data-field="goal">${escapeHtml(ph.goal)}</td>`;
        html += `<td>` +
          `<input type="date" class="modal-input mono" style="padding:4px 6px" value="${ph.deadline || ''}" data-key="${p.key}" data-n="${ph.n}" data-field="deadline">` +
          `<div class="rm-deadline-label mono">${ph.deadline ? weekLabelFor(ph.deadline) : 'no date set'}</div>` +
          `</td>`;
        html += `<td><label class="rm-status ${ph.done ? 'done' : 'todo'}"><input type="checkbox" ${ph.done ? 'checked' : ''} data-key="${p.key}" data-n="${ph.n}" data-field="done"> ${ph.done ? 'Done' : 'To do'}</label></td>`;
        html += '</tr>';
      });
      html += `<tr><td colspan="5" class="rm-add-row"><button class="rm-add-btn" data-add-phase="${p.key}">+ add phase</button></td></tr>`;
    });
    body.innerHTML = html || '<tr><td colspan="5" class="doc-empty">No products yet.</td></tr>';

    body.querySelectorAll('[contenteditable][data-field="goal"]').forEach((el) => {
      el.addEventListener('blur', async () => {
        await api(`/products/${el.dataset.key}/phases/${el.dataset.n}`, { method: 'PATCH', body: JSON.stringify({ goal: el.textContent }) });
      });
    });
    body.querySelectorAll('input[data-field="deadline"]').forEach((el) => {
      el.addEventListener('change', async () => {
        await api(`/products/${el.dataset.key}/phases/${el.dataset.n}`, { method: 'PATCH', body: JSON.stringify({ deadline: el.value }) });
        renderRoadmap();
        renderTable();
      });
    });
    body.querySelectorAll('input[data-field="done"]').forEach((el) => {
      el.addEventListener('change', async () => {
        await api(`/products/${el.dataset.key}/phases/${el.dataset.n}`, { method: 'PATCH', body: JSON.stringify({ done: el.checked }) });
        renderRoadmap();
        renderTable();
      });
    });
    body.querySelectorAll('[data-add-phase]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const goal = prompt('New phase goal:');
        if (!goal) return;
        await api(`/products/${btn.dataset.addPhase}/phases`, { method: 'POST', body: JSON.stringify({ goal }) });
        renderRoadmap();
        renderTable();
      });
    });
  }
  document.getElementById('add-product-btn').addEventListener('click', async () => {
    const label = prompt('New product name:');
    if (!label) return;
    await api('/products', { method: 'POST', body: JSON.stringify({ label }) });
    renderRoadmap();
    renderTable();
  });

  /* ================= IDEAS BACKLOG (read-only Obsidian vault) ================= */
  const CATEGORY_LABELS = { 'cat-1': 'var(--cat-1)', 'cat-2': 'var(--cat-2)', 'cat-3': 'var(--cat-3)', 'cat-4': 'var(--cat-4)' };

  function renderVaultPrompt(data) {
    data = data || {};
    const banner = document.getElementById('vault-banner');

    if (data.error === 'hosted') {
      banner.innerHTML = `<div class="banner">${escapeHtml(data.message)}</div>`;
      return;
    }

    let notice;
    if (data.error === 'permission-denied') {
      notice = `<b>macOS is blocking access to that folder.</b> ${escapeHtml(data.message)}`;
    } else if (data.error === 'read-error') {
      notice = `Couldn't read <code>${escapeHtml(data.path)}</code>: ${escapeHtml(data.message)}`;
    } else if (data.path) {
      notice = `No vault set up yet — couldn't find <code>${escapeHtml(data.path)}</code>. In Obsidian: click your vault name (top-left) → the path is shown there, or right-click it → "Reveal in Finder" and copy that folder's path.`;
    } else {
      notice = `No vault set up yet. In Obsidian: click your vault name (top-left) → the path is shown there, or right-click it → "Reveal in Finder" and copy that folder's path.`;
    }
    banner.innerHTML =
      `<div class="banner">` +
      `<div style="margin-bottom:8px">${notice}</div>` +
      `<div style="display:flex; gap:8px; flex-wrap:wrap">` +
      `<input type="text" id="vault-path-input" class="modal-input" style="flex:1; min-width:240px" placeholder="/Users/you/Documents/Obsidian/MyVault" value="${data.path ? escapeHtml(data.path) : ''}">` +
      `<button class="modal-btn" id="vault-path-save">Save</button>` +
      `</div><div id="vault-path-error" style="color:var(--critical); font-size:12px; margin-top:6px"></div>` +
      `</div>`;
    document.getElementById('vault-path-save').addEventListener('click', async () => {
      const input = document.getElementById('vault-path-input');
      const errEl = document.getElementById('vault-path-error');
      try {
        await api('/settings', { method: 'PUT', body: JSON.stringify({ obsidianVaultPath: input.value }) });
        renderIdeas();
      } catch (e) {
        errEl.textContent = e.message;
      }
    });
  }

  async function renderIdeas() {
    const data = await api('/ideas');
    const banner = document.getElementById('vault-banner');
    if (!data.available) {
      renderVaultPrompt(data);
    } else {
      banner.innerHTML =
        `<div class="banner" style="display:flex; align-items:center; gap:12px; flex-wrap:wrap">` +
        `<span>${data.nodes.length} notes · read from <code>${escapeHtml(data.path)}</code> — edit in Obsidian, this view just reads it.</span>` +
        `<button class="rm-add-btn" id="vault-change-btn" style="margin-left:auto">change folder</button>` +
        `</div>`;
      document.getElementById('vault-change-btn').addEventListener('click', () => renderVaultPrompt());
    }

    const svg = document.getElementById('graph-svg');
    svg.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    const byId = {};
    data.nodes.forEach((n) => { byId[n.id] = n; });

    data.edges.forEach((e) => {
      const a = byId[e.from], b = byId[e.to];
      if (!a || !b) return;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.setAttribute('stroke', 'var(--border-strong)'); line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    });

    const circles = {};
    data.nodes.forEach((n) => {
      const c = document.createElementNS(ns, 'circle');
      const r = Math.min(13, 5.5 + (n.degree || 0) * 1.4);
      c.setAttribute('cx', n.x); c.setAttribute('cy', n.y); c.setAttribute('r', r);
      c.setAttribute('fill', CATEGORY_LABELS[n.color] || 'var(--cat-1)');
      c.style.cursor = 'pointer';
      c.addEventListener('click', () => openDoc(n.id));
      c.addEventListener('mouseenter', () => { c.setAttribute('stroke', 'var(--ink)'); c.setAttribute('stroke-width', '2'); });
      c.addEventListener('mouseleave', () => { if (!c.classList.contains('sel')) c.removeAttribute('stroke'); });
      const title = document.createElementNS(ns, 'title');
      title.textContent = n.title;
      c.appendChild(title);
      svg.appendChild(c);
      circles[n.id] = c;
    });

    const categories = [...new Set(data.nodes.map((n) => n.category))];
    document.getElementById('legend-row').innerHTML = categories.map((cat) => {
      const color = data.nodes.find((n) => n.category === cat).color;
      return `<span><i class="dot" style="background:${CATEGORY_LABELS[color]}"></i>${escapeHtml(cat)}</span>`;
    }).join('') + `<span style="margin-left:auto;color:var(--ink-muted)">${data.nodes.length} ideas</span>`;

    function openDoc(id) {
      Object.values(circles).forEach((c) => { c.classList.remove('sel'); c.removeAttribute('stroke'); });
      if (circles[id]) { circles[id].classList.add('sel'); circles[id].setAttribute('stroke', 'var(--ink)'); circles[id].setAttribute('stroke-width', '2.5'); }
      const d = data.docs[id];
      if (!d) return;
      const tags = (d.tags || []).map((t) => `<span class="doc-tag">#${escapeHtml(t)}</span>`).join(' ');
      const links = (d.links || []).map((l) =>
        l.id ? `<a data-target="${l.id}">${escapeHtml(l.title)}</a>` : `<span style="color:var(--ink-muted)">${escapeHtml(l.title)} (not found)</span>`
      ).join(' · ') || '<span style="color:var(--ink-muted)">none</span>';
      const pane = document.getElementById('doc-pane');
      pane.innerHTML =
        `<div class="doc-title">${escapeHtml(d.title)}</div>` +
        `<div class="doc-props"><span><b>created</b> ${escapeHtml(d.created)}</span><span>${tags}</span></div>` +
        `<div class="doc-body">${d.body}</div>` +
        `<div class="doc-links"><b>Linked mentions (${(d.links || []).length}):</b><br>${links}</div>`;
      pane.querySelectorAll('a[data-target]').forEach((a) => {
        a.addEventListener('click', () => openDoc(a.dataset.target));
      });
    }

    if (data.nodes.length) openDoc(data.nodes[0].id);
  }

  /* ================= EXPENSE STAT ================= */
  async function renderExpenseStat() {
    const s = await api('/expenses/summary');
    const fmt = (n) => (n >= 0 ? '+' : '−') + '$' + Math.abs(n).toFixed(2);
    document.getElementById('stat-expense-today').textContent = fmt(s.today);
    const rows = s.todayBreakdown.map((e) =>
      `<div class="tt-row"><span>${escapeHtml(e.label)}</span><span class="mono ${e.amount >= 0 ? 'amt-in' : 'amt-out'}">${fmt(e.amount)}</span></div>`
    ).join('');
    document.getElementById('expense-tooltip').innerHTML = rows +
      `<div class="tt-row" style="border-top:1px solid var(--border); margin-top:4px; padding-top:6px;"><span>Week to date</span><span class="mono amt-in">${fmt(s.weekToDate)}</span></div>` +
      `<div class="tt-row"><span>Month to date</span><span class="mono amt-in">${fmt(s.monthToDate)}</span></div>` +
      `<div class="tt-row" style="font-weight:700;"><span>Lifetime</span><span class="mono amt-in">${fmt(s.lifetime)}</span></div>`;
  }
  const expenseStat = document.getElementById('today-expense-stat');
  expenseStat.addEventListener('click', () => expenseStat.classList.toggle('show'));
  document.addEventListener('click', (e) => { if (!expenseStat.contains(e.target)) expenseStat.classList.remove('show'); });

  /* ================= INIT ================= */
  function safe(name, fn) {
    Promise.resolve().then(fn).catch((e) => {
      console.error(name + ' failed:', e);
      const el = document.querySelector('#' + name) || document.body;
      const note = document.createElement('div');
      note.className = 'banner';
      note.style.color = 'var(--critical)';
      note.textContent = `${name} didn't load: ${e.message}`;
      el.prepend(note);
    });
  }
  safe('habits', renderTable);
  safe('products', renderRoadmap);
  safe('ideas', renderIdeas);
  safe('habits', renderExpenseStat);
})();
