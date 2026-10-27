const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const R = require('./rooms');
const Logbook = require('./logbook');
const { Rules } = R;

const app = express();
// Variante eines Raums nachschlagen, damit die Startseite beim Link-Aufruf schon passend aussieht
app.get('/api/room/:code', (req, res) => {
  const room = R.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'not_found' });
  res.json({ mode: room.cfg.mode, theme: room.cfg.theme, label: room.cfg.label, full: room.players.length >= 2 });
});
// Logbuch nur mit Passwort (HTTP-Basic-Auth, Benutzername egal). Passwort aus LOGBOOK_PASSWORD
// oder data/logbook-password.txt – nie im Code, das Repo ist öffentlich. Ohne Passwort ist das Logbuch gesperrt.
function logbookPassword() {
  if (process.env.LOGBOOK_PASSWORD) return process.env.LOGBOOK_PASSWORD;
  try { return fs.readFileSync(path.join(__dirname, '..', 'data', 'logbook-password.txt'), 'utf8').trim() || null; } catch { return null; }
}
const digest = (s) => crypto.createHash('sha256').update(s).digest();
function requirePassword(req, res, next) {
  const want = logbookPassword();
  if (!want) return res.status(503).type('text').send('Logbuch gesperrt: kein Passwort gesetzt (LOGBOOK_PASSWORD oder data/logbook-password.txt).');
  const [scheme, b64] = (req.headers.authorization || '').split(' ');
  const given = scheme === 'Basic' && b64 ? Buffer.from(b64, 'base64').toString().replace(/^[^:]*:/, '') : '';
  if (crypto.timingSafeEqual(digest(given), digest(want))) return next();
  res.set('WWW-Authenticate', 'Basic realm="Logbuch", charset="UTF-8"').status(401).type('text').send('Passwort erforderlich');
}
app.use(['/logbuch', '/api/logbook'], requirePassword);

// Logbuch: beendete Partien ansehen und löschen
app.get('/api/logbook', (req, res) => res.json(Logbook.list()));
app.delete('/api/logbook/:id', (req, res) => {
  if (!Logbook.remove(req.params.id)) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});
