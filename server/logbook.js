const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Beendete Partien als JSON-Datei auf dem Rechner, auf dem der Server läuft
const file = () => process.env.LOGBOOK_FILE || path.join(__dirname, '..', 'data', 'logbook.json');

function read() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return []; }
}

// Erst in Temp-Datei schreiben, dann umbenennen: nie halbes JSON auf der Platte
function write(entries) {
  const f = file();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(entries, null, 1));
  fs.renameSync(f + '.tmp', f);
}

// Neueste zuerst
function list() {
  return read().sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

function add(entry) {
  write([...read(), entry]);
  return entry;
}

function remove(id) {
  const all = read();
  const rest = all.filter((e) => e.id !== id);
  if (rest.length === all.length) return false;
  write(rest);
  return true;
}

function clear() { write([]); }

// Nachträglich: Alias pro Spieler (leer = Originalname) und Freitext-Kommentar
const tidy = (v, max, keepNewlines) => (typeof v === 'string' ? v.replace(keepNewlines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
function update(id, { aliases, comment } = {}) {
  const all = read();
  const e = all.find((x) => x.id === id);
  if (!e) return null;
  if (Array.isArray(aliases)) e.players.forEach((p, i) => { p.alias = tidy(aliases[i], 20) || null; });
  if (comment !== undefined) e.comment = tidy(comment, 1000, true) || null;
  write(all);
  return e;
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
