const Logbook = (() => {
  const $ = (id) => document.getElementById(id);
  const LETTERS = 'ABCDEFGHIJKLMNO';
  const THEME_NAME = { classic: 'Klassisch', space: 'Weltraum' };
  const RESULT = { miss: 'Wasser', hit: 'Treffer', sunk: 'Versenkt!' };
  const boardEls = [$('log-board-0'), $('log-board-1')];
  let app, entries = [], entry = null, step = 0, timer = null, themeBefore = null;

  const when = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  const shortId = (id) => (id ? id.slice(0, 8) : '–');
  // Alias (falls nachträglich vergeben) statt des Namens aus dem Spiel
  const nameOf = (p) => p.alias || p.name;
  const winnerName = (e) => nameOf(e.players[e.winner]);

  function duration(e) {
    const s = Math.round((new Date(e.endedAt) - new Date(e.startedAt)) / 1000);
    return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
  }

  async function load() {
    const r = await fetch('/api/logbook');
    entries = r.ok ? await r.json() : [];
  }

  // ---- Liste ----
  function renderList() {
    const ul = $('log-list');
    ul.innerHTML = '';
    $('log-count').textContent = entries.length === 1 ? '1 Partie' : `${entries.length} Partien`;
    $('log-clear').disabled = !entries.length;
    if (!entries.length) {
      const li = document.createElement('li');
      li.className = 'muted log-empty'; li.textContent = 'Noch keine beendeten Partien.';
      return ul.append(li);
    }
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = 'log-item';
      const info = document.createElement('div');
      info.className = 'log-info';
      const line = (cls, text) => { const p = document.createElement('div'); p.className = cls; p.textContent = text; info.append(p); };
      line('log-date', `${when(e.endedAt)} · ${THEME_NAME[e.theme]} · ${e.label}`);
      const vs = document.createElement('div');
      vs.className = 'log-vs';
      e.players.forEach((p, i) => {
        if (i) vs.append(' vs. ');
        vs.append(nameOf(p));
        if (p.alias) { const o = document.createElement('span'); o.className = 'log-orig'; o.textContent = ` (${p.name})`; vs.append(o); }
      });
      info.append(vs);
      line('log-winner', `Gewinner: ${winnerName(e)}`);
      line('muted log-devices', `Geräte: ${e.players.map((p) => `${nameOf(p)} ${shortId(p.deviceId)}`).join(' · ')}`);
      if (e.comment) line('log-comment', e.comment);
      const btns = document.createElement('div');
      btns.className = 'log-actions';
      const view = document.createElement('button');
      view.type = 'button'; view.className = 'primary'; view.textContent = 'Ansehen';
      view.onclick = () => openGame(e.id);
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'btn-end'; del.textContent = 'Löschen';
      del.onclick = () => removeEntry(e);
      btns.append(view, del);
      li.append(info, btns);
      ul.append(li);
    }
  }

  async function removeEntry(e) {
    if (!confirm(`Partie ${nameOf(e.players[0])} vs. ${nameOf(e.players[1])} vom ${when(e.endedAt)} löschen?`)) return;
    const r = await fetch(`/api/logbook/${encodeURIComponent(e.id)}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) return app.toast('Löschen fehlgeschlagen');
    entries = entries.filter((x) => x.id !== e.id);
    renderList();
  }

  async function clearAll() {
    if (!confirm('Wirklich alle Partien aus dem Logbuch löschen?')) return;
    const r = await fetch('/api/logbook', { method: 'DELETE' });
    if (!r.ok) return app.toast('Löschen fehlgeschlagen');
    entries = [];
    renderList();
  }

  async function openList() {
    stop();
    if (themeBefore) { app.applyTheme(themeBefore); themeBefore = null; }
    history.replaceState(null, '', '/logbuch');
    app.show('logbook');
    try { await load(); } catch { app.toast('Logbuch konnte nicht geladen werden'); }
    renderList();
  }

  // ---- Einzelne Partie: Endstand + Zug-für-Zug-Wiedergabe ----
  async function openGame(id) {
    if (!entries.some((e) => e.id === id)) { try { await load(); } catch {} }
    entry = entries.find((e) => e.id === id);
    if (!entry) { app.toast('Partie nicht gefunden'); return openList(); }
    if (!themeBefore) themeBefore = app.theme();
    app.applyTheme(entry.theme);
    history.replaceState(null, '', `/logbuch?partie=${encodeURIComponent(id)}`);

    entry.players.forEach((p, i) => Board.build(boardEls[i], entry.size));
    showNames();
    fillNotes();
    const total = entry.moves.length;
    $('log-slider').max = total;
    $('log-meta').textContent = `${when(entry.startedAt)} · ${THEME_NAME[entry.theme]} · ${entry.label} · Dauer ${duration(entry)}`;
    showStats();
    app.show('log-game');
    render(total);
  }

  function showNames() {
    entry.players.forEach((p, i) => {
      $(`log-title-${i}`).textContent = i === entry.winner ? `${nameOf(p)} ★ SIEG` : nameOf(p);
    });
  }

  function showStats() {
    $('log-stats').textContent = entry.players.map((p, i) => {
      const own = entry.moves.filter((m) => m.by === i);
      const hits = own.filter((m) => m.result !== 'miss').length;
      return `${nameOf(p)}: ${own.length} Schüsse, ${own.length ? Math.round((hits / own.length) * 100) : 0} % Treffer`;
    }).join(' · ');
  }

  // ---- Notizen: Alias je Spieler + Kommentar ----
  function fillNotes() {
    entry.players.forEach((p, i) => {
      $(`log-alias-label-${i}`).textContent = `Alias für „${p.name}“${i === entry.winner ? ' (Gewinner)' : ''}`;
      $(`log-alias-${i}`).placeholder = p.name;
      $(`log-alias-${i}`).value = p.alias || '';
    });
    $('log-comment').value = entry.comment || '';
  }

  async function saveNotes() {
    const body = { aliases: [0, 1].map((i) => $(`log-alias-${i}`).value), comment: $('log-comment').value };
    try {
      const r = await fetch(`/api/logbook/${encodeURIComponent(entry.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      const saved = await r.json();
      entries = entries.map((e) => (e.id === saved.id ? saved : e));
      entry = saved;
      showNames(); showStats(); fillNotes(); render(step);
      app.toast('Gespeichert');
    } catch { app.toast('Speichern fehlgeschlagen'); }
  }

  // Stand nach n Zügen: Felder zurücksetzen, Schiffe zeichnen, Züge mit der echten Spiellogik nachspielen
  function render(n) {
    step = Math.max(0, Math.min(n, entry.moves.length));
    for (const el of boardEls) {
      for (const c of el._cells) { c.classList.remove('hit', 'miss', 'sunk', 'last'); c.classList.add('fresh'); }
    }
    entry.players.forEach((p, i) => Board.drawShips(boardEls[i], p.ships));
    const { events } = Rules.replay(entry, step);
    for (const { move, target, res } of events) {
      if (res.error) continue;
      if (res.result === 'sunk') Board.markSunk(boardEls[target], res.ship, res.water);
      else Board.mark(boardEls[target], move.x, move.y, res.result);
    }
    const last = events[events.length - 1];
    if (last) Board.cell(boardEls[last.target], last.move.x, last.move.y).classList.add('last');

    $('log-slider').value = step;
    const total = entry.moves.length;
    let text = 'Startaufstellung';
    if (last) {
      const shooter = nameOf(entry.players[last.move.by]);
      text = `Zug ${step}/${total} – ${shooter} schießt ${LETTERS[last.move.x]}${last.move.y + 1}: ${RESULT[last.res.result] || last.move.result}`;
    }
    if (step === total) text += ` – Gewinner: ${winnerName(entry)}`;
    $('log-step').textContent = text;
    $('log-first').disabled = $('log-prev').disabled = step === 0;
    $('log-next').disabled = $('log-last').disabled = step === total;
  }

  function stop() {
    clearInterval(timer); timer = null;
    $('log-play').textContent = 'Abspielen';
  }

  function togglePlay() {
    if (timer) return stop();
    if (step >= entry.moves.length) render(0);
    $('log-play').textContent = 'Pause';
    timer = setInterval(() => {
      render(step + 1);
      if (step >= entry.moves.length) stop();
    }, 450);
  }

  function init(hooks) {
    app = hooks;
    $('log-close').onclick = () => { history.replaceState(null, '', '/'); app.show('start'); };
    $('log-clear').onclick = clearAll;
    $('log-back').onclick = openList;
    $('log-slider').oninput = () => { stop(); render(Number($('log-slider').value)); };
    $('log-first').onclick = () => { stop(); render(0); };
    $('log-prev').onclick = () => { stop(); render(step - 1); };
    $('log-next').onclick = () => { stop(); render(step + 1); };
    $('log-last').onclick = () => { stop(); render(entry.moves.length); };
    $('log-play').onclick = togglePlay;
    $('log-save').onclick = saveNotes;
  }

  return { init, openList, openGame };
})();
