import { type IconNode, Hammer, PersonStanding, Shield, Truck, createElement } from 'lucide';
import { CURRENCY, regularsNeededFor } from '../constants';
import { FACTIONS } from '../factions';
import { getFlagTexture } from '../render/Flags';
import type { BuildOption, QueueSlot } from '../systems/ConstructionSystem';
import type { ArmyRatio, TrainOption, TrainingQueue } from '../systems/TrainingSystem';
import type { VehicleOption, VehicleQueue } from '../systems/VehicleSystem';
import type { BuildingType, PlayerState } from '../types';

type TabId = 'build' | 'defense' | 'infantry' | 'vehicles';

/** Names shown on locked cameos. */
const TYPE_LABEL: Readonly<Partial<Record<BuildingType, string>>> = {
  barracks: 'BARRACKS',
  warFactory: 'FACTORY',
  hospital: 'HOSPITAL',
  airfield: 'AIRFIELD',
};

/** Construction tabs (RA2 sidebar), shown as Lucide icons. */
const BUILD_TABS: readonly { id: TabId; label: string; icon: IconNode; enabled: boolean }[] = [
  { id: 'build', label: 'Build', icon: Hammer, enabled: true },
  { id: 'defense', label: 'Defense', icon: Shield, enabled: false },
  { id: 'infantry', label: 'Infantry', icon: PersonStanding, enabled: true },
  { id: 'vehicles', label: 'Vehicles', icon: Truck, enabled: true },
];

export interface SidebarModel {
  player: PlayerState;
  /** Total income in TB per second. */
  income: number;
  derricks: number;
  /** Derricks currently pumping (the others are resting). */
  pumping: number;
  queue: QueueSlot;
  /** True while the finished structure is being positioned on the map. */
  placing: boolean;
  training: TrainingQueue;
  vehicleQueue: VehicleQueue;
  /** Types of the player's living buildings (drives the tech tree). */
  owned: ReadonlySet<BuildingType>;
  /** Vehicles need a War Factory, aircraft an Airfield. */
  hasWarFactory: boolean;
  hasAirfield: boolean;
  /** Infantry can only be trained while the nation owns a Barracks. */
  hasBarracks: boolean;
  ratio: ArmyRatio;
}

export interface SidebarHandlers {
  /** Auto-defence switched on/off (keeps training soldiers and vehicles to protect the base). */
  onAutoDefense: (on: boolean) => void;
  /** Left click on a build cameo. */
  onBuild: (option: BuildOption) => void;
  /** Right click on a build cameo (cancel / refund). */
  onCancel: (option: BuildOption) => void;
  /** Sprite canvas used as the cameo picture. */
  preview: (option: BuildOption) => HTMLCanvasElement;
  onVehicle: (option: VehicleOption) => void;
  onVehicleCancel: (option: VehicleOption) => void;
  vehiclePreview: (option: VehicleOption) => HTMLCanvasElement;
  /** Left click on an infantry cameo: queue one soldier. */
  onTrain: (option: TrainOption) => void;
  /** Right click on an infantry cameo: remove one from the queue (refund if in training). */
  onTrainCancel: (option: TrainOption) => void;
  trainPreview: (option: TrainOption) => HTMLCanvasElement;
}

type Cameo = { el: HTMLElement; wipe: HTMLElement; state: HTMLElement; badge?: HTMLElement };

/**
 * Right-hand command bar (DOM overlay): radar, TB treasury & income, oil,
 * power, the construction tabs with their build cameos, and controls help.
 */
export class Sidebar {
  readonly minimapCanvas: HTMLCanvasElement;

  private readonly credits: HTMLElement;
  private readonly income: HTMLElement;
  private readonly derricks: HTMLElement;
  private readonly powerFill: HTMLElement;
  private readonly powerText: HTMLElement;
  private readonly message: HTMLElement;
  private readonly autoButton: HTMLElement;
  private autoDefense = false;
  private readonly radarPanel: HTMLElement;
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private readonly opener: HTMLButtonElement;
  private readonly cameos = new Map<string, Cameo>();
  private readonly unitCameos = new Map<string, Cameo>();
  private readonly vehicleCameos = new Map<string, Cameo>();
  private vehiclesSeen = false;
  private readonly panels = new Map<TabId, HTMLElement>();
  private activeTab: TabId = 'build';
  /** The Infantry tab blinks once a Barracks exists, until the player opens it. */
  private infantrySeen = false;
  private messageTimer = 0;

