import { demoPrice } from '../core/Demo';
import {
  AIRFIELD_COST,
  ALLIED_BUILDING_COST,
  TECH_CENTER_COST,
  BARRACKS_COST,
  BUNKER_COST,
  WALL_COST,
  FOOTPRINT_WALL,
  GATE_COST,
  FOOTPRINT_GATE,
  FOOTPRINT_BUNKER,
  BUILD_STEP_FRACTION,
  BUILD_STEP_SECONDS,
  CELL_SIZE,
  FOOTPRINT_AIRFIELD,
  FOOTPRINT_CITY,
  FOOTPRINT_FLAGPOLE,
  FLAGPOLE_COST,
  HAPPY_CITY_COST,
  FOOTPRINT_LARGE,
  FOOTPRINT_SMALL,
  POWER_PLANT_COST,
  WAR_FACTORY_COST,
} from '../constants';
import { Airfield } from '../entities/Airfield';
import { AlliedBuilding } from '../entities/AlliedBuilding';
import { FACTIONS } from '../factions';
import { HappyCity } from '../entities/HappyCity';
import { Bunker } from '../entities/Bunker';
import { PowerPlant } from '../entities/PowerPlant';
import { TechCenter } from '../entities/TechCenter';
import { WarFactory } from '../entities/WarFactory';
import { Barracks } from '../entities/Barracks';
import { Flagpole } from '../entities/Flagpole';
import { Wall } from '../entities/Wall';
import { Gate } from '../entities/Gate';
import type { Building } from '../entities/Building';
import type { BuildingType, FactionId, PlayerState } from '../types';
import type { GameSystem } from './GameSystem';

/** A structure that can be produced from the sidebar's Build tab. */
export interface BuildOption {
  id: 'powerPlant' | 'barracks' | 'warFactory' | 'airfield' | 'techCenter' | 'happyCity' | 'flagpole' | 'alliedBuilding' | 'bunker' | 'wall' | 'gate';
  name: string;
  /** Tech tree: these buildings must already stand (power plant → barracks → war factory → airfield → happy city). */
  requires?: BuildingType | readonly BuildingType[];
  cost: number;
  /** Same price for every nation (the faction cost multiplier is not applied). */
  fixedCost?: boolean;
  footprint: { w: number; d: number };
  spriteKey: (faction: FactionId) => string;
  /** Creates the building with its footprint's top-left at cell (x, y). */
  create: (owner: number, faction: FactionId, x: number, y: number) => Building;
}

const center = (x: number, y: number, f: { w: number; d: number }) => ({
  x: (x + f.w / 2) * CELL_SIZE,
  y: (y + f.d / 2) * CELL_SIZE,
});

