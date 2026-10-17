const test = require('node:test');
const assert = require('node:assert');
const R = require('../shared/rules');
const N = 10;
const cfg = R.getConfig('normal');

test('Überlappung und Berührung werden abgelehnt', () => {
  const a = { x: 0, y: 0, len: 3, dir: 'h' };
  assert.equal(R.canPlace({ x: 1, y: 0, len: 2, dir: 'v' }, [a], N), false); // überlappt
  assert.equal(R.canPlace({ x: 3, y: 1, len: 2, dir: 'h' }, [a], N), false); // diagonal
  assert.equal(R.canPlace({ x: 0, y: 1, len: 2, dir: 'h' }, [a], N), false); // direkt daneben
  assert.equal(R.canPlace({ x: 0, y: 2, len: 2, dir: 'h' }, [a], N), true);
});

test('Außerhalb des Feldes wird abgelehnt', () => {
  assert.equal(R.canPlace({ x: 8, y: 0, len: 3, dir: 'h' }, [], N), false);
  assert.equal(R.canPlace({ x: 0, y: 9, len: 2, dir: 'v' }, [], N), false);
  assert.equal(R.canPlace({ x: 3, y: 0, len: 3, dir: 'h' }, [], 5), false);
});

test('Varianten haben die erwarteten Größen und Flotten', () => {
  assert.deepEqual(['mini', 'normal', 'large', 'expert'].map((m) => R.getConfig(m).size), [5, 10, 15, 15]);
  assert.equal(R.getConfig('expert').fleet.length, R.getConfig('normal').fleet.length);
  assert.ok(R.getConfig('large').fleet.length > R.getConfig('normal').fleet.length);
  assert.ok(R.getConfig('mini').fleet.length < R.getConfig('normal').fleet.length);
  assert.equal(R.getConfig('unbekannt').mode, 'normal');
  assert.equal(R.getConfig('__proto__').mode, 'normal');
});

test('randomPlacement ist in jeder Variante gültig', () => {
  for (const mode of Object.keys(R.MODES)) {
    const c = R.getConfig(mode);
    for (let i = 0; i < 200; i++) assert.ok(R.validatePlacement(R.randomPlacement(c), c), mode);
  }
});

test('validatePlacement prüft Flotte und Feldgröße', () => {
  const f = R.randomPlacement(cfg);
  assert.equal(R.validatePlacement(f.slice(1), cfg), false);
  assert.equal(R.validatePlacement(null, cfg), false);
  assert.equal(R.validatePlacement(f, R.getConfig('mini')), false); // falsche Flotte
  assert.equal(R.validatePlacement(f.map((s) => ({ ...s, len: String(s.len) })), cfg), false);
  // 10×10-Flotte passt nicht auf ein 5×5-Feld, aber auf 15×15 mit gleicher Flotte
  assert.equal(R.validatePlacement(f, R.getConfig('expert')), true);
});

test('applyShot: miss, hit, sunk, Sieg, doppelter Schuss', () => {
  const b = R.createBoard([{ x: 0, y: 0, len: 2, dir: 'h' }], 10);
  assert.equal(R.applyShot(b, 5, 5).result, 'miss');
  assert.ok(R.applyShot(b, 5, 5).error);
  assert.equal(R.applyShot(b, 0, 0).result, 'hit');
  const r = R.applyShot(b, 1, 0);
  assert.equal(r.result, 'sunk');
  assert.equal(r.allSunk, true);
  assert.ok(r.water.some((w) => w.x === 2 && w.y === 1));
});

test('applyShot respektiert die Feldgröße', () => {
  const b = R.createBoard([{ x: 0, y: 0, len: 2, dir: 'h' }], 5);
  assert.ok(R.applyShot(b, 5, 0).error);
  assert.ok(R.applyShot(b, 0, 7).error);
  assert.equal(R.applyShot(b, 4, 4).result, 'miss');
});
