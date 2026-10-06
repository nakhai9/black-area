import { type IconNode, Factory, Hammer, PersonStanding, Radar, Shield, Trophy, Truck, createElement } from 'lucide';
import { BUILD_LIMIT_VEHICLES, CURRENCY, TECH_TIERS, TECH_VEHICLES, isAircraftKind } from '../constants';
import { FACTIONS } from '../factions';
import { getFlagTexture } from '../render/Flags';
import { type BuildOption, type QueueSlot, buildCost, missingRequirement } from '../systems/ConstructionSystem';
import { MIN_SALE_STOCK } from '../systems/OilMarket';
import type { ArmyCount, TrainOption, TrainingQueue } from '../systems/TrainingSystem';
import type { VehicleOption, VehicleQueue } from '../systems/VehicleSystem';
import type { BuildingType, FactionId, PlayerState, WorldPoint } from '../types';

type TabId = 'build' | 'defense' | 'infantry' | 'vehicles';
/** Sidebar pages: the command centre (budget, oil, alerts), production (build, train) and the world ranking. */
type ViewId = 'command' | 'production' | 'rank';

/** One nation in the ranking tab. */
export interface RankRow {
  playerId: number;
  faction: FactionId;
  name: string;
  isHuman: boolean;
  defeated: boolean;
  /** Budget + oil stock at the posted price − debt, in TB. */
  economy: number;
  /** Total price of the nation's living soldiers and vehicles, in TB. */
  military: number;
  soldiers: number;
  vehicles: number;
}

/** Construction tabs (RA2 sidebar), shown as Lucide icons. */
const BUILD_TABS: readonly { id: TabId; label: string; icon: IconNode; enabled: boolean }[] = [
  { id: 'build', label: 'Build', icon: Hammer, enabled: true },
  { id: 'defense', label: 'Defense', icon: Shield, enabled: false },
  { id: 'infantry', label: 'Infantry', icon: PersonStanding, enabled: true },
  { id: 'vehicles', label: 'Vehicles', icon: Truck, enabled: true },
];

export interface SidebarModel {
  player: PlayerState;
  /** Oil output in barrels per second. */
  oilRate: number;
  /** The price the World Bank pays right now, in TB per barrel. */
  oilPrice: number;
  /** Barrels above the 1.0 reserve that may be offered, and seconds until the 10 s sale cooldown ends. */
  sellable: number;
  salesWait: number;
  /** Why the World Bank would refuse a loan now (null = available). */
  loanBlocker: string | null;
  /** Most the nation may owe (from its oil and assets) and the size of the next loan. */
  creditLine: number;
  loanSize: number;
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
  army: ArmyCount;
  /** Vehicle orders waiting (limit: BUILD_LIMIT_VEHICLES). */
  vehicleQueued: number;
  /** Airfield parking spots still free for aircraft orders. */
  parkingFree: number;
  /** Every nation, for the Rank tab (null while that tab is hidden: nothing to compute). */
  ranking: readonly RankRow[] | null;
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
  /** The Sell oil button: offer the stock to the World Bank. */
  onSellOil: () => void;
  /** The Emergency loan button: borrow from the World Bank (only at 0 TB). */
  onLoan: () => void;
  /** An alert in the alert section was clicked: look at where it happened. */
  onAlert: (at: WorldPoint) => void;
}

/** One line of the alert section. */
interface AlertEntry {
  text: string;
  at: WorldPoint;
  /** performance.now() when it was raised. */
  born: number;
}

const MAX_ALERTS = 4;
/** An alert is shown for this many seconds, then it goes away. */
const ALERT_SECONDS = 10;

type Cameo = { el: HTMLElement; wipe: HTMLElement; state: HTMLElement; badge?: HTMLElement };

/**
 * Right-hand command centre (DOM overlay): the map (radar), the national budget & income, oil and
 * power, an alert section ("under attack"), and the purchasing tabs (buildings, soldiers, vehicles).
 */