  constructor(
    root: HTMLElement,
    player: PlayerState,
    private readonly options: readonly BuildOption[],
    private readonly trainOptions: readonly TrainOption[],
    private readonly vehicleOptions: readonly VehicleOption[],
    private readonly handlers: SidebarHandlers,
  ) {
    const faction = FACTIONS[player.faction];
    root.innerHTML = `
      <header class="sb-header">
        <div class="sb-logo">BLACK<span>AREA</span></div>
        <div class="sb-sub">Phase 2 · Construction, Infantry &amp; Vehicles</div>
        <button class="sb-collapse" title="Hide sidebar (Tab)">⟩</button>
      </header>
      <section class="sb-panel sb-radar"><canvas class="sb-minimap"></canvas></section>
      <section class="sb-panel sb-resources">
        <div class="sb-player">
          <img class="sb-flag" src="${getFlagTexture(player.faction).toDataURL()}" alt="">
          <div>
            <div class="sb-player-name">${player.name}</div>
            <div class="sb-muted">${faction.name}</div>
          </div>
        </div>
        <div class="sb-credits"><span>0</span> <small>${CURRENCY}</small></div>
        <div class="sb-oil">INCOME <span class="sb-income"></span></div>
        <div class="sb-oil">OIL <span class="sb-derricks"></span></div>
        <button class="sb-auto" type="button" aria-pressed="false" title="Automatically train soldiers and vehicles to defend your base (F)">Auto-defense: OFF</button>
        <div class="sb-power">
          <div class="sb-power-label">POWER <span></span></div>
          <div class="sb-power-track"><div class="sb-power-fill"></div></div>
        </div>
      </section>
      <nav class="sb-tabs" aria-label="Construction"></nav>
      <section class="sb-panel sb-build">
        <div class="sb-cameos" data-panel="build"></div>
        <div class="sb-cameos" data-panel="infantry" hidden></div>
        <div class="sb-cameos" data-panel="vehicles" hidden></div>
        <div class="sb-msg" role="status" aria-live="polite"></div>
      </section>
      <section class="sb-panel sb-help">
        <h3>Controls</h3>
        <ul>
          <li><kbd>Click</kbd> cameo — build/train · <kbd>Right-click</kbd> cameo — cancel (refund)</li>
          <li>Soldiers &amp; vehicles: <kbd>Right-drag</kbd> sweep-select · <kbd>Left-click</kbd> a unit select · <kbd>Left-click</kbd> ground — move · <kbd>Right-click</kbd> deselect · <kbd>Shift</kbd> add</li>
          <li>Armed units: <kbd>Left-click</kbd> an enemy to attack · enemy engineers capture buildings · <kbd>M</kbd> sound on/off</li>
          <li>Army: 1 special per 4 regulars (5 soldiers = 4 + 1) · special forces can swim</li>
          <li>When <b>READY</b>: click cameo, then click the map to place · <kbd>Esc</kbd>/<kbd>Right-click</kbd> stop placing</li>
          <li><kbd>WASD</kbd>/<kbd>Arrows</kbd>/screen edge — scroll · <kbd>Wheel</kbd> zoom · <kbd>Middle-drag</kbd> pan</li>
          <li><kbd>Click</kbd> select · <kbd>R</kbd> rotate · <kbd>1</kbd>–<kbd>5</kbd> landmarks · <kbd>O</kbd> oil · <kbd>H</kbd> home · <kbd>Tab</kbd> sidebar</li>
        </ul>
      </section>`;

    const q = <T extends HTMLElement>(sel: string): T => {
      const el = root.querySelector<T>(sel);
      if (!el) throw new Error(`Sidebar element missing: ${sel}`);
      return el;
    };
    this.minimapCanvas = q<HTMLCanvasElement>('.sb-minimap');
    this.credits = q('.sb-credits span');
    this.income = q('.sb-income');
    this.derricks = q('.sb-derricks');
    this.powerFill = q('.sb-power-fill');
    this.powerText = q('.sb-power-label span');
    this.message = q('.sb-msg');
    this.autoButton = q('.sb-auto');
    this.autoButton.addEventListener('click', () => this.toggleAutoDefense());
    this.radarPanel = q('.sb-radar');
    // No browser context menu anywhere on the sidebar (radar, cameos, panels): right-click is a game command.
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.buildTabs(q('.sb-tabs'));
    const buildPanel = q('[data-panel=build]');
    const infantryPanel = q('[data-panel=infantry]');
    this.panels.set('build', buildPanel);
    this.panels.set('infantry', infantryPanel);
    const vehiclePanel = q('[data-panel=vehicles]');
    this.panels.set('vehicles', vehiclePanel);
    this.buildVehicleCameos(vehiclePanel);
    this.buildCameos(buildPanel);
    this.buildUnitCameos(infantryPanel);
    q('.sb-collapse').addEventListener('click', () => this.toggle());

    const opener = document.createElement('button');
    this.opener = opener;
    opener.className = 'sb-open';
    opener.title = 'Show sidebar (Tab)';
    opener.textContent = '⟨';
    opener.addEventListener('click', () => this.toggle());
    document.body.append(opener);
  }

