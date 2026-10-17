const test = require('node:test');
const assert = require('node:assert');
const R = require('../shared/rules');

const line = (x, y, len, dir = 'h') => ({ kind: 'line', cells: Array.from({ length: len }, (_, i) => ({ x: x + (dir === 'h' ? i : 0), y: y + (dir === 'v' ? i : 0) })) });
const dot = (x, y) => ({ kind: 'dot', cells: [{ x, y }] });
const square = (x, y) => ({ kind: 'square', cells: [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }] });
const plus = (cx, cy) => ({ kind: 'plus', cells: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx + 1, y: cy }, { x: cx, y: cy - 1 }, { x: cx, y: cy + 1 }] });
const classic = R.getConfig('normal', 'classic');
const space = R.getConfig('normal', 'space');

test('Überlappung und Berührung werden abgelehnt', () => {
  const a = line(0, 0, 3);
  assert.equal(R.canPlace(line(1, 0, 2, 'v'), [a], 10), false); // überlappt
  assert.equal(R.canPlace(line(3, 1, 2), [a], 10), false); // diagonal
  assert.equal(R.canPlace(line(0, 1, 2), [a], 10), false); // direkt daneben
  assert.equal(R.canPlace(line(0, 2, 2), [a], 10), true);
});

test('Außerhalb des Feldes wird abgelehnt', () => {
  assert.equal(R.canPlace(line(8, 0, 3), [], 10), false);
  assert.equal(R.canPlace(line(0, 9, 2, 'v'), [], 10), false);
  assert.equal(R.canPlace(line(3, 0, 3), [], 5), false);
  assert.equal(R.canPlace(plus(0, 0), [], 10), false); // Kreuz ragt raus
  assert.equal(R.canPlace(plus(1, 1), [], 10), true);
});

test('Formen werden erkannt', () => {
  assert.ok(R.isShape('dot', 1, dot(3, 3).cells));
  assert.ok(R.isShape('square', 4, square(2, 2).cells));
  assert.ok(R.isShape('plus', 5, plus(4, 4).cells));
  assert.ok(R.isShape('line', 3, line(0, 0, 3, 'v').cells));
  assert.equal(R.isShape('square', 4, line(0, 0, 4).cells), false);
  assert.equal(R.isShape('plus', 5, [...square(0, 0).cells, { x: 2, y: 0 }]), false);
  assert.equal(R.isShape('line', 3, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]), false); // Knick
  assert.equal(R.isShape('line', 3, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }]), false); // Lücken
});

test('Objekte dürfen ein Kreuz auch diagonal nicht berühren', () => {
  const one = (x, y) => ({ kind: 'line', cells: [{ x, y }] });
  // Kreuz-Mitte (4,4), Arm links (3,4): (2,3) liegt diagonal zum Arm
  assert.equal(R.canPlace(one(2, 3), [plus(4, 4)], 10), false);
  assert.equal(R.canPlace(one(2, 2), [plus(4, 4)], 10), true);
  assert.equal(R.canPlace(one(3, 3), [plus(4, 4)], 10), false); // Eckfeld des Kreuzes grenzt an zwei Arme
});

test('Varianten haben die erwarteten Größen und Objekte', () => {
  assert.deepEqual(['mini', 'normal', 'large', 'expert'].map((m) => R.getConfig(m).size), [5, 10, 15, 15]);
  assert.equal(R.getConfig('expert').fleet.length, R.getConfig('normal').fleet.length);
  assert.ok(R.getConfig('large').fleet.length > R.getConfig('normal').fleet.length);
  assert.ok(R.getConfig('mini').fleet.length < R.getConfig('normal').fleet.length);
  assert.equal(R.getConfig('unbekannt').mode, 'normal');
  assert.equal(R.getConfig('__proto__', '__proto__').mode, 'normal');
  assert.equal(R.getConfig('normal', '__proto__').theme, 'classic');
  assert.deepEqual(space.fleet.map((f) => f.name), ['Stern', 'Planet', 'Raumschiff', 'Raumschiff', 'Asteroid']);
  assert.deepEqual(space.fleet.map((f) => f.len), [5, 4, 3, 3, 1]);
  assert.deepEqual(classic.fleet.map((f) => f.len), [5, 4, 3, 3, 2]);
});

test('randomPlacement ist in jeder Variante und jedem Theme gültig', () => {
  for (const theme of ['classic', 'space']) for (const mode of Object.keys(R.MODES)) {
    const c = R.getConfig(mode, theme);
    for (let i = 0; i < 150; i++) assert.ok(R.validatePlacement(R.randomPlacement(c), c), `${theme}/${mode}`);
  }
});