export class Sidebar {
  readonly minimapCanvas: HTMLCanvasElement;

  private readonly credits: HTMLElement;
  private readonly income: HTMLElement;
  private readonly stock: HTMLElement;
  private readonly price: HTMLElement;
  private readonly sellButton: HTMLButtonElement;
  private readonly debt: HTMLElement;
  private readonly loanButton: HTMLButtonElement;
  private readonly derricks: HTMLElement;
  private readonly powerFill: HTMLElement;
  private readonly powerText: HTMLElement;
  private readonly message: HTMLElement;
  private readonly autoButton: HTMLElement;
  private autoDefense = false;
  private readonly radarPanel: HTMLElement;
  private readonly alertList: HTMLElement;
  private readonly alertEmpty: HTMLElement;
  private readonly alerts: AlertEntry[] = [];
  private readonly faction: FactionId;
  private readonly mainTabs = new Map<ViewId, HTMLButtonElement>();
  private readonly views = new Map<ViewId, HTMLElement>();
  private activeView: ViewId = 'production';
  private rankEconomy!: HTMLElement;
  private rankMilitary!: HTMLElement;
  private lastRanking: readonly RankRow[] = [];
  /** What the lists show now: the DOM is rebuilt only when this changes. */
  private rankKey = '';
  private rankTimer = 0;
  private readonly flagUrls = new Map<FactionId, string>();
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
  private alertClock = 0;

