/**
 * Black Area multiplayer server: HTTP health check + WebSocket rooms.
 *
 * Client → server (JSON):
 *   { t: 'create', room, code, name, slots }  create a room (2–5 players, own 4–6 char code or random) and join it as host
 *   { t: 'join', room, code, name }  join a room by its name + code
 *   { t: 'faction', faction }        pick a free nation
 *   { t: 'ready', ready }            toggle ready
 *   { t: 'start' }                   host only, every slot filled, everyone ready
 *   { t: 'progress', pct }           loading the match: 0–100
 *   { t: 'loaded' }                  this machine is ready to play
 *   { t: 'cmd', tick, data }         in game: relayed to the whole room (lockstep orders)
 *   { t: 'leave' }
 * Server → client:
 *   { t: 'hello', id }  { t: 'room', room }  { t: 'start', seed, room }  { t: 'cmd', from, tick, data }  { t: 'error', message }
 *   { t: 'loading', players: [{ id, pct, loaded }] }  everyone's loading progress
 *   { t: 'go' }                      every machine has loaded: the match begins on all of them at once
 *   { t: 'left', id, faction }       in game: that player left the match (counts as beaten)
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { addPlayer, cleanCode, cleanName, createRoom, validCode, findRoom, pickFaction, removePlayer, roomCount, roomView, takeExpiredRooms } from './rooms.js';

const PORT = Number(process.env.PORT) || 8787;
const MAX_MESSAGE_BYTES = 16 * 1024;

const server = http.createServer((req, res) => {
  // Render health check / quick status.
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ ok: true, rooms: roomCount() }));
});

const wss = new WebSocketServer({ server, maxPayload: MAX_MESSAGE_BYTES });

const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
const broadcast = (room, msg) => room.players.forEach((p) => send(p.ws, msg));
const pushRoom = (room) => broadcast(room, { t: 'room', room: roomView(room) });
const pushLoading = (room) =>
  broadcast(room, { t: 'loading', players: room.players.map((p) => ({ id: p.id, pct: p.pct, loaded: p.loaded })) });
/** Loading screen sync: the match only begins once every machine still in the room has loaded it. */
const checkGo = (room) => {
  if (!room.started || room.go || room.players.length === 0 || room.players.some((p) => !p.loaded)) return;
  room.go = true;
  broadcast(room, { t: 'go' });
};

wss.on('connection', (ws) => {
  const player = { id: randomUUID(), name: '', ws, faction: null, ready: false, pct: 0, loaded: false };
  let room = null;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  send(ws, { t: 'hello', id: player.id });

  const fail = (message) => send(ws, { t: 'error', message });
  // The room was dropped for sitting idle: back to the lobby screen.
  player.expire = () => {
    room = null;
    send(ws, { t: 'room', room: null });
    fail('Room closed: not started within 5 minutes');
  };
  const leave = () => {
    if (!room) return;
    const left = room;
    room = null;
    removePlayer(left, player.id); // the last one out deletes the room (a finished match included)
    if (!left.players.length) return;
    // Leaving a started match counts as losing it: every other machine takes that nation off the map.
    if (left.started) broadcast(left, { t: 'left', id: player.id, faction: player.faction });
    pushRoom(left);
    if (left.started) {
      pushLoading(left);
      checkGo(left); // the one who left no longer holds the others back
    }
  };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return fail('Bad message');
    }
    switch (msg?.t) {
      case 'create': {
        const code = cleanCode(msg.code);
        if (code && !validCode(code)) return fail('Room code must be 4–6 letters or digits');
        if (code && findRoom(code)) return fail('Room code already in use');
        leave();
        player.name = cleanName(msg.name, 'Player');
        const r = createRoom(cleanName(msg.room, `${player.name}'s room`), msg.slots, code);
        addPlayer(r, player);
        room = r;
        return pushRoom(room);
      }
      case 'join': {
        const r = findRoom(msg.code);
        // Both the room name and its code must match.
        if (!r || r.name.toLowerCase() !== cleanName(msg.room, '').toLowerCase()) return fail('Room not found');
        if (r === room) return pushRoom(room);
        player.name = cleanName(msg.name, 'Player');
        const err = addPlayer(r, player);
        if (err) return fail(err);
        leave();
        room = r;
        return pushRoom(room);
      }
      case 'faction': {
        if (!room) return fail('Not in a room');
        const err = pickFaction(room, player, msg.faction);
        return err ? fail(err) : pushRoom(room);
      }
      case 'ready': {
        if (!room || room.started) return;
        player.ready = !!msg.ready;
        return pushRoom(room);
      }
      case 'start': {
        if (!room) return fail('Not in a room');
        if (room.hostId !== player.id) return fail('Only the host can start');
        if (room.started) return;
        if (room.players.length < room.slots) return fail('Not enough players in the room yet');
        if (room.players.some((p) => p.id !== room.hostId && !p.ready)) return fail('Not everyone is ready');
        room.started = true;
        room.seed = Math.floor(Math.random() * 2 ** 31);
        room.go = false;
        for (const p of room.players) {
          p.pct = 0;
          p.loaded = false;
        }
        broadcast(room, { t: 'start', seed: room.seed, room: roomView(room) });
        return pushLoading(room);
      }
      case 'progress': {
        if (!room?.started || room.go) return;
        player.pct = Math.max(0, Math.min(100, Math.round(Number(msg.pct) || 0)));
        return pushLoading(room);
      }
      case 'loaded': {
        if (!room?.started || room.go) return;
        player.pct = 100;
        player.loaded = true;
        pushLoading(room);
        return checkGo(room);
      }
      case 'cmd': {
        if (!room?.started) return;
        return broadcast(room, { t: 'cmd', from: player.id, tick: msg.tick, data: msg.data });
      }
      case 'leave':
        leave();
        return send(ws, { t: 'room', room: null });
      default:
        return fail('Unknown message');
    }
  });

  ws.on('close', leave);
});

// Drop dead connections (closed laptop, lost Wi-Fi) so their rooms free up.
// Forget rooms not started within ROOM_IDLE_MS of being created.
const sweep = setInterval(() => {
  for (const room of takeExpiredRooms()) for (const p of room.players) p.expire();
}, 15_000);
wss.on('close', () => clearInterval(sweep));

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => console.log(`Black Area server on :${PORT}`));
