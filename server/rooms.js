const crypto = require('crypto');
const Rules = require('../shared/rules');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GRACE_MS = 60_000;
const rooms = new Map();

function makeCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(code)) return code;
  }
}

function newPlayer(name) {
  return { id: crypto.randomUUID(), name: String(name || 'Spieler').slice(0, 20), ws: null, board: null, ready: false, rematch: false, timer: null };
}

function createRoom(name, mode) {
  const code = makeCode();
  const cfg = Rules.getConfig(mode);
  const room = { code, cfg, players: [newPlayer(name)], phase: 'lobby', turn: 0 };
  rooms.set(code, room);
  return { room, player: room.players[0] };
}

function joinRoom(code, name) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) return { error: 'Raum nicht gefunden' };
  if (room.players.length >= 2) return { error: 'Raum ist voll' };
  const player = newPlayer(name);
  room.players.push(player);
  room.phase = 'placing';
  return { room, player };
}

function findBySession(code, playerId) {
  const room = rooms.get(String(code || '').toUpperCase());
  const player = room && room.players.find((p) => p.id === playerId);
  return player ? { room, player } : null;
}

function opponentOf(room, player) {
  return room.players.find((p) => p !== player) || null;
}

function resetForPlacing(room) {
  room.phase = 'placing';
  room.turn = 0;
  for (const p of room.players) { p.board = null; p.ready = false; p.rematch = false; }
}

function removeRoom(room) {
  for (const p of room.players) clearTimeout(p.timer);
  rooms.delete(room.code);
}

module.exports = { GRACE_MS, createRoom, joinRoom, findBySession, opponentOf, resetForPlacing, removeRoom, Rules };
