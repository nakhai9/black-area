import type { FactionId } from '../types';

/** Deployed multiplayer server (server/ folder on Render). */
const PRODUCTION_SERVER_URL = 'https://black-area.onrender.com';

/**
 * Multiplayer server address: VITE_GAME_SERVER_API if set (http(s):// or ws(s)://), else the local server in dev
 * and the Render one in a build. http(s) is turned into the matching ws(s) for the WebSocket.
 */
export const SERVER_URL = (import.meta.env.VITE_GAME_SERVER_API || (import.meta.env.DEV ? 'http://localhost:8787' : PRODUCTION_SERVER_URL))
  .trim()
  .replace(/^http/, 'ws');

export interface RoomPlayer {
  id: string;
  name: string;
  faction: FactionId;
  ready: boolean;
}

export interface RoomView {
  code: string;
  name: string;
  hostId: string;
  started: boolean;
  maxPlayers: number;
  players: RoomPlayer[];
}

export type ServerMessage =
  | { t: 'hello'; id: string }
  | { t: 'room'; room: RoomView | null }
  | { t: 'start'; seed: number; room: RoomView }
  | { t: 'cmd'; from: string; tick: number; data: unknown }
  | { t: 'error'; message: string }
  | { t: 'loading'; players: { id: string; pct: number; loaded: boolean }[] }
  | { t: 'go' }
  | { t: 'left'; id: string; faction: FactionId };

type ClientMessage =
  | { t: 'create'; room: string; code: string; name: string; slots: number }
  | { t: 'join'; room: string; code: string; name: string }
  | { t: 'progress'; pct: number }
  | { t: 'loaded' }
  | { t: 'faction'; faction: FactionId }
  | { t: 'ready'; ready: boolean }
  | { t: 'start' }
  | { t: 'cmd'; tick: number; data: unknown }
  | { t: 'leave' };

/** One WebSocket to the multiplayer server; messages go to `onMessage`. */
export class NetClient {
  private ws: WebSocket | null = null;
  /** This player's id, given by the server on connect. */
  id = '';
  onMessage: (msg: ServerMessage) => void = () => undefined;
  onClose: () => void = () => undefined;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(SERVER_URL);
      this.ws = ws;
      let opened = false;
      ws.onmessage = (e) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(e.data)) as ServerMessage;
        } catch {
          return;
        }
        if (msg.t === 'hello') {
          this.id = msg.id;
          opened = true;
          resolve();
        }
        this.onMessage(msg);
      };
      ws.onerror = () => !opened && reject(new Error('Cannot reach the multiplayer server'));
      ws.onclose = () => {
        if (!opened) reject(new Error('Cannot reach the multiplayer server'));
        else this.onClose();
      };
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
