const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.LOGBOOK_DB = 'file:' + path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'logbook-')), 'logbook.db');
delete process.env.TURSO_DATABASE_URL;
const Logbook = require('../server/logbook');
const R = require('../shared/rules');

// Komplette Partie wie der Server spielen: Spieler schießen abwechselnd (Extra-Schuss bei Treffer) bis alles versenkt ist
function playGame(mode, theme) {
  const cfg = R.getConfig(mode, theme);
  let seed = 42;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const players = ['Anna', 'Ben'].map((name, i) => ({ name, deviceId: `dev-${i}`, board: R.createBoard(R.randomPlacement(cfg, rng), cfg.size) }));
  const room = { cfg, players, moves: [], startedAt: new Date(Date.now() - 60_000).toISOString() };
  let turn = 0, winner = null;
  while (!winner) {
    const target = players[1 - turn].board;
    let x, y;
    do { x = Math.floor(rng() * cfg.size); y = Math.floor(rng() * cfg.size); } while (target.shots.has(x + ',' + y));
    const res = R.applyShot(target, x, y);
    room.moves.push({ by: turn, x, y, result: res.result });
    if (res.allSunk) winner = players[turn];
    else if (!(R.EXTRA_SHOT_ON_HIT && res.result !== 'miss')) turn = 1 - turn;
  }
  return { room, winner };
}

test('fromRoom: Namen, Geräte, Schüsse, Zugfolge und Gewinner', () => {
  const { room, winner } = playGame('mini', 'classic');
  const e = Logbook.fromRoom(room, winner);
  assert.equal(e.winner, room.players.indexOf(winner));
  assert.deepEqual(e.players.map((p) => p.deviceId), ['dev-0', 'dev-1']);
  assert.ok(Array.isArray(e.players[0].shots));
  assert.equal(e.moves.length, room.moves.length);
  assert.equal(e.size, 5);
  assert.ok(e.startedAt < e.endedAt);
  assert.doesNotThrow(() => JSON.stringify(e));
});

for (const [mode, theme] of [['mini', 'classic'], ['normal', 'space'], ['large', 'classic']]) {
  test(`Replay reproduziert den Endstand exakt (${mode}/${theme})`, () => {
    const { room, winner } = playGame(mode, theme);
    const e = JSON.parse(JSON.stringify(Logbook.fromRoom(room, winner))); // wie aus der Datei gelesen
    const { boards, events } = R.replay(e);
    boards.forEach((b, i) => {
      assert.deepEqual([...b.shots].sort(), [...room.players[i].board.shots].sort());
      assert.deepEqual(b.ships.map((s) => s.hits), room.players[i].board.ships.map((s) => s.hits));
    });
    assert.ok(events.every((ev) => !ev.res.error && ev.res.result === ev.move.result));
    assert.equal(events[events.length - 1].res.allSunk, true);
    assert.equal(events[events.length - 1].move.by, e.winner);
  });
}

test('Replay bis Zug n zeigt nur die ersten n Schüsse', () => {
  const { room, winner } = playGame('normal', 'classic');
  const e = Logbook.fromRoom(room, winner);
  const { events } = R.replay(e, 5);
  assert.equal(events.length, 5);
  assert.equal(R.replay(e, 0).events.length, 0);
});

test('add / list / remove / clear', async () => {
  await Logbook.clear();
  const g = playGame('mini', 'classic');
  const a = await Logbook.add({ ...Logbook.fromRoom(g.room, g.winner), endedAt: '2026-01-01T10:00:00.000Z' });
  const b = await Logbook.add({ ...a, id: 'zweite', endedAt: '2026-02-01T10:00:00.000Z' });
  assert.deepEqual((await Logbook.list()).map((e) => e.id), [b.id, a.id]); // neueste zuerst
  assert.equal(await Logbook.remove(a.id), true);
  assert.equal(await Logbook.remove(a.id), false);
  assert.deepEqual((await Logbook.list()).map((e) => e.id), [b.id]);
  await Logbook.clear();
  assert.deepEqual(await Logbook.list(), []);
});

test('update: Alias und Kommentar nachträglich setzen und wieder entfernen', async () => {
  await Logbook.clear();
  const { room, winner } = playGame('mini', 'space');
  const e = await Logbook.add(Logbook.fromRoom(room, winner));
  const u = await Logbook.update(e.id, { aliases: ['  Anna K.  ', ''], comment: 'Knapp!\nNächstes Mal Revanche.' });
  assert.deepEqual(u.players.map((p) => p.alias), ['Anna K.', null]);
  assert.equal(u.players[0].name, 'Anna'); // Originalname bleibt erhalten
  assert.equal(u.comment, 'Knapp!\nNächstes Mal Revanche.');
  assert.equal((await Logbook.list())[0].players[0].alias, 'Anna K.');
  assert.equal((await Logbook.update(e.id, { aliases: ['x'.repeat(50), 'Ben'] })).players[0].alias.length, 20);
  assert.equal((await Logbook.update(e.id, { comment: '' })).comment, null);
  assert.equal((await Logbook.list())[0].players[1].alias, 'Ben'); // Kommentar ändern lässt Alias stehen
  assert.equal(await Logbook.update('gibt-es-nicht', { comment: 'x' }), null);
});
