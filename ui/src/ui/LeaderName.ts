import { FACTIONS } from '../factions';
import { t } from '../i18n';
import type { FactionId } from '../types';
import { factionBadge } from './FactionBadge';
import { modalCloseButton } from './ModalClose';

/** localStorage key of the player's leader name (remembered for the next game). */
const NAME_KEY = 'black-area.leaderName';
export const LEADER_NAME_MAX = 24;

/** The leader name the player gave last (empty if none). */
export function storedLeaderName(): string {
  try {
    return (localStorage.getItem(NAME_KEY) ?? '').trim().slice(0, LEADER_NAME_MAX);
  } catch {
    return '';
  }
}

/**
 * Start a new game: asks the name of the nation's leader (the player). Resolves with the name (also remembered),
 * or null when the player backs out (X / Esc) to pick again.
 */
export function askLeaderName(faction: FactionId, parent: HTMLElement = document.body): Promise<string | null> {
  const f = FACTIONS[faction];
  const root = document.createElement('div');
  root.className = 'end-screen pause-screen';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const card = document.createElement('div');
  card.className = 'end-card lc-card ln-card';
  card.style.setProperty('--end-color', '#f5c542');
  const caption = document.createElement('div');
  caption.className = 'lc-caption';
  caption.innerHTML = `<b class="lc-nation">${f.shortName}</b>`;
  const label = document.createElement('label');
  label.className = 'ln-label';
  label.textContent = t('Name of the leader of {nation}', { nation: t(f.shortName) });
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ln-input';
  input.maxLength = LEADER_NAME_MAX;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = t('Your name');
  input.value = storedLeaderName();
  label.append(input);
  const error = document.createElement('div');
  error.className = 'ln-error';
  error.hidden = true;
  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'lc-start';
  start.textContent = t('Start');
  start.style.setProperty('--faction-color', f.colors.primary);
  const actions = document.createElement('div');
  actions.className = 'pause-actions';
  actions.append(start);
  root.append(card);
  parent.append(root);

  return new Promise((resolve) => {
    const close = (name: string | null): void => {
      window.removeEventListener('keydown', onKey, true);
      root.remove();
      resolve(name);
    };
    const submit = (): void => {
      const name = input.value.replace(/\s+/g, ' ').trim();
      if (!name) {
        error.textContent = t('Please enter a name.');
        error.hidden = false;
        input.focus();
        return;
      }
      try {
        localStorage.setItem(NAME_KEY, name);
      } catch {
        /* not remembered: still used for this game */
      }
      close(name);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    input.addEventListener('input', () => (error.hidden = true));
    start.addEventListener('click', submit);
    card.append(modalCloseButton(() => close(null)), factionBadge(faction, 'lg'), caption, label, error, actions);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}
