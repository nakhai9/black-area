import { type IconNode, Clock, Handshake, Info, Droplet, Factory, Hammer, Minus, PersonStanding, Radar, Shield, TrendingDown, TrendingUp, Trophy, Truck, Zap, createElement } from 'lucide';
import { BUILD_LIMIT_VEHICLES, CURRENCY, MAX_ALLIES, OIL_GRID_MARKUP, OIL_POLICIES, POWER_PER_BARREL, TECH_TIERS, TECH_VEHICLES, isAircraftKind } from '../constants';
import { FACTIONS } from '../factions';
import { getFlagTexture } from '../render/Flags';
import { type BuildOption, type QueueSlot, buildCost, missingRequirement } from '../systems/ConstructionSystem';
import { MIN_SALE_STOCK } from '../systems/OilMarket';
import type { ArmyCount, TrainOption, TrainingQueue } from '../systems/TrainingSystem';
import type { VehicleOption, VehicleQueue } from '../systems/VehicleSystem';
import type { BuildingType, FactionId, OilPolicy, PlayerState, WorldPoint } from '../types';
import type { CarrierState } from '../entities/Vehicle';

/** The selected transport, for the Transport panel (RA2: passengers aboard + the Deploy / Unload button). */
export interface TransportInfo {
  name: string;
  soldiers: number;
  soldierCapacity: number;
  vehicles: number;
  vehicleCapacity: number;
  /** Units still walking up to climb aboard. */
  incoming: number;
  state: CarrierState;
}

const CARRIER_STATE_LABEL: Readonly<Record<CarrierState, string>> = {
  idle: 'Empty',
  loading: 'Loading…',
  carrying: 'Carrying',
  unloading: 'Unloading…',
};

type TabId = 'build' | 'defense' | 'infantry' | 'vehicles';
/** Sidebar pages: the command centre (budget, oil, alerts), production (build, train) and the world ranking with oil & power prices. */
type ViewId = 'command' | 'production' | 'rank' | 'allies';

/** One of the player's allies (Allied Building) or a claim flag still waiting for its ally, for the Allies tab. */
export interface AllyInfo {
  id: number;
  /** Allied Building standing (false: only the claim flag so far). */
  built: boolean;
  /** Where it stands (latitude / longitude). */
  place: string;
  at: WorldPoint;
  hp: number;
  maxHp: number;
  /** Hit within the last few seconds. */
  underAttack: boolean;
}

/** One nation in the ranking tab. */
export interface RankRow {
  playerId: number;
  faction: FactionId;
  name: string;
  isHuman: boolean;
  defeated: boolean;
  /** Wealth: oil stock + structures (by health) + soldiers & vehicles + budget + unused stored power, in TB. */
  economy: number;
  /** Price of the living soldiers and working vehicles (snapshot, refreshed every 4 min); only the rank is shown. */
  military: number;
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
  /** The price the Global Financial Center pays right now, in TB per barrel, the one before it and the recent history. */
  oilPrice: number;
  previousPrice: number;
  priceHistory: readonly number[];
  /** Seconds until the Center posts a new price. */
  priceChangeIn: number;
  /** Barrels above the 1.0 reserve that may be offered, and seconds until the sale pause (after 6 sales in a row) ends. */
  sellable: number;
  salesWait: number;
  /** Auto sell is on: the oil is offered whenever a sale is allowed. */
  autoSell: boolean;
  /** The player leads the oil cartel: its production policy, and seconds until it may change again. */
  cartel: boolean;
  oilPolicy: OilPolicy;
  policyWait: number;
  /** Why the Global Financial Center would refuse a loan now (null = available). */
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
  /** The selected transport of the player, or null (hides the Transport panel). */
  transport: TransportInfo | null;
  /** The player's allies and open claims (the Allies tab shows up once there is at least one ally). */
  allies: readonly AllyInfo[];
}

