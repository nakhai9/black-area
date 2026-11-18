import { createElement, House, Keyboard, Map as MapIcon, type IconNode } from 'lucide';
import { t } from '../i18n';
import { modalCloseButton } from './ModalClose';

/** How many times larger than the sidebar minimap the big map modal is. */
const BIG_MAP_SCALE = 3.5;

/** A modal on the shared template (.end-screen + .end-card + h1 + X). */
class CornerModal {
  readonly root: HTMLDivElement;
  readonly card: HTMLDivElement;
  open = false;

  constructor(title: string, extraClass: string) {
    this.root = document.createElement('div');
    this.root.className = `end-screen pause-screen ${extraClass}-screen`;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.hide();
    });
    this.card = document.createElement('div');
    this.card.className = `end-card ${extraClass}-card`;
    const h = document.createElement('h1');
    h.textContent = title;
    this.card.append(modalCloseButton(() => this.hide()), h);
    this.root.append(this.card);
    document.body.append(this.root);
  }

  show(): void {
    this.root.hidden = false;
    this.open = true;
  }

  hide(): void {
    this.root.hidden = true;
    this.open = false;
  }
}

/**
 * Bar flush with the battlefield's bottom-left corner: Home, World Map, Controls, zoom lock, war clock (then the demo status readout).
 * World Map opens the minimap BIG_MAP_SCALE times the sidebar one; Controls opens the controls guide.
 */
export class BigMap {
  readonly canvas: HTMLCanvasElement;
  readonly bar: HTMLDivElement;
  private readonly map: CornerModal;
  private readonly controls: CornerModal;

  get open(): boolean {
    return this.map.open;
  }

  /** Slot for the sidebar's zoom lock button (replaced when the sidebar is rebuilt). */
  private readonly zoomLockSlot = document.createElement('span');
  /** Slot for the sidebar's war clock (replaced when the sidebar is rebuilt). */
  private readonly warClockSlot = document.createElement('span');

  constructor(host: HTMLElement, private readonly source: HTMLCanvasElement, guide: HTMLElement, onHome: () => void) {
    this.bar = document.createElement('div');
    this.bar.className = 'corner-bar';
    const button = (icon: IconNode, label: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'corner-btn';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.append(createElement(icon, { width: 16, height: 16, 'stroke-width': 2, 'aria-hidden': 'true' }));
      b.addEventListener('click', onClick);
      return b;
    };

    this.map = new CornerModal(t('World Map'), 'bigmap');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bigmap-canvas';
    this.map.card.append(this.canvas);

    this.controls = new CornerModal(t('Controls'), 'controls');
    const help = document.createElement('section');
    help.className = 'sb-help controls-guide';
    help.append(guide);
    this.controls.card.append(help);

    this.bar.append(
      button(House, t('Home (H): jump the camera to your capital.'), onHome),
      button(MapIcon, t('World Map'), () => (this.map.open ? this.map.hide() : this.showMap())),
      button(Keyboard, t('Controls'), () => (this.controls.open ? this.controls.hide() : this.controls.show())),
      this.zoomLockSlot,
      this.warClockSlot,
    );
    this.zoomLockSlot.className = 'corner-slot';
    this.warClockSlot.className = 'corner-slot';
    host.append(this.bar);

    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || !(this.map.open || this.controls.open)) return;
        e.stopImmediatePropagation();
        this.map.hide();
        this.controls.hide();
      },
      true,
    );
  }

  /** Puts the sidebar's zoom lock toggle into the bar (after the zoom buttons). */
  setZoomLock(btn: HTMLButtonElement): void {
    btn.classList.add('corner-btn');
    this.zoomLockSlot.replaceChildren(btn);
  }

  /** Puts the sidebar's war clock into the bar, engraved (no badge background). */
  setWarClock(el: HTMLElement): void {
    this.warClockSlot.replaceChildren(el);
  }

  private showMap(): void {
    const r = this.source.getBoundingClientRect();
    // BIG_MAP_SCALE × the sidebar minimap, shrunk (same aspect) if the window is smaller.
    const fit = Math.min(1, (window.innerWidth - 120) / (r.width * BIG_MAP_SCALE), (window.innerHeight - 160) / (r.height * BIG_MAP_SCALE));
    this.canvas.style.width = `${Math.round(r.width * BIG_MAP_SCALE * fit)}px`;
    this.canvas.style.height = `${Math.round(r.height * BIG_MAP_SCALE * fit)}px`;
    this.map.show();
  }
}