  /** Switches automatic defence on/off (button or F key); returns the new state. */
  toggleAutoDefense(): boolean {
    this.autoDefense = !this.autoDefense;
    this.autoButton.textContent = `Auto-defense: ${this.autoDefense ? 'ON' : 'OFF'}`;
    this.autoButton.setAttribute('aria-pressed', String(this.autoDefense));
    this.autoButton.classList.toggle('on', this.autoDefense);
    this.handlers.onAutoDefense(this.autoDefense);
    this.notify(this.autoDefense ? 'Auto-defense ON — soldiers and vehicles are trained automatically.' : 'Auto-defense OFF.');
    return this.autoDefense;
  }

  toggle(): void {
    document.body.classList.toggle('sidebar-hidden');
  }

  /** Short EVA-style message under the cameos (e.g. "Construction complete"). */
  notify(text: string, seconds = 3): void {
    this.message.textContent = text;
    this.messageTimer = seconds;
  }

  update(model: SidebarModel, dt: number): void {
    const { player, queue } = model;
    this.credits.textContent = Math.floor(player.credits).toLocaleString('en-US');
    this.income.textContent = `+${model.income} ${CURRENCY}/s`;
    this.derricks.textContent = `${model.pumping}/${model.derricks} pumping`;

    const produced = player.powerProduced;
    const used = player.powerConsumed;
    this.powerText.textContent = `${used} / ${produced}`;
    // Full green bar = surplus; shrinks and turns red when demand exceeds supply.
    this.powerFill.style.width = `${produced > 0 ? (produced / Math.max(used, produced)) * 100 : 0}%`;
    this.powerFill.classList.toggle('low', used > produced);

    // The radar picture is blurred and dimmed until the nation owns an Airfield.
    this.radarPanel.classList.toggle('offline', !model.owned.has('airfield'));

    // Blink the Build tab (and the sidebar opener) while a finished structure waits.
    const awaiting = queue.state === 'ready' && !model.placing;
    this.tabButtons.get('build')?.classList.toggle('sb-attention', awaiting);
    // Infantry tab: locked without a Barracks, blinks when it first becomes available.
    const infantryTab = this.tabButtons.get('infantry');
    if (infantryTab) {
      infantryTab.disabled = !model.hasBarracks;
      infantryTab.title = model.hasBarracks ? 'Infantry' : 'Infantry (requires a Barracks)';
      infantryTab.classList.toggle('sb-attention', model.hasBarracks && !this.infantrySeen);
    }
    if (!model.hasBarracks && this.activeTab === 'infantry') this.switchTab('build');
    // Vehicles tab: unlocked by a War Factory or an Airfield; blinks until opened.
    const canMake = model.hasWarFactory || model.hasAirfield;
    const vehicleTab = this.tabButtons.get('vehicles');
    if (vehicleTab) {
      vehicleTab.disabled = !canMake;
      vehicleTab.title = canMake ? 'Vehicles & aircraft' : 'Vehicles (requires a War Factory or an Airfield)';
      vehicleTab.classList.toggle('sb-attention', canMake && !this.vehiclesSeen);
    }
    if (!canMake && this.activeTab === 'vehicles') this.switchTab('build');
    this.opener.classList.toggle(
      'sb-attention',
      awaiting || (model.hasBarracks && !this.infantrySeen) || (canMake && !this.vehiclesSeen),
    );
    this.updateVehicleCameos(model);
    this.updateUnitCameos(model);

    for (const option of this.options) {
      const c = this.cameos.get(option.id);
      if (!c) continue;
      const mine = queue.option?.id === option.id;
      const state = mine ? queue.state : 'idle';
      const busyElsewhere = !mine && queue.state !== 'idle';
      c.el.dataset.state = model.placing && mine ? 'placing' : state;
      const missing = option.requires && !model.owned.has(option.requires) ? option.requires : null;
      c.el.classList.toggle('locked', busyElsewhere || (missing !== null && !mine));
      // RA2 clock wipe: the dark sector shrinks as the build progresses.
      const remaining = mine && state !== 'ready' ? 1 - queue.progress : 0;
      c.wipe.style.background =
        mine && state !== 'idle' ? `conic-gradient(rgba(0,0,0,0.62) 0 ${remaining * 360}deg, transparent 0)` : 'none';
      c.state.textContent =
        !mine || state === 'idle'
          ? missing
            ? `NEED ${TYPE_LABEL[missing]}`
            : `${option.cost} ${CURRENCY}`
          : state === 'ready'
            ? model.placing
              ? 'PLACING'
              : 'READY'
            : state === 'onHold'
              ? `ON HOLD ${Math.floor(queue.progress * 100)}%`
              : `${Math.floor(queue.progress * 100)}%`;
    }

    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message.textContent = '';
    }
  }

  private switchTab(id: TabId): void {
    this.activeTab = id;
    if (id === 'infantry') this.infantrySeen = true;
    if (id === 'vehicles') this.vehiclesSeen = true;
    for (const [tab, btn] of this.tabButtons) {
      btn.classList.toggle('active', tab === id);
      btn.setAttribute('aria-pressed', String(tab === id));
    }
    for (const [tab, panel] of this.panels) panel.hidden = tab !== id;
  }

  private updateUnitCameos(model: SidebarModel): void {
    const q = model.training;
    const head = q.items[0];
    for (const option of this.trainOptions) {
      const c = this.unitCameos.get(option.tier);
      if (!c) continue;
      const count = q.items.filter((t) => t === option.tier).length;
      const training = head === option.tier;
      c.el.dataset.state = training ? q.state : count > 0 ? 'queued' : 'idle';
      const ratioLocked = option.tier === 'special' && model.ratio.special >= model.ratio.specialCap;
      const inOffice = option.tier === 'president' && model.ratio.presidentTaken && count === 0;
      c.el.classList.toggle('locked', !model.hasBarracks || ratioLocked || inOffice);
      if (c.badge) {
        c.badge.textContent = count > 0 ? String(count) : '';
        c.badge.hidden = count === 0;
      }
      const remaining = training ? 1 - q.progress : 0;
      c.wipe.style.background = training
        ? `conic-gradient(rgba(0,0,0,0.62) 0 ${remaining * 360}deg, transparent 0)`
        : count > 0
          ? 'rgba(0,0,0,0.45)'
          : 'none';
      c.state.textContent = !training
        ? count > 0
          ? 'QUEUED'
          : inOffice
            ? 'IN OFFICE'
            : ratioLocked
              ? `NEED ${regularsNeededFor(model.ratio.special + 1) - model.ratio.regular} MORE`
              : `${option.cost} ${CURRENCY}`
        : q.state === 'noBarracks'
          ? 'NO BARRACKS'
          : q.state === 'onHold'
            ? `ON HOLD ${Math.floor(q.progress * 100)}%`
            : `${Math.floor(q.progress * 100)}%`;
    }
  }

  private updateVehicleCameos(model: SidebarModel): void {
    const q = model.vehicleQueue;
    const head = q.items[0];
    for (const option of this.vehicleOptions) {
      const c = this.vehicleCameos.get(option.kind);
      if (!c) continue;
      const have = option.requires === 'airfield' ? model.hasAirfield : model.hasWarFactory;
      const count = q.items.filter((k) => k === option.kind).length;
      const producing = head === option.kind;
      c.el.dataset.state = producing ? q.state : count > 0 ? 'queued' : 'idle';
      c.el.classList.toggle('locked', !have);
      if (c.badge) {
        c.badge.textContent = count > 0 ? String(count) : '';
        c.badge.hidden = count === 0;
      }
      const remaining = producing ? 1 - q.progress : 0;
      c.wipe.style.background = producing
        ? `conic-gradient(rgba(0,0,0,0.62) 0 ${remaining * 360}deg, transparent 0)`
        : count > 0
          ? 'rgba(0,0,0,0.45)'
          : 'none';
      c.state.textContent = !have
        ? option.requires === 'airfield'
          ? 'NEED AIRFIELD'
          : 'NEED FACTORY'
        : !producing
          ? count > 0
            ? 'QUEUED'
            : `${option.cost} ${CURRENCY}`
          : q.state === 'onHold'
            ? `ON HOLD ${Math.floor(q.progress * 100)}%`
            : `${Math.floor(q.progress * 100)}%`;
    }
  }

  private buildVehicleCameos(container: HTMLElement): void {
    for (const option of this.vehicleOptions) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'sb-cameo';
      el.title = `${option.name} — ${option.cost} ${CURRENCY}, ${option.trainSeconds}s. ${option.description} Click to build, right-click to cancel.`;
      el.innerHTML = `
        <canvas width="128" height="96"></canvas>
        <span class="sb-cameo-wipe"></span>
        <span class="sb-cameo-name">${option.name}</span>
        <span class="sb-cameo-badge" hidden></span>
        <span class="sb-cameo-state"></span>`;
      const canvas = el.querySelector('canvas');
      if (canvas) drawPreview(canvas, this.handlers.vehiclePreview(option));
      el.addEventListener('click', () => this.handlers.onVehicle(option));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.handlers.onVehicleCancel(option);
      });
      container.append(el);
      const wipe = el.querySelector<HTMLElement>('.sb-cameo-wipe');
      const state = el.querySelector<HTMLElement>('.sb-cameo-state');
      const badge = el.querySelector<HTMLElement>('.sb-cameo-badge') ?? undefined;
      if (wipe && state) this.vehicleCameos.set(option.kind, { el, wipe, state, badge });
    }
  }

  private buildUnitCameos(container: HTMLElement): void {
    for (const option of this.trainOptions) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'sb-cameo';
      el.title = `${option.name} — ${option.cost} ${CURRENCY}, ${option.trainSeconds}s. ${option.description} Click to train, right-click to cancel.`;
      el.innerHTML = `
        <canvas width="128" height="96"></canvas>
        <span class="sb-cameo-wipe"></span>
        <span class="sb-cameo-name">${option.name}</span>
        <span class="sb-cameo-badge" hidden></span>
        <span class="sb-cameo-state"></span>`;
      const canvas = el.querySelector('canvas');
      if (canvas) drawPreview(canvas, this.handlers.trainPreview(option));
      el.addEventListener('click', () => this.handlers.onTrain(option));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.handlers.onTrainCancel(option);
      });
      container.append(el);
      const wipe = el.querySelector<HTMLElement>('.sb-cameo-wipe');
      const state = el.querySelector<HTMLElement>('.sb-cameo-state');
      const badge = el.querySelector<HTMLElement>('.sb-cameo-badge') ?? undefined;
      if (wipe && state) this.unitCameos.set(option.tier, { el, wipe, state, badge });
    }
  }

  private buildTabs(nav: HTMLElement): void {
    for (const tab of BUILD_TABS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.disabled = !tab.enabled;
      btn.dataset.tab = tab.id;
      btn.classList.toggle('active', tab.id === 'build');
      btn.title = tab.enabled ? tab.label : `${tab.label} (coming soon)`;
      if (tab.id === 'infantry' || tab.id === 'vehicles') btn.disabled = true; // unlocked by the matching building
      btn.setAttribute('aria-label', tab.label);
      btn.setAttribute('aria-pressed', String(tab.id === 'build'));
      btn.append(createElement(tab.icon, { width: 18, height: 18, 'stroke-width': 2, 'aria-hidden': 'true' }));
      btn.addEventListener('click', () => {
        if (!btn.disabled) this.switchTab(tab.id);
      });
      nav.append(btn);
      this.tabButtons.set(tab.id, btn);
    }
  }

  private buildCameos(container: HTMLElement): void {
    for (const option of this.options) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'sb-cameo';
      el.title = `${option.name} — ${option.cost} ${CURRENCY}. Click to build, right-click to cancel.`;
      el.innerHTML = `
        <canvas width="128" height="96"></canvas>
        <span class="sb-cameo-wipe"></span>
        <span class="sb-cameo-name">${option.name}</span>
        <span class="sb-cameo-state"></span>`;
      const canvas = el.querySelector('canvas');
      if (canvas) drawPreview(canvas, this.handlers.preview(option));
      el.addEventListener('click', () => this.handlers.onBuild(option));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.handlers.onCancel(option);
      });
      container.append(el);
      const wipe = el.querySelector<HTMLElement>('.sb-cameo-wipe');
      const state = el.querySelector<HTMLElement>('.sb-cameo-state');
      if (wipe && state) this.cameos.set(option.id, { el, wipe, state });
    }
  }
}

/** Fits a sprite canvas into the cameo picture. */
function drawPreview(target: HTMLCanvasElement, sprite: HTMLCanvasElement): void {
  const ctx = target.getContext('2d');
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, 0, target.height);
  g.addColorStop(0, '#2a3440');
  g.addColorStop(1, '#151b21');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, target.width, target.height);
  const k = Math.min(target.width / sprite.width, target.height / sprite.height) * 0.95;
  const w = sprite.width * k;
  const h = sprite.height * k;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sprite, (target.width - w) / 2, (target.height - h) / 2, w, h);
}
