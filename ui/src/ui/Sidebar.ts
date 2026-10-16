import { type IconNode, Settings, ArrowUpFromLine, Clock, House, Handshake, TriangleAlert, Wallet, Info, Keyboard, Droplet, Hammer, LogIn, LogOut, Minus, PersonStanding, Radar, Rocket, Shield, TrendingDown, TrendingUp, Trophy, Truck, Zap, createElement } from 'lucide';
import { BUILD_LIMIT_VEHICLES, CURRENCY, MAX_ALLIES, OIL_GRID_MARKUP, OIL_POLICIES, POWER_PER_BARREL, TECH_TIERS, TECH_VEHICLES, isAircraftKind } from '../constants';
import { FACTIONS } from '../factions';
import { getFlagTexture } from '../render/Flags';
import { factionBadgeHtml } from './FactionBadge';
import { nationFlag } from '../render/sprites/NationCapital';
import { isFactionNation, type NationId } from '../entities/NationCapital';
import { type BuildOption, type QueueSlot, buildCost, missingRequirement } from '../systems/ConstructionSystem';
import { MIN_SALE_STOCK } from '../systems/OilMarket';
import type { ArmyCount, TrainKey, TrainOption, TrainingQueue } from '../systems/TrainingSystem';
import type { VehicleKey, VehicleOption, VehicleQueue } from '../systems/VehicleSystem';
import type { BuildingType, FactionId, OilPolicy, PlayerState, WorldPoint } from '../types';
import type { CarrierState } from '../entities/Vehicle';
import { t } from '../i18n';

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

/** The selected own aircraft, for the Aircraft panel (Turbo button). */
export interface AircraftInfo {
  name: string;
  count: number;
  /** Some selected aircraft can fire its turbo now (in the air and charged). */
  ready: boolean;
  /** Seconds of turbo left on the one burning longest (0 = none burning). */
  active: number;
  /** Recharge of the best one still recharging (0..1); 1 when ready. */
  charge: number;
}

const CARRIER_STATE_LABEL: Readonly<Record<CarrierState, string>> = {
  idle: 'Empty',
  loading: 'Loading…',
  carrying: 'Carrying',
  unloading: 'Unloading…',
};

type TabId = 'build' | 'defense' | 'infantry' | 'vehicles';
/** Sidebar pages: the command centre (budget, oil, alerts), production (build, train) and the world ranking with oil & power prices. */
type ViewId = 'command' | 'production';
/** Tabs of the row above the alerts on the Command page: what shows under it. */
type InfoId = 'alerts' | 'finance' | 'rank' | 'allies' | 'controls';

