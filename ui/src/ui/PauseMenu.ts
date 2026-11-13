import { type IconNode, Car, Globe, Music, ScreenShareOff, ZoomIn, X, createElement } from 'lucide';
import { setEdgeLock, setZoomLock, settings } from '../core/Settings';
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
    // Spinner overlay while the file is read and the page reloads into it.
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loading-text');
    if (loading) {
      loading.classList.remove('error');
      if (loadingText) loadingText.textContent = t('Loading save…');
      loading.hidden = false;
    }
    const hideLoading = (): void => {
      if (loading) loading.hidden = true;
    };
    void file.text().then((text) => {
      try {
        const save = JSON.parse(text) as { format?: string };
        if (save.format !== 'black-area-save') throw new Error(t('This file is not a Black Area save.'));
        sessionStorage.setItem(PENDING_SAVE_KEY, text);
      } catch (err) {
        hideLoading();
        onError(err instanceof Error ? err.message : String(err));
        return;
      }
      window.location.assign(window.location.pathname);
    }, (err: unknown) => {
      hideLoading();
      onError(err instanceof Error ? err.message : String(err));
    });
  });
  input.click();
}

/** Esc pause modal: music volume slider, "Continue" resumes the game, "Quit game" goes back to the faction picker. */
export class PauseMenu {
  private readonly root: HTMLDivElement;
  /** Re-reads the music volume into the slider (the sound system may not exist yet at construction). */
  private readonly syncVolume: () => void;

  constructor(onContinue: () => void, music: MusicVolumeControl, vehicles: MusicVolumeControl, saves: SaveActions, parent: HTMLElement = document.body) {
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
    // One slider per volume: background music, vehicle / aircraft engines.
    const syncs: (() => void)[] = [];
    const volumeSlider = (control: MusicVolumeControl, label: string): HTMLLabelElement => {
      const wrap = document.createElement('label');
      wrap.className = 'pause-volume';
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.step = '1';
      slider.setAttribute('aria-label', label);
      syncs.push(() => {
        slider.value = String(Math.round(control.get() * 100));
      });
      slider.addEventListener('input', () => control.set(Number(slider.value) / 100));
      wrap.append(slider);
      return wrap;
    };
    const volume = volumeSlider(music, t('Music volume'));
    const vehicleVolume = volumeSlider(vehicles, t('Vehicle volume'));
    this.syncVolume = (): void => syncs.forEach((f) => f());
    // Screen lock: stop scrolling when the mouse leaves the browser window.
    const lock = document.createElement('label');
    lock.className = 'pause-check';
    const lockBox = document.createElement('input');
    lockBox.type = 'checkbox';
    lockBox.checked = settings.edgeLock;
    lockBox.addEventListener('change', () => setEdgeLock(lockBox.checked));
    const lockText = document.createElement('span');
    lockText.textContent = t('No scrolling when mouse is outside');
    lock.append(lockBox, lockText);
    // Zoom lock: the wheel and +/- keys stop zooming.
    const zoomLock = document.createElement('label');
    zoomLock.className = 'pause-check';
    const zoomBox = document.createElement('input');
    zoomBox.type = 'checkbox';
    zoomBox.checked = settings.zoomLock;
    zoomBox.addEventListener('change', () => setZoomLock(zoomBox.checked));
    const zoomText = document.createElement('span');
    zoomText.textContent = t('Lock zoom');
    zoomLock.append(zoomBox, zoomText);
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
      row(ZoomIn, t('Zoom lock'), zoomLock),
      row(Music, t('Music volume'), volume),
      row(Car, t('Vehicle volume'), vehicleVolume),
      row(Globe, t('Language'), languageSelect((lang) => saves.onLanguage(lang), false)),
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
    // Same X as every other modal: closes the menu, like Continue.
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'modal-close';
    x.title = t('Close');
    x.setAttribute('aria-label', t('Close'));
    x.append(createElement(X, { width: 18, height: 18, 'stroke-width': 2.5, 'aria-hidden': 'true' }));
    x.addEventListener('click', onContinue);
    card.append(x, title, settingsBox, actions);
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
