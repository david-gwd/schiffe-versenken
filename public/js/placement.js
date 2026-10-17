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
  // Felder anderer Objekte als 1-Feld-Objekte (mit ihrer Form-Art für den Mindestabstand)
  const obstacles = (skip) => cells.flatMap((c, i) => (i === skip ? [] : c.map((p) => ({ kind: FLEET[i].kind, cells: [p] }))));
  const has = (list, p) => list.some((c) => c.x === p.x && c.y === p.y);

  // Lässt sich Objekt i mit diesen Feldern noch gültig fertig bauen?
  function feasible(i, list) {
    const f = FLEET[i], others = obstacles(i);
    return Rules.placements(f.kind, f.len, N).some((pl) => list.every((p) => has(pl.cells, p)) && Rules.canPlace(pl, others, N));
  }

  function canAdd(i, x, y) {
    if (i < 0 || full(i) || !Rules.inBounds(x, y, N) || owner(x, y) >= 0) return false;
    const c = cells[i];
    if (c.length && !c.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) === 1)) return false;
    return feasible(i, [...c, { x, y }]);
  }

  // Hängen die Felder (waagerecht/senkrecht) zusammen?
  function connected(list) {
    if (list.length < 2) return true;
    const seen = [list[0]], queue = [list[0]];
    while (queue.length) {
      const cur = queue.pop();
      for (const p of list) if (!has(seen, p) && Math.abs(p.x - cur.x) + Math.abs(p.y - cur.y) === 1) { seen.push(p); queue.push(p); }
    }
    return seen.length === list.length;
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
    Board.clear(boardEl, 'ship', 'k2', 'k3', 'k4', 'k5', 'partial', 'hint', 'preview-ok', 'preview-bad');
    cells.forEach((c, i) => c.forEach((p) => {
      const e = Board.cell(boardEl, p.x, p.y);
      e.classList.add('ship', `k${FLEET[i].tier}`);
      if (i === current && !full(i)) e.classList.add('partial');
    }));
    if (current >= 0) {
      for (const p of cells[current]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = p.x + dx, y = p.y + dy;
        if (Rules.inBounds(x, y, N) && canAdd(current, x, y)) Board.cell(boardEl, x, y).classList.add('hint');
      }
    }
    renderList();
    infoEl.textContent = current < 0 ? 'Alles platziert – drücke „Fertig“'
      : `${FLEET[current].name} (${FLEET[current].desc}): Feld für Feld anklicken – ${cells[current].length}/${FLEET[current].len}`;
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
      const rest = cells[o].filter((p) => !(p.x === x && p.y === y));
      cells[o] = connected(rest) ? rest : [];
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
    cells = Rules.randomPlacement(cfg).map((o) => o.cells); // gleiche Reihenfolge wie FLEET
    current = -1;
    redraw();
  }

  function ships() {
    return cells.map((c, i) => ({ kind: FLEET[i].kind, cells: c.map(({ x, y }) => ({ x, y })) })).filter((o, i) => full(i));
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
