import { t } from '../i18n';
import { modalCloseButton } from './ModalClose';

/** Where to keep the game when quitting ('none': quit without saving). */
export type SaveTarget = 'cloud' | 'file' | 'none';

/** Pause menu → Quit game: asks how to keep the game first. Resolves with the choice, or null when closed (X / Esc). */
export function askSaveTarget(parent: HTMLElement = document.body): Promise<SaveTarget | null> {
  const root = document.createElement('div');
  root.className = 'end-screen pause-screen save-choice';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const card = document.createElement('div');
  card.className = 'end-card';
  card.style.setProperty('--end-color', '#f5c542');
  const title = document.createElement('h1');
  title.textContent = t('Save before quitting?');
  const cloud = document.createElement('button');
  cloud.type = 'button';
  cloud.textContent = t('Save to cloud');
  cloud.title = t('Saved on the server: continue it later with Continue on the main menu.');
  const file = document.createElement('button');
  file.type = 'button';
  file.textContent = t('Save to file');
  file.title = t('Download this game as a .json file, to continue it later with Import saved file.');
  const none = document.createElement('button');
  none.type = 'button';
  none.textContent = t('Quit without saving');
  const actions = document.createElement('div');
  actions.className = 'pause-actions';
  actions.append(cloud, file, none);
  root.append(card);
  parent.append(root);

  return new Promise((resolve) => {
    const close = (choice: SaveTarget | null): void => {
      window.removeEventListener('keydown', onKey, true);
      root.remove();
      resolve(choice);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(null);
    };
    window.addEventListener('keydown', onKey, true);
    cloud.addEventListener('click', () => close('cloud'));
    file.addEventListener('click', () => close('file'));
    none.addEventListener('click', () => close('none'));
    card.append(modalCloseButton(() => close(null)), title, actions);
    cloud.focus();
  });
}