export interface SidebarHandlers {
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
  /** The Sell oil button: offer the stock to the Global Financial Center. */
  onSellOil: () => void;
  /** The Auto sell button: turn automatic oil sales on / off. */
  onToggleAutoSell: () => void;
  /** The Emergency loan button: borrow from the Global Financial Center (only at 0 TB). */
  onLoan: () => void;
  /** A cartel policy button (oil-cartel nation only). */
  onOilPolicy: (policy: OilPolicy) => void;
  /** The Unload button of the Transport panel (same as the U key). */
  onUnload: () => void;
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
  private readonly autoSellButton: HTMLButtonElement;
  private readonly cartelPanel: HTMLElement;
  private readonly policyText: HTMLElement;
  private readonly policyButtons: HTMLButtonElement[];
  private readonly derricks: HTMLElement;
  private readonly powerText: HTMLElement;
  private readonly powerPrice: HTMLElement;
  private readonly priceTrend: HTMLElement;
  private readonly priceClock: HTMLElement;
  private readonly priceLine: HTMLElement;
  private trendKey = 0;
  private readonly message: HTMLElement;
  private readonly radarPanel: HTMLElement;
  private readonly alertList: HTMLElement;
  private readonly alertEmpty: HTMLElement;
  private readonly transportPanel: HTMLElement;
  private readonly transportName: HTMLElement;
  private readonly transportSoldiers: HTMLElement;
  private readonly transportVehicles: HTMLElement;
  private readonly transportState: HTMLElement;
  private readonly unloadButton: HTMLButtonElement;
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
  private allyList!: HTMLElement;
  private allyCount!: HTMLElement;
  private allyKey = '';
  private rankTimer = 0;
  private readonly flagUrls = new Map<FactionId, string>();
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private readonly opener: HTMLButtonElement;
  private readonly cameos = new Map<string, Cameo>();
  private readonly unitCameos = new Map<string, Cameo>();
  private readonly vehicleCameos = new Map<string, Cameo>();
  private readonly panels = new Map<TabId, HTMLElement>();
  private activeTab: TabId = 'build';
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
        <div class="sb-logo"><img src="${import.meta.env.BASE_URL}logo.png" alt="Black Area" /></div>
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
            <div class="sb-muted sb-leader" title="Head of state">${faction.leader.title}: ${faction.leader.name}</div>
          </div>
        </div>
        <div class="sb-budget-label">National budget</div>
        <div class="sb-credits"><span>0</span> <small>${CURRENCY}</small></div>
        <div class="sb-oil">OIL OUTPUT <span class="sb-income"></span></div>
        <div class="sb-oil">OIL STOCK <span class="sb-stock"></span></div>
        <div class="sb-oil">DEBT <span class="sb-debt"></span></div>
        <div class="sb-oil">DERRICKS <span class="sb-derricks"></span></div>
        <div class="sb-actions">
          <button class="sb-sell" type="button" title="Offer your oil to the Global Financial Center: it decides whether and how much to buy (at most 25% per sale) and pays the posted price into your budget">Sell oil</button>
          <button class="sb-sell sb-auto" type="button" title="Auto sell: offer your oil to the Global Financial Center automatically whenever a sale is allowed">Auto sell: OFF</button>
          <button class="sb-sell sb-loan" type="button" title="Emergency loan from the Global Financial Center (only when your budget is 0 ${CURRENCY}). Oil sales pay the debt back automatically.">Emergency loan</button>
        </div>
        <div class="sb-cartel" hidden>
          <div class="sb-oil">CARTEL POLICY <span class="sb-policy"></span></div>
          <div class="sb-actions">
            <button class="sb-sell" type="button" data-policy="cut" title="Cut output: your derricks pump 50%, the world oil price climbs (+35% target). Rivals pay more for grid oil; you earn more per barrel.">Cut</button>
            <button class="sb-sell" type="button" data-policy="hold" title="Hold: normal output, the market sets the price.">Hold</button>
            <button class="sb-sell" type="button" data-policy="flood" title="Flood the market: your derricks pump 160%, the world price crashes (−30% target) — a price war on nations that live off oil.">Flood</button>
          </div>
        </div>
        <div class="sb-oil sb-power">POWER <span class="sb-power-value"></span></div>
      </section>
      <section class="sb-panel sb-transport" hidden>
        <h3>Transport</h3>
        <div class="sb-muted sb-transport-name"></div>
        <div class="sb-oil">SOLDIERS <span class="sb-transport-soldiers"></span></div>
        <div class="sb-oil">VEHICLES <span class="sb-transport-vehicles"></span></div>
        <div class="sb-oil">STATUS <span class="sb-transport-state"></span></div>
        <button class="sb-unload" type="button" title="Let the passengers out one by one (U). In the air the transport first lands on solid ground below it.">Unload (U)</button>
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
          <li>Soldiers &amp; vehicles: <kbd>Left-drag</kbd> box-select · <kbd>Left-click</kbd> a unit select · <kbd>Shift</kbd>+<kbd>Left-click</kbd> add/remove · <kbd>Double-click</kbd> all of that type on screen · <kbd>Right-click</kbd> — deselect (units keep going)</li>
          <li>Orders: <kbd>Left-click</kbd> ground — move · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Right-click</kbd> attack-move · <kbd>X</kbd> scatter</li>
          <li>Armed units: <kbd>Left-click</kbd> an enemy to attack — they never shoot buildings on their own, <kbd>Left-click</kbd> the building to focus it · enemy engineers capture buildings · <kbd>M</kbd> sound on/off</li>
          <li>Elite (type II) soldiers: at most 2 for every 3 regulars · orders: up to 15 soldiers and 10 vehicles waiting at once — a new one the moment one is done, whatever your army size · special forces swim · tanks run soldiers over · only aircraft shoot aircraft</li>
          <li>Transport: select soldiers/vehicles, <kbd>Left-click</kbd> your transport to board (one in the air lands first) · select the transport, <kbd>Left-click</kbd> ground — it flies there, lands and unloads · <kbd>U</kbd>/<b>Unload</b> — let them out here, one by one</li>
          <li>Squatters (flag bearer + escort, one unit): walk it (or fly it by transport) to unclaimed land (not your rivals' home lands, never Antarctica), select it, <kbd>F</kbd> — plant the flag (the Squatters are gone once it stands) · then build an <b>Allied Building</b> beside it (max 3 allies)</li>
          <li>When <b>READY</b>: click cameo, then click the map to place · <kbd>R</kbd> turn it 90° · <kbd>Esc</kbd>/<kbd>Right-click</kbd> stop placing</li>
          <li><kbd>WASD</kbd>/<kbd>Arrows</kbd>/screen edge — scroll · <kbd>Wheel</kbd> zoom · <kbd>Middle-drag</kbd> pan</li>
          <li><kbd>Click</kbd> select · <kbd>1</kbd>–<kbd>5</kbd> landmarks · <kbd>O</kbd> oil · <kbd>H</kbd> home · <kbd>Tab</kbd> sidebar</li>
        </ul>
      </details>
      </div>
      <div class="sb-view" data-page="rank" hidden>
        <section class="sb-panel sb-prices">
          <div class="sb-price-row" title="Oil: what the Global Financial Center pays per barrel"><i data-icon="oil"></i><b class="sb-price"></b><i class="sb-price-trend"></i></div>
          <div class="sb-price-row" title="Power: what the Global Financial Center charges when your grid runs dry (oil at +${Math.round((OIL_GRID_MARKUP - 1) * 100)}%, per 1 Ke)"><i data-icon="power"></i><b class="sb-power-price"></b></div>
          <div class="sb-price-row" title="Next price revision"><i data-icon="clock"></i><b class="sb-price-clock"></b></div>
          <svg class="sb-price-chart" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Oil price, last 5 minutes"><polyline fill="none" stroke-width="1.5" vector-effect="non-scaling-stroke"></polyline></svg>
        </section>
        <section class="sb-panel sb-rank">
          <h3 class="sb-rank-title">ECONOMY <small>oil + assets + budget + spare power</small></h3>
          <ol class="sb-rank-list" data-rank="economy"></ol>
          <h3 class="sb-rank-title">MILITARY <small>rank 1 = strongest · updated every 4 min</small></h3>
          <ol class="sb-rank-list" data-rank="military"></ol>
        </section>
      </div>
      <div class="sb-view" data-page="allies" hidden>
        <section class="sb-panel sb-allies">
          <h3 class="sb-rank-title">ALLIES <small class="sb-allies-count"></small></h3>
          <ol class="sb-ally-list"></ol>
          <p class="sb-muted sb-allies-hint">Click an ally to look at it. Raise up to ${MAX_ALLIES} allies on land claimed by Squatters.</p>
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
    this.autoSellButton = q<HTMLButtonElement>('.sb-auto');
    this.autoSellButton.addEventListener('click', () => this.handlers.onToggleAutoSell());
    this.debt = q('.sb-debt');
    this.loanButton = q<HTMLButtonElement>('.sb-loan');
    this.loanButton.addEventListener('click', () => this.handlers.onLoan());
    this.cartelPanel = q('.sb-cartel');
    this.policyText = q('.sb-policy');
    this.policyButtons = [...root.querySelectorAll<HTMLButtonElement>('.sb-cartel [data-policy]')];
    for (const b of this.policyButtons) b.addEventListener('click', () => this.handlers.onOilPolicy(b.dataset.policy as OilPolicy));
    this.derricks = q('.sb-derricks');
    this.powerText = q('.sb-power-value');
    this.message = q('.sb-msg');
    this.radarPanel = q('.sb-radar');
    this.alertList = q('.sb-alert-list');
    this.alertEmpty = q('.sb-alert-empty');
    this.transportPanel = q('.sb-transport');
    this.transportName = q('.sb-transport-name');
    this.transportSoldiers = q('.sb-transport-soldiers');
    this.transportVehicles = q('.sb-transport-vehicles');
    this.transportState = q('.sb-transport-state');
    this.unloadButton = q<HTMLButtonElement>('.sb-unload');
    this.unloadButton.addEventListener('click', () => this.handlers.onUnload());
    // No browser context menu anywhere on the sidebar (radar, cameos, panels): right-click is a game command.
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.buildMainTabs(q('.sb-main-tabs'));
    this.views.set('command', q('[data-page=command]'));
    this.views.set('production', q('[data-page=production]'));
    this.views.set('rank', q('[data-page=rank]'));
    this.views.set('allies', q('[data-page=allies]'));
    this.allyList = q('.sb-ally-list');
    this.allyCount = q('.sb-allies-count');
    this.powerPrice = q('.sb-power-price');
    this.priceTrend = q('.sb-price-trend');
    this.priceClock = q('.sb-price-clock');
    this.priceLine = q<HTMLElement>('.sb-price-chart polyline');
    const icons: Readonly<Record<string, IconNode>> = { oil: Droplet, power: Zap, clock: Clock };
    for (const slot of root.querySelectorAll<HTMLElement>('.sb-price-row [data-icon]')) {
      const icon = icons[slot.dataset.icon ?? ''];
      if (icon) slot.replaceWith(createElement(icon, { width: 16, height: 16, 'stroke-width': 2, 'aria-hidden': 'true' }));
    }
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
        btn.innerHTML = `<span class="sb-alert-text"></span><span class="sb-alert-age">${secs < 60 ? `${secs} s` : `${Math.floor(secs / 60)} m`}</span>`;
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

  /** Transport panel: seats taken / free and the Unload button, lit while there are passengers to let out. */
  private renderTransport(t: TransportInfo | null): void {
    this.transportPanel.hidden = t === null;
    if (!t) return;
    this.transportName.textContent = t.incoming > 0 ? `${t.name} · ${t.incoming} on the way` : t.name;
    this.transportSoldiers.textContent = `${t.soldiers}/${t.soldierCapacity}`;
    this.transportVehicles.textContent = `${t.vehicles}/${t.vehicleCapacity}`;
    this.transportState.textContent = CARRIER_STATE_LABEL[t.state];
    const passengers = t.soldiers + t.vehicles;
    this.unloadButton.disabled = passengers === 0 || t.state === 'unloading';
    this.unloadButton.classList.toggle('lit', passengers > 0 && t.state !== 'unloading');
  }

  update(model: SidebarModel, dt: number): void {
    const { player, queue } = model;
    this.credits.textContent = Math.floor(player.credits).toLocaleString('en-US');
    this.renderAllies(model.allies);
    if (model.ranking) {
      this.lastRanking = model.ranking;
      this.renderRanking(model.ranking);
    }
    this.income.textContent = `+${model.oilRate.toFixed(2)} bbl/s`;
    this.stock.textContent = `${player.oil.toFixed(1)} bbl`;
    this.renderPrices(model);
    this.sellButton.disabled = player.defeated || model.sellable < MIN_SALE_STOCK || model.salesWait > 0;
    this.sellButton.textContent = model.salesWait > 0 ? `Sell oil · wait ${model.salesWait} s` : 'Sell oil';
    this.autoSellButton.textContent = model.autoSell ? 'Auto sell: ON' : 'Auto sell: OFF';
    this.autoSellButton.classList.toggle('on', model.autoSell);
    this.debt.textContent = `${Math.ceil(player.debt).toLocaleString('en-US')} / ${model.creditLine.toLocaleString('en-US')} ${CURRENCY}`;
    this.loanButton.disabled = model.loanBlocker !== null;
    this.loanButton.title =
      model.loanBlocker ??
      `Borrow ${model.loanSize.toLocaleString('en-US')} ${CURRENCY} now. Credit line ${model.creditLine.toLocaleString('en-US')} ${CURRENCY}, based on your oil stock and assets. Oil sales pay the debt back automatically.`;
    this.derricks.textContent = `${model.pumping}/${model.derricks} pumping`;
    this.cartelPanel.hidden = !model.cartel;
    if (model.cartel) {
      const p = OIL_POLICIES[model.oilPolicy];
      this.policyText.textContent = `${p.label} · ${Math.round(p.output * 100)}%` + (model.policyWait > 0 ? ` · ${model.policyWait} s` : '');
      for (const b of this.policyButtons) {
        b.classList.toggle('lit', b.dataset.policy === model.oilPolicy);
        b.disabled = player.defeated || model.policyWait > 0 || b.dataset.policy === model.oilPolicy;
      }
    }
    this.renderTransport(model.transport);

    // POWER: what the nuclear plants can generate / what the structures need (e/s); red while short.
    this.powerText.textContent = `${compactUnit(player.powerSupply, 'e')} / ${compactUnit(player.powerConsumed, 'e')}`;
    this.powerText.classList.toggle('low', player.powerShort);
    this.powerText.parentElement!.title = player.blackout
      ? 'BLACKOUT: no power and no TB to buy oil from the Global Financial Center. No construction, vehicles or take-offs.'
      : player.powerShort
        ? 'Not enough power: the Global Financial Center sells oil for the missing power (+25%), but construction (except power plants), vehicles and take-offs stop.'
        : `Stored ${compactUnit(player.powerStored, 'e')} / ${compactUnit(player.powerCapacity, 'e')}. Plants burn your oil (0.001 bbl = 1 e).`;

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
    }
    if (!model.hasBarracks && this.activeTab === 'infantry') this.switchTab('build');
    // Vehicles tab: unlocked by a War Factory (ground vehicles) or an Airfield (aircraft); blinks until opened.
    const canMake = model.hasWarFactory || model.hasAirfield;
    const vehicleTab = this.tabButtons.get('vehicles');
    if (vehicleTab) {
      vehicleTab.disabled = !canMake;
      vehicleTab.title = canMake ? 'Vehicles & aircraft' : '';
      vehicleTab.classList.toggle('no-icon', !canMake);
    }
    if (!canMake && this.activeTab === 'vehicles') this.switchTab('build');
    this.opener.classList.toggle('sb-attention', awaiting);
    // The page you are not looking at calls for attention: green when something can be built / placed / unlocked,
    // red while a fresh alert (an attack) is showing.
    const productionNews = awaiting;
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
      setData(c.el, 'state', model.placing && mine ? 'placing' : state);
      const missing = missingRequirement(option, model.owned);
      const locked = busyElsewhere || (missing !== null && !mine);
      c.el.classList.toggle('locked', locked);
      (c.el as HTMLButtonElement).disabled = locked;
      // RA2 clock wipe: the dark sector shrinks as the build progresses.
      const remaining = mine && state !== 'ready' ? 1 - queue.progress : 0;
      setBackground(
        c.wipe,
        mine && state !== 'idle' ? `conic-gradient(rgba(0,0,0,0.62) 0 ${Math.round(remaining * 360)}deg, transparent 0)` : 'none',
      );
      setText(
        c.state,
        !mine || state === 'idle'
          ? `${buildCost(option, this.faction)} ${CURRENCY}`
          : state === 'ready'
            ? model.placing
              ? 'PLACING'
              : 'READY'
            : state === 'onHold'
              ? `ON HOLD ${Math.floor(queue.progress * 100)}%`
              : state === 'noPower'
                ? `NO POWER ${Math.floor(queue.progress * 100)}%`
              : `${Math.floor(queue.progress * 100)}%`,
      );
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
      { id: 'allies', label: 'Allies', icon: Handshake },
    ];
    for (const page of pages) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.view = page.id;
      btn.setAttribute('aria-pressed', String(page.id === this.activeView));
      btn.classList.toggle('active', page.id === this.activeView);
      // Icon only: the name is in the tooltip and for screen readers.
      btn.title = page.label;
      btn.setAttribute('aria-label', page.label);
      btn.append(createElement(page.icon, { width: 18, height: 18, 'stroke-width': 2, 'aria-hidden': 'true' }));
      btn.addEventListener('click', () => this.switchView(page.id));
      // The Allies tab only shows up once the nation has its first ally.
      if (page.id === 'allies') btn.hidden = true;
      nav.append(btn);
      this.mainTabs.set(page.id, btn);
    }
  }

  /** Price page: oil and grid-power prices, the trend since the last revision, the countdown and a chart. */
  private renderPrices(model: SidebarModel): void {
    this.price.textContent = compactMoney(model.oilPrice);
    this.powerPrice.textContent = compactMoney(((model.oilPrice * OIL_GRID_MARKUP) / POWER_PER_BARREL) * 1000);
    this.priceClock.textContent = `${model.priceChangeIn} s`;
    const trend = Math.sign(model.oilPrice - model.previousPrice);
    if (trend !== this.trendKey || this.priceTrend.childElementCount === 0) {
      this.trendKey = trend;
      const icon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
      this.priceTrend.replaceChildren(createElement(icon, { width: 16, height: 16, 'stroke-width': 2.5, 'aria-hidden': 'true' }));
      this.priceTrend.dataset.trend = trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat';
    }
    const h = model.priceHistory;
    const lo = Math.min(...h);
    const hi = Math.max(...h);
    const span = Math.max(1, hi - lo);
    const points = h.map((v, i) => `${h.length > 1 ? (i / (h.length - 1)) * 100 : 100},${38 - ((v - lo) / span) * 36}`);
    if (h.length === 1) points.unshift(`0,${38 - ((h[0] - lo) / span) * 36}`);
    this.priceLine.setAttribute('points', points.join(' '));
  }

  /** Fills both ranking lists, best nation first. */
  private renderRanking(rows: readonly RankRow[]): void {
    const key = rows.map((r) => `${r.playerId}:${Math.round(r.economy)}:${r.military}:${r.defeated}`).join('|');
    if (key === this.rankKey) return;
    this.rankKey = key;
    const fill = (list: HTMLElement, key: 'economy' | 'military', detail: ((r: RankRow) => string) | null): void => {
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
          flag.title = r.name;
          if (!detail) {
            // Military: only the position is shown, never the money behind it.
            const name = document.createElement('span');
            name.className = 'sb-rank-value';
            name.textContent = r.name;
            li.append(pos, flag, name);
            return li;
          }
          const value = document.createElement('span');
          value.className = 'sb-rank-value';
          value.textContent = compactMoney(r[key]);
          value.title = detail(r);
          li.append(pos, flag, value);
          return li;
        }),
      );
    };
    fill(this.rankEconomy, 'economy', (r) => `Economy ${Math.round(r.economy).toLocaleString('en-US')} ${CURRENCY}`);
    fill(this.rankMilitary, 'military', null);
  }

  private flagUrl(faction: FactionId): string {
    let url = this.flagUrls.get(faction);
    if (!url) {
      url = getFlagTexture(faction).toDataURL();
      this.flagUrls.set(faction, url);
    }
    return url;
  }

  /**
   * Allies tab: one row per Allied Building (health, under attack) and per claim flag still waiting for its
   * building. The tab button appears with the first ally (and blinks until opened); it goes away if all are lost.
   */
  private renderAllies(allies: readonly AllyInfo[]): void {
    const tab = this.mainTabs.get('allies');
    const built = allies.filter((a) => a.built).length;
    if (tab) {
      const show = built > 0;
      if (show && tab.hidden) tab.classList.add('sb-attention');
      tab.hidden = !show;
      if (!show && this.activeView === 'allies') this.switchView('command');
    }
    if (this.activeView === 'allies') tab?.classList.remove('sb-attention');
    const key = allies.map((a) => `${a.id}:${a.built}:${Math.ceil((a.hp / a.maxHp) * 20)}:${a.underAttack}`).join('|');
    if (key === this.allyKey) return;
    this.allyKey = key;
    this.allyCount.textContent = `${built} / ${MAX_ALLIES}`;
    let n = 0;
    this.allyList.replaceChildren(
      ...allies.map((a) => {
        const li = document.createElement('li');
        li.classList.toggle('pending', !a.built);
        li.classList.toggle('hit', a.underAttack);
        li.title = 'Look at it';
        const pos = document.createElement('span');
        pos.className = 'sb-rank-pos';
        pos.textContent = a.built ? String(++n) : '⚑';
        const info = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'sb-ally-name';
        name.textContent = a.built ? `Ally ${n}${a.underAttack ? ' · under attack!' : ''}` : 'Claimed land · no ally yet';
        const place = document.createElement('div');
        place.className = 'sb-muted sb-ally-place';
        place.textContent = a.place;
        const bar = document.createElement('div');
        bar.className = 'sb-ally-hp';
        const fill = document.createElement('i');
        const share = Math.max(0, Math.min(1, a.hp / a.maxHp));
        fill.style.width = `${Math.round(share * 100)}%`;
        fill.dataset.level = share > 0.6 ? 'ok' : share > 0.3 ? 'low' : 'critical';
        bar.append(fill);
        info.append(name, place, bar);
        li.append(pos, info);
        li.addEventListener('click', () => this.handlers.onAlert(a.at));
        return li;
      }),
    );
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
      setData(c.el, 'state', training ? q.state : count > 0 ? 'queued' : 'idle');
      const atLimit = model.army.queued >= model.army.limit && count === 0;
      const noTech = TECH_TIERS.includes(option.tier) && !model.owned.has('techCenter');
      const overElite = option.tier === 'special' && model.army.special >= model.army.specialCap && count === 0;
      const locked = !model.hasBarracks || atLimit || noTech || overElite;
      c.el.classList.toggle('locked', locked);
      (c.el as HTMLButtonElement).disabled = locked;
      if (c.badge) {
        c.badge.textContent = count > 0 ? String(count) : '';
        c.badge.hidden = count === 0;
      }
      const remaining = training ? 1 - q.progress : 0;
      setBackground(c.wipe, training
        ? `conic-gradient(rgba(0,0,0,0.62) 0 ${Math.round(remaining * 360)}deg, transparent 0)`
        : count > 0
          ? 'rgba(0,0,0,0.45)'
          : 'none');
      setText(c.state, !training
        ? count > 0
          ? 'QUEUED'
          : `${option.cost} ${CURRENCY}`
        : q.state === 'noBarracks'
          ? 'NO MINISTRY'
          : q.state === 'onHold'
            ? `ON HOLD ${Math.floor(q.progress * 100)}%`
            : `${Math.floor(q.progress * 100)}%`);
    }
  }

  private updateVehicleCameos(model: SidebarModel): void {
    const q = model.vehicleQueue;
    const head = q.items[0];
    for (const option of this.vehicleOptions) {
      const c = this.vehicleCameos.get(option.kind);
      if (!c) continue;
      const have = option.needsAirfield ? model.hasAirfield : model.hasWarFactory;
      const count = q.items.filter((k) => k === option.kind).length;
      const producing = head === option.kind;
      setData(c.el, 'state', producing ? q.state : count > 0 ? 'queued' : 'idle');
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
      setBackground(c.wipe, producing
        ? `conic-gradient(rgba(0,0,0,0.62) 0 ${Math.round(remaining * 360)}deg, transparent 0)`
        : count > 0
          ? 'rgba(0,0,0,0.45)'
          : 'none');
      setText(c.state, !producing
        ? count > 0
          ? 'QUEUED'
          : !have
            ? option.needsAirfield
              ? 'NO AIRFIELD'
              : 'NO FACTORY'
            : `${option.cost} ${CURRENCY}`
        : q.state === 'noAirfield'
          ? 'NO AIRFIELD'
          : q.state === 'noFactory'
            ? 'NO FACTORY'
            : q.state === 'noPower'
              ? `NO POWER ${Math.floor(q.progress * 100)}%`
              : q.state === 'onHold'
              ? `ON HOLD ${Math.floor(q.progress * 100)}%`
              : `${Math.floor(q.progress * 100)}%`);
    }
  }

  private buildVehicleCameos(container: HTMLElement): void {
    for (const option of this.vehicleOptions) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'sb-cameo';
      el.title = `${option.name} — ${option.cost} ${CURRENCY}, ${option.trainSeconds} s. ${option.description} Click to build, right-click to cancel.`;
      el.innerHTML = `
        <canvas width="128" height="96"></canvas>
        <span class="sb-cameo-wipe"></span>
        <span class="sb-cameo-info"></span>
        <span class="sb-cameo-badge" hidden></span>
        <span class="sb-cameo-state"></span>`;
      const canvas = el.querySelector('canvas');
      if (canvas) drawPreview(canvas, this.handlers.vehiclePreview(option));
      addInfoIcon(el, option.name);
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
      el.title = `${option.name} — ${option.cost} ${CURRENCY}, ${option.trainSeconds} s. ${option.description} Click to train, right-click to cancel.`;
      el.innerHTML = `
        <canvas width="128" height="96"></canvas>
        <span class="sb-cameo-wipe"></span>
        <span class="sb-cameo-info"></span>
        <span class="sb-cameo-badge" hidden></span>
        <span class="sb-cameo-state"></span>`;
      const canvas = el.querySelector('canvas');
      if (canvas) drawPreview(canvas, this.handlers.trainPreview(option));
      addInfoIcon(el, option.name);
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
        <span class="sb-cameo-info"></span>
        <span class="sb-cameo-state"></span>`;
      const canvas = el.querySelector('canvas');
      if (canvas) drawPreview(canvas, this.handlers.preview(option));
      addInfoIcon(el, option.name);
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

/** 1 234 → "1.23 KTB", 1 234 567 → "1.23 MTB", 1.2e9 → "1.2 BTB" (below 1 000: plain "950 TB"). */
export function compactMoney(value: number): string {
  return compactUnit(value, CURRENCY);
}

/** Same K / M / B shortening for any unit (power: "e"). */
export function compactUnit(value: number, unit: string): string {
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  const units: readonly [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (v >= size) return `${sign}${parseFloat((v / size).toFixed(2))} ${suffix}${unit}`;
  }
  return `${sign}${Math.floor(v)} ${unit}`;
}

/**
 * The sidebar refreshes several times a second: these write to the DOM only when the value really changed, so an
 * unchanged cameo costs no style recalculation.
 */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
function setBackground(el: HTMLElement, value: string): void {
  // The browser rewrites style values, so the last written value is remembered on the element instead.
  if (el.dataset.bg !== value) {
    el.dataset.bg = value;
    el.style.background = value;
  }
}
function setData(el: HTMLElement, key: string, value: string): void {
  if (el.dataset[key] !== value) el.dataset[key] = value;
}

/** Info icon in the cameo corner: the name lives in its tooltip (and the button's accessible name), not on the picture. */
function addInfoIcon(el: HTMLElement, name: string): void {
  el.setAttribute('aria-label', name);
  const slot = el.querySelector<HTMLElement>('.sb-cameo-info');
  if (!slot) return;
  slot.title = el.title;
  slot.append(createElement(Info, { width: 14, height: 14, 'stroke-width': 2.25, 'aria-hidden': 'true' }));
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
