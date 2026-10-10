import { Airfield } from '../entities/Airfield';
import { AlliedBuilding } from '../entities/AlliedBuilding';
import { Barracks } from '../entities/Barracks';
import { Capital } from '../entities/Capital';
import { Entity } from '../entities/Entity';
import { Flagpole } from '../entities/Flagpole';
import { HappyCity } from '../entities/HappyCity';
import { Hospital } from '../entities/Hospital';
import { Bunker } from '../entities/Bunker';
import { Infantry } from '../entities/Infantry';
import { OilDerrick } from '../entities/OilDerrick';
import { PowerPlant } from '../entities/PowerPlant';
import { TechCenter } from '../entities/TechCenter';
import { Vehicle } from '../entities/Vehicle';
import { WarFactory } from '../entities/WarFactory';
import { WorldBank } from '../entities/WorldBank';
import { CELL_SIZE, VEHICLE_BASE } from '../constants';
import { FACTIONS } from '../factions';
import { BUILD_OPTIONS } from '../systems/ConstructionSystem';
import type { FactionId, PlayerState, UnitTier, VehicleKind, WorldPoint } from '../types';
import { mulberry32 } from './Random';

/**
 * Saved-game codec. Game objects are plain data held in class instances, so they are written generically:
 *  - an entity anywhere inside the data becomes `{ $e: id }` and is linked back to the restored entity on load;
 *  - a player becomes `{ $p: id }` (players are restored in place, so every holder keeps the same object);
 *  - a build option becomes `{ $o: id }` (shared constants that carry functions);
 *  - Map / Set / seeded generators / non-finite numbers get small tagged forms.
 * Entities themselves are stored as their class name plus their own fields.
 */

/** Every concrete entity class, by the name written into the save. Add new entity classes here. */
const ENTITY_CLASSES: Readonly<Record<string, abstract new (...args: never[]) => Entity>> = {
  Capital,
  WorldBank,
  Barracks,
  WarFactory,
  Hospital,
  Airfield,
  TechCenter,
  OilDerrick,
  HappyCity,
  PowerPlant,
  Flagpole,
  AlliedBuilding,
  Bunker,
  Infantry,
  Vehicle,
};

/**
 * A fresh instance of each entity class built from a saved entity's owner / nation / kind: it supplies the default of
 * every field the save does not have (fields added by later versions of the game). Throws for a kind of unit the game
 * no longer has. Classes not listed take (owner, faction, centre).
 */
const TEMPLATES: Readonly<Record<string, (d: Record<string, unknown>, at: WorldPoint) => Entity>> = {
  Capital: (d, at) => new Capital(FACTIONS[d.faction as FactionId], d.owner as number, at),
  WorldBank: (_d, at) => new WorldBank(at),
  OilDerrick: (d, at) => new OilDerrick(d.owner as number, d.faction as FactionId, at, (d.rowIndex as number) ?? 0, d.bankManaged === true),
  Infantry: (d, at) => new Infantry(d.owner as number, d.faction as FactionId, d.tier as UnitTier, at),
  Vehicle: (d, at) => {
    if (!(String(d.type) in VEHICLE_BASE)) throw new Error(`vehicle kind '${String(d.type)}' was removed`);
    return new Vehicle(d.owner as number, d.faction as FactionId, d.type as VehicleKind, at);
  },
};

/** Written into every save; a save of another format, or of a newer version than this game, is refused. */
export const SAVE_FORMAT = 'black-area-save';
export const SAVE_VERSION = 1;
/**
 * Format upgrades: MIGRATIONS[n] turns a version-n save into a version-(n + 1) save, in place. Only needed for a change
 * the default-merging cannot absorb on its own — a field renamed or moved, a value whose meaning changed. Adding
 * things never needs one. When adding a migration, raise SAVE_VERSION to n + 1.
 */
export const MIGRATIONS: Readonly<Record<number, (save: SaveFile) => void>> = {};

