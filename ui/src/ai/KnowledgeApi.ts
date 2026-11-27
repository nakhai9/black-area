import { SERVER_URL } from '../net/NetClient';
import { cleanKnowledge, type Knowledge } from './AIDoctrine';

/**
 * AI knowledge on the game server (server/src/ai.js):
 *   GET  /api/ai/knowledge?factions=a,b&player=<id>   → learned doctrine + this player's counter + playbook
 *   GET  /api/ai/counter?player=<id>                  → this player's counter only (continuing a saved match)
 *   POST /api/ai/checkpoint                           → the match so far (on every save): the server learns the new part
 *   POST /api/ai/matches                              → the finished match: the server learns from the result
 *
 * The game never waits on it: a request that takes longer than TIMEOUT_MS is dropped and the AI plays with what it has
 * (save / last answer / defaults). Reports that could not be sent are queued in the browser and sent next time.
 */
const API = `${SERVER_URL.replace(/^ws/, 'http').replace(/\/+$/, '')}/api/ai`;
const TIMEOUT_MS = 3000;
const PLAYER_KEY = 'black-area.ai-player';
const QUEUE_KEY = 'black-area.ai-outbox';
/** Settings switch (Settings → AI learning): off = nothing is sent, nothing is fetched. */
const OFF_KEY = 'black-area.ai-learning-off';

export const learningOn = (): boolean => {
  try {
    return localStorage.getItem(OFF_KEY) !== '1';
  } catch {
    return true;
  }
};

/** Anonymous id of this browser's player (a random UUID made here once; no name, no e-mail). */
export function aiPlayerId(): string {
  try {
    let id = localStorage.getItem(PLAYER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PLAYER_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

async function getJson(path: string): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${API}${path}`, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** New match: the learned doctrine for the AI nations + this player's counter. Null = offline / slow / off. */
export async function fetchKnowledge(factions: readonly string[]): Promise<Knowledge | null> {
  if (!learningOn()) return null;
  const raw = await getJson(`/knowledge?factions=${encodeURIComponent(factions.join(','))}&player=${encodeURIComponent(aiPlayerId())}`);
  return raw ? cleanKnowledge(raw) : null;
}

/** Continuing a saved match: only this player's (updated) counter. */
export async function fetchCounter(): Promise<Knowledge['counter'] | null> {
  if (!learningOn()) return null;
  const raw = await getJson(`/counter?player=${encodeURIComponent(aiPlayerId())}`);
  return raw ? cleanKnowledge({ counter: (raw as { counter?: unknown }).counter }).counter : null;
}

/** Wakes the server (Render sleeps when idle) while the player is still in the menus. */
export function wakeServer(): void {
  if (learningOn()) void getJson('/ping');
}

type Outgoing = { path: '/checkpoint' | '/matches'; body: Record<string, unknown> };

function readQueue(): Outgoing[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as Outgoing[];
  } catch {
    return [];
  }
}

function writeQueue(q: Outgoing[]): void {
  try {
    // Only the latest report per match and kind is worth keeping (each one holds the whole match so far).
    const last = new Map<string, Outgoing>();
    for (const o of q) last.set(`${o.path}:${String(o.body.matchId)}`, o);
    localStorage.setItem(QUEUE_KEY, JSON.stringify([...last.values()].slice(-20)));
  } catch {
    /* storage full / blocked: the report is lost, the game goes on */
  }
}

async function post(o: Outgoing): Promise<boolean> {
  try {
    const r = await fetch(`${API}${o.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o.body), keepalive: true });
    return r.ok;
  } catch {
    return false;
  }
}

/** Sends a report; queued in the browser if the server cannot be reached (sent again by flushOutbox). */
export async function send(path: Outgoing['path'], body: Record<string, unknown>): Promise<void> {
  if (!learningOn()) return;
  const o = { path, body: { ...body, playerId: aiPlayerId() } };
  if (!(await post(o))) writeQueue([...readQueue(), o]);
}

/** Sends what could not be sent before (called at start-up). */
export async function flushOutbox(): Promise<void> {
  if (!learningOn()) return;
  const q = readQueue();
  if (q.length === 0) return;
  const left: Outgoing[] = [];
  for (const o of q) if (!(await post(o))) left.push(o);
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(left));
  } catch {
    /* ignore */
  }
}