/** One of the player's allies (Allied Building) or a claim flag still waiting for its ally, for the Allies tab. */
export interface AllyInfo {
  id: number;
  /** Allied Building standing (false: only the claim flag so far). */
  built: boolean;
  /** Captured contested-nation capital (its name): counts as an ally, outside the MAX_ALLIES cap. */
  capital?: string;
  /** Allied Building: its display name (the nation's embassy in that land). */
  embassy?: string;
  /** Captured capital: the nation taken and the faction holding it (emblem 🤝 flag in the row). */
  nation?: NationId;
  holder?: FactionId;
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
/** Protective structures: bought from the Defense tab, not the Build tab (main structures). */
const DEFENSE_IDS: ReadonlySet<string> = new Set(['bunker', 'wall', 'gate', 'flagpole']);

const BUILD_TABS: readonly { id: TabId; label: string; icon: IconNode; enabled: boolean }[] = [
  { id: 'build', label: 'Build', icon: Hammer, enabled: true },
  { id: 'defense', label: 'Defense', icon: Shield, enabled: true },
  { id: 'infantry', label: 'Infantry', icon: PersonStanding, enabled: true },
  { id: 'vehicles', label: 'Vehicles', icon: Truck, enabled: true },
];

export interface SidebarModel {
  player: PlayerState;
  /** Oil output in barrels per second. */
  oilRate: number;
  /** The price the Global Monitoring Center pays right now, in TB per barrel, the one before it and the recent history. */
  oilPrice: number;
  previousPrice: number;
  priceHistory: readonly number[];
  /** Seconds until the Center posts a new price. */
  priceChangeIn: number;
  /** War / ceasefire cycle: which phase it is and seconds left in it. */
  warPhase: { peace: boolean; left: number };
  /** Barrels above the 1.0 reserve that may be offered, and seconds until the sale pause (after 6 sales in a row) ends. */
  sellable: number;
  salesWait: number;
  /** Auto sell is on: the oil is offered whenever a sale is allowed. */
  autoSell: boolean;
  /** The player leads the oil cartel: its production policy, and seconds until it may change again. */
  cartel: boolean;
  oilPolicy: OilPolicy;
  policyWait: number;
  /** Why the Global Monitoring Center would refuse a loan now (null = available). */
  loanBlocker: string | null;
  /** Most the nation may owe (from its oil and assets) and the size of the next loan. */
  creditLine: number;
  loanSize: number;
  derricks: number;
  /** Derricks currently pumping (the others are resting). */
  pumping: number;
  /** The order slot of each structure (every structure is built on its own, in parallel). */
  buildSlot: (id: BuildOption['id']) => QueueSlot;
  /** True while a finished structure is being positioned on the map (and which one). */
  placing: boolean;
  placingId: string | null;
  /** 0..1 progress of the most advanced order of each soldier / vehicle (all orders are produced in parallel). */
  unitProgress: (key: TrainKey) => number;
  vehicleProgress: (key: VehicleKey) => number;
  /** Soldiers / machines on sale now (own, then those of captured foreign structures). */
  trainOptions: readonly TrainOption[];
  vehicleOptions: readonly VehicleOption[];
  /** Is this structure on sale now (another nation's design needs that nation's captured capital)? */
  buildAvailable: (option: BuildOption) => boolean;
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
  aircraft: AircraftInfo | null;
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
  /** The Sell oil button: offer the stock to the Global Monitoring Center. */
  onSellOil: () => void;
  /** The Auto sell button: turn automatic oil sales on / off. */
  onToggleAutoSell: () => void;
  /** The Get a loan button: borrow from the Global Monitoring Center (only at 0 TB). */
  onLoan: () => void;
  /** A cartel policy button (oil-cartel nation only). */
  onOilPolicy: (policy: OilPolicy) => void;
  /** The Unload button of the Transport panel (same as the U key). */
  onUnload: () => void;
  /** The Turbo button of the Aircraft panel (same as the T key). */
  onTurbo: () => void;
  /** The Home button of the action bar (same as the H key): camera to the own capital. */
  onHome: () => void;
  /** Settings button: opens the pause menu (screen lock, volume, language). */
  onSettings: () => void;
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
  private readonly powerBar: HTMLElement;
  private readonly powerFill: HTMLElement;
  private readonly powerPrice: HTMLElement;
  private readonly priceTrend: HTMLElement;
  private readonly priceClock: HTMLElement;
  private readonly warClock: HTMLElement;
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
  /** Floating action bar left of the sidebar (Home / Turbo / Unload), always shown; each button is disabled when it does not apply. */
  private readonly airTools: HTMLElement;
  /** Countdown to the end of the peace (mm:ss) under the air tools; hidden during the war. */
  private readonly peaceTimer: HTMLElement;
  private readonly turboButton: HTMLButtonElement;
  private readonly turboBadge: HTMLElement;
  private readonly alerts: AlertEntry[] = [];
  private readonly faction: FactionId;
  private readonly mainTabs = new Map<ViewId, HTMLButtonElement>();
  private readonly views = new Map<ViewId, HTMLElement>();
  private activeView: ViewId = 'command';
  private readonly infoTabs = new Map<InfoId, HTMLButtonElement>();
  private readonly infoPanes = new Map<InfoId, HTMLElement>();
  private activeInfo: InfoId = 'alerts';
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
    private trainOptions: readonly TrainOption[],
    private vehicleOptions: readonly VehicleOption[],
    private readonly handlers: SidebarHandlers,
  ) {
    const faction = FACTIONS[player.faction];
    this.faction = player.faction;
    root.innerHTML = `
      <header class="sb-header">
        <div class="sb-logo"><img src="${import.meta.env.BASE_URL}logo.png" alt="Black Area" /></div>
        <button class="sb-collapse" title="${t('Hide sidebar (Tab)')}" aria-label="${t('Hide sidebar')}"></button>
      </header>
      <section class="sb-panel sb-radar"><canvas class="sb-minimap"></canvas></section>
      <section class="sb-panel sb-oil-actions">
        <div class="sb-actions">
          <button class="sb-sell" type="button" title="${t('Offer your oil to the Global Monitoring Center: it decides whether and how much to buy (at most 25% per sale) and pays the posted price into your budget')}">${t('Sell oil')}</button>
          <button class="sb-sell sb-auto" type="button" title="${t('Auto sell: offer your oil to the Global Monitoring Center automatically whenever a sale is allowed (green = on). Hotkey: A')}">${t('Auto sell')}</button>
          <button class="sb-sell sb-loan" type="button" title="${t('Loan from the Global Monitoring Center (only when your budget is 0 {c}). Oil sales pay the debt back automatically.', { c: CURRENCY })}">${t('Get a loan')}</button>
        </div>
      </section>
      <nav class="sb-main-tabs" aria-label="${t('Sidebar pages')}"></nav>
      <div class="sb-view" data-page="command">
      <section class="sb-panel sb-resources">
        <div class="sb-player">
          ${factionBadgeHtml(player.faction, 'sm')}
          <div>
            <div class="sb-player-name">${faction.name}</div>
            <div class="sb-muted sb-leader" title="${t('Head of state')}">${faction.leader.name}</div>
          </div>
        </div>
        <div class="sb-budget-row">
          <span class="sb-budget-label">${t('Budget')}</span>
          <span class="sb-credits"><span>0</span> <small>${CURRENCY}</small></span>
        </div>
        <div class="sb-cartel" hidden>
          <div class="sb-oil">${t('CARTEL POLICY ')}<span class="sb-policy"></span></div>
          <div class="sb-actions">
            <button class="sb-sell" type="button" data-policy="cut" title="${t('Cut output: your derricks pump 50%, the world oil price climbs (+35% target). Rivals pay more for grid oil; you earn more per barrel.')}">${t('Cut')}</button>
            <button class="sb-sell" type="button" data-policy="hold" title="${t('Hold: normal output, the market sets the price.')}">${t('Hold')}</button>
            <button class="sb-sell" type="button" data-policy="flood" title="${t('Flood the market: your derricks pump 160%, the world price crashes (−30% target) — a price war on nations that live off oil.')}">${t('Flood')}</button>
          </div>
        </div>
        <div class="sb-power" title="${t('Power')}"><i data-icon="power"></i><div class="sb-power-bar"><i class="sb-power-fill"></i></div></div>
      </section>
      <section class="sb-panel sb-transport" hidden>
        <h3>${t('Transport')}</h3>
        <div class="sb-muted sb-transport-name"></div>
        <div class="sb-oil">${t('SOLDIERS ')}<span class="sb-transport-soldiers"></span></div>
        <div class="sb-oil">${t('VEHICLES ')}<span class="sb-transport-vehicles"></span></div>
        <div class="sb-oil">${t('STATUS ')}<span class="sb-transport-state"></span></div>
      </section>
      <nav class="sb-main-tabs sb-page-links" aria-label="${t('Alerts, rank and allies')}"></nav>
      <section class="sb-panel sb-alerts" data-info="alerts" aria-live="polite" aria-label="${t('Alerts')}">
        <ul class="sb-alert-list"></ul>
        <div class="sb-alert-empty">${t('All quiet.')}</div>
      </section>
      <div class="sb-info" data-info="finance" hidden>
        <section class="sb-panel sb-finance">
          <h3>${t('Finance')}</h3>
          <div class="sb-oil">${t('OIL OUTPUT ')}<span class="sb-income"></span></div>
          <div class="sb-oil">${t('OIL STOCK ')}<span class="sb-stock"></span></div>
          <div class="sb-oil">${t('DEBT ')}<span class="sb-debt"></span></div>
          <div class="sb-oil">${t('DERRICKS ')}<span class="sb-derricks"></span></div>
        </section>
        <section class="sb-panel sb-prices">
          <div class="sb-price-row" title="${t('Oil: what the Global Monitoring Center pays per barrel')}"><i data-icon="oil"></i><b class="sb-price"></b><i class="sb-price-trend"></i></div>
          <div class="sb-price-row" title="${t('Power: what the Global Monitoring Center charges when your grid runs dry (oil at +{p}%, per 1 kJ)', { p: Math.round((OIL_GRID_MARKUP - 1) * 100) })}"><i data-icon="power"></i><b class="sb-power-price"></b></div>
          <div class="sb-price-row" title="${t('Next price revision')}"><i data-icon="clock"></i><b class="sb-price-clock"></b></div>
          <div class="sb-price-row" title="${t('War cycle: 6 minutes of war, then 4 minutes of ceasefire (no attacks, no takeovers)')}"><i data-icon="clock"></i><b class="sb-war-clock"></b></div>
          <svg class="sb-price-chart" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="${t('Oil price, last 5 minutes')}"><polyline fill="none" stroke-width="1.5" vector-effect="non-scaling-stroke"></polyline></svg>
        </section>
      </div>
      <div class="sb-info" data-info="rank" hidden>
        <section class="sb-panel sb-rank">
          <h3 class="sb-rank-title">${t('ECONOMY ')}<small>${t('oil + assets + budget + spare power')}</small></h3>
          <ol class="sb-rank-list" data-rank="economy"></ol>
          <h3 class="sb-rank-title">${t('MILITARY ')}<small>${t('rank 1 = strongest · updated every 4 min')}</small></h3>
          <ol class="sb-rank-list" data-rank="military"></ol>
        </section>
      </div>
      <div class="sb-info" data-info="allies" hidden>
        <section class="sb-panel sb-allies">
          <h3 class="sb-rank-title">${t('ALLIES ')}<small class="sb-allies-count"></small></h3>
          <ol class="sb-ally-list"></ol>
          <p class="sb-muted sb-allies-hint">${t('Captured capitals and embassies are listed here. Click one to look at it. Build up to {n} embassies next to your flags or buildings: far from every capital they become Pro-regimes.', { n: MAX_ALLIES })}</p>
        </section>
      </div>
      <div class="sb-info" data-info="controls" hidden>
        <section class="sb-panel sb-help">
          <h3>${t('Controls')}</h3>
          <ul>
            <li>${t('<kbd>Click</kbd> cameo — build/train · <kbd>Right-click</kbd> cameo — cancel (refund)')}</li>
            <li>${t('Soldiers &amp; vehicles: <kbd>Left-drag</kbd> box-select · <kbd>Left-click</kbd> a unit select · <kbd>Shift</kbd>+<kbd>Left-click</kbd> add/remove · <kbd>Double-click</kbd> all of that type on screen · <kbd>Right-click</kbd> — deselect (units keep going)')}</li>
            <li>${t('Orders: <kbd>Left-click</kbd> ground — move · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Right-click</kbd> attack-move · <kbd>X</kbd> scatter')}</li>
            <li>${t('Armed units: <kbd>Left-click</kbd> an enemy to attack — they never shoot buildings on their own, <kbd>Left-click</kbd> the building to focus it · enemy engineers capture buildings · <kbd>M</kbd> sound on/off')}</li>
            <li>${t('Elite (type II) soldiers: at most 2 for every 3 regulars · orders: up to 15 soldiers and 10 vehicles waiting at once — a new one the moment one is done, whatever your army size · special forces swim · tanks run soldiers over · only aircraft shoot aircraft')}</li>
            <li>${t('Transport: select soldiers/vehicles, <kbd>Left-click</kbd> your transport to board (one in the air lands first) · select the transport, <kbd>Left-click</kbd> ground — it flies there, lands and unloads · <kbd>U</kbd>/<b>Unload</b> — let them out here, one by one')}</li>
            <li>${t('Aircraft: <kbd>T</kbd>/<b>Turbo</b> — the selected aircraft in the air fly 2× faster for 15 s, then the turbo recharges (40 s)')}</li>
            <li>${t('Squatters (flag bearer + escort, one unit): walk it (or fly it by transport) to unclaimed land (not your rivals\' home lands, never Antarctica), select it and press <kbd>F</kbd> (or double-click it) — the flag goes up on the nearest open cell, on any land (the Squatters are gone once it stands) · then build an <b>Allied Building</b> beside it (max 3 allies)')}</li>
            <li>${t('When <b>READY</b>: click cameo, then click the map to place · <kbd>R</kbd> turn it 90° (only before it is placed) · <kbd>Esc</kbd>/<kbd>Right-click</kbd> stop placing')}</li>
            <li>${t('<kbd>WSD</kbd>/<kbd>Arrows</kbd>/screen edge — scroll · <kbd>A</kbd> auto sell · <kbd>Wheel</kbd> zoom · <kbd>Middle-drag</kbd> pan')}</li>
            <li>${t('<kbd>Click</kbd> select · <kbd>1</kbd> your capital · <kbd>2</kbd>–<kbd>5</kbd> rival capitals · <kbd>O</kbd> oil · <kbd>H</kbd> home · <kbd>Tab</kbd> sidebar')}</li>
          </ul>
        </section>
      </div>
      </div>
      <div class="sb-view" data-page="production" hidden>
      <section class="sb-panel sb-build">
        <div class="sb-cameos" data-panel="build"></div>
        <div class="sb-cameos" data-panel="defense" hidden></div>
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
    this.powerBar = q('.sb-power-bar');
    this.powerFill = q('.sb-power-fill');
    this.message = q('.sb-msg');
    this.radarPanel = q('.sb-radar');
    // The compass sits in the minimap's bottom-left corner (the minimap is drawn north-up).
    const compass = document.getElementById('compass');
    if (compass) {
      this.radarPanel.append(compass);
      compass.hidden = false; // hidden in index.html so it never shows loose in the page corner (before the CSS loads)
    }
    this.alertList = q('.sb-alert-list');
    this.alertEmpty = q('.sb-alert-empty');
    this.transportPanel = q('.sb-transport');
    this.transportName = q('.sb-transport-name');
    this.transportSoldiers = q('.sb-transport-soldiers');
    this.transportVehicles = q('.sb-transport-vehicles');
    this.transportState = q('.sb-transport-state');
    this.airTools = document.createElement('div');
    this.airTools.className = 'air-tools';
    const tool = (icon: IconNode, title: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'air-tool';
      b.title = title;
      b.append(createElement(icon, { width: 20, height: 20, 'stroke-width': 2, 'aria-hidden': 'true' }));
      // A click only acts (camera home, turbo…): the button never keeps the focus, so no focus ring is left on it.
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        b.blur();
        onClick();
      });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      this.airTools.append(b);
      return b;
    };
    tool(House, t('Home (H): jump the camera to your capital.'), () => this.handlers.onHome());
    this.turboButton = tool(Rocket, t('Turbo (T): the selected aircraft fly much faster for a while, then the turbo has to recharge before it can be used again.'), () => this.handlers.onTurbo());
    this.turboBadge = document.createElement('span');
    this.turboBadge.className = 'air-tool-badge';
    this.turboButton.append(this.turboBadge);
    this.unloadButton = tool(ArrowUpFromLine, t('Unload (U): let the passengers out one by one. In the air the transport first lands on solid ground below it.'), () => this.handlers.onUnload());
    tool(Settings, t('Settings: screen lock, volume, language (pause menu, Esc).'), () => this.handlers.onSettings());
    this.peaceTimer = document.createElement('div');
    this.peaceTimer.className = 'peace-timer';
    this.peaceTimer.title = t('Ceasefire: time left before the war resumes.');
    this.peaceTimer.hidden = true;
    this.airTools.append(this.peaceTimer);
    document.body.append(this.airTools);
    // No browser context menu anywhere on the sidebar (radar, cameos, panels): right-click is a game command.
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.buildMainTabs(q('.sb-main-tabs'), q('.sb-page-links'));
    this.views.set('command', q('[data-page=command]'));
    this.views.set('production', q('[data-page=production]'));
    for (const id of ['alerts', 'finance', 'rank', 'allies', 'controls'] as const) this.infoPanes.set(id, q(`[data-info=${id}]`));
    this.allyList = q('.sb-ally-list');
    this.allyCount = q('.sb-allies-count');
    this.powerPrice = q('.sb-power-price');
    this.priceTrend = q('.sb-price-trend');
    this.priceClock = q('.sb-price-clock');
    this.warClock = q('.sb-war-clock');
    this.priceLine = q<HTMLElement>('.sb-price-chart polyline');
    const icons: Readonly<Record<string, IconNode>> = { oil: Droplet, power: Zap, clock: Clock };
    for (const slot of root.querySelectorAll<HTMLElement>('.sb-price-row [data-icon], .sb-power [data-icon]')) {
      const icon = icons[slot.dataset.icon ?? ''];
      if (icon) slot.replaceWith(createElement(icon, { width: 16, height: 16, 'stroke-width': 2, 'aria-hidden': 'true' }));
    }
    this.rankEconomy = q('[data-rank=economy]');
    this.rankMilitary = q('[data-rank=military]');
    this.buildTabs(q('.sb-main-tabs'));
    const buildPanel = q('[data-panel=build]');
    const infantryPanel = q('[data-panel=infantry]');
    this.panels.set('build', buildPanel);
    const defensePanel = q('[data-panel=defense]');
    this.panels.set('defense', defensePanel);
    this.panels.set('infantry', infantryPanel);
    const vehiclePanel = q('[data-panel=vehicles]');
    this.panels.set('vehicles', vehiclePanel);
    this.buildVehicleCameos(vehiclePanel);
    this.buildCameos(buildPanel, defensePanel);
    this.buildUnitCameos(infantryPanel);
    const collapse = q('.sb-collapse');
    collapse.append(createElement(LogOut, { width: 16, height: 16, 'stroke-width': 2, 'aria-hidden': 'true' }));
    collapse.addEventListener('click', () => this.toggle());

    const opener = document.createElement('button');
    this.opener = opener;
    opener.className = 'sb-open';
    opener.title = t('Show sidebar (Tab)');
    opener.setAttribute('aria-label', t('Show sidebar'));
    opener.append(createElement(LogIn, { width: 16, height: 16, 'stroke-width': 2, 'aria-hidden': 'true' }));
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
        btn.title = t('Click to look at it');
        btn.addEventListener('click', () => this.handlers.onAlert(a.at));
        li.append(btn);
        return li;
      }),
    );
  }

  /** Shows the seconds left in the peace as mm:ss, or hides the countdown (null) while the war is on. */
  setPeaceTimer(left: number | null): void {
    if (left === null) {
      this.peaceTimer.hidden = true;
      return;
    }
    const s = Math.max(0, Math.ceil(left));
    const text = `${t('Peace time left')} ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    if (this.peaceTimer.textContent !== text) this.peaceTimer.textContent = text;
    this.peaceTimer.hidden = false;
  }

