(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const EXTRA_SHOT_ON_HIT = true;
  const LEN_NAMES = { 5: 'Schlachtschiff', 4: 'Kreuzer', 3: 'Zerstörer', 2: 'U-Boot' };

  // Spielvarianten: Feldgröße + Schiffslängen
  const MODES = {
    mini: { size: 5, label: 'Mini 5×5', lens: [3, 2, 2] },
    normal: { size: 10, label: 'Normal 10×10', lens: [5, 4, 3, 3, 2] },
    large: { size: 15, label: 'Groß 15×15 – Schwer', lens: [5, 5, 4, 4, 3, 3, 3, 2, 2, 2] },
    expert: { size: 15, label: 'Groß 15×15 – Experte', lens: [5, 4, 3, 3, 2] },
  };

  function getConfig(mode) {
    const key = Object.prototype.hasOwnProperty.call(MODES, mode) ? mode : 'normal';
    const m = MODES[key];
    return { mode: key, size: m.size, label: m.label, fleet: m.lens.map((len) => ({ name: LEN_NAMES[len], len })) };
  }

  // ship: {x, y, len, dir: 'h'|'v'}
  function cellsOf(ship) {
    const cells = [];
    for (let i = 0; i < ship.len; i++) {
      cells.push({ x: ship.x + (ship.dir === 'h' ? i : 0), y: ship.y + (ship.dir === 'v' ? i : 0) });
    }
    return cells;
  }

  function inBounds(x, y, size) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size;
  }

  // Can `ship` be added to `others` (in bounds, no overlap, no touching incl. diagonal)?
  function canPlace(ship, others, size) {
    if (!ship || (ship.dir !== 'h' && ship.dir !== 'v')) return false;
    const cells = cellsOf(ship);
    if (!cells.every((c) => inBounds(c.x, c.y, size))) return false;
    for (const o of others) {
      for (const oc of cellsOf(o)) {
        for (const c of cells) {
          if (Math.abs(oc.x - c.x) <= 1 && Math.abs(oc.y - c.y) <= 1) return false;
        }
      }
    }
    return true;
  }

  // Full fleet check: exact lengths of cfg.fleet, all valid.
  function validatePlacement(ships, cfg) {
    if (!Array.isArray(ships) || ships.length !== cfg.fleet.length) return false;
    if (!ships.every((s) => s && Number.isInteger(s.len))) return false;
    const num = (a, b) => a - b;
    const want = cfg.fleet.map((s) => s.len).sort(num).join(',');
    const have = ships.map((s) => s && s.len).sort(num).join(',');
    if (want !== have) return false;
    const placed = [];
    for (const s of ships) {
      if (!canPlace(s, placed, cfg.size)) return false;
      placed.push({ x: s.x, y: s.y, len: s.len, dir: s.dir });
    }
    return true;
  }

  function randomPlacement(cfg, rng = Math.random) {
    for (;;) {
      const placed = [];
      let ok = true;
      for (const f of cfg.fleet) {
        let done = false;
        for (let tries = 0; tries < 200 && !done; tries++) {
          const ship = {
            x: Math.floor(rng() * cfg.size),
            y: Math.floor(rng() * cfg.size),
            len: f.len,
            dir: rng() < 0.5 ? 'h' : 'v',
          };
          if (canPlace(ship, placed, cfg.size)) { placed.push(ship); done = true; }
        }
        if (!done) { ok = false; break; }
      }
      if (ok) return placed;
    }
  }

  // Board state held by the server for one player.
  function createBoard(ships, size) {
    return {
      size,
      ships: ships.map((s) => ({ x: s.x, y: s.y, len: s.len, dir: s.dir, hits: 0 })),
      shots: new Set(),
    };
  }

  // Returns {error} or {result:'miss'|'hit'|'sunk', ship?, allSunk, water?}
  // water: cells around a sunk ship to auto-mark as miss.
  function applyShot(board, x, y) {
    if (!inBounds(x, y, board.size)) return { error: 'Ungültiges Feld' };
    const key = x + ',' + y;
    if (board.shots.has(key)) return { error: 'Bereits beschossen' };
    board.shots.add(key);
    const ship = board.ships.find((s) => cellsOf(s).some((c) => c.x === x && c.y === y));
    if (!ship) return { result: 'miss', allSunk: false };
    ship.hits++;
    const allSunk = board.ships.every((s) => s.hits >= s.len);
    if (ship.hits < ship.len) return { result: 'hit', allSunk };
    const water = [];
    const shipCells = cellsOf(ship);
    for (const c of shipCells) {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const nx = c.x + dx, ny = c.y + dy;
        if (!inBounds(nx, ny, board.size)) continue;
        if (shipCells.some((s) => s.x === nx && s.y === ny)) continue;
        if (!water.some((w) => w.x === nx && w.y === ny)) water.push({ x: nx, y: ny });
        board.shots.add(nx + ',' + ny);
      }
    }
    return { result: 'sunk', ship: { x: ship.x, y: ship.y, len: ship.len, dir: ship.dir }, water, allSunk };
  }

  return { MODES, EXTRA_SHOT_ON_HIT, getConfig, cellsOf, inBounds, canPlace, validatePlacement, randomPlacement, createBoard, applyShot };
});
