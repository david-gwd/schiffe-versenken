const Placement = (() => {
  const boardEl = document.getElementById('place-board');
  const listEl = document.getElementById('fleet-list');
  const readyBtn = document.getElementById('btn-ready');
  const infoEl = document.getElementById('place-info');
  let cfg, N, FLEET;
  let cells, current; // cells[i]: Felder von FLEET[i] (evtl. unvollständig)

  const full = (i) => cells[i].length === FLEET[i].len;
  const nextOpen = () => cells.findIndex((c, i) => !full(i));
  const owner = (x, y) => cells.findIndex((c) => c.some((p) => p.x === x && p.y === y));
  // Felder anderer Schiffe als 1er-Schiffe, damit Rules.canPlace Überlappung/Berührung prüft
  const obstacles = (skip) => cells.flatMap((c, i) => (i === skip ? [] : c.map((p) => ({ x: p.x, y: p.y, len: 1, dir: 'h' }))));

  // Lässt sich das Schiff i mit diesen Feldern noch gültig fertig bauen?
  function feasible(i, list) {
    const len = FLEET[i].len, others = obstacles(i);
    const xs = list.map((p) => p.x), ys = list.map((p) => p.y);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    if (miny === maxy && maxx - minx < len) {
      for (let sx = maxx - len + 1; sx <= minx; sx++) if (Rules.canPlace({ x: sx, y: miny, len, dir: 'h' }, others, N)) return true;
    }
    if (minx === maxx && maxy - miny < len) {
      for (let sy = maxy - len + 1; sy <= miny; sy++) if (Rules.canPlace({ x: minx, y: sy, len, dir: 'v' }, others, N)) return true;
    }
    return false;
  }

  function canAdd(i, x, y) {
    if (i < 0 || full(i) || !Rules.inBounds(x, y, N) || owner(x, y) >= 0) return false;
    const c = cells[i];
    if (c.length && !c.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) === 1)) return false;
    return feasible(i, [...c, { x, y }]);
  }

  function isEnd(i, x, y) {
    const c = cells[i];
    if (c.length <= 2) return true;
    const key = c[0].x === c[1].x ? 'y' : 'x';
    const v = key === 'x' ? x : y, vals = c.map((p) => p[key]);
    return v === Math.min(...vals) || v === Math.max(...vals);
  }

  function renderList() {
    listEl.innerHTML = '';
    FLEET.forEach((f, i) => {
      const li = document.createElement('li');
      li.textContent = `${f.name} (${cells[i].length}/${f.len})`;
      if (full(i)) li.classList.add('done');
      if (i === current) li.classList.add('current');
      li.onclick = () => { current = i; redraw(); };
      listEl.appendChild(li);
    });
    readyBtn.disabled = cells.some((c, i) => !full(i));
  }

  function redraw() {
    Board.clear(boardEl, 'ship', 'partial', 'hint', 'preview-ok', 'preview-bad');
    cells.forEach((c, i) => c.forEach((p) => {
      const e = Board.cell(boardEl, p.x, p.y);
      e.classList.add('ship');
      if (i === current && !full(i)) e.classList.add('partial');
    }));
    if (current >= 0 && cells[current].length) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (canAdd(current, x, y)) Board.cell(boardEl, x, y).classList.add('hint');
    }
    renderList();
    infoEl.textContent = current < 0 ? 'Flotte komplett – drücke „Fertig“'
      : `${FLEET[current].name}: Feld für Feld anklicken (${cells[current].length}/${FLEET[current].len})`;
  }

  function preview(x, y) {
    Board.clear(boardEl, 'preview-ok', 'preview-bad');
    if (current < 0 || owner(x, y) >= 0) return;
    Board.cell(boardEl, x, y).classList.add(canAdd(current, x, y) ? 'preview-ok' : 'preview-bad');
  }

  function click(x, y) {
    const o = owner(x, y);
    if (o >= 0 && o !== current) { current = o; return redraw(); }       // anderes Schiff auswählen
    if (o === current) {                                                  // eigenes Feld: abbauen
      cells[o] = isEnd(o, x, y) ? cells[o].filter((p) => !(p.x === x && p.y === y)) : [];
      return redraw();
    }
    if (!canAdd(current, x, y)) return;
    cells[current].push({ x, y });
    if (full(current)) current = nextOpen();
    redraw();
    preview(x, y);
  }

  function reset() {
    cells = FLEET.map(() => []);
    current = 0;
    redraw();
  }

  function random() {
    const pool = [...Rules.randomPlacement(cfg)];
    cells = FLEET.map((f) => Rules.cellsOf(pool.splice(pool.findIndex((s) => s.len === f.len), 1)[0]));
    current = -1;
    redraw();
  }

  function ships() {
    return cells.filter((c, i) => c.length === FLEET[i].len).map((c) => {
      const x = Math.min(...c.map((p) => p.x)), y = Math.min(...c.map((p) => p.y));
      return { x, y, len: c.length, dir: c.every((p) => p.y === c[0].y) ? 'h' : 'v' };
    });
  }

  function setConfig(c) {
    cfg = c; N = c.size; FLEET = c.fleet;
    Board.build(boardEl, N, { onClick: click, onHover: preview, onLeave: () => Board.clear(boardEl, 'preview-ok', 'preview-bad') });
    reset();
  }

  document.getElementById('btn-random').onclick = random;
  document.getElementById('btn-reset').onclick = reset;

  return { setConfig, reset, ships, isComplete: () => cells.every((c, i) => full(i)), el: boardEl };
})();