  /** Short EVA-style message under the cameos (e.g. "Construction complete"). */
  notify(text: string, seconds = 3): void {
    this.message.textContent = text;
    this.messageTimer = seconds;
  }

  /** Air tools: Turbo lit when ready, otherwise counting down its burn / recharge; disabled for a selection without aircraft. */
  private renderAircraft(a: AircraftInfo | null): void {
    this.turboButton.disabled = !a?.ready;
    this.turboButton.classList.toggle('lit', !!a?.ready);
    this.turboBadge.textContent = !a || a.ready ? '' : a.active > 0 ? `${Math.ceil(a.active)}s` : `${Math.floor(a.charge * 100)}%`;
  }

  /** Transport panel: seats taken / free and the Unload button, lit while there are passengers to let out. */
  private renderTransport(tr: TransportInfo | null): void {
    this.transportPanel.hidden = tr === null;
    if (!tr) return;
    this.transportName.textContent = tr.incoming > 0 ? t('{name} · {n} on the way', { name: tr.name, n: tr.incoming }) : tr.name;
    this.transportSoldiers.textContent = `${tr.soldiers}/${tr.soldierCapacity}`;
    this.transportVehicles.textContent = `${tr.vehicles}/${tr.vehicleCapacity}`;
    this.transportState.textContent = t(CARRIER_STATE_LABEL[tr.state]);
  }

