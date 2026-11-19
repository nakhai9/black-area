import { t } from '../i18n';

/** Material Design "rocket-launch" icon (Pictogrammers, Apache 2.0). */
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="m13.16 22.19l-1.66-3.84c1.6-.58 3.07-1.35 4.43-2.27l-2.78 6.11m-7.5-9.69l-3.84-1.65l6.11-2.78a20 20 0 0 0-2.27 4.43M21.66 2.35S23.78 7.31 18.11 13c-2.2 2.17-4.58 3.5-6.73 4.34c-.74.28-1.57.1-2.12-.46l-2.13-2.13c-.56-.56-.74-1.38-.47-2.13C7.5 10.5 8.83 8.09 11 5.89C16.69.216 21.66 2.35 21.66 2.35M6.25 22H4.84l4.09-4.1c.3.21.63.36.97.45zM2 22v-1.41l4.77-4.78l1.43 1.42L3.41 22zm0-2.84v-1.41l3.65-3.65c.09.35.24.68.45.97zM16 6a2 2 0 1 0 0 4c1.11 0 2-.89 2-2a2 2 0 0 0-2-2"/></svg>';

/** m:ss, rounded up to the whole second. */
function clock(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type SiloButtonState = { kind: 'hidden' } | { kind: 'ready'; aiming: boolean } | { kind: 'loading'; seconds: number } | { kind: 'unpaid' } | { kind: 'busy' };

/**
 * Launch button of a selected RS-24 Yars silo (bottom centre of the battlefield): the rocket icon; pressed while a
 * missile is ready, it starts aiming (the next click on the map picks the strike point). Shows the loading countdown
 * otherwise.
 */
export class SiloButton {
  private readonly el: HTMLButtonElement;
  private last = '';

  constructor(host: HTMLElement, onPress: () => void) {
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.style.cssText =
      'position:absolute;left:50%;bottom:18px;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:6px 14px 6px 10px;' +
      'border:1px solid #c9a227;border-radius:8px;background:rgba(16,22,18,0.88);color:#f1d36a;font:600 14px system-ui,sans-serif;cursor:pointer;z-index:20;';
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.el.disabled) onPress();
    });
    host.appendChild(this.el);
  }

  update(state: SiloButtonState): void {
    const key = JSON.stringify(state);
    if (key === this.last) return;
    this.last = key;
    if (state.kind === 'hidden') {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = 'flex';
    const ready = state.kind === 'ready';
    this.el.disabled = !ready;
    this.el.style.opacity = ready ? '1' : '0.6';
    this.el.style.cursor = ready ? 'pointer' : 'default';
    this.el.style.background = ready && state.aiming ? 'rgba(120,24,18,0.92)' : 'rgba(16,22,18,0.88)';
    const label =
      state.kind === 'ready'
        ? state.aiming
          ? t('Pick the strike point (Esc: cancel)')
          : t('Launch')
        : state.kind === 'loading'
          ? t('Loading {time}', { time: clock(state.seconds) })
          : state.kind === 'unpaid'
            ? t('Not enough money for a missile')
            : t('Launching…');
    this.el.innerHTML = `${ICON}<span>${label}</span>`;
  }
}