export const BUILD_OPTIONS: readonly BuildOption[] = [
  {
    id: 'powerPlant',
    name: 'Nuclear Power Plant',
    cost: POWER_PLANT_COST,
    footprint: FOOTPRINT_SMALL,
    spriteKey: (f) => `powerPlant:${f}`,
    create: (owner, faction, x, y) => new PowerPlant(owner, faction, center(x, y, FOOTPRINT_SMALL)),
  },
  {
    id: 'barracks',
    name: 'Ministry of Defence',
    // First building of every nation is a power plant: nothing else runs without power.
    requires: 'powerPlant',
    cost: BARRACKS_COST,
    footprint: FOOTPRINT_SMALL,
    spriteKey: (f) => `barracks:${f}`,
    create: (owner, faction, x, y) => new Barracks(owner, faction, center(x, y, FOOTPRINT_SMALL)),
  },
  {
    id: 'warFactory',
    name: 'War Factory',
    requires: 'barracks',
    cost: WAR_FACTORY_COST,
    footprint: FOOTPRINT_LARGE,
    spriteKey: (f) => `warFactory:${f}`,
    create: (owner, faction, x, y) => new WarFactory(owner, faction, center(x, y, FOOTPRINT_LARGE)),
  },
  {
    // Self-firing machine-gun pillbox: shoots enemy soldiers and ground vehicles in range on its own.
    id: 'bunker',
    name: 'Bunker',
    requires: 'barracks',
    cost: BUNKER_COST,
    footprint: FOOTPRINT_BUNKER,
    spriteKey: (f) => `bunker:${f}`,
    create: (owner, faction, x, y) => new Bunker(owner, faction, center(x, y, FOOTPRINT_BUNKER)),
  },
  {
    // One block of the nation's wall: stops enemy ground units.
    id: 'wall',
    name: 'Wall',
    requires: 'barracks',
    cost: WALL_COST,
    footprint: FOOTPRINT_WALL,
    spriteKey: (f) => `wall:${f}`,
    create: (owner, faction, x, y) => new Wall(owner, faction, center(x, y, FOOTPRINT_WALL)),
  },
  {
    // Nation Gate: two pillars in the nation's architecture, a 2-cell way through the middle (R turns it).
    id: 'gate',
    name: 'Nation Gate',
    requires: 'barracks',
    cost: GATE_COST,
    footprint: FOOTPRINT_GATE,
    spriteKey: (f) => `gate:${f}`,
    create: (owner, faction, x, y) => new Gate(owner, faction, center(x, y, FOOTPRINT_GATE)),
  },
  {
    id: 'airfield',
    name: 'Airfield',
    requires: 'warFactory',
    cost: AIRFIELD_COST,
    footprint: FOOTPRINT_AIRFIELD,
    spriteKey: (f) => `airfield:${f}`,
    create: (owner, faction, x, y) => new Airfield(owner, faction, center(x, y, FOOTPRINT_AIRFIELD)),
  },
  {
    id: 'techCenter',
    name: 'High-Tech Center',
    requires: 'warFactory',
    cost: TECH_CENTER_COST,
    footprint: FOOTPRINT_SMALL,
    spriteKey: (f) => `techCenter:${f}`,
    create: (owner, faction, x, y) => new TechCenter(owner, faction, center(x, y, FOOTPRINT_SMALL)),
  },
  {
    id: 'happyCity',
    name: 'Happy City',
    requires: 'airfield',
    cost: HAPPY_CITY_COST,
    fixedCost: true,
    footprint: FOOTPRINT_CITY,
    spriteKey: (f) => `happyCity:${f}`,
    create: (owner, faction, x, y) => new HappyCity(owner, faction, center(x, y, FOOTPRINT_CITY)),
  },
  {
    id: 'flagpole',
    name: 'Flagpole',
    cost: FLAGPOLE_COST,
    footprint: FOOTPRINT_FLAGPOLE,
    spriteKey: (f) => `flagpole:${f}`,
    create: (owner, faction, x, y) => new Flagpole(owner, faction, center(x, y, FOOTPRINT_FLAGPOLE)),
  },
  {
    // Seat of an ally (embassy / Pro-<nation> regime): built like any structure, next to an own flag or building, no cap.
    id: 'alliedBuilding',
    name: 'Allied Building',
    requires: ['barracks', 'warFactory'],
    cost: ALLIED_BUILDING_COST,
    footprint: FOOTPRINT_SMALL,
    spriteKey: (f) => `alliedBuilding:${f}`,
    create: (owner, faction, x, y) => new AlliedBuilding(owner, faction, center(x, y, FOOTPRINT_SMALL)),
  },
];

/** First prerequisite of `option` the nation does not own yet (null = it may be built). */
export function missingRequirement(option: BuildOption, owned: ReadonlySet<BuildingType>): BuildingType | null {
  const list: readonly BuildingType[] = option.requires === undefined ? [] : typeof option.requires === 'string' ? [option.requires] : option.requires;
  return list.find((t) => !owned.has(t)) ?? null;
}

/** Price of a structure for a nation (faction cost multiplier applied, like soldiers and vehicles). */
export function buildCost(option: BuildOption, faction: FactionId): number {
  if (option.fixedCost) return demoPrice(option.cost);
  return demoPrice(Math.round((option.cost * FACTIONS[faction].stats.cost) / 10) * 10);
}

