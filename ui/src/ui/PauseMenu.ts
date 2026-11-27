import { type IconNode, Car, Globe, Maximize, Music, ScreenShareOff, ZoomIn, X, createElement } from 'lucide';
import { setEdgeLock, setZoomLock, settings } from '../core/Settings';
import { type Lang, languageSelect, t } from '../i18n';
import { adoptMatchCode, loadFromCloud } from '../net/CloudSave';

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
  /** Quit game: asks how to save (cloud / file / not at all), then back to the main menu. */
  onQuit: () => void;
  /** Settings → Language: the game switches to it (carried over through a save and a reload). */
  onLanguage: (lang: Lang) => void;
}

/** Key in sessionStorage holding a save picked to be loaded (the page reloads and boots straight into it). */
export const PENDING_SAVE_KEY = 'black-area.pendingSave';

/** Load saved game: opens a file picker for a saved game; on a pick, queues it and reloads the page into it. */
export function pickSaveFile(onError: (message: string) => void = (m) => window.alert(m)): void {
  pickSaveFromDisk(onError);
}

/** Continue: loads this browser's cloud save (server API); false when there is none or the server is unreachable. */
export async function continueLatestSave(onError: (message: string) => void = (m) => window.alert(m), matchCode?: string): Promise<boolean> {
  const cloud = await loadFromCloud(matchCode);
  if (!cloud) return false;
  if (matchCode) adoptMatchCode(matchCode); // found: this browser goes on as that player (its later saves go there too)
  loadSaveText(cloud, onError);
  return true;
}

/** Queues a save's JSON text and reloads the page into it (spinner meanwhile). */
function loadSaveText(text: string, onError: (message: string) => void): void {
  const loading = document.getElementById('loading');
  const loadingText = document.getElementById('loading-text');
  if (loading) {
    loading.classList.remove('error');
    if (loadingText) loadingText.textContent = t('Loading save…');
    loading.hidden = false;
  }
  try {
    const save = JSON.parse(text) as { format?: string };
    if (save.format !== 'black-area-save') throw new Error(t('This file is not a Black Area save.'));
    sessionStorage.setItem(PENDING_SAVE_KEY, text);
  } catch (err) {
    if (loading) loading.hidden = true;
    onError(err instanceof Error ? err.message : String(err));
    return;
  }
  window.location.assign(window.location.pathname);
}

/** Opens a file picker for a saved game; on a pick, queues it and reloads the page into it. */
function pickSaveFromDisk(onError: (message: string) => void): void {
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
    // Settings in groups (Display / Sound / Language), one per line: neutral icon, name, its control on the right.
    const syncs: (() => void)[] = [];
    /** A switch (checkbox styled as a toggle). */
    const toggle = (checked: () => boolean, onChange: (on: boolean) => void): HTMLLabelElement => {
      const wrap = document.createElement('label');
      wrap.className = 'pause-switch';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = checked();
      box.addEventListener('change', () => onChange(box.checked));
      syncs.push(() => (box.checked = checked()));
      const knob = document.createElement('span');
      knob.className = 'pause-switch-track';
      wrap.append(box, knob);
      return wrap;
    };
    /** A volume slider with its percentage. */
    const volumeSlider = (control: MusicVolumeControl, label: string): HTMLLabelElement => {
      const wrap = document.createElement('label');
      wrap.className = 'pause-volume';
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.step = '1';
      slider.setAttribute('aria-label', label);
      const pct = document.createElement('span');
      pct.className = 'pause-volume-pct';
      const show = (): void => {
        pct.textContent = `${slider.value}%`;
      };
      syncs.push(() => {
        slider.value = String(Math.round(control.get() * 100));
        show();
      });
      slider.addEventListener('input', () => {
        control.set(Number(slider.value) / 100);
        show();
      });
      wrap.append(slider, pct);
      return wrap;
    };
    this.syncVolume = (): void => syncs.forEach((f) => f());
    const row = (icon: IconNode, name: string, hint: string, control: HTMLElement): HTMLDivElement => {
      const r = document.createElement('div');
      r.className = 'pause-setting';
      r.append(createElement(icon, { width: 18, height: 18, 'stroke-width': 2, 'aria-hidden': 'true' }));
      const text = document.createElement('div');
      text.className = 'pause-setting-text';
      const n = document.createElement('div');
      n.className = 'pause-setting-name';
      n.textContent = name;
      text.append(n);
      if (hint) {
        const h = document.createElement('div');
        h.className = 'pause-setting-hint';
        h.textContent = hint;
        text.append(h);
      }
      r.append(text, control);
      return r;
    };
    const group = (name: string, ...rows: HTMLElement[]): HTMLElement => {
      const g = document.createElement('section');
      g.className = 'pause-group';
      const h = document.createElement('h2');
      h.className = 'pause-group-title';
      h.textContent = name;
      g.append(h, ...rows);
      return g;
    };
    // Full screen (moved here from the dock): follows the browser's own state (Esc / F11 leave it too).
    const fullscreen = toggle(
      () => !!document.fullscreenElement,
      (on) => {
        if (on) void document.documentElement.requestFullscreen().catch(() => undefined);
        else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      },
    );
    document.addEventListener('fullscreenchange', () => this.syncVolume());
    const zoom = toggle(() => settings.zoomLock, (on) => setZoomLock(on));
    window.addEventListener('black-area:zoomlock', () => this.syncVolume());
    const settingsBox = document.createElement('div');
    settingsBox.className = 'pause-settings';
    settingsBox.append(
      group(
        t('Display'),
        row(Maximize, t('Full screen'), '', fullscreen),
        row(ZoomIn, t('Lock zoom'), t('The mouse wheel and +/- keys stop zooming'), zoom),
        row(ScreenShareOff, t('Screen lock'), t('No scrolling when mouse is outside'), toggle(() => settings.edgeLock, (on) => setEdgeLock(on))),
      ),
      group(t('Sound'), row(Music, t('Music volume'), '', volumeSlider(music, t('Music volume'))), row(Car, t('Vehicle volume'), '', volumeSlider(vehicles, t('Vehicle volume')))),
      group(t('Language'), row(Globe, t('Language'), '', languageSelect((lang) => saves.onLanguage(lang), false))),
    );
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.textContent = t('Continue');
    resume.addEventListener('click', onContinue);
    const quit = document.createElement('button');
    quit.type = 'button';
    quit.textContent = t('Quit game');
    quit.addEventListener('click', () => saves.onQuit());
    // Only Continue and Quit game (no Save game button).
    const actions = document.createElement('div');
    actions.className = 'pause-actions';
    actions.append(resume, quit);
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
