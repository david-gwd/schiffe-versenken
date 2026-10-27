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

function newPlayer(name, deviceId) {
  const device = typeof deviceId === 'string' && deviceId ? deviceId.slice(0, 64) : null;
  return { id: crypto.randomUUID(), name: String(name || 'Spieler').slice(0, 20), deviceId: device, ws: null, board: null, ready: false, rematch: false, timer: null };
}

function createRoom(name, mode, theme, deviceId) {
  const code = makeCode();
  const cfg = Rules.getConfig(mode, theme);
  const room = { code, cfg, players: [newPlayer(name, deviceId)], phase: 'lobby', turn: 0, moves: [] };
  rooms.set(code, room);
  return { room, player: room.players[0] };
}

function joinRoom(code, name, deviceId) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) return { error: 'Raum nicht gefunden' };
  if (room.players.length >= 2) return { error: 'Raum ist voll' };
  const player = newPlayer(name, deviceId);
  room.players.push(player);
  room.phase = 'placing';
  return { room, player };
}

function getRoom(code) {
  return rooms.get(String(code || '').toUpperCase()) || null;
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
  room.moves = [];
  for (const p of room.players) { p.board = null; p.ready = false; p.rematch = false; }
}

function removeRoom(room) {
  for (const p of room.players) clearTimeout(p.timer);
  rooms.delete(room.code);
}

module.exports = { GRACE_MS, createRoom, joinRoom, getRoom, findBySession, opponentOf, resetForPlacing, removeRoom, Rules };