export type QueueState = 'idle' | 'building' | 'onHold' | 'noPower' | 'ready';

/** One order of one structure. Every structure of the Build / Defense tabs has its own, all running in parallel. */
export interface QueueSlot {
  option: BuildOption | null;
  state: QueueState;
  /** 0..1 */
  progress: number;
  /** TB spent so far on the current item. */
  paid: number;
}

/** Share of the build completed per second (20% every 4 s → 20 s total). */
const RATE = BUILD_STEP_FRACTION / BUILD_STEP_SECONDS;

const idleSlot = (): QueueSlot => ({ option: null, state: 'idle', progress: 0, paid: 0 });

/**
 * Sidebar production of structures. Every structure has its own order slot, so all of them are built at the same
 * time, independently (parallel production); a finished one waits in the "ready" state until it is placed. Cost is
 * paid gradually from the owner's treasury; with no money an order goes on hold (the oldest are paid first) and
 * resumes as soon as TB comes in.
 */
export class ConstructionSystem implements GameSystem {
  /** Player id → structure id → its order. (Saves up to 1.29 hold one QueueSlot per player: see `orders`.) */
  private readonly slots = new Map<number, Map<string, QueueSlot> | QueueSlot>();

  constructor(private readonly players: readonly PlayerState[]) {
    for (const p of players) this.slots.set(p.id, new Map());
  }

  /** The nation's orders by structure id (an old single-slot save is converted on first use). */
  private orders(player: PlayerState): Map<string, QueueSlot> {
    const v = this.slots.get(player.id);
    if (v instanceof Map) return v;
    const m = new Map<string, QueueSlot>();
    if (v && v.option && v.state !== 'idle') m.set(v.option.id, v);
    this.slots.set(player.id, m);
    return m;
  }

  /** The order slot of structure `id` (idle when nothing is ordered). */
  slot(player: PlayerState, id: BuildOption['id']): QueueSlot {
    const m = this.orders(player);
    let s = m.get(id);
    if (!s) {
      s = idleSlot();
      m.set(id, s);
    }
    return s;
  }

  /** Every order of the nation that is not idle (building, on hold or ready). */
  active(player: PlayerState): QueueSlot[] {
    return [...this.orders(player).values()].filter((s) => s.state !== 'idle' && s.option !== null);
  }

  /** Starts producing `option`; only when its own slot is free. */
  start(player: PlayerState, option: BuildOption): boolean {
    const s = this.slot(player, option.id);
    if (s.state !== 'idle' || player.capitalLost) return false;
    Object.assign(s, { option, state: 'building', progress: 0, paid: 0 });
    return true;
  }

  /** Cancels the order of structure `id` (or a finished, unplaced one) and refunds what was paid. */
  cancel(player: PlayerState, id: BuildOption['id']): void {
    const s = this.slot(player, id);
    player.credits += s.paid;
    Object.assign(s, idleSlot());
  }

  /** Takes the finished structure `id` for placement; its slot becomes free again. */
  takeReady(player: PlayerState, id: BuildOption['id']): BuildOption | null {
    const s = this.slot(player, id);
    if (s.state !== 'ready' || !s.option) return null;
    const option = s.option;
    Object.assign(s, idleSlot());
    return option;
  }

  update(dt: number): void {
    for (const p of this.players) {
      for (const s of this.orders(p).values()) {
        if (!s.option || (s.state !== 'building' && s.state !== 'onHold' && s.state !== 'noPower')) continue;
        // Orders always run while there is money: power no longer stops construction.
        const cost = buildCost(s.option, p.faction);
        const want = Math.min(cost * RATE * dt, cost - s.paid);
        const pay = p.capitalLost ? 0 : Math.max(0, Math.min(want, p.credits));
        p.credits -= pay;
        s.paid += pay;
        s.progress = Math.min(1, s.paid / cost);
        if (s.progress >= 1) s.state = 'ready';
        else s.state = pay < want - 1e-6 ? 'onHold' : 'building';
      }
    }
  }
}