/** Upgrades an older save to the current SAVE_VERSION (in place); throws for a save from a newer game. */
export function migrateSave(save: SaveFile): SaveFile {
  if (save.format !== SAVE_FORMAT) throw new Error('This file is not a Black Area save.');
  if (!(save.version <= SAVE_VERSION)) throw new Error(`This save was made by a newer version of the game (save v${save.version}, game v${SAVE_VERSION}).`);
  for (let v = save.version; v < SAVE_VERSION; v++) {
    MIGRATIONS[v]?.(save);
    save.version = v + 1;
  }
  save.players ??= [];
  save.entities ??= [];
  save.systems ??= {};
  save.game ??= {};
  return save;
}

/** System fields that are catalogues built from the game's own rules (what can be bought): never taken from a save. */
export const RULE_FIELDS: readonly string[] = ['options'];

/** A whole saved game (JSON). */
/**
 * Black Area save file (JSON). The format is built to stay loadable by every later version of the game:
 *  - `format` / `version`: SAVE_FORMAT and the save-format version (SAVE_VERSION). A save from an older format version
 *    is upgraded step by step by MIGRATIONS on load; one from a newer version is refused.
 *  - `gameVersion`: GAME_VERSION that wrote it (information only).
 *  - `players`, `entities` (class name + own fields), `systems` (each system's own fields), `game`, `camera`.
 * Loading never trusts the save to be complete: every entity, system, player and nested plain object starts from the
 * current game's defaults and the saved values are laid over them (mergeDefaults). So anything added to the game
 * later — new fields, new units, structures, rules — simply takes its default in an old save, and anything removed
 * (a kind of unit, an order for something no longer sold) is dropped. See RULE.html "Định dạng file save".
 */
export interface SaveFile {
  format: string;
  version: number;
  /** Game version that wrote the file (GAME_VERSION); for information. */
  gameVersion?: string;
  savedAt: string;
  /** The human player's nation: the new game is created for it, then filled from the save. */
  faction: FactionId;
  nextEntityId: number;
  players: Record<string, unknown>[];
  entities: SavedEntity[];
  systems: Record<string, Record<string, unknown>>;
  game: Record<string, unknown>;
  camera: { x: number; y: number; zoom: number };
}

export interface SavedEntity {
  cls: string;
  data: Record<string, unknown>;
}

export class SaveCodec {
  private readonly players = new Map<PlayerState, number>();
  private readonly playersById = new Map<number, PlayerState>();

  constructor(
    players: readonly PlayerState[],
    /** Entities by id, filled in while loading (resolves `{ $e }`). */
    private readonly entities: Map<number, Entity> = new Map(),
  ) {
    for (const p of players) {
      this.players.set(p, p.id);
      this.playersById.set(p.id, p);
    }
  }

  // ------------------------------------------------------------------ writing

