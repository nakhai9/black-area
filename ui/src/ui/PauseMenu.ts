import { type IconNode, Globe, ScreenShareOff, Volume2, createElement } from 'lucide';
import { setEdgeLock, settings } from '../core/Settings';
import { type Lang, languageSelect, t } from '../i18n';

/** Key in sessionStorage: set when the page reloads only to switch the language, so the save loads without asking. */
export const LANGUAGE_RELOAD_KEY = 'black-area.languageReload';

/** Background-music volume control wired into the pause menu. */
export interface MusicVolumeControl {
  get: () => number;
  set: (volume: number) => void;
}

/** Save / load actions of the pause menu. */
export interface SaveActions {
  onSave: () => void;
  /** Settings → Language: the game switches to it (carried over through a save and a reload). */
  onLanguage: (lang: Lang) => void;
}

/** Key in sessionStorage holding a save picked to be loaded (the page reloads and boots straight into it). */
export const PENDING_SAVE_KEY = 'black-area.pendingSave';

/** Opens a file picker for a saved game; on a pick, queues it and reloads the page into it. */
export function pickSaveFile(onError: (message: string) => void = (m) => window.alert(m)): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        const save = JSON.parse(text) as { format?: string };
        if (save.format !== 'black-area-save') throw new Error(t('This file is not a Black Area save.'));
        sessionStorage.setItem(PENDING_SAVE_KEY, text);
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
        return;
      }
      window.location.assign(window.location.pathname);
    });
  });
  input.click();
}

/** Esc pause modal: music volume slider, "Continue" resumes the game, "Quit game" goes back to the faction picker. */
export class PauseMenu {
  private readonly root: HTMLDivElement;
  /** Re-reads the music volume into the slider (the sound system may not exist yet at construction). */
  private readonly syncVolume: () => void;

  constructor(onContinue: () => void, music: MusicVolumeControl, saves: SaveActions, parent: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.className = 'end-screen pause-screen';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.hidden = true;
    const card = document.createElement('div');
    card.className = 'end-card';
    card.style.setProperty('--end-color', '#f5c542');
    const title = document.createElement('h1');
    title.textContent = t('SETTINGS');
    const text = document.createElement('p');
    text.textContent = t('The game is paused. Press Esc or Continue to resume.');
    const volume = document.createElement('label');
    volume.className = 'pause-volume';
    const volumeText = document.createElement('span');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    const showVolume = (): void => {
      volumeText.textContent = t('Music volume: {value}%', { value: slider.value });
    };
    this.syncVolume = (): void => {
      slider.value = String(Math.round(music.get() * 100));
      showVolume();
    };
    slider.addEventListener('input', () => {
      music.set(Number(slider.value) / 100);
      showVolume();
    });
    volume.append(volumeText, slider);
    // Screen lock: stop scrolling when the mouse leaves the browser window.
    const lock = document.createElement('label');
    lock.className = 'pause-check';
    const lockBox = document.createElement('input');
    lockBox.type = 'checkbox';
    lockBox.checked = settings.edgeLock;
    lockBox.addEventListener('change', () => setEdgeLock(lockBox.checked));
    const lockText = document.createElement('span');
    lockText.textContent = t('Stop scrolling the screen when the mouse leaves the browser window');
    lock.append(lockBox, lockText);
    // Settings, one per line: icon, then its control.
    const row = (icon: IconNode, title: string, control: HTMLElement): HTMLDivElement => {
      const r = document.createElement('div');
      r.className = 'pause-setting';
      r.title = title;
      const i = createElement(icon, { width: 20, height: 20, 'stroke-width': 2, 'aria-hidden': 'true' });
      r.append(i, control);
      return r;
    };
    const settingsBox = document.createElement('div');
    settingsBox.className = 'pause-settings';
    settingsBox.append(
      row(ScreenShareOff, t('Screen lock'), lock),
      row(Volume2, t('Volume'), volume),
      row(Globe, t('Language'), languageSelect((lang) => saves.onLanguage(lang))),
    );
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.textContent = t('Continue');
    resume.addEventListener('click', onContinue);
    const quit = document.createElement('button');
    quit.type = 'button';
    quit.textContent = t('Quit game');
    // Reload without query params (e.g. ?faction=…) so the faction picker opens again.
    quit.addEventListener('click', () => window.location.assign(window.location.pathname));
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = t('Save game');
    save.title = t('Download this game as a .json file, to continue it later with Load saved game.');
    save.addEventListener('click', () => saves.onSave());
    const actions = document.createElement('div');
    actions.className = 'pause-actions';
    actions.append(resume, save, quit);
    card.append(title, text, settingsBox, actions);
    this.root.append(card);
    parent.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    if (open) this.syncVolume();
    this.root.hidden = !open;
  }
}
