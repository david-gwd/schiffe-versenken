const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

// Beendete Partien in SQLite: online bei Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN),
// sonst lokal in data/logbook.db (anderer Ort: LOGBOOK_DB=file:/pfad/zur/datei.db)
const DATA_DIR = path.join(__dirname, '..', 'data');
let ready = null;

function connect() {
  if (process.env.TURSO_DATABASE_URL) {
    return createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  const url = process.env.LOGBOOK_DB || 'file:' + path.join(DATA_DIR, 'logbook.db');
  if (url.startsWith('file:')) fs.mkdirSync(path.dirname(url.slice(5)), { recursive: true });
  return createClient({ url });
}

// Verbindung + Tabelle beim ersten Zugriff; alte data/logbook.json wird einmalig übernommen
function db() {
  if (!ready) {
    ready = (async () => {
      const c = connect();
      await c.execute('CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, ended_at TEXT NOT NULL, data TEXT NOT NULL)');
      if (!process.env.LOGBOOK_DB) await importJson(c); // Tests mit eigener DB nicht anfassen
      return c;
    })();
    ready.catch(() => { ready = null; }); // beim nächsten Zugriff neu versuchen
  }
  return ready;
}

async function importJson(c) {
  const file = path.join(DATA_DIR, 'logbook.json');
  let old;
  try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
  await c.batch(old.map((e) => ({ sql: 'INSERT OR IGNORE INTO games (id, ended_at, data) VALUES (?, ?, ?)', args: [e.id, e.endedAt, JSON.stringify(e)] })), 'write');
  fs.renameSync(file, file + '.importiert');
  console.log(`Logbuch: ${old.length} Partien aus logbook.json übernommen`);
}

async function get(id) {
  const r = await (await db()).execute({ sql: 'SELECT data FROM games WHERE id = ?', args: [id] });
  return r.rows.length ? JSON.parse(r.rows[0].data) : null;
}

async function save(e) {
  await (await db()).execute({ sql: 'INSERT OR REPLACE INTO games (id, ended_at, data) VALUES (?, ?, ?)', args: [e.id, e.endedAt, JSON.stringify(e)] });
  return e;
}

// Neueste zuerst
async function list() {
  const r = await (await db()).execute('SELECT data FROM games ORDER BY ended_at DESC');
  return r.rows.map((row) => JSON.parse(row.data));
}

const add = save;

async function remove(id) {
  const r = await (await db()).execute({ sql: 'DELETE FROM games WHERE id = ?', args: [id] });
  return r.rowsAffected > 0;
}

async function clear() { await (await db()).execute('DELETE FROM games'); }

// Nachträglich: Alias pro Spieler (leer = Originalname) und Freitext-Kommentar
const tidy = (v, max, keepNewlines) => (typeof v === 'string' ? v.replace(keepNewlines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
async function update(id, { aliases, comment } = {}) {
  const e = await get(id);
  if (!e) return null;
  if (Array.isArray(aliases)) e.players.forEach((p, i) => { p.alias = tidy(aliases[i], 20) || null; });
  if (comment !== undefined) e.comment = tidy(comment, 1000, true) || null;
  return save(e);
}

// Eintrag aus einem gerade beendeten Raum: Aufstellung, Schüsse, Zugfolge, Gewinner
function fromRoom(room, winner) {
  return {
    id: crypto.randomUUID(),
    startedAt: room.startedAt,
    endedAt: new Date().toISOString(),
    mode: room.cfg.mode, theme: room.cfg.theme, label: room.cfg.label, size: room.cfg.size,
    players: room.players.map((p) => ({
      name: p.name,
      deviceId: p.deviceId,
      ships: p.board.ships.map(({ kind, cells }) => ({ kind, cells })),
      shots: [...p.board.shots],
    })),
    moves: room.moves.map((m) => ({ ...m })),
    winner: room.players.indexOf(winner),
  };
}

module.exports = { list, add, remove, clear, update, fromRoom };