  encode(v: unknown, path = '$'): unknown {
    if (v === null || v === undefined || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
    if (typeof v === 'function') {
      const state = (v as { state?: unknown }).state;
      if (typeof state === 'number') return { $rng: state };
      throw new Error(`Cannot save a function at ${path}`);
    }
    if (typeof v !== 'object') throw new Error(`Cannot save a ${typeof v} at ${path}`);
    if (v instanceof Entity) return { $e: v.id };
    const pid = this.players.get(v as PlayerState);
    if (pid !== undefined) return { $p: pid };
    const opt = BUILD_OPTIONS.find((o) => o === v);
    if (opt) return { $o: opt.id };
    if (Array.isArray(v)) return v.map((x, i) => this.encode(x, `${path}[${i}]`));
    if (v instanceof Map) return { $m: [...v].map(([k, x], i) => [this.encode(k, `${path}<k${i}>`), this.encode(x, `${path}<${String(k)}>`)]) };
    if (v instanceof Set) return { $s: [...v].map((x, i) => this.encode(x, `${path}{${i}}`)) };
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new Error(`Cannot save an object of class ${proto?.constructor?.name} at ${path}`);
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined) continue;
      out[k] = this.encode(x, `${path}.${k}`);
    }
    return out;
  }

  /** A player's own fields (not the `{ $p }` reference used elsewhere). */
  encodePlayer(p: PlayerState): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(p)) if (x !== undefined) out[k] = this.encode(x, `player${p.id}.${k}`);
    return out;
  }

  /** Like snapshot(), but leaves out `exclude` and any field that cannot be written (its name goes to `skipped`). */
  snapshotSafe(obj: object, exclude: readonly string[], skipped: string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(obj)) {
      if (exclude.includes(k) || !this.isState(x)) continue;
      try {
        out[k] = this.encode(x, `${obj.constructor.name}.${k}`);
      } catch {
        skipped.push(`${obj.constructor.name}.${k}`);
      }
    }
    return out;
  }

  /** An entity as its class name and own fields. */
  encodeEntity(e: Entity): SavedEntity {
    const cls = Object.keys(ENTITY_CLASSES).find((name) => ENTITY_CLASSES[name] === e.constructor);
    if (!cls) throw new Error(`Entity class not registered for saving: ${e.constructor.name}`);
    const data: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(e)) {
      if (x === undefined) continue;
      data[k] = this.encode(x, `${cls}#${e.id}.${k}`);
    }
    return { cls, data };
  }

  /**
   * The saveable fields of a system / the game: every own field except its links to shared parts (other systems,
   * the map, the entity manager, callbacks, the players list) — those are rebuilt by the new game itself.
   */
  snapshot(obj: object, only?: readonly string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(obj)) {
      if (only && !only.includes(k)) continue;
      if (!only && !this.isState(x)) continue;
      out[k] = this.encode(x, `${obj.constructor.name}.${k}`);
    }
    return out;
  }

  /** Plain data (numbers, flags, Maps, Sets, arrays and plain objects of them, entities, generators) — not a link to another part. */
  private isState(x: unknown): boolean {
    if (x === null || typeof x !== 'object') return typeof x !== 'function' || typeof (x as { state?: unknown }).state === 'number';
    if (x instanceof Map || x instanceof Set) return true;
    if (Array.isArray(x)) return !x.some((i) => this.players.has(i as PlayerState));
    const proto = Object.getPrototypeOf(x);
    if (proto !== Object.prototype && proto !== null) return false;
    return !Object.values(x).some((v) => typeof v === 'function' && typeof (v as { state?: unknown }).state !== 'number');
  }

  // ------------------------------------------------------------------ reading

  decode(v: unknown): unknown {
    if (v === null || typeof v !== 'object') return v;
    // A reference to an entity that was not restored (a removed kind of unit) drops out of lists.
    if (Array.isArray(v)) return v.filter((x) => !this.isLostEntity(x)).map((x) => this.decode(x));
    const o = v as Record<string, unknown>;
    if ('$n' in o) return Number(o.$n);
    if ('$rng' in o) {
      const rng = mulberry32(0);
      rng.state = o.$rng as number;
      return rng;
    }
    if ('$e' in o) return this.entities.get(o.$e as number) ?? null;
    if ('$p' in o) return this.playersById.get(o.$p as number) ?? null;
    if ('$o' in o) return BUILD_OPTIONS.find((b) => b.id === o.$o) ?? null;
    if ('$m' in o) return new Map((o.$m as [unknown, unknown][]).map(([k, x]) => [this.decode(k), this.decode(x)]));
    if ('$s' in o) return new Set((o.$s as unknown[]).map((x) => this.decode(x)));
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = this.decode(x);
    return out;
  }

  private isLostEntity(x: unknown): boolean {
    return x !== null && typeof x === 'object' && '$e' in x && !this.entities.has((x as { $e: number }).$e);
  }

  /**
   * Step 1 of loading: a default instance of the entity's class with the saved id, so references can point at it and
   * fields newer than the save keep their defaults. Null for something this version of the game no longer has
   * (it is left out of the loaded game).
   */
  createShell(saved: SavedEntity): Entity | null {
    const Cls = ENTITY_CLASSES[saved.cls];
    if (!Cls) {
      console.warn(`Save: skipped an entity of unknown class ${saved.cls}`);
      return null;
    }
    const d = saved.data;
    const at = { x: Number(d.px ?? (Number(d.x) + 0.5) * CELL_SIZE) || 0, y: Number(d.py ?? (Number(d.y) + 0.5) * CELL_SIZE) || 0 };
    let e: Entity;
    try {
      const make =
        TEMPLATES[saved.cls] ??
        ((s: Record<string, unknown>, p: WorldPoint) => new (Cls as unknown as new (o: number, f: FactionId, c: WorldPoint) => Entity)(s.owner as number, s.faction as FactionId, p));
      e = make(d, at);
    } catch (err) {
      console.warn(`Save: skipped ${saved.cls} #${String(d.id)}:`, err instanceof Error ? err.message : err);
      return null;
    }
    Object.defineProperty(e, 'id', { value: d.id as number, writable: false, enumerable: true, configurable: true });
    this.entities.set(e.id, e);
    return e;
  }

  /**
   * Step 2 of loading: the saved fields over the defaults, now that every entity exists. A saved plain object (a
   * building's spec…) is laid over the default one, so properties added since the save keep their defaults.
   */
  fillEntity(e: Entity, saved: SavedEntity): void {
    const target = e as unknown as Record<string, unknown>;
    for (const [k, x] of Object.entries(saved.data)) {
      if (k === 'id') continue;
      const value = this.decode(x);
      const cur = target[k];
      target[k] = mergeDefaults(cur, value);
    }
  }

  /** Writes saved fields back onto a system / the game. Collections are refilled in place (others may hold them). */
  restore(obj: object, data: Record<string, unknown> | undefined): void {
    if (!data) return;
    const target = obj as Record<string, unknown>;
    for (const [k, x] of Object.entries(data)) {
      if (RULE_FIELDS.includes(k)) continue;
      const value = this.decode(x);
      const cur = target[k];
      if (cur instanceof Map && value instanceof Map) {
        // Entries (e.g. an AI nation's state) start from the fresh game's entry for the same key, or any entry.
        const sample = cur.values().next().value as unknown;
        const fresh = new Map(cur);
        cur.clear();
        for (const [a, b] of value) cur.set(a, mergeDefaults(fresh.get(a) ?? sample, b));
      } else if (cur instanceof Set && value instanceof Set) {
        cur.clear();
        for (const a of value) cur.add(a);
      } else if (Array.isArray(cur) && Array.isArray(value)) {
        cur.splice(0, cur.length, ...value);
      } else target[k] = mergeDefaults(cur, value);
    }
  }

  /** Player fields written onto the existing player objects. */
  restorePlayer(saved: Record<string, unknown>): void {
    const p = this.playersById.get(saved.id as number);
    if (p) for (const [k, v] of Object.entries(this.decode(saved) as Record<string, unknown>)) (p as unknown as Record<string, unknown>)[k] = mergeDefaults((p as unknown as Record<string, unknown>)[k], v);
  }
}

function isPlain(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * The saved value laid over the current default: plain objects are merged key by key (deeply), so properties the
 * save does not know keep their defaults; anything else (numbers, lists, entities, collections) is the saved value.
 * A saved null / missing value for something that is a collection by default keeps the default collection.
 */
export function mergeDefaults(base: unknown, saved: unknown): unknown {
  if (saved === undefined) return base;
  if ((base instanceof Map || base instanceof Set) && !(saved instanceof Map || saved instanceof Set)) return base;
  if (isPlain(base) && isPlain(saved)) {
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(saved)) out[k] = mergeDefaults(base[k], v);
    return out;
  }
  return saved;
}
