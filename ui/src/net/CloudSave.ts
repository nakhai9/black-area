import { SERVER_URL } from './NetClient';

/**
 * Cloud save on the game server (server/src/saves.js, MySQL): one slot per browser, overwritten on every save.
 * The slot id is a random id kept in localStorage; VITE_SAVE_API_KEY is sent if the server has SAVE_API_KEY set.
 */
const ID_KEY = 'black-area.cloudSaveId';
const API = SERVER_URL.replace(/^ws/, 'http').replace(/\/+$/, '');
const API_KEY = (import.meta.env.VITE_SAVE_API_KEY ?? '').trim();

function slotId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return 'default';
  }
}

const headers = (): Record<string, string> => ({
  'content-type': 'application/json',
  ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
});

/** Overwrites this browser's cloud save; throws with the server's message on failure. */
export async function saveToCloud(text: string): Promise<void> {
  const r = await fetch(`${API}/api/saves/${slotId()}`, { method: 'PUT', headers: headers(), body: text });
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
}

/** This browser's cloud save as JSON text, or null when there is none / the server is unreachable. */
export async function loadFromCloud(): Promise<string | null> {
  try {
    const r = await fetch(`${API}/api/saves/${slotId()}`, { headers: headers() });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}
