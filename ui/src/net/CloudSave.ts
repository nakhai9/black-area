import { t } from '../i18n';
import { SERVER_URL } from './NetClient';

/**
 * Cloud save on the game server (server/src/saves.js, MySQL): one slot per browser, overwritten on every save.
 * The slot id is a random id kept in localStorage; VITE_SAVE_API_KEY is sent if the server has SAVE_API_KEY set.
 */
const ID_KEY = 'black-area.cloudSaveId';
const API = SERVER_URL.replace(/^ws/, 'http').replace(/\/+$/, '');
const API_KEY = (import.meta.env.VITE_SAVE_API_KEY ?? '').trim();

/**
 * Player id (stands for the player until real accounts with login come): read once per page from localStorage,
 * created and stored there on the very first visit. `returning` is false on that first visit (and whenever
 * localStorage is unavailable: a fresh id kept for this page only, never a shared fallback).
 */
const player: { id: string; returning: boolean } = (() => {
  try {
    const stored = localStorage.getItem(ID_KEY);
    if (stored) return { id: stored, returning: true };
    const id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
    return { id, returning: false };
  } catch {
    return { id: crypto.randomUUID(), returning: false };
  }
})();

/** This player's id (created on the first visit). */
export const playerId = (): string => player.id;
/** True when the id already existed before this visit: the player has been here before (Continue is offered). */
export const isReturningPlayer = (): boolean => player.returning;

const slotId = playerId;

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

/** Overwrites this browser's cloud save; throws with the server's message on failure. */
export function saveToCloud(text: string): Promise<void> {
  return busy(t('Saving to the cloud…'), async () => {
    const r = await fetch(`${API}/api/saves/${slotId()}`, { method: 'PUT', headers: headers(), body: text });
    if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
  });
}

/** This browser's cloud save as JSON text, or null when there is none / the server is unreachable. */
export function loadFromCloud(): Promise<string | null> {
  return busy(t('Loading cloud save…'), async () => {
    try {
      const r = await fetch(`${API}/api/saves/${slotId()}`, { headers: headers() });
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
  await busy(t('Closing the game…'), async () => {
    try {
      await fetch(`${API}/api/saves/${slotId()}`, { method: 'DELETE', headers: headers() });
    } catch (err) {
      console.error(err);
    }
  });
  try {
    localStorage.removeItem(ID_KEY);
  } catch {
    /* no local storage: nothing stored */
  }
  window.location.assign(window.location.pathname);
}
