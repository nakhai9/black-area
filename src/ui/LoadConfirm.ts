import { FACTIONS } from '../factions';
import type { FactionId } from '../types';

/**
 * Shown when a saved game was picked, before anything is generated: which save, a "Start" button (Enter too)
 * that goes on to build the map and load the save into it, and a "Main menu" button back to the faction picker.
 */
export function confirmLoadedGame(info: { faction: FactionId; savedAt: string }, parent: HTMLElement = document.body): Promise<void> {
  const f = FACTIONS[info.faction];
  const root = document.createElement('div');
  root.className = 'end-screen pause-screen';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const card = document.createElement('div');
  card.className = 'end-card';
  card.style.setProperty('--end-color', '#f5c542'); // same as the pause menu
  const title = document.createElement('h1');
  title.textContent = 'LOAD GAME';
  const text = document.createElement('p');
  const when = new Date(info.savedAt);
  text.textContent = `${f.name} — saved ${Number.isNaN(when.getTime()) ? info.savedAt : when.toLocaleString()}. Press Start to load the map and continue the war.`;
  const start = document.createElement('button');
  start.type = 'button';
  start.textContent = 'Start';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Main menu';
  back.title = 'Leave the loaded game and go back to the faction picker.';
  // Reload without query params so the faction picker opens again (same as the pause menu's Quit game).
  back.addEventListener('click', () => window.location.assign(window.location.pathname));
  const actions = document.createElement('div');
  actions.className = 'pause-actions';
  actions.append(start, back);
  card.append(title, text, actions);
  root.append(card);
  parent.append(root);
  start.focus();
  return new Promise((resolve) => {
    const go = (): void => {
      window.removeEventListener('keydown', onKey);
      root.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        go();
      }
    };
    window.addEventListener('keydown', onKey);
    start.addEventListener('click', go);
  });
}
