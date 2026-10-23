import { BRIDGE_HP, BRIDGE_MAX_SECTIONS, FOOTPRINT_BRIDGE, MOUNTAIN_PASS } from '../constants';
import type { TileMap } from '../map/TileMap';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/** Bridge.joins: the low end (smaller y, or smaller x when rotated) runs on into another bridge. */
export const BRIDGE_JOIN_LOW = 1;
/** Bridge.joins: the high end runs on into another bridge. */
export const BRIDGE_JOIN_HIGH = 2;

/**
 * Bridge (BRIDGE_W × BRIDGE_L) laid by a bridge layer: soldiers and ground vehicles cross water on it (its cells are
 * marked in TileMap.bridge, never `occupied`), ships cannot pass under it. Not capturable; enemies can destroy it, and
 * the water under it is open again. Sections laid end to end join into one long bridge (ramps only at the open ends).
 * `rotated`: the long side runs along x instead of y.
 */
export class Bridge extends Building {
  /** Ends that run on into another bridge (BRIDGE_JOIN_LOW | BRIDGE_JOIN_HIGH): picks the joined sprite. */
  joins = 0;

  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'bridge',
      name: 'Bridge',
      footprint: FOOTPRINT_BRIDGE,
      maxHp: BRIDGE_HP,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: `bridge:${faction}`,
      uncapturable: true,
    });
  }

  /** Damage state from HP left: 0 above 66%, 1 above 33%, 2 below (holed deck, bent rails). */
  get damageLevel(): number {
    const r = this.hpRatio;
    return r > 0.66 ? 0 : r > 0.33 ? 1 : 2;
  }

  override get spriteKey(): string {
    return `${this.spec.spriteKey}|${this.joins}~${this.damageLevel}`;
  }

  /** The cells just beyond the low (`high` false) or high end, outside the footprint. */
  endBeyond(high: boolean): { x: number; y: number }[] {
    return bridgeEnd(this.x, this.y, this.rotated, high, true);
  }
}

/**
 * The two cells of a bridge footprint's end row — the low (smaller y / x) or high end — or, with `beyond`, the two
 * cells just past that end. (x, y) is the footprint's top-left cell; `rotated` = long along x.
 */
export function bridgeEnd(x: number, y: number, rotated: boolean, high: boolean, beyond = false): { x: number; y: number }[] {
  const len = FOOTPRINT_BRIDGE.d;
  const across = FOOTPRINT_BRIDGE.w;
  const at = high ? (beyond ? len : len - 1) : beyond ? -1 : 0;
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < across; k++) out.push(rotated ? { x: x + at, y: y + k } : { x: x + k, y: y + at });
  return out;
}

/** A bridge head rests at most this many cells on the bank, this side and the far side. */
export const BRIDGE_BANK_CELLS = 2;

/**
 * Can a bridge be laid with its top-left cell at (x, y)? Every cell inside the map, free of structures, bridges, trees
 * and mountains (passes allowed), and laid from one end (see bridgeStart): the bank or the bridge it runs on from.
 * Same rule for the player and the AI.
 */
export function bridgeSiteOk(map: TileMap, x: number, y: number, rotated: boolean): boolean {
  const w = rotated ? FOOTPRINT_BRIDGE.d : FOOTPRINT_BRIDGE.w;
  const d = rotated ? FOOTPRINT_BRIDGE.w : FOOTPRINT_BRIDGE.d;
  for (let ty = y; ty < y + d; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (!map.inBounds(tx, ty) || map.occupantAt(tx, ty) !== null || map.isBridge(tx, ty) || map.hasTrees(tx, ty)) return false;
      // No mountain cell but a pass (vehicles could not drive onto it anyway).
      const m = map.mountain[map.index(tx, ty)] ?? 0;
      if (m !== 0 && m !== MOUNTAIN_PASS) return false;
    }
  }
  return bridgeStart(map, x, y, rotated) !== null;
}

/**
 * The end a bridge at (x, y) is laid from (true: the high end), or null when it may not be laid there:
 *  - from the bank: that end row dry, the water starting at most BRIDGE_BANK_CELLS rows in;
 *  - or run straight on from an existing bridge;
 *  - the far bank must be within reach of the whole bridge (at most BRIDGE_MAX_SECTIONS sections, so never across a
 *    sea), and no section rests more than BRIDGE_BANK_CELLS rows on the far bank.
 */
export function bridgeStart(map: TileMap, x: number, y: number, rotated: boolean): boolean | null {
  const len = FOOTPRINT_BRIDGE.d;
  const across = FOOTPRINT_BRIDGE.w;
  // Bridge cells straight on past one end (the sections it would join).
  const run = (high: boolean): number => {
    const start = bridgeEnd(x, y, rotated, high, true)[0]!;
    const step = high ? 1 : -1;
    let n = 0;
    const at = (k: number): [number, number] => (rotated ? [start.x + k * step, start.y] : [start.x, start.y + k * step]);
    while (map.inBounds(...at(n)) && map.isBridge(...at(n))) n++;
    return n;
  };
  const lowRun = run(false);
  const highRun = run(true);
  if (lowRun + highRun + len > BRIDGE_MAX_SECTIONS * len) return null;
  for (const high of [false, true]) {
    const joined = (high ? highRun : lowRun) > 0;
    // Row k counted from this end, going across (k >= len: past the footprint). Dry: no open water in it.
    const dry = (k: number): boolean => {
      const a = high ? len - 1 - k : k;
      for (let j = 0; j < across; j++) {
        const cx = rotated ? x + a : x + j;
        const cy = rotated ? y + j : y + a;
        if (!map.inBounds(cx, cy) || map.isOpenWater(cx, cy)) return false;
      }
      return true;
    };
    let k = 0;
    if (!joined) {
      if (!dry(0)) continue;
      while (k < len && dry(k)) k++;
      if (k > BRIDGE_BANK_CELLS || k >= len) continue;
    }
    // The far bank: the first dry row after the water, within reach of the whole bridge.
    const reach = BRIDGE_MAX_SECTIONS * len - (joined ? (high ? highRun : lowRun) : 0);
    while (k < reach && !dry(k)) k++;
    if (k >= reach || !dry(k)) continue;
    // This section rests at most BRIDGE_BANK_CELLS rows on the far bank.
    if (len - k > BRIDGE_BANK_CELLS) continue;
    return high;
  }
  return null;
}

/**
 * Where a bridge layer stands to lay the bridge at (x, y): the middle of the end that starts on the bank (or runs on
 * from the bridge it extends) — just outside the footprint when that ground is walkable, else on the end row itself.
 * Null when the site is not legal.
 */
export function bridgeAnchor(map: TileMap, x: number, y: number, rotated: boolean): { x: number; y: number } | null {
  if (!bridgeSiteOk(map, x, y, rotated)) return null;
  const walk = (c: { x: number; y: number }): boolean => map.inBounds(c.x, c.y) && map.occupantAt(c.x, c.y) === null && !map.isOpenWater(c.x, c.y);
  const mid = (cells: { x: number; y: number }[]): { x: number; y: number } => ({
    x: cells.reduce((s, c) => s + c.x + 0.5, 0) / cells.length,
    y: cells.reduce((s, c) => s + c.y + 0.5, 0) / cells.length,
  });
  const high = bridgeStart(map, x, y, rotated);
  if (high === null) return null;
  const beyond = bridgeEnd(x, y, rotated, high, true);
  const row = bridgeEnd(x, y, rotated, high);
  if (beyond.every((c) => map.isBridge(c.x, c.y))) return mid(beyond);
  return beyond.every(walk) ? mid(beyond) : mid(row);
}