test('validatePlacement prüft Flotte, Formen und Feldgröße', () => {
  const f = R.randomPlacement(space);
  assert.equal(R.validatePlacement(f.slice(1), space), false);
  assert.equal(R.validatePlacement(null, space), false);
  assert.equal(R.validatePlacement(f, classic), false);                  // falsche Formen für das Theme
  assert.equal(R.validatePlacement(f, R.getConfig('mini', 'space')), false);
  assert.equal(R.validatePlacement(f, R.getConfig('expert', 'space')), true);
  // Form gefälscht: Planet als Linie mit 4 Feldern
  const fake = f.map((o) => (o.kind === 'square' ? { kind: 'line', cells: o.cells.slice() } : o));
  assert.equal(R.validatePlacement(fake, space), false);
  // Form gefälscht: Kreuz mit verschobenem Arm
  const bad = f.map((o) => (o.kind === 'plus' ? { kind: 'plus', cells: o.cells.map((c, i) => (i === 1 ? { x: c.x - 1, y: c.y } : c)) } : o));
  assert.equal(R.validatePlacement(bad, space), false);
  // Koordinaten als Strings
  const str = f.map((o) => ({ kind: o.kind, cells: o.cells.map((c) => ({ x: String(c.x), y: c.y })) }));
  assert.equal(R.validatePlacement(str, space), false);
});

test('Asteroiden brauchen zwei freie Felder Abstand zu jedem Objekt', () => {
  assert.equal(R.ASTEROID_GAP, 2);
  assert.equal(R.canPlace(dot(1, 1), [dot(0, 0)], 10), false);  // diagonal berührt
  assert.equal(R.canPlace(dot(2, 0), [dot(0, 0)], 10), false);  // nur ein Feld dazwischen
  assert.equal(R.canPlace(dot(2, 2), [dot(0, 0)], 10), false);  // diagonal, ein Feld dazwischen
  assert.equal(R.canPlace(dot(3, 0), [dot(0, 0)], 10), true);   // zwei Felder dazwischen
  assert.equal(R.canPlace(dot(3, 3), [dot(0, 0)], 10), true);
  // gilt auch zu anderen Formen, und zwar in beide Richtungen der Prüfung
  assert.equal(R.canPlace(dot(4, 0), [line(0, 0, 3)], 10), false); // Schiff endet bei x=2, nur ein Feld dazwischen
  assert.equal(R.canPlace(dot(5, 0), [line(0, 0, 3)], 10), true);  // zwei Felder dazwischen
  assert.equal(R.canPlace(line(4, 0, 3), [dot(0, 0)], 10), true);  // normales Objekt darf an den Asteroiden-Abstand heran
  assert.equal(R.canPlace(line(2, 0, 3), [dot(0, 0)], 10), false); // …aber nicht näher als zwei freie Felder
});

test('applyShot: miss, hit, sunk, Sieg, doppelter Schuss', () => {
  const b = R.createBoard([line(0, 0, 2)], 10);
  assert.equal(R.applyShot(b, 5, 5).result, 'miss');
  assert.ok(R.applyShot(b, 5, 5).error);
  assert.equal(R.applyShot(b, 0, 0).result, 'hit');
  const r = R.applyShot(b, 1, 0);
  assert.equal(r.result, 'sunk');
  assert.equal(r.allSunk, true);
  assert.ok(r.water.some((w) => w.x === 2 && w.y === 1));
  assert.equal(r.ship.kind, 'line');
});

test('Asteroid ist mit einem Treffer zerstört, Kreuz braucht fünf', () => {
  const b = R.createBoard([dot(0, 0), plus(5, 5)], 10);
  const a = R.applyShot(b, 0, 0);
  assert.equal(a.result, 'sunk');
  assert.equal(a.allSunk, false);
  for (const c of [[5, 5], [4, 5], [6, 5], [5, 4]]) assert.equal(R.applyShot(b, ...c).result, 'hit');
  const last = R.applyShot(b, 5, 6);
  assert.equal(last.result, 'sunk');
  assert.equal(last.allSunk, true);
  assert.ok(last.water.some((w) => w.x === 4 && w.y === 4)); // Eckfeld neben dem Kreuz
});

test('applyShot respektiert die Feldgröße', () => {
  const b = R.createBoard([line(0, 0, 2)], 5);
  assert.ok(R.applyShot(b, 5, 0).error);
  assert.ok(R.applyShot(b, 0, 7).error);
  assert.equal(R.applyShot(b, 4, 4).result, 'miss');
});

test('tierOf liefert die Farbstufe', () => {
  assert.deepEqual([dot(0, 0), line(0, 0, 3), square(0, 0), plus(1, 1), line(0, 0, 5)].map(R.tierOf), [2, 3, 4, 5, 5]);
});
