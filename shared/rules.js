(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const EXTRA_SHOT_ON_HIT = true;
  // Mindestabstand zwischen Asteroiden und allen anderen Objekten:
  // 1 = nicht berühren (auch nicht diagonal), 2 = mindestens zwei Felder Abstand
  const ASTEROID_GAP = 2;

  // Spielvarianten: Feldgröße + Objekte (nach "Stufe" 2–5, siehe THEMES)
  const MODES = {
    mini: { size: 5, label: 'Mini 5×5', tiers: [3, 2, 2] },
    normal: { size: 10, label: 'Normal 10×10', tiers: [5, 4, 3, 3, 2] },
    large: { size: 15, label: 'Groß 15×15 – Schwer', tiers: [5, 5, 4, 4, 3, 3, 3, 2, 2, 2] },
    expert: { size: 15, label: 'Groß 15×15 – Experte', tiers: [5, 4, 3, 3, 2] },
  };

  // kind: line (gerade Reihe), dot (1 Feld), square (2×2), plus (Kreuz aus 5 Feldern)
  const THEMES = {
    classic: {
      5: { name: 'Schlachtschiff', kind: 'line', len: 5, desc: '5 Felder in einer Reihe' },
      4: { name: 'Kreuzer', kind: 'line', len: 4, desc: '4 Felder in einer Reihe' },
      3: { name: 'Zerstörer', kind: 'line', len: 3, desc: '3 Felder in einer Reihe' },
      2: { name: 'U-Boot', kind: 'line', len: 2, desc: '2 Felder in einer Reihe' },
    },
    space: {
      5: { name: 'Stern', kind: 'plus', len: 5, desc: '5 Felder im Kreuz' },
      4: { name: 'Planet', kind: 'square', len: 4, desc: '4 Felder im Quadrat' },
      3: { name: 'Raumschiff', kind: 'line', len: 3, desc: '3 Felder in einer Reihe' },
      2: { name: 'Asteroid', kind: 'dot', len: 1, desc: '1 Feld' },
    },
  };

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function getConfig(mode, theme) {
    const key = has(MODES, mode) ? mode : 'normal';
    const th = has(THEMES, theme) ? theme : 'classic';
    const m = MODES[key];
    return { mode: key, theme: th, size: m.size, label: m.label, fleet: m.tiers.map((t) => ({ ...THEMES[th][t], tier: t })) };
  }

  // Objekt: { kind, cells: [{x, y}] }
  function tierOf(obj) {
    if (obj.kind === 'dot') return 2;
    if (obj.kind === 'square') return 4;
    if (obj.kind === 'plus') return 5;
    return obj.cells.length;
  }

  const gapOf = (kind) => (kind === 'dot' ? ASTEROID_GAP : 1);

  function variants(kind, len) {
    if (kind === 'dot') return [[[0, 0]]];
    if (kind === 'square') return [[[0, 0], [1, 0], [0, 1], [1, 1]]];
    if (kind === 'plus') return [[[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]];
    const h = [], v = [];
    for (let i = 0; i < len; i++) { h.push([i, 0]); v.push([0, i]); }
    return len === 1 ? [h] : [h, v];
  }

  function inBounds(x, y, size) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size;
  }

  // Alle Positionen/Drehungen einer Form auf einem size×size-Feld
  const cache = new Map();
  function placements(kind, len, size) {
    const key = `${kind}:${len}:${size}`;
    if (cache.has(key)) return cache.get(key);
    const out = [];
    for (const v of variants(kind, len)) {
      const w = Math.max(...v.map((p) => p[0])) + 1, h = Math.max(...v.map((p) => p[1])) + 1;
      for (let oy = 0; oy + h <= size; oy++) for (let ox = 0; ox + w <= size; ox++) {
        out.push({ kind, cells: v.map(([dx, dy]) => ({ x: ox + dx, y: oy + dy })) });
      }
    }
    cache.set(key, out);
    return out;
  }

  // Passen die Felder genau zur Form (in beliebiger Position/Drehung)?
  function isShape(kind, len, cells) {
    if (!Array.isArray(cells) || cells.length !== len) return false;
    if (!cells.every((c) => c && Number.isInteger(c.x) && Number.isInteger(c.y))) return false;
    const minx = Math.min(...cells.map((c) => c.x)), miny = Math.min(...cells.map((c) => c.y));
    const got = cells.map((c) => `${c.x - minx},${c.y - miny}`).sort().join(';');
    return variants(kind, len).some((v) => v.map(([x, y]) => `${x},${y}`).sort().join(';') === got);
  }

  // Passt das Objekt aufs Feld, ohne andere zu überlappen oder zu nah zu kommen?
  function canPlace(obj, others, size) {
    if (!obj || !Array.isArray(obj.cells)) return false;
    if (!obj.cells.every((c) => inBounds(c.x, c.y, size))) return false;
    for (const o of others) {
      const gap = Math.max(gapOf(obj.kind), gapOf(o.kind));
      for (const oc of o.cells) for (const c of obj.cells) {
        if (Math.max(Math.abs(oc.x - c.x), Math.abs(oc.y - c.y)) <= gap) return false;
      }
    }
    return true;
  }

  const clean = (o) => ({ kind: o.kind, cells: o.cells.map((c) => ({ x: c.x, y: c.y })) });

  // Komplette Flotte prüfen: genau die Objekte aus cfg.fleet, alle gültig.
  function validatePlacement(objs, cfg) {
    if (!Array.isArray(objs) || objs.length !== cfg.fleet.length) return false;
    if (!objs.every((o) => o && typeof o.kind === 'string' && Array.isArray(o.cells))) return false;
    const want = cfg.fleet.map((f) => `${f.kind}:${f.len}`).sort().join(',');
    const have = objs.map((o) => `${o.kind}:${o.cells.length}`).sort().join(',');
    if (want !== have) return false;
    const placed = [];
    for (const o of objs) {
      if (!isShape(o.kind, o.cells.length, o.cells)) return false;
      if (!canPlace(o, placed, cfg.size)) return false;
      placed.push(clean(o));
    }
    return true;
  }

  // Zufällige Flotte, Reihenfolge wie cfg.fleet
  function randomPlacement(cfg, rng = Math.random) {
    for (;;) {
      const placed = [];
      let ok = true;
      for (const f of cfg.fleet) {
        const all = placements(f.kind, f.len, cfg.size);
        let done = false;
        for (let tries = 0; tries < 300 && !done; tries++) {
          const p = all[Math.floor(rng() * all.length)];
          if (canPlace(p, placed, cfg.size)) { placed.push(clean(p)); done = true; }
        }
        if (!done) { ok = false; break; }
      }
      if (ok) return placed;
    }
  }

  // Board state held by the server for one player.
  function createBoard(objs, size) {
    return { size, ships: objs.map((o) => ({ ...clean(o), hits: 0 })), shots: new Set() };
  }

  // Returns {error} or {result:'miss'|'hit'|'sunk', ship?, allSunk, water?}
  // water: cells around a destroyed object to auto-mark as miss.
  function applyShot(board, x, y) {
    if (!inBounds(x, y, board.size)) return { error: 'Ungültiges Feld' };
    const key = x + ',' + y;
    if (board.shots.has(key)) return { error: 'Bereits beschossen' };
    board.shots.add(key);
    const ship = board.ships.find((s) => s.cells.some((c) => c.x === x && c.y === y));
    if (!ship) return { result: 'miss', allSunk: false };
    ship.hits++;
    const allSunk = board.ships.every((s) => s.hits >= s.cells.length);
    if (ship.hits < ship.cells.length) return { result: 'hit', allSunk };
    const water = [];
    for (const c of ship.cells) {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const nx = c.x + dx, ny = c.y + dy;
        if (!inBounds(nx, ny, board.size)) continue;
        if (ship.cells.some((s) => s.x === nx && s.y === ny)) continue;
        if (!water.some((w) => w.x === nx && w.y === ny)) water.push({ x: nx, y: ny });
        board.shots.add(nx + ',' + ny);
      }
    }
    return { result: 'sunk', ship: clean(ship), water, allSunk };
  }

  return { MODES, THEMES, EXTRA_SHOT_ON_HIT, ASTEROID_GAP, getConfig, tierOf, placements, isShape, inBounds, canPlace, validatePlacement, randomPlacement, createBoard, applyShot };
});
