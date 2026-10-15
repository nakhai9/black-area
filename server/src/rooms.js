/**
 * Game rooms: a room has a name, a 6-character code to join it, and a number of slots (MIN_PLAYERS..MAX_PLAYERS,
 * one nation each) chosen by its creator; the match starts only once every slot is filled.
 * The first player in is the host; only the host starts the match. No accounts: a player is a name + a socket.
 */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
/** A room not started this long after it was created is forgotten (its players are sent back to the lobby). */
export const ROOM_IDLE_MS = 5 * 60 * 1000;
export const FACTIONS = ['usa', 'russia', 'china', 'europe', 'islamic'];

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I: easy to read out loud
const NAME_MAX = 24;

/** code → room */
const rooms = new Map();

export function cleanName(raw, fallback) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return s || fallback;
}

function newCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(code)) return code;
  }
}

/** Room code typed by the creator: 4–6 letters / digits, upper case; '' when none was typed. */
export function cleanCode(raw) {
  return String(raw ?? '').trim().toUpperCase();
}
export const validCode = (code) => /^[A-Z0-9]{4,6}$/.test(code);

/** New room; `code` is the creator's own (checked free by the caller), or a random one when empty. */
export function createRoom(name, slots, code = '') {
  const n = Math.round(Number(slots));
  const size = Number.isFinite(n) ? Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, n)) : MAX_PLAYERS;
  const room = { code: code || newCode(), name, slots: size, hostId: null, players: [], started: false, seed: 0, createdAt: Date.now() };
  rooms.set(room.code, room);
  return room;
}

export function findRoom(code) {
  return rooms.get(String(code ?? '').trim().toUpperCase()) ?? null;
}

/** Adds the player with the first free nation; returns an error text instead when it cannot. */
export function addPlayer(room, player) {
  if (room.started) return 'Room already in game';
  if (room.players.length >= room.slots) return 'Room is full';
  const taken = new Set(room.players.map((p) => p.faction));
  player.faction = FACTIONS.find((f) => !taken.has(f));
  player.ready = false;
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  return null;
}

/** Removes the player; the next one becomes host; an empty room is deleted. */
export function removePlayer(room, playerId) {
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.hostId === playerId) room.hostId = room.players[0]?.id ?? null;
  if (room.players.length === 0) rooms.delete(room.code);
}

export function pickFaction(room, player, faction) {
  if (room.started) return 'Room already in game';
  if (!FACTIONS.includes(faction)) return 'Unknown nation';
  if (room.players.some((p) => p !== player && p.faction === faction)) return 'Nation already taken';
  player.faction = faction;
  player.ready = false;
  return null;
}

/** What every client in the room is told (no sockets). */
export function roomView(room) {
  return {
    code: room.code,
    name: room.name,
    hostId: room.hostId,
    started: room.started,
    maxPlayers: room.slots,
    players: room.players.map((p) => ({ id: p.id, name: p.name, faction: p.faction, ready: p.ready })),
  };
}

/** Rooms created more than ROOM_IDLE_MS ago that never started: taken off the list and returned. */
export function takeExpiredRooms(now = Date.now()) {
  const expired = [];
  for (const room of rooms.values()) {
    if (room.started || now - room.createdAt < ROOM_IDLE_MS) continue;
    rooms.delete(room.code);
    expired.push(room);
  }
  return expired;
}

export function roomCount() {
  return rooms.size;
}
