import { createElement, ShoppingCart, Pause, Play, House, Map as MapIcon, Radiation, Rocket, Settings as SettingsIcon, type IconNode } from 'lucide';
import { factionBadgeHtml } from './FactionBadge';
import type { FactionId } from '../types';
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
  /** Preparation halted by the player (no paying, no loading). */
  halted: boolean;
  /** Still preparing (not loaded): the pause / resume button is usable. */
  canHalt: boolean;
}

/** Width (px) of the old corner minimap the big map is measured from. */
const BASE_W = 220;

/** How many times larger than the old corner minimap the big map modal is. */
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
  /** A silo tile clicked (not its Launch button): jump the camera to that silo. */
  onSiloFocus: (id: number) => void = () => {};
  /** Pause / resume a silo's preparation. */
  onSiloPause: (id: number) => void = () => {};

  get nuclearOpen(): boolean {
    return this.nuclear.open;
  }

  get open(): boolean {
    return this.map.open;
  }

  /** Slot for the sidebar's zoom lock button (replaced when the sidebar is rebuilt). */
  private readonly zoomLockSlot = document.createElement('span');
  /** Slot for the sidebar's war clock (replaced when the sidebar is rebuilt): in the dock, under the logo. */
  private readonly warClockSlot = document.createElement('span');
  /**
   * Command dock at the bottom of the battlefield: (1) the game logo with the nation's flag, (2) the peace / war clock
   * under it, then one row of buttons: home, world map, build, defense, infantry, vehicles, aircraft, loan, nuclear
   * briefcase, settings, allies. The cart button opens the sidebar's shop drawer.
   */
  private readonly dock = document.createElement('div');
  /** The nation's emblem with its flag, exactly as on the sidebar's faction card (factionBadgeHtml). */
  private readonly dockBadge = document.createElement('div');
  private readonly dockProduction = document.createElement('span');
  /** Screen tools in the dock: controls guide, full screen, zoom lock. */
  private readonly dockTools = document.createElement('span');
  /** Slot for the nation's money (filled by setDock). */
  private readonly dockCredits = document.createElement('div');
  private readonly dockLoan = document.createElement('span');
  private readonly dockTail = document.createElement('span');
  /** The selected unit's / structure's action buttons (filled by setDock). */
  private readonly dockActions = document.createElement('span');
  /** Slot for the sidebar's show button (seen only while the sidebar is hidden). */
  private readonly openerSlot = document.createElement('span');

  constructor(host: HTMLElement, guide: HTMLElement, onHome: () => void) {
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

    this.nuclearBtn = button(Radiation, t('Nuclear briefcase control panel'), () => {
      if (this.nuclear.open) return this.nuclear.hide();
      // Opened afresh: the silo list is rebuilt from the silos standing now (a sold / lost silo never lingers).
      this.nuclearKey = '';
      this.nuclearList.replaceChildren();
      this.nuclear.show();
    });
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

    // Top corner keeps only the screen tools: controls guide, full screen, zoom lock, show-sidebar.
    // The screen tools (controls guide, full screen, zoom lock) moved into the command dock: the top corner stays empty.
    // (Controls guide: a tab of World Monitor & News; full screen: in Settings.)
    const tools: HTMLButtonElement[] = [];
    for (const b of tools) b.className = 'cmd-btn';
    this.dockTools.className = 'cmd-slot';
    this.dockTools.append(...tools, this.zoomLockSlot);
    this.bar.hidden = true;

    // Command dock (bottom of the battlefield).
    this.dock.className = 'cmd-dock';
    const brand = document.createElement('div');
    brand.className = 'cmd-brand';
    this.dockBadge.className = 'cmd-brand-top';
    const top = this.dockBadge;
    this.warClockSlot.className = 'cmd-clock';
    brand.append(top, this.warClockSlot);
    const row = document.createElement('div');
    row.className = 'cmd-row';
    this.nuclearBtn.classList.add('cmd-btn');
    this.dockProduction.className = 'cmd-shop';
    this.dockLoan.className = 'cmd-slot';
    this.dockTail.className = 'cmd-slot';
    this.dockActions.className = 'cmd-slot';
    const dockButton = (icon: IconNode, label: string, onClick: () => void): HTMLButtonElement => {
      const b = button(icon, label, onClick);
      b.className = 'cmd-btn';
      return b;
    };
    row.append(
      dockButton(House, t('Home (H): jump the camera to your capital.'), onHome),
      dockButton(MapIcon, t('World Map (Tab)'), () => this.toggleMap()),
      this.dockProduction,
      this.dockLoan,
      this.nuclearBtn,
      this.dockTail,
      this.dockTools,
      this.dockActions,
    );
    // Money above the buttons (right-aligned), the button row under it.
    const side = document.createElement('div');
    side.className = 'cmd-side';
    side.append(this.dockCredits, row);
    this.dock.append(brand, side);
    host.append(this.dock);
    this.openerSlot.className = 'corner-slot';
    this.zoomLockSlot.className = 'corner-slot';
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

  /** World Map open / close (Tab). */
  toggleMap(): void {
    if (this.map.open) this.map.hide();
    else this.showMap();
  }

  /** Puts the sidebar's zoom lock toggle into the bar (after the zoom buttons). */
  setZoomLock(btn: HTMLButtonElement): void {
    btn.classList.add('cmd-btn');
    this.zoomLockSlot.replaceChildren(btn);
  }

  /** Puts the sidebar's show button at the end of the bar (it shows only while the sidebar is hidden). */
  setOpener(btn: HTMLButtonElement): void {
    btn.classList.add('corner-btn');
    this.openerSlot.replaceChildren(btn);
  }

  /**
   * Fills the dock from a (new) sidebar: the nation's flag beside the logo, the money and power bar, the shop cart,
   * the loan button, the oil / capitals / news buttons, and the settings / allies buttons. Replaces whatever a previous sidebar put.
   */
  setDock(o: { faction: FactionId; onShop: () => void; credits: HTMLElement; extras: readonly HTMLElement[]; loan: HTMLElement; onSettings: () => void; actions?: HTMLElement }): void {
    this.dockActions.replaceChildren(...(o.actions ? [o.actions] : []));
    this.dockBadge.innerHTML = factionBadgeHtml(o.faction, 'sm');
    this.dockCredits.replaceChildren(o.credits);
    // Cart: opens the shop drawer (the buy tabs and their cameos).
    const cart = document.createElement('button');
    cart.type = 'button';
    cart.className = 'cmd-btn cmd-cart';
    cart.title = t('Shop: build structures and defenses, train soldiers, vehicles and aircraft');
    cart.setAttribute('aria-label', t('Shop'));
    cart.append(createElement(ShoppingCart, { width: 18, height: 18, 'stroke-width': 2, 'aria-hidden': 'true' }));
    cart.addEventListener('click', o.onShop);
    this.dockProduction.className = 'cmd-slot';
    this.dockProduction.hidden = false;
    this.dockProduction.replaceChildren(cart);
    o.loan.classList.add('cmd-loan');
    this.dockLoan.replaceChildren(o.loan);
    const tail = (icon: IconNode, label: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cmd-btn';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.append(createElement(icon, { width: 18, height: 18, 'stroke-width': 2, 'aria-hidden': 'true' }));
      b.addEventListener('click', onClick);
      return b;
    };
    this.dockTail.replaceChildren(...o.extras, tail(SettingsIcon, t('Settings'), o.onSettings)); // (Allies dropped: the Occupied capitals button shows the same)
  }

  /** Puts the sidebar's war clock into the dock, under the logo. */
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
    const key = silos.map((s) => `${s.id}:${s.label}:${s.status}:${s.ready}:${s.lamp}:${s.halted}:${s.canHalt}`).join('|');
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
        // pointerdown, not click: the panel is rebuilt while a countdown ticks, which could swallow a click.
        fire.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.nuclear.hide();
          this.onSiloLaunch(s.id);
        });
        tile.title = t('Go to silo {label}', { label: s.label });
        tile.style.cursor = 'pointer';
        tile.addEventListener('click', () => {
          this.nuclear.hide();
          this.onSiloFocus(s.id);
        });
        // Pause / resume preparation: paused, no more money goes into this silo and its loading stops.
        const hold = document.createElement('button');
        hold.type = 'button';
        hold.className = 'nuclear-launch nuclear-pause';
        const holdLabel = s.halted ? t('Resume') : t('Pause');
        hold.title = holdLabel;
        hold.setAttribute('aria-label', `${holdLabel} ${s.label}`);
        hold.append(createElement(s.halted ? Play : Pause, { width: 16, height: 16, 'stroke-width': 2.2, 'aria-hidden': 'true' }));
        hold.disabled = !s.canHalt;
        hold.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.onSiloPause(s.id);
        });
        hold.addEventListener('click', (e) => e.stopPropagation());
        tile.append(name, lamps, status, hold, fire);
        return tile;
      }),
    );
  }

  private showMap(): void {
    // Base: the size of the old corner minimap (220 px wide, 2 : 1.08).
    const r = { width: BASE_W, height: BASE_W * (1.08 / 2) };
    // BIG_MAP_SCALE × the sidebar minimap, shrunk (same aspect) if the window is smaller.
    const fit = Math.min(1, (window.innerWidth - 120) / (r.width * BIG_MAP_SCALE), (window.innerHeight - 160) / (r.height * BIG_MAP_SCALE));
    this.canvas.style.width = `${Math.round(r.width * BIG_MAP_SCALE * fit)}px`;
    this.canvas.style.height = `${Math.round(r.height * BIG_MAP_SCALE * fit)}px`;
    this.map.show();
  }
}