  constructor(
    root: HTMLElement,
    player: PlayerState,
    private readonly options: readonly BuildOption[],
    private readonly trainOptions: readonly TrainOption[],
    private readonly vehicleOptions: readonly VehicleOption[],
    private readonly handlers: SidebarHandlers,
  ) {
    const faction = FACTIONS[player.faction];
    this.faction = player.faction;
    root.innerHTML = `
      <header class="sb-header">
        <div class="sb-logo">BLACK<span>AREA</span></div>
        <div class="sb-sub">Command centre · orders, budget &amp; map</div>
        <button class="sb-collapse" title="Hide sidebar (Tab)">⟩</button>
      </header>
      <section class="sb-panel sb-radar"><canvas class="sb-minimap"></canvas></section>
      <nav class="sb-main-tabs" aria-label="Sidebar pages"></nav>
      <div class="sb-view" data-page="command" hidden>
      <section class="sb-panel sb-resources">
        <div class="sb-player">
          <img class="sb-flag" src="${getFlagTexture(player.faction).toDataURL()}" alt="">
          <div>
            <div class="sb-player-name">${player.name}</div>
            <div class="sb-muted">${faction.name}</div>
          </div>
        </div>
        <div class="sb-budget-label">National budget</div>
        <div class="sb-credits"><span>0</span> <small>${CURRENCY}</small></div>
        <div class="sb-oil">OIL OUTPUT <span class="sb-income"></span></div>
        <div class="sb-oil">OIL STOCK <span class="sb-stock"></span></div>
        <div class="sb-oil">BANK BUYS AT <span class="sb-price"></span></div>
        <div class="sb-oil">DEBT <span class="sb-debt"></span></div>
        <div class="sb-oil">DERRICKS <span class="sb-derricks"></span></div>
        <div class="sb-actions">
          <button class="sb-sell" type="button" title="Offer your oil to the World Bank: it decides whether and how much to buy (at most 25% per sale) and pays the posted price into your budget">Sell oil</button>
          <button class="sb-sell sb-loan" type="button" title="Emergency loan from the World Bank (only when your budget is 0 ${CURRENCY}). Oil sales pay the debt back automatically.">Emergency loan</button>
          <button class="sb-auto" type="button" aria-pressed="false" title="Automatically train soldiers and vehicles to defend your base (F)">Auto-defense: OFF</button>
        </div>
        <div class="sb-power">
          <div class="sb-power-label">POWER <span></span></div>
          <div class="sb-power-track"><div class="sb-power-fill"></div></div>
        </div>
      </section>
      <section class="sb-panel sb-alerts" aria-live="polite">
        <h3>Alerts</h3>
        <ul class="sb-alert-list"></ul>
        <div class="sb-alert-empty">All quiet.</div>
      </section>
      <details class="sb-panel sb-help">
        <summary>Controls</summary>
        <ul>
          <li><kbd>Click</kbd> cameo — build/train · <kbd>Right-click</kbd> cameo — cancel (refund)</li>
          <li>Soldiers &amp; vehicles: <kbd>Right-drag</kbd> sweep-select · <kbd>Left-click</kbd> a unit select · <kbd>Left-click</kbd> ground — move · <kbd>Right-click</kbd> deselect · <kbd>Shift</kbd> add</li>
          <li>Armed units: <kbd>Left-click</kbd> an enemy to attack — they never shoot buildings on their own, <kbd>Left-click</kbd> the building to focus it · enemy engineers capture buildings · <kbd>M</kbd> sound on/off</li>
          <li>Elite (type II) soldiers: at most 2 for every 3 regulars · orders: up to 15 soldiers and 10 vehicles waiting at once — a new one the moment one is done, whatever your army size · special forces swim · tanks run soldiers over · only aircraft shoot aircraft</li>
          <li>Transport: select soldiers/vehicles, <kbd>Left-click</kbd> the parked transport to board · <kbd>Left-click</kbd> ground — it flies there, lands and unloads · <kbd>U</kbd> unload on the airfield</li>
          <li>When <b>READY</b>: click cameo, then click the map to place · <kbd>R</kbd> turn it 90° · <kbd>Esc</kbd>/<kbd>Right-click</kbd> stop placing</li>
          <li><kbd>WASD</kbd>/<kbd>Arrows</kbd>/screen edge — scroll · <kbd>Wheel</kbd> zoom · <kbd>Middle-drag</kbd> pan</li>
          <li><kbd>Click</kbd> select · <kbd>1</kbd>–<kbd>5</kbd> landmarks · <kbd>O</kbd> oil · <kbd>H</kbd> home · <kbd>Tab</kbd> sidebar</li>
        </ul>
      </details>
      </div>
      <div class="sb-view" data-page="rank" hidden>
        <section class="sb-panel sb-rank">
          <h3 class="sb-rank-title">ECONOMY <small>budget + oil − debt</small></h3>
          <ol class="sb-rank-list" data-rank="economy"></ol>
          <h3 class="sb-rank-title">MILITARY <small>value of soldiers &amp; vehicles</small></h3>
          <ol class="sb-rank-list" data-rank="military"></ol>
        </section>
      </div>
      <div class="sb-view" data-page="production">
      <nav class="sb-tabs" aria-label="Construction"></nav>
      <section class="sb-panel sb-build">
        <div class="sb-cameos" data-panel="build"></div>
        <div class="sb-cameos" data-panel="infantry" hidden></div>
        <div class="sb-cameos" data-panel="vehicles" hidden></div>
        <div class="sb-msg" role="status" aria-live="polite"></div>
      </section>
      </div>`;

    const q = <T extends HTMLElement>(sel: string): T => {
      const el = root.querySelector<T>(sel);
      if (!el) throw new Error(`Sidebar element missing: ${sel}`);
      return el;
    };
    this.minimapCanvas = q<HTMLCanvasElement>('.sb-minimap');
    this.credits = q('.sb-credits span');
    this.income = q('.sb-income');
    this.stock = q('.sb-stock');
    this.price = q('.sb-price');
    this.sellButton = q('.sb-sell');
    this.sellButton.addEventListener('click', () => this.handlers.onSellOil());
    this.debt = q('.sb-debt');
    this.loanButton = q<HTMLButtonElement>('.sb-loan');
    this.loanButton.addEventListener('click', () => this.handlers.onLoan());
    this.derricks = q('.sb-derricks');
    this.powerFill = q('.sb-power-fill');
    this.powerText = q('.sb-power-label span');
    this.message = q('.sb-msg');
    this.autoButton = q('.sb-auto');
    this.autoButton.addEventListener('click', () => this.toggleAutoDefense());
    this.radarPanel = q('.sb-radar');
    this.alertList = q('.sb-alert-list');
    this.alertEmpty = q('.sb-alert-empty');
    // No browser context menu anywhere on the sidebar (radar, cameos, panels): right-click is a game command.
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.buildMainTabs(q('.sb-main-tabs'));
    this.views.set('command', q('[data-page=command]'));
    this.views.set('production', q('[data-page=production]'));
    this.views.set('rank', q('[data-page=rank]'));
    this.rankEconomy = q('[data-rank=economy]');
    this.rankMilitary = q('[data-rank=military]');
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

  /** Adds an alert ("X is under attack!") to the alert section; clicking it shows where it happened. */
  alert(text: string, at: WorldPoint): void {
    this.alerts.unshift({ text, at, born: performance.now() });
    this.alerts.length = Math.min(this.alerts.length, MAX_ALERTS);
    this.renderAlerts();
  }

  private renderAlerts(): void {
    const now = performance.now();
    this.alertEmpty.hidden = this.alerts.length > 0;
    this.alertList.replaceChildren(
      ...this.alerts.map((a) => {
        const secs = Math.floor((now - a.born) / 1000);
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = secs < 4 ? 'sb-alert fresh' : 'sb-alert';
        btn.innerHTML = `<span class="sb-alert-text"></span><span class="sb-alert-age">${secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m`}</span>`;
        const label = btn.querySelector('.sb-alert-text');
        if (label) label.textContent = a.text;
        btn.title = 'Click to look at it';
        btn.addEventListener('click', () => this.handlers.onAlert(a.at));
        li.append(btn);
        return li;
      }),
    );
  }

  /** Short EVA-style message under the cameos (e.g. "Construction complete"). */
  notify(text: string, seconds = 3): void {
    this.message.textContent = text;
    this.messageTimer = seconds;
  }

  update(model: SidebarModel, dt: number): void {
    const { player, queue } = model;
    this.credits.textContent = Math.floor(player.credits).toLocaleString('en-US');
    if (model.ranking) {
      this.lastRanking = model.ranking;
      this.renderRanking(model.ranking);
    }
    this.income.textContent = `+${model.oilRate.toFixed(2)} bbl/s`;
    this.stock.textContent = `${player.oil.toFixed(1)} bbl`;
    this.price.textContent = `${model.oilPrice} ${CURRENCY}/bbl`;
    this.sellButton.disabled = player.defeated || model.sellable < MIN_SALE_STOCK || model.salesWait > 0;
    this.sellButton.textContent = model.salesWait > 0 ? `Sell oil · wait ${model.salesWait}s` : 'Sell oil';
    this.debt.textContent = `${Math.ceil(player.debt).toLocaleString('en-US')} / ${model.creditLine.toLocaleString('en-US')} ${CURRENCY}`;
    this.loanButton.disabled = model.loanBlocker !== null;
    this.loanButton.title =
      model.loanBlocker ??
      `Borrow ${model.loanSize.toLocaleString('en-US')} ${CURRENCY} now. Credit line ${model.creditLine.toLocaleString('en-US')} ${CURRENCY}, based on your oil stock and assets. Oil sales pay the debt back automatically.`;
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
      infantryTab.title = model.hasBarracks ? 'Infantry' : '';
      infantryTab.classList.toggle('no-icon', !model.hasBarracks);
      infantryTab.classList.toggle('sb-attention', model.hasBarracks && !this.infantrySeen);
    }
    if (!model.hasBarracks && this.activeTab === 'infantry') this.switchTab('build');
    // Vehicles tab: unlocked by a War Factory or an Airfield; blinks until opened.
    const canMake = model.hasWarFactory || model.hasAirfield;
    const vehicleTab = this.tabButtons.get('vehicles');
    if (vehicleTab) {
      vehicleTab.disabled = !canMake;
      vehicleTab.title = canMake ? 'Vehicles & aircraft' : '';
      vehicleTab.classList.toggle('no-icon', !canMake);
      vehicleTab.classList.toggle('sb-attention', canMake && !this.vehiclesSeen);
    }
    if (!canMake && this.activeTab === 'vehicles') this.switchTab('build');
    this.opener.classList.toggle(
      'sb-attention',
      awaiting || (model.hasBarracks && !this.infantrySeen) || (canMake && !this.vehiclesSeen),
    );
    // The page you are not looking at calls for attention: green when something can be built / placed / unlocked,
    // red while a fresh alert (an attack) is showing.
    const productionNews = awaiting || (model.hasBarracks && !this.infantrySeen) || (canMake && !this.vehiclesSeen);
    const freshAlert = this.alerts.some((a) => performance.now() - a.born < 4000);
    this.mainTabs.get('production')?.classList.toggle('sb-attention', this.activeView !== 'production' && productionNews);
    this.mainTabs.get('command')?.classList.toggle('sb-alerting', this.activeView !== 'command' && freshAlert);
    this.updateVehicleCameos(model);
    this.updateUnitCameos(model);

    for (const option of this.options) {
      const c = this.cameos.get(option.id);
      if (!c) continue;
      const mine = queue.option?.id === option.id;
      const state = mine ? queue.state : 'idle';
      const busyElsewhere = !mine && queue.state !== 'idle';
      c.el.dataset.state = model.placing && mine ? 'placing' : state;
      const missing = missingRequirement(option, model.owned);
      const locked = busyElsewhere || (missing !== null && !mine);
      c.el.classList.toggle('locked', locked);
      (c.el as HTMLButtonElement).disabled = locked;
      // RA2 clock wipe: the dark sector shrinks as the build progresses.
      const remaining = mine && state !== 'ready' ? 1 - queue.progress : 0;
      c.wipe.style.background =
        mine && state !== 'idle' ? `conic-gradient(rgba(0,0,0,0.62) 0 ${remaining * 360}deg, transparent 0)` : 'none';
      c.state.textContent =
        !mine || state === 'idle'
          ? `${buildCost(option, this.faction)} ${CURRENCY}`
          : state === 'ready'
            ? model.placing
              ? 'PLACING'
              : 'READY'
            : state === 'onHold'
              ? `ON HOLD ${Math.floor(queue.progress * 100)}%`
              : `${Math.floor(queue.progress * 100)}%`;
    }

    if (this.alerts.length > 0) {
      this.alertClock += dt;
      if (this.alertClock >= 1) {
        this.alertClock = 0;
        const now = performance.now();
        const fresh = this.alerts.filter((a) => now - a.born < ALERT_SECONDS * 1000);
        this.alerts.splice(0, this.alerts.length, ...fresh);
        this.renderAlerts();
      }
    }
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message.textContent = '';
    }
  }

  private buildMainTabs(nav: HTMLElement): void {
    const pages: readonly { id: ViewId; label: string; icon: IconNode }[] = [
      { id: 'command', label: 'Command', icon: Radar },
      { id: 'production', label: 'Production', icon: Factory },
      { id: 'rank', label: 'Rank', icon: Trophy },
    ];
    for (const page of pages) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.view = page.id;
      btn.setAttribute('aria-pressed', String(page.id === this.activeView));
      btn.classList.toggle('active', page.id === this.activeView);
      btn.append(createElement(page.icon, { width: 16, height: 16, 'stroke-width': 2, 'aria-hidden': 'true' }), document.createTextNode(page.label));
      btn.addEventListener('click', () => this.switchView(page.id));
      nav.append(btn);
      this.mainTabs.set(page.id, btn);
    }
  }

  /** Fills both ranking lists, best nation first. */
  private renderRanking(rows: readonly RankRow[]): void {
    const key = rows.map((r) => `${r.playerId}:${Math.round(r.economy)}:${r.military}:${r.soldiers}:${r.vehicles}:${r.defeated}`).join('|');
    if (key === this.rankKey) return;
    this.rankKey = key;
    const fill = (list: HTMLElement, key: 'economy' | 'military', detail: (r: RankRow) => string): void => {
      const sorted = [...rows].sort((a, b) => Number(a.defeated) - Number(b.defeated) || b[key] - a[key]);
      list.replaceChildren(
        ...sorted.map((r, i) => {
          const li = document.createElement('li');
          li.classList.toggle('me', r.isHuman);
          li.classList.toggle('out', r.defeated);
          const pos = document.createElement('span');
          pos.className = 'sb-rank-pos';
          pos.textContent = r.defeated ? '✕' : String(i + 1);
          const flag = document.createElement('img');
          flag.className = 'sb-rank-flag';
          flag.alt = '';
          flag.src = this.flagUrl(r.faction);
          const name = document.createElement('span');
          name.className = 'sb-rank-name';
          name.textContent = r.isHuman ? `${r.name} (you)` : r.name;
          name.title = detail(r);
          const value = document.createElement('span');
          value.className = 'sb-rank-value';
          value.textContent = `${Math.round(r[key]).toLocaleString('en-US')} ${CURRENCY}`;
          li.append(pos, flag, name, value);
          return li;
        }),
      );
    };
    fill(this.rankEconomy, 'economy', (r) => `Economy ${Math.round(r.economy).toLocaleString('en-US')} ${CURRENCY}`);
    fill(this.rankMilitary, 'military', (r) => `${r.soldiers} soldiers · ${r.vehicles} vehicles`);
  }

  private flagUrl(faction: FactionId): string {
    let url = this.flagUrls.get(faction);
    if (!url) {
      url = getFlagTexture(faction).toDataURL();
      this.flagUrls.set(faction, url);
    }
    return url;
  }

  /** True when the Rank tab is open and its 1 s refresh is due (the ranking is only computed then). */
  wantsRanking(dt: number): boolean {
    if (this.activeView !== 'rank') return false;
    this.rankTimer -= dt;
    if (this.rankTimer > 0) return false;
    this.rankTimer = 1;
    return true;
  }

  private switchView(id: ViewId): void {
    this.activeView = id;
    for (const [view, btn] of this.mainTabs) {
      btn.classList.toggle('active', view === id);
      btn.setAttribute('aria-pressed', String(view === id));
    }
    for (const [view, el] of this.views) el.hidden = view !== id;
    if (id === 'rank') this.renderRanking(this.lastRanking);
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
      const atLimit = model.army.queued >= model.army.limit && count === 0;
      const inOffice = option.tier === 'president' && model.army.presidentTaken && count === 0;
      const noTech = TECH_TIERS.includes(option.tier) && !model.owned.has('techCenter');
      const overElite = option.tier === 'special' && model.army.special >= model.army.specialCap && count === 0;
      const locked = !model.hasBarracks || atLimit || inOffice || noTech || overElite;
      c.el.classList.toggle('locked', locked);
      (c.el as HTMLButtonElement).disabled = locked;
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
      const atLimit = model.vehicleQueued >= BUILD_LIMIT_VEHICLES && count === 0;
      const noTech = TECH_VEHICLES.includes(option.kind) && !model.owned.has('techCenter');
      const noParking = isAircraftKind(option.kind) && model.parkingFree <= 0 && count === 0;
      const locked = !have || atLimit || noTech || noParking;
      c.el.classList.toggle('locked', locked);
      (c.el as HTMLButtonElement).disabled = locked;
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
      c.state.textContent = !producing
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
      el.title = `${option.name} — ${buildCost(option, this.faction)} ${CURRENCY}. Click to build, right-click to cancel.`;
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
