import {
  AIRFIELD_COST,
  TECH_CENTER_COST,
  BARRACKS_COST,
  BUILD_STEP_FRACTION,
  BUILD_STEP_SECONDS,
  CELL_SIZE,
  FOOTPRINT_AIRFIELD,
  FOOTPRINT_CITY,
  HAPPY_CITY_COST,
  FOOTPRINT_LARGE,
  FOOTPRINT_SMALL,
  HOSPITAL_COST,
  WAR_FACTORY_COST,
} from '../constants';
import { Airfield } from '../entities/Airfield';
import { FACTIONS } from '../factions';
import { HappyCity } from '../entities/HappyCity';
import { Hospital } from '../entities/Hospital';
import { TechCenter } from '../entities/TechCenter';
import { WarFactory } from '../entities/WarFactory';
import { Barracks } from '../entities/Barracks';
import type { Building } from '../entities/Building';
import type { BuildingType, FactionId, PlayerState } from '../types';
import type { GameSystem } from './GameSystem';

/** A structure that can be produced from the sidebar's Build tab. */
export interface BuildOption {
  id: 'barracks' | 'warFactory' | 'hospital' | 'airfield' | 'techCenter' | 'happyCity';
  name: string;
  /** Tech tree: this building must already stand (barracks → war factory/hospital → airfield). */
  requires?: BuildingType;
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
    id: 'barracks',
    name: 'Barracks',
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
    id: 'hospital',
    name: 'Hospital',
    requires: 'barracks',
    cost: HOSPITAL_COST,
    footprint: FOOTPRINT_LARGE,
    spriteKey: (f) => `hospital:${f}`,
    create: (owner, faction, x, y) => new Hospital(owner, faction, center(x, y, FOOTPRINT_LARGE)),
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
    cost: HAPPY_CITY_COST,
    fixedCost: true,
    footprint: FOOTPRINT_CITY,
    spriteKey: (f) => `happyCity:${f}`,
    create: (owner, faction, x, y) => new HappyCity(owner, faction, center(x, y, FOOTPRINT_CITY)),
  },
];

/** Price of a structure for a nation (faction cost multiplier applied, like soldiers and vehicles). */
export function buildCost(option: BuildOption, faction: FactionId): number {
  if (option.fixedCost) return option.cost;
  return Math.round((option.cost * FACTIONS[faction].stats.cost) / 10) * 10;
}

export type QueueState = 'idle' | 'building' | 'onHold' | 'ready';

/** One structure is produced at a time per nation (RA2 rule). */
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

/**
 * Sidebar production queue. Cost is paid gradually from the owner's treasury
 * while building; with no money the item goes on hold and resumes as soon as
 * TB comes in. A finished structure waits in the "ready" state until placed.
 */
export class ConstructionSystem implements GameSystem {
  private readonly slots = new Map<number, QueueSlot>();

  constructor(private readonly players: readonly PlayerState[]) {
    for (const p of players) this.slots.set(p.id, { option: null, state: 'idle', progress: 0, paid: 0 });
  }

  slot(player: PlayerState): QueueSlot {
    const s = this.slots.get(player.id);
    if (!s) throw new Error(`No construction slot for player ${player.id}`);
    return s;
  }

  /** Starts producing `option`; only when the slot is free. */
  start(player: PlayerState, option: BuildOption): boolean {
    const s = this.slot(player);
    if (s.state !== 'idle') return false;
    Object.assign(s, { option, state: 'building', progress: 0, paid: 0 });
    return true;
  }

  /** Cancels production (or a finished, unplaced item) and refunds what was paid. */
  cancel(player: PlayerState): void {
    const s = this.slot(player);
    player.credits += s.paid;
    Object.assign(s, { option: null, state: 'idle', progress: 0, paid: 0 });
  }

  /** Takes the finished item for placement; the slot becomes free again. */
  takeReady(player: PlayerState): BuildOption | null {
    const s = this.slot(player);
    if (s.state !== 'ready' || !s.option) return null;
    const option = s.option;
    Object.assign(s, { option: null, state: 'idle', progress: 0, paid: 0 });
    return option;
  }

  update(dt: number): void {
    for (const p of this.players) {
      const s = this.slot(p);
      if (!s.option || (s.state !== 'building' && s.state !== 'onHold')) continue;
      const cost = buildCost(s.option, p.faction);
      const want = Math.min(cost * RATE * dt, cost - s.paid);
      const pay = Math.max(0, Math.min(want, p.credits));
      p.credits -= pay;
      s.paid += pay;
      s.progress = Math.min(1, s.paid / cost);
      if (s.progress >= 1) s.state = 'ready';
      else s.state = pay < want - 1e-6 ? 'onHold' : 'building';
    }
  }
}
