import { createElement, House, Keyboard, Map as MapIcon, Radiation, Rocket, type IconNode } from 'lucide';
import { t } from '../i18n';
import { modalCloseButton } from './ModalClose';

/** One silo row of the nuclear briefcase panel. */
export interface NuclearSiloRow {
  id: number;
  label: string;
  status: string;
  ready: boolean;
  /** Which of the three lamps is lit: yellow preparing, red short of power, green ready to fire. */
  lamp: 'prep' | 'power' | 'ready';
}

/** How many times larger than the sidebar minimap the big map modal is. */
const BIG_MAP_SCALE = 3.5;

/** A modal on the shared template (.end-screen + .end-card + h1 + X). */
class CornerModal {
  readonly root: HTMLDivElement;
  readonly card: HTMLDivElement;
  readonly heading: HTMLHeadingElement;
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
    const h = (this.heading = document.createElement('h1'));
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
  private readonly nuclear: CornerModal;
  private readonly nuclearList = document.createElement('div');
  /** Readout above the silos: armed lamp and how many silos are ready out of all. */
  private readonly nuclearHead = document.createElement('div');
  private nuclearKey = '';
  /** Corner-bar button that opens the briefcase: disabled without a silo, green with one ready to fire. */
  private readonly nuclearBtn: HTMLButtonElement;
  private nuclearState = '';
  /** Launch pressed for a silo in the nuclear briefcase panel. */
  onSiloLaunch: (id: number) => void = () => {};

  get nuclearOpen(): boolean {
    return this.nuclear.open;
  }

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

    this.nuclearBtn = button(Radiation, t('Nuclear briefcase control panel'), () => (this.nuclear.open ? this.nuclear.hide() : this.nuclear.show()));
    this.nuclearBtn.classList.add('nuclear-btn');
    this.setNuclearState(false, false);

    this.map = new CornerModal(t('World Map'), 'bigmap');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bigmap-canvas';
    this.map.card.append(this.canvas);

    this.controls = new CornerModal(t('Controls'), 'controls');
    const help = document.createElement('section');
    help.className = 'sb-help controls-guide';
    help.append(guide);
    this.controls.card.append(help);

    this.nuclear = new CornerModal(t('Nuclear Briefcase'), 'nuclear');
    this.nuclearHead.className = 'nuclear-head';
    this.nuclearList.className = 'nuclear-list';
    this.nuclear.card.append(this.nuclearHead, this.nuclearList);
    this.setSilos([]);

    this.bar.append(
      this.warClockSlot,
      button(House, t('Home (H): jump the camera to your capital.'), onHome),
      button(MapIcon, t('World Map'), () => (this.map.open ? this.map.hide() : this.showMap())),
      button(Keyboard, t('Controls'), () => (this.controls.open ? this.controls.hide() : this.controls.show())),
      this.nuclearBtn,
      this.zoomLockSlot,
    );
    this.zoomLockSlot.className = 'corner-slot';
    this.warClockSlot.className = 'corner-slot';
    host.append(this.bar);

    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || !(this.map.open || this.controls.open || this.nuclear.open)) return;
        e.stopImmediatePropagation();
        this.map.hide();
        this.controls.hide();
        this.nuclear.hide();
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

  /** Briefcase button state: disabled while the nation has no silo, green once at least one is ready to fire. */
  setNuclearState(hasSilo: boolean, anyReady: boolean): void {
    const key = `${hasSilo}:${anyReady}`;
    if (key === this.nuclearState) return;
    this.nuclearState = key;
    this.nuclearBtn.disabled = !hasSilo;
    this.nuclearBtn.classList.toggle('ready', hasSilo && anyReady);
    // Optional: also called from the constructor, before the briefcase modal exists.
    if (!hasSilo && this.nuclear?.open) this.nuclear.hide();
  }

  /** Title of the nuclear briefcase panel: the name the commanding nation gives its briefcase. */
  setNuclearTitle(title: string): void {
    this.nuclear.heading.textContent = title;
  }

  /**
   * Nuclear briefcase panel: every silo of the nation, its state and its own Launch button (the only launch control:
   * the silo has no button on the battlefield). Rebuilt only when a row changes.
   */
  setSilos(silos: readonly NuclearSiloRow[]): void {
    const key = silos.map((s) => `${s.id}:${s.label}:${s.status}:${s.ready}:${s.lamp}`).join('|');
    if (key === this.nuclearKey && this.nuclearList.childElementCount > 0) return;
    this.nuclearKey = key;
    const ready = silos.filter((s) => s.ready).length;
    const lamp = document.createElement('span');
    lamp.className = `nuclear-lamp${ready > 0 ? ' on' : ''}`;
    const state = document.createElement('span');
    state.className = 'nuclear-state';
    state.textContent = ready > 0 ? t('ARMED') : t('STANDBY');
    const count = document.createElement('span');
    count.className = 'nuclear-count';
    count.textContent = t('Ready {n}/{total}', { n: ready, total: silos.length });
    this.nuclearHead.classList.toggle('armed', ready > 0);
    this.nuclearHead.replaceChildren(lamp, state, count);
    if (silos.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'nuclear-empty';
      empty.append(createElement(Radiation, { width: 28, height: 28, 'stroke-width': 1.5, 'aria-hidden': 'true' }), document.createTextNode(t('No silo is ready to fire.')));
      this.nuclearList.replaceChildren(empty);
      return;
    }
    this.nuclearList.replaceChildren(
      ...silos.map((s) => {
        const tile = document.createElement('div');
        tile.className = `nuclear-tile${s.ready ? ' ready' : ''}`;
        const name = document.createElement('div');
        name.className = 'nuclear-name';
        name.textContent = s.label;
        // Three lamps: yellow (preparing), red (short of power), green (ready to fire); only the current one is lit.
        const lamps = document.createElement('div');
        lamps.className = 'nuclear-lamps';
        for (const [kind, label] of [
          ['prep', t('Preparing')],
          ['power', t('Low power')],
          ['ready', t('Ready to fire')],
        ] as const) {
          const dot = document.createElement('span');
          dot.className = `nuclear-dot ${kind}${s.lamp === kind ? ' on' : ''}`;
          dot.title = label;
          lamps.append(dot);
        }
        lamps.setAttribute('aria-label', s.lamp === 'ready' ? t('Ready to fire') : s.lamp === 'power' ? t('Low power') : t('Preparing'));
        const status = document.createElement('div');
        status.className = 'nuclear-status';
        status.textContent = s.status;
        const fire = document.createElement('button');
        fire.type = 'button';
        fire.className = 'nuclear-launch';
        fire.title = t('Launch');
        fire.setAttribute('aria-label', `${t('Launch')} ${s.label}`);
        fire.append(createElement(Rocket, { width: 16, height: 16, 'stroke-width': 2.2, 'aria-hidden': 'true' }));
        fire.disabled = !s.ready;
        fire.addEventListener('click', () => {
          this.nuclear.hide();
          this.onSiloLaunch(s.id);
        });
        tile.append(name, lamps, status, fire);
        return tile;
      }),
    );
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