app.delete('/api/logbook', (req, res) => { Logbook.clear(); res.status(204).end(); });
app.patch('/api/logbook/:id', express.json(), (req, res) => {
  const e = Logbook.update(req.params.id, req.body || {});
  if (!e) return res.status(404).json({ error: 'not_found' });
  res.json(e);
});
// Versteckte Logbuch-Seite: nicht auf der Startseite verlinkt, nur über /logbuch erreichbar
app.get('/logbuch', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));
app.use(express.static(path.join(__dirname, '..', 'public')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function send(p, msg) {
  if (p && p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
}

function startIfReady(room) {
  if (room.players.length === 2 && room.players.every((p) => p.ready)) {
    room.phase = 'playing';
    room.startedAt = new Date().toISOString();
    room.moves = [];
    room.turn = Math.floor(Math.random() * 2);
    room.players.forEach((p, i) => send(p, { type: 'start', yourTurn: i === room.turn }));
  }
}

wss.on('connection', (ws) => {
  let room = null, player = null;

  function attach(r, p) {
    room = r; player = p;
    clearTimeout(p.timer);
    p.ws = ws;
  }

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.type !== 'string') return;

    if (m.type === 'create' && !room) {
      const r = R.createRoom(m.name, m.mode, m.theme, m.deviceId);
      attach(r.room, r.player);
      return send(player, { type: 'created', code: room.code, playerId: player.id, mode: room.cfg.mode, theme: room.cfg.theme });
    }
    if (m.type === 'join' && !room) {
      const r = R.joinRoom(m.code, m.name, m.deviceId);
      if (r.error) return ws.send(JSON.stringify({ type: 'error', msg: r.error }));
      attach(r.room, r.player);
      const opp = R.opponentOf(room, player);
      send(player, { type: 'joined', code: room.code, playerId: player.id, opponent: opp.name, mode: room.cfg.mode, theme: room.cfg.theme });
      return send(opp, { type: 'opponent_joined', name: player.name });
    }
    if (m.type === 'resume' && !room) {
      const found = R.findBySession(m.code, m.playerId);
      if (!found) return ws.send(JSON.stringify({ type: 'resume_failed' }));
      attach(found.room, found.player);
      const opp = R.opponentOf(room, player);
      send(player, { type: 'resumed', code: room.code, mode: room.cfg.mode, theme: room.cfg.theme, phase: room.phase, opponent: opp && opp.name, yourTurn: room.players[room.turn] === player, placed: player.ready });
      return send(opp, { type: 'opponent_back' });
    }
    if (!room) return;
    const opp = R.opponentOf(room, player);

    // Wartenden Raum abbrechen: Code sofort ungültig machen
    if (m.type === 'leave' && !opp) { R.removeRoom(room); room = null; player = null; return; }

    // Laufendes Spiel beenden: Gegner benachrichtigen, Raum schließen
    if (m.type === 'leave' && opp) {
      send(opp, { type: 'game_ended' });
      R.removeRoom(room); room = null; player = null; return;
    }

    if (m.type === 'place' && room.phase === 'placing' && !player.ready) {
      if (!Rules.validatePlacement(m.ships, room.cfg)) return send(player, { type: 'error', msg: 'Ungültige Platzierung' });
      player.board = Rules.createBoard(m.ships, room.cfg.size);
      player.ready = true;
      send(player, { type: 'placed_ok' });
      send(opp, { type: 'opponent_ready' });
      return startIfReady(room);
    }

    if (m.type === 'shoot' && room.phase === 'playing') {
      if (room.players[room.turn] !== player) return send(player, { type: 'error', msg: 'Nicht an der Reihe' });
      const res = Rules.applyShot(opp.board, m.x, m.y);
      if (res.error) return send(player, { type: 'error', msg: res.error });
      room.moves.push({ by: room.players.indexOf(player), x: m.x, y: m.y, result: res.result });
      const keepTurn = Rules.EXTRA_SHOT_ON_HIT && res.result !== 'miss' && !res.allSunk;
      if (!keepTurn) room.turn = 1 - room.turn;
      const base = { type: 'shot', x: m.x, y: m.y, result: res.result, sunkShip: res.ship, water: res.water };
      for (const p of room.players) send(p, { ...base, by: p === player ? 'you' : 'opponent', yourTurn: room.players[room.turn] === p });
      if (res.allSunk) {
        room.phase = 'over';
        try { Logbook.add(Logbook.fromRoom(room, player)); } catch (e) { console.error('Logbuch-Eintrag fehlgeschlagen:', e); }
        send(player, { type: 'game_over', winner: 'you', opponentShips: opp.board.ships.map(({ kind, cells }) => ({ kind, cells })) });
        send(opp, { type: 'game_over', winner: 'opponent', opponentShips: player.board.ships.map(({ kind, cells }) => ({ kind, cells })) });
      }
      return;
    }

    // Reaktions-Emoji: nur Einträge aus der festen Liste, höchstens eines alle 500 ms
    if (m.type === 'reaction' && opp && room.phase !== 'lobby' && Rules.REACTIONS.includes(m.emoji)) {
      const now = Date.now();
      if (now - (player.lastReaction || 0) < 500) return;
      player.lastReaction = now;
      return send(opp, { type: 'reaction', emoji: m.emoji });
    }

    // Freitext: bereinigt, höchstens eine Nachricht pro Sekunde
    if (m.type === 'chat' && opp && room.phase !== 'lobby') {
      const text = Rules.cleanChat(m.text);
      const now = Date.now();
      if (!text || now - (player.lastChat || 0) < 1000) return;
      player.lastChat = now;
      return send(opp, { type: 'chat', text });
    }

    // Revanche-Anfrage ablehnen: Anfragenden informieren, damit er wieder frei wählen kann
    if (m.type === 'rematch_decline' && room.phase === 'over' && opp && opp.rematch) {
      opp.rematch = false;
      return send(opp, { type: 'rematch_declined' });
    }

    if (m.type === 'rematch' && room.phase === 'over') {
      player.rematch = true;
      send(opp, { type: 'opponent_wants_rematch' });
      if (room.players.length === 2 && room.players.every((p) => p.rematch)) {
        R.resetForPlacing(room);
        room.players.forEach((p) => send(p, { type: 'rematch_start' }));
      }
    }
  });

  ws.on('close', () => {
    if (!player || player.ws !== ws) return;
    player.ws = null;
    send(R.opponentOf(room, player), { type: 'opponent_left' });
    const r = room;
    player.timer = setTimeout(() => {
      const opp = R.opponentOf(r, player);
      if (!opp || !opp.ws) R.removeRoom(r);
    }, R.GRACE_MS);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Schiffe versenken läuft auf http://localhost:${PORT}`));
