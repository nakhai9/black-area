import {
  AIRFIELD_COST,
  ALLIED_BUILDING_COST,
  TECH_CENTER_COST,
  BARRACKS_COST,
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
  HOSPITAL_COST,
  POWER_PLANT_COST,
  WAR_FACTORY_COST,
} from '../constants';
import { Airfield } from '../entities/Airfield';
import { AlliedBuilding } from '../entities/AlliedBuilding';
import { FACTIONS } from '../factions';
import { HappyCity } from '../entities/HappyCity';
import { Hospital } from '../entities/Hospital';
import { PowerPlant } from '../entities/PowerPlant';
import { TechCenter } from '../entities/TechCenter';
import { WarFactory } from '../entities/WarFactory';
import { Barracks } from '../entities/Barracks';
import { Flagpole } from '../entities/Flagpole';
import type { Building } from '../entities/Building';
import type { BuildingType, FactionId, PlayerState } from '../types';
import type { GameSystem } from './GameSystem';

/** A structure that can be produced from the sidebar's Build tab. */
export interface BuildOption {
  id: 'powerPlant' | 'barracks' | 'warFactory' | 'hospital' | 'airfield' | 'techCenter' | 'happyCity' | 'flagpole' | 'alliedBuilding';
  name: string;
  /** Tech tree: these buildings must already stand (power plant → barracks → war factory/hospital → airfield → happy city). */
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
    requires: ['airfield', 'hospital'],
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
    // Seat of an ally: only on land claimed by a Squatters team (see Game.alliedBlocker), at most MAX_ALLIES per nation.
    id: 'alliedBuilding',
    name: 'Allied Building',
    requires: 'flagpole',
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
  if (option.fixedCost) return option.cost;
  return Math.round((option.cost * FACTIONS[faction].stats.cost) / 10) * 10;
}

export type QueueState = 'idle' | 'building' | 'onHold' | 'noPower' | 'ready';

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
      if (!s.option || (s.state !== 'building' && s.state !== 'onHold' && s.state !== 'noPower')) continue;
      // Short of power the economy slows to a halt: only a power plant can still be built.
      if (p.powerShort && s.option.id !== 'powerPlant') {
        s.state = 'noPower';
        continue;
      }
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
