// Netplay signaling: hands WebRTC offers/answers between a host and up to three guests
// in a "room". Game video and input never pass through here, only connection setup.
import { WebSocketServer } from 'ws';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_GUESTS = 3;
const MAX_MESSAGE = 64 * 1024;

function roomCode(rooms) {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

export function attachSignaling(httpServer, path = '/signal') {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });
  /** @type {Map<string, {host: import('ws').WebSocket, guests: Map<string, import('ws').WebSocket>, names: Map<string,string>}>} */
  const rooms = new Map();
  let nextId = 1;

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== path) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    const id = `p${(nextId++).toString(36)}`;
    let room = null;
    let isHost = false;
    const send = (sock, msg) => sock.readyState === 1 && sock.send(JSON.stringify(msg));
    const alive = setInterval(() => ws.readyState === 1 && ws.ping(), 25000);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.t === 'host' && !room) {
        const code = roomCode(rooms);
        rooms.set(code, { host: ws, guests: new Map(), names: new Map() });
        room = code;
        isHost = true;
        send(ws, { t: 'room', room: code, id });
      } else if (msg.t === 'join' && !room) {
        const code = String(msg.room ?? '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return send(ws, { t: 'error', message: 'No game with that room code. Check the code with the host.' });
        if (r.guests.size >= MAX_GUESTS) return send(ws, { t: 'error', message: 'That game is full (4 players).' });
        room = code;
        r.guests.set(id, ws);
        const name = String(msg.name ?? 'Guest').slice(0, 24);
        r.names.set(id, name);
        send(ws, { t: 'joined', room: code, id });
        send(r.host, { t: 'peer', id, name });
      } else if (msg.t === 'signal' && room) {
        const r = rooms.get(room);
        if (!r) return;
        const target = isHost ? r.guests.get(String(msg.to)) : r.host;
        if (target) send(target, { t: 'signal', from: id, data: msg.data });
      } else if (msg.t === 'kick' && room && isHost) {
        const r = rooms.get(room);
        const g = r?.guests.get(String(msg.id));
        if (g) {
          send(g, { t: 'closed', reason: 'The host removed you from the game.' });
          g.close();
        }
      }
    });

    ws.on('close', () => {
      clearInterval(alive);
      if (!room) return;
      const r = rooms.get(room);
      if (!r) return;
      if (isHost) {
        for (const g of r.guests.values()) {
          send(g, { t: 'closed', reason: 'The host ended the game.' });
          g.close();
        }
        rooms.delete(room);
      } else {
        r.guests.delete(id);
        r.names.delete(id);
        send(r.host, { t: 'left', id });
      }
    });
  });

  return wss;
}