  update(model: SidebarModel, dt: number): void {
    const { player } = model;
    this.credits.textContent = Math.floor(player.credits).toLocaleString('en-US');
    this.renderAllies(model.allies);
    if (model.ranking) {
      this.lastRanking = model.ranking;
      this.renderRanking(model.ranking);
    }
    this.income.textContent = `+${model.oilRate.toFixed(2)} bbl/s`;
    this.stock.textContent = `${player.oil.toFixed(1)} bbl`;
    this.renderPrices(model);
    this.sellButton.hidden = model.autoSell; // auto sell does the selling: no manual button
    this.sellButton.disabled = player.defeated || model.sellable < MIN_SALE_STOCK || model.salesWait > 0;
    this.sellButton.textContent = model.salesWait > 0 ? t('Sell oil · wait {n} s', { n: model.salesWait }) : t('Sell oil');
    this.autoSellButton.classList.toggle('on', model.autoSell);
    this.debt.textContent = `${Math.ceil(player.debt).toLocaleString('en-US')} / ${model.creditLine.toLocaleString('en-US')} ${CURRENCY}`;
    this.loanButton.disabled = model.loanBlocker !== null;
    this.loanButton.title =
      model.loanBlocker ??
      t('Borrow {loan} {c} now. Credit line {line} {c}, based on your oil stock and assets. Oil sales pay the debt back automatically.', { loan: model.loanSize.toLocaleString('en-US'), line: model.creditLine.toLocaleString('en-US'), c: CURRENCY });
    this.derricks.textContent = t('{a}/{b} pumping', { a: model.pumping, b: model.derricks });
    this.cartelPanel.hidden = !model.cartel;
    if (model.cartel) {
      const p = OIL_POLICIES[model.oilPolicy];
      this.policyText.textContent = `${t(p.label)} · ${Math.round(p.output * 100)}%` + (model.policyWait > 0 ? ` · ${model.policyWait} s` : '');
      for (const b of this.policyButtons) {
        b.classList.toggle('lit', b.dataset.policy === model.oilPolicy);
        b.disabled = player.defeated || model.policyWait > 0 || b.dataset.policy === model.oilPolicy;
      }
    }
    this.renderTransport(model.transport);
    this.renderAircraft(model.aircraft);
    // Unload works only for a carrier with someone aboard (a fighter / bomber has no seats).
    const carrier = model.transport;
    this.unloadButton.disabled = !carrier || carrier.soldiers + carrier.vehicles === 0 || carrier.state === 'unloading';
    this.unloadButton.classList.toggle('lit', !this.unloadButton.disabled);

    // POWER: what the nuclear plants can generate / what the structures need (J/s); red while short.
    // No numbers on the bar: supply / demand goes in the tooltip.
    const powerLine = `${compactEnergy(player.powerSupply)}/s / ${compactEnergy(player.powerConsumed)}/s`;
    // Bar: supply against demand. Green = enough power; orange = short but the Global Monitoring Center still sells the
    // missing power (things keep running, no take-offs); red = blackout, nothing can run.
    const ratio = player.powerConsumed > 0 ? Math.min(1, player.powerSupply / player.powerConsumed) : 1;
    this.powerFill.style.width = `${Math.round(ratio * 100)}%`;
    this.powerBar.dataset.level = player.blackout ? 'dead' : player.powerShort ? 'weak' : 'ok';
    this.powerBar.parentElement!.title = t('Power {line}. ', { line: powerLine }) + (player.blackout
      ? t('BLACKOUT: no power and no TB to buy oil from the Global Monitoring Center. No take-offs.')
      : player.powerShort
        ? t('Not enough power: the Global Monitoring Center sells oil for the missing power (+25%), and take-offs stop (construction and production keep running while you have TB).')
        : t('Stored {a} / {b}. Plants burn your oil (0.001 bbl = 1 J).', { a: compactEnergy(player.powerStored), b: compactEnergy(player.powerCapacity) }));

    // The radar picture is blurred and dimmed until the nation owns an Airfield.
    this.radarPanel.classList.toggle('offline', !model.owned.has('airfield'));

    // Blink the Build tab (and the sidebar opener) while a finished structure waits.
    const ready = this.options.filter((o) => model.buildSlot(o.id).state === 'ready' && model.placingId !== o.id);
    const awaiting = ready.length > 0;
    this.tabButtons.get('build')?.classList.toggle('sb-attention', ready.some((o) => !DEFENSE_IDS.has(o.id)));
    this.tabButtons.get('defense')?.classList.toggle('sb-attention', ready.some((o) => DEFENSE_IDS.has(o.id)));
    // Infantry tab: locked without a Barracks, blinks when it first becomes available.
    const infantryTab = this.tabButtons.get('infantry');
    if (infantryTab) {
      infantryTab.disabled = !model.hasBarracks;
      infantryTab.title = model.hasBarracks ? t('Infantry') : '';
      infantryTab.classList.toggle('no-icon', !model.hasBarracks);
    }
    if (!model.hasBarracks && this.activeTab === 'infantry') this.switchTab('build');
    // Vehicles tab: unlocked by a War Factory (ground vehicles) or an Airfield (aircraft); blinks until opened.
    const canMake = model.hasWarFactory || model.hasAirfield;
    const vehicleTab = this.tabButtons.get('vehicles');
    if (vehicleTab) {
      vehicleTab.disabled = !canMake;
      vehicleTab.title = canMake ? t('Vehicles & aircraft') : '';
      vehicleTab.classList.toggle('no-icon', !canMake);
    }
    if (!canMake && this.activeTab === 'vehicles') this.switchTab('build');
    this.opener.classList.toggle('sb-attention', awaiting);
    // The page you are not looking at calls for attention: green when something can be built / placed / unlocked,
    // red while a fresh alert (an attack) is showing.
    this.refreshForeignCameos(model);
    this.updateVehicleCameos(model);
    this.updateUnitCameos(model);

    for (const option of this.options) {
      const c = this.cameos.get(option.id);
      if (!c) continue;
      const queue = model.buildSlot(option.id);
      // Another nation's structures show only while its capital is held (or one is still on order).
      c.el.hidden = !model.buildAvailable(option) && queue.state === 'idle';
      const state = queue.state;
      const mine = state !== 'idle';
      const placingThis = model.placingId === option.id;
      setData(c.el, 'state', placingThis ? 'placing' : state);
      const missing = missingRequirement(option, model.owned);
      const locked = missing !== null && !mine;
      c.el.classList.toggle('locked', locked);
      (c.el as HTMLButtonElement).disabled = locked;
      // RA2 clock wipe: the dark sector shrinks as the build progresses.
      const remaining = mine && state !== 'ready' ? 1 - queue.progress : 0;
      setBackground(
        c.wipe,
        mine ? `conic-gradient(rgba(0,0,0,0.62) 0 ${Math.round(remaining * 360)}deg, transparent 0)` : 'none',
      );
      setText(
        c.state,
        !mine
          ? `${buildCost(option, this.faction)} ${CURRENCY}`
          : state === 'ready'
            ? placingThis
              ? t('PLACING')
              : t('READY')
            : state === 'onHold'
              ? t('ON HOLD {p}%', { p: Math.floor(queue.progress * 100) })
              : state === 'noPower'
                ? t('NO POWER {p}%', { p: Math.floor(queue.progress * 100) })
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

  /** Command goes on the top row (the production tabs follow it); Alerts / Rank / Allies tabs sit on the Command page. */
  private buildMainTabs(nav: HTMLElement, links: HTMLElement): void {
    const tabButton = (label: string, icon: IconNode, active: boolean, onClick: () => void): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('active', active);
      // Icon only: the name is in the tooltip and for screen readers.
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.append(createElement(icon, { width: 18, height: 18, 'stroke-width': 2, 'aria-hidden': 'true' }));
      btn.addEventListener('click', onClick);
      return btn;
    };
    const command = tabButton(t('Command'), Radar, true, () => this.switchView('command'));
    nav.append(command);
    this.mainTabs.set('command', command);
    const infos: readonly { id: InfoId; label: string; icon: IconNode }[] = [
      { id: 'alerts', label: 'Alerts', icon: TriangleAlert },
      { id: 'finance', label: 'Finance', icon: Wallet },
      { id: 'rank', label: 'Rank', icon: Trophy },
      { id: 'allies', label: 'Allies', icon: Handshake },
      { id: 'controls', label: 'Controls', icon: Keyboard },
    ];
    for (const info of infos) {
      const btn = tabButton(t(info.label), info.icon, info.id === this.activeInfo, () => this.switchInfo(info.id));
      // The Allies tab only shows up once the nation has its first ally.
      if (info.id === 'allies') btn.hidden = true;
      links.append(btn);
      this.infoTabs.set(info.id, btn);
    }
  }

  /** Price page: oil and grid-power prices, the trend since the last revision, the countdown and a chart. */
  private renderPrices(model: SidebarModel): void {
    this.price.textContent = compactMoney(model.oilPrice);
    this.powerPrice.textContent = compactMoney(((model.oilPrice * OIL_GRID_MARKUP) / POWER_PER_BARREL) * 1000);
    this.priceClock.textContent = `${model.priceChangeIn} s`;
    const left = Math.ceil(model.warPhase.left);
    this.warClock.textContent = `${model.warPhase.peace ? t('Peace') : t('War')} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    this.warClock.style.color = model.warPhase.peace ? '#7fd17f' : '#ff7a6b';
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
    fill(this.rankEconomy, 'economy', (r) => t('Economy {v} {c}', { v: Math.round(r.economy).toLocaleString('en-US'), c: CURRENCY }));
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
    const tab = this.infoTabs.get('allies');
    const built = allies.filter((a) => a.built && !a.capital).length;
    if (tab) {
      const show = allies.some((a) => a.built);
      tab.hidden = !show;
      if (!show && this.activeInfo === 'allies') this.switchInfo('alerts');
    }
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
        li.title = a.capital ?? t('Look at it');
        const pos = document.createElement('span');
        pos.className = 'sb-rank-pos';
        pos.textContent = a.built ? String(++n) : '⚑';
        const info = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'sb-ally-name';
        const hit = a.underAttack ? t(' · under attack!') : '';
        if (a.nation && a.holder) {
          // Emblem of the holder [handshake] flag of the nation taken: the alliance between them.
          const img = (src: string) => {
            const el = document.createElement('img');
            el.src = src;
            el.alt = '';
            el.style.height = '14px';
            el.style.verticalAlign = '-2px';
            return el;
          };
          const shake = createElement(Handshake, { width: 14, height: 14, 'stroke-width': 2, 'aria-hidden': 'true' });
          shake.style.verticalAlign = '-2px';
          shake.style.margin = '0 4px';
          name.append(img(`${import.meta.env.BASE_URL}emblems/${a.holder}.png`), shake, img(isFactionNation(a.nation) ? getFlagTexture(a.nation).toDataURL() : nationFlag(a.nation).toDataURL()));
          if (hit) name.append(hit);
        } else {
          name.textContent = a.built ? `${a.capital ?? (a.embassy ?? t('Ally {n}', { n }))}${hit}` : t('Claimed land · no ally yet');
        }
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
    if (this.activeView !== 'command' || this.activeInfo !== 'rank') return false;
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
    this.markTabs();
  }

  /** Alerts (the default), Rank or Allies under the tab row of the Command page. */
  private switchInfo(id: InfoId): void {
    this.activeInfo = id;
    for (const [info, btn] of this.infoTabs) {
      btn.classList.toggle('active', info === id);
      btn.setAttribute('aria-pressed', String(info === id));
    }
    for (const [info, pane] of this.infoPanes) pane.hidden = info !== id;
    if (id === 'rank') this.renderRanking(this.lastRanking);
  }

  /** Picks the production panel; `open` also brings the production page up (a click on its tab). */
  private switchTab(id: TabId, open = false): void {
    this.activeTab = id;
    for (const [tab, panel] of this.panels) panel.hidden = tab !== id;
    if (open) this.switchView('production');
    else this.markTabs();
  }

  /** A production tab shows as active only while the production page is open. */
  private markTabs(): void {
    for (const [tab, btn] of this.tabButtons) {
      const on = this.activeView === 'production' && tab === this.activeTab;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  /** Last seen queue count and progress per soldier / vehicle cameo: a count that drops from (nearly) done means one came out. */
  private readonly lastMade = new Map<string, { count: number; progress: number }>();

  /** A soldier or vehicle just came out: only its tab flashes green once, then stops. */
  private flashIfDone(key: string, tab: 'infantry' | 'vehicles', count: number, progress: number): void {
    const before = this.lastMade.get(key);
    this.lastMade.set(key, { count, progress });
    if (!before || count >= before.count || before.progress < 0.9) return;
    for (const target of [this.tabButtons.get(tab)]) {
      if (!target) continue;
      target.classList.remove('sb-done');
      void target.offsetWidth; // restart the animation if it is still running
      target.classList.add('sb-done');
    }
  }

  /** A foreign Ministry of Defence / War Factory / Airfield was captured or lost: the cameo rows follow. */
  private refreshForeignCameos(model: SidebarModel): void {
    const keys = (list: readonly { key: string }[]): string => list.map((o) => o.key).join(',');
    if (keys(model.trainOptions) !== keys(this.trainOptions)) {
      this.trainOptions = model.trainOptions;
      const panel = this.panels.get('infantry');
      if (panel) {
        for (const c of this.unitCameos.values()) c.el.remove();
        this.unitCameos.clear();
        this.buildUnitCameos(panel);
      }
    }
    if (keys(model.vehicleOptions) !== keys(this.vehicleOptions)) {
      this.vehicleOptions = model.vehicleOptions;
      const panel = this.panels.get('vehicles');
      if (panel) {
        for (const c of this.vehicleCameos.values()) c.el.remove();
        this.vehicleCameos.clear();
        this.buildVehicleCameos(panel);
      }
    }
  }

  private updateUnitCameos(model: SidebarModel): void {
    const q = model.training;
    for (const option of this.trainOptions) {
      const c = this.unitCameos.get(option.key);
      if (!c) continue;
      const count = q.items.filter((t) => t === option.key).length;
      // Every order trains at once: each cameo shows its own most advanced soldier.
      const training = count > 0;
      const progress = model.unitProgress(option.key);
      this.flashIfDone(`u:${option.key}`, 'infantry', count, progress);
      setData(c.el, 'state', training ? q.state : 'idle');
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
      const remaining = training ? 1 - progress : 0;
      setBackground(c.wipe, training ? `conic-gradient(rgba(0,0,0,0.62) 0 ${Math.round(remaining * 360)}deg, transparent 0)` : 'none');
      setText(c.state, !training
        ? `${option.cost} ${CURRENCY}`
        : q.state === 'noBarracks'
          ? t('NO MINISTRY')
          : q.state === 'onHold'
            ? t('ON HOLD {p}%', { p: Math.floor(progress * 100) })
            : `${Math.floor(progress * 100)}%`);
    }
  }

  private updateVehicleCameos(model: SidebarModel): void {
    const q = model.vehicleQueue;
    for (const option of this.vehicleOptions) {
      const c = this.vehicleCameos.get(option.key);
      if (!c) continue;
      const have = option.needsAirfield ? model.hasAirfield : model.hasWarFactory;
      const count = q.items.filter((k) => k === option.key).length;
      // Every order is built at once: each cameo shows its own most advanced machine.
      const producing = count > 0;
      const progress = model.vehicleProgress(option.key);
      this.flashIfDone(`v:${option.key}`, 'vehicles', count, progress);
      setData(c.el, 'state', producing ? q.state : 'idle');
      const atLimit = model.vehicleQueued >= BUILD_LIMIT_VEHICLES && count === 0;
      const noTech = TECH_VEHICLES.includes(option.kind) && !model.owned.has('techCenter');
      const noParking = isAircraftKind(option.kind) && option.kind !== 'heli' && model.parkingFree <= 0 && count === 0;
      const locked = !have || atLimit || noTech || noParking;
      c.el.classList.toggle('locked', locked);
      (c.el as HTMLButtonElement).disabled = locked;
      if (c.badge) {
        c.badge.textContent = count > 0 ? String(count) : '';
        c.badge.hidden = count === 0;
      }
      const remaining = producing ? 1 - progress : 0;
      setBackground(c.wipe, producing ? `conic-gradient(rgba(0,0,0,0.62) 0 ${Math.round(remaining * 360)}deg, transparent 0)` : 'none');
      setText(c.state, !producing
        ? !have
            ? option.needsAirfield
              ? t('NO AIRFIELD')
              : t('NO FACTORY')
            : `${option.cost} ${CURRENCY}`
        : q.state === 'noAirfield'
          ? t('NO AIRFIELD')
          : q.state === 'noFactory'
            ? t('NO FACTORY')
            : q.state === 'noPower'
              ? t('NO POWER {p}%', { p: Math.floor(progress * 100) })
              : q.state === 'exitBlocked'
              ? t('EXIT BLOCKED')
              : q.state === 'onHold'
              ? t('ON HOLD {p}%', { p: Math.floor(progress * 100) })
              : `${Math.floor(progress * 100)}%`);
    }
  }

  private buildVehicleCameos(container: HTMLElement): void {
    for (const option of this.vehicleOptions) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'sb-cameo';
      el.title = `${this.foreignName(option)} — ${option.cost} ${CURRENCY}, ${option.trainSeconds} s. ${option.description} ${t('Click to build, right-click to cancel.')}`;
      el.innerHTML = `
        <canvas width="128" height="96"></canvas>
        <span class="sb-cameo-wipe"></span>
        <span class="sb-cameo-info"></span>
        <span class="sb-cameo-name"></span>
        <span class="sb-cameo-badge" hidden></span>
        <span class="sb-cameo-state"></span>`;
      const canvas = el.querySelector('canvas');
      if (canvas) drawPreview(canvas, this.handlers.vehiclePreview(option));
      addInfoIcon(el, this.foreignName(option));
      this.addForeignFlag(el, option.faction);
      el.addEventListener('click', () => this.handlers.onVehicle(option));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.handlers.onVehicleCancel(option);
      });
      container.append(el);
      const wipe = el.querySelector<HTMLElement>('.sb-cameo-wipe');
      const state = el.querySelector<HTMLElement>('.sb-cameo-state');
      const badge = el.querySelector<HTMLElement>('.sb-cameo-badge') ?? undefined;
      if (wipe && state) this.vehicleCameos.set(option.key, { el, wipe, state, badge });
    }
  }

  private buildUnitCameos(container: HTMLElement): void {
    for (const option of this.trainOptions) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'sb-cameo';
      el.title = `${this.foreignName(option)} — ${option.cost} ${CURRENCY}, ${option.trainSeconds} s. ${option.description} ${t('Click to train, right-click to cancel.')}`;
      el.innerHTML = `
        <canvas width="128" height="96"></canvas>
        <span class="sb-cameo-wipe"></span>
        <span class="sb-cameo-info"></span>
        <span class="sb-cameo-name"></span>
        <span class="sb-cameo-badge" hidden></span>
        <span class="sb-cameo-state"></span>`;
      const canvas = el.querySelector('canvas');
      if (canvas) drawPreview(canvas, this.handlers.trainPreview(option));
      addInfoIcon(el, this.foreignName(option));
      this.addForeignFlag(el, option.faction);
      el.addEventListener('click', () => this.handlers.onTrain(option));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.handlers.onTrainCancel(option);
      });
      container.append(el);
      const wipe = el.querySelector<HTMLElement>('.sb-cameo-wipe');
      const state = el.querySelector<HTMLElement>('.sb-cameo-state');
      const badge = el.querySelector<HTMLElement>('.sb-cameo-badge') ?? undefined;
      if (wipe && state) this.unitCameos.set(option.key, { el, wipe, state, badge });
    }
  }

  /** Another nation's design: its flag on the cameo (own designs carry none). */
  private addForeignFlag(el: HTMLElement, faction: FactionId): void {
    if (faction === this.faction) return;
    const img = document.createElement('img');
    img.className = 'sb-cameo-flag';
    img.alt = FACTIONS[faction].shortName;
    img.src = this.flagUrl(faction);
    el.append(img);
  }

  /** Name on a cameo; another nation's design carries that nation's name. */
  private foreignName(option: { name: string; faction: FactionId }): string {
    return option.faction === this.faction ? option.name : `${option.name} (${FACTIONS[option.faction].shortName})`;
  }

  private buildTabs(nav: HTMLElement): void {
    for (const tab of BUILD_TABS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.disabled = !tab.enabled;
      btn.dataset.tab = tab.id;
      btn.classList.toggle('active', false);
      btn.title = tab.enabled ? t(tab.label) : t('{label} (coming soon)', { label: t(tab.label) });
      if (tab.id === 'infantry' || tab.id === 'vehicles') btn.disabled = true; // unlocked by the matching building
      btn.setAttribute('aria-label', t(tab.label));
      btn.setAttribute('aria-pressed', 'false');
      btn.append(createElement(tab.icon, { width: 18, height: 18, 'stroke-width': 2, 'aria-hidden': 'true' }));
      btn.addEventListener('click', () => {
        if (!btn.disabled) this.switchTab(tab.id, true);
      });
      // One row with Command: the production tabs follow it.
      nav.append(btn);
      this.tabButtons.set(tab.id, btn);
    }
  }

  private buildCameos(container: HTMLElement, defense: HTMLElement): void {
    for (const option of this.options) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'sb-cameo sb-cameo-structure';
      // The Allied Building is the nation's embassy in that land.
      el.title =
        option.id === 'alliedBuilding'
          ? t('{nation} Embassy', { nation: FACTIONS[this.faction].shortName })
          : `${option.foreign ? this.foreignName({ name: option.name, faction: option.foreign }) : option.name} — ${buildCost(option, this.faction)} ${CURRENCY}. ${t('Click to build, right-click to cancel.')}`;
      el.innerHTML = `
        <canvas width="128" height="96"></canvas>
        <span class="sb-cameo-wipe"></span>
        <span class="sb-cameo-info"></span>
        <span class="sb-cameo-state"></span>`;
      const canvas = el.querySelector('canvas');
      if (canvas) drawPreview(canvas, this.handlers.preview(option), '#ffffff');
      addInfoIcon(el, option.name);
      if (option.foreign) this.addForeignFlag(el, option.foreign);
      el.addEventListener('click', () => this.handlers.onBuild(option));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.handlers.onCancel(option);
      });
      (DEFENSE_IDS.has(option.id) ? defense : container).append(el);
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

/** Same K / M / B shortening for any unit. */
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

/** Energy in joules (J), named after James Prescott Joule, with SI prefixes: 950 J, 1.2 kJ, 3.4 MJ, 5 GJ. */
export function compactEnergy(value: number): string {
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  for (const [size, prefix] of [[1e9, 'G'], [1e6, 'M'], [1e3, 'k']] as const) {
    if (v >= size) return `${sign}${parseFloat((v / size).toFixed(2))} ${prefix}J`;
  }
  return `${sign}${Math.floor(v)} J`;
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

/** Info icon in the cameo corner (tooltip + accessible name); soldier and vehicle cameos also print the name small. */
function addInfoIcon(el: HTMLElement, name: string): void {
  el.setAttribute('aria-label', name);
  const label = el.querySelector<HTMLElement>('.sb-cameo-name');
  if (label) label.textContent = name; // soldiers and vehicles show their name in small print
  const slot = el.querySelector<HTMLElement>('.sb-cameo-info');
  if (!slot) return;
  slot.title = el.title;
  slot.append(createElement(Info, { width: 14, height: 14, 'stroke-width': 2.25, 'aria-hidden': 'true' }));
}

/** Fits a sprite canvas into the cameo picture. */
/** `background`: a flat fill (structure cameos are on white); soldiers and vehicles keep the dark gradient. */
function drawPreview(target: HTMLCanvasElement, sprite: HTMLCanvasElement, background?: string): void {
  const ctx = target.getContext('2d');
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, 0, target.height);
  g.addColorStop(0, '#2a3440');
  g.addColorStop(1, '#151b21');
  ctx.fillStyle = background ?? g;
  ctx.fillRect(0, 0, target.width, target.height);
  const k = Math.min(target.width / sprite.width, target.height / sprite.height) * 0.95;
  const w = sprite.width * k;
  const h = sprite.height * k;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sprite, (target.width - w) / 2, (target.height - h) / 2, w, h);
}
