import { t } from '../i18n';
import { SERVER_URL } from './NetClient';

/**
 * Cloud save on the game server (server/src/saves.js, MySQL): one row per player, overwritten on every save.
 * The player id is issued by the server on the first save (POST) and kept in localStorage under ID_KEY; it stands
 * for the player until real accounts with login come. VITE_SAVE_API_KEY is sent if the server has SAVE_API_KEY set.
 */
/** localStorage key of the player id: an opaque name on purpose. */
const ID_KEY = '_x9f1eadd4cb865';
/** Former key (before v3.75.208): an id stored under it is moved to ID_KEY once. */
const LEGACY_ID_KEY = 'black-area.cloudSaveId';
const API = SERVER_URL.replace(/^ws/, 'http').replace(/\/+$/, '');
const API_KEY = (import.meta.env.VITE_SAVE_API_KEY ?? '').trim();

/** The stored player id, or null when the server has not issued one to this browser yet. */
function readId(): string | null {
  try {
    const legacy = localStorage.getItem(LEGACY_ID_KEY);
    if (legacy) {
      if (!localStorage.getItem(ID_KEY)) localStorage.setItem(ID_KEY, legacy);
      localStorage.removeItem(LEGACY_ID_KEY);
    }
    return localStorage.getItem(ID_KEY);
  } catch {
    return null;
  }
}

/** Player id for this page: read once at start, replaced by the one the server issues on the first save. */
let currentId: string | null = readId();
/** Whether this browser already had a player id when the page opened (Continue is offered). */
const returning = currentId !== null;

function storeId(id: string | null): void {
  currentId = id;
  try {
    if (id) localStorage.setItem(ID_KEY, id);
    else localStorage.removeItem(ID_KEY);
  } catch {
    /* no local storage: the id lives for this page only */
  }
}

/** This player's id issued by the server, or null before the first cloud save. */
export const playerId = (): string | null => currentId;
/** True when the browser had a player id when the page opened: the player has saved before (Continue is offered). */
export const isReturningPlayer = (): boolean => returning;

const headers = (): Record<string, string> => ({
  'content-type': 'application/json',
  ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
});

/** Runs `job` behind a dimmed backdrop with a spinner and `label` (blocks clicks while the request runs). */
async function busy<T>(label: string, job: () => Promise<T>): Promise<T> {
  const el = document.createElement('div');
  el.className = 'api-busy';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  const box = document.createElement('div');
  box.className = 'ld-box';
  const spin = document.createElement('div');
  spin.className = 'ld-spin';
  const text = document.createElement('div');
  text.textContent = label;
  box.append(spin, text);
  el.append(box);
  document.body.append(el);
  try {
    return await job();
  } finally {
    el.remove();
  }
}

/**
 * Saves to the cloud: overwrites this player's save (PUT), or, with no id yet (or one the server does not know),
 * creates it (POST) and keeps the player id the server sends back. Throws with the server's message on failure.
 */
export function saveToCloud(text: string): Promise<void> {
  return busy(t('Saving to the cloud…'), async () => {
    const fail = async (r: Response): Promise<never> => {
      throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
    };
    if (currentId) {
      const r = await fetch(`${API}/api/saves/${encodeURIComponent(currentId)}`, { method: 'PUT', headers: headers(), body: text });
      if (r.ok) return;
      if (r.status !== 404) await fail(r);
    }
    const r = await fetch(`${API}/api/saves`, { method: 'POST', headers: headers(), body: text });
    if (!r.ok) await fail(r);
    const { id } = (await r.json()) as { id?: string };
    if (!id) throw new Error('The server sent no player id');
    storeId(id);
  });
}

/** This browser's cloud save as JSON text, or null when there is none / the server is unreachable. */
export function loadFromCloud(): Promise<string | null> {
  const id = currentId;
  if (!id) return Promise.resolve(null);
  return busy(t('Loading cloud save…'), async () => {
    try {
      const r = await fetch(`${API}/api/saves/${encodeURIComponent(id)}`, { headers: headers() });
      return r.ok ? await r.text() : null;
    } catch {
      return null;
    }
  });
}

/** Key in sessionStorage: a message to toast on the main menu after the page went back to it. */
const MENU_TOAST_KEY = 'black-area.menuToast';

/** Goes back to the main menu (page reload, like Quit game) and toasts `message` there. */
export function backToMenuWithToast(message: string): void {
  try {
    sessionStorage.setItem(MENU_TOAST_KEY, message);
  } catch {
    /* no session storage: just go back */
  }
  window.location.assign(window.location.pathname);
}

/** Shows (once) the toast queued by backToMenuWithToast, if any. */
export function showPendingMenuToast(): void {
  let message: string | null = null;
  try {
    message = sessionStorage.getItem(MENU_TOAST_KEY);
    sessionStorage.removeItem(MENU_TOAST_KEY);
  } catch {
    return;
  }
  if (!message) return;
  const el = document.createElement('div');
  el.className = 'menu-toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 3500);
  setTimeout(() => el.remove(), 4000);
}

/**
 * The war is over (victory or defeat): the game cannot be continued, so its cloud save is deleted (DELETE
 * /api/saves/:id), the player id is removed from this browser (the next visit is a new player, no Continue) and the
 * page goes back to the main menu. A failed delete does not hold the player back.
 */
export async function finishGameAndReturnToMenu(): Promise<void> {
  const id = currentId;
  if (id) {
    await busy(t('Closing the game…'), async () => {
      try {
        await fetch(`${API}/api/saves/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() });
      } catch (err) {
        console.error(err);
      }
    });
  }
  storeId(null);
  window.location.assign(window.location.pathname);
}
