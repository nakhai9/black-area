import { BRIDGE_HP, BRIDGE_MAX_SECTIONS, FOOTPRINT_BRIDGE, MOUNTAIN_PASS } from '../constants';
import type { TileMap } from '../map/TileMap';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/** Bridge.joins: the low end (smaller y, or smaller x when rotated) runs on into another bridge. */
export const BRIDGE_JOIN_LOW = 1;
/** Bridge.joins: the high end runs on into another bridge. */
export const BRIDGE_JOIN_HIGH = 2;
/** Bridge.joins: another bridge lies alongside the low side (smaller x, or smaller y when rotated): one wide deck. */
export const BRIDGE_JOIN_SIDE_LOW = 4;
/** Bridge.joins: another bridge lies alongside the high side. */
export const BRIDGE_JOIN_SIDE_HIGH = 8;

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

  /** The cells just past the low (`high` false) or high long side, the whole length of the section. */
  sideBeyond(high: boolean): { x: number; y: number }[] {
    const len = FOOTPRINT_BRIDGE.d;
    const at = high ? FOOTPRINT_BRIDGE.w : -1;
    const out: { x: number; y: number }[] = [];
    for (let k = 0; k < len; k++) out.push(this.rotated ? { x: this.x + k, y: this.y + at } : { x: this.x + at, y: this.y + k });
    return out;
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
      // Bridge cells are only allowed where the section closes the gap between two bridges (see bridgeGap).
      if (!map.inBounds(tx, ty) || map.occupantAt(tx, ty) !== null || map.hasTrees(tx, ty)) return false;
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
  const gap = bridgeGap(map, x, y, rotated);
  if (gap === 'bad') return null;
  if (gap === 'joins') return false; // laid from the low end, standing on the bridge there
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
 * A section laid over bridge cells: 'joins' when it closes the gap between two bridges into one (whole rows of bridge
 * only at its two ends, or a bridge just past an end, the rows between open water), 'bad' for any other overlap,
 * 'none' when no cell of it is a bridge yet.
 */
function bridgeGap(map: TileMap, x: number, y: number, rotated: boolean): 'none' | 'joins' | 'bad' {
  const len = FOOTPRINT_BRIDGE.d;
  const across = FOOTPRINT_BRIDGE.w;
  // Row k (0..len-1) of the footprint: 'b' all bridge, 'w' none bridge, 'x' mixed.
  const rows: string[] = [];
  for (let k = 0; k < len; k++) {
    let n = 0;
    for (let j = 0; j < across; j++) if (map.isBridge(rotated ? x + k : x + j, rotated ? y + j : y + k)) n++;
    rows.push(n === 0 ? 'w' : n === across ? 'b' : 'x');
  }
  const bridged = (high: boolean): boolean => bridgeEnd(x, y, rotated, high, true).every((c) => map.inBounds(c.x, c.y) && map.isBridge(c.x, c.y));
  if (rows.every((c) => c === 'w')) return bridged(false) && bridged(true) ? 'joins' : 'none';
  const m = /^(b*)(w+)(b*)$/.exec(rows.join(''));
  if (!m) return 'bad';
  const lowJoined = (m[1] ?? '').length > 0 || bridged(false);
  const highJoined = (m[3] ?? '').length > 0 || bridged(true);
  return lowJoined && highJoined ? 'joins' : 'bad';
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

/**
 * Where a bridge layer may stand to lay the bridge at (x, y), as a segment in cell units: the anchor alone, or — when
 * the section runs on from an existing bridge — from the anchor back along that bridge to the bank it starts from, so a
 * layer near any part of the bridge it extends is in reach (it drives over the bridge to the end). Null when illegal.
 */
export function bridgeReachSegment(map: TileMap, x: number, y: number, rotated: boolean): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const at = bridgeAnchor(map, x, y, rotated);
  if (!at) return null;
  const high = bridgeStart(map, x, y, rotated);
  if (high === null) return { a: at, b: at };
  const beyond = bridgeEnd(x, y, rotated, high, true);
  if (!beyond.every((c) => map.inBounds(c.x, c.y) && map.isBridge(c.x, c.y))) return { a: at, b: at };
  const step = high ? 1 : -1;
  // Walk back along the bridge (away from the new section) to the first cell past it (the bank it starts from).
  let n = 0;
  const along = (k: number): { x: number; y: number }[] => beyond.map((c) => (rotated ? { x: c.x + k * step, y: c.y } : { x: c.x, y: c.y + k * step }));
  while (n < 64 && along(n + 1).every((c) => map.inBounds(c.x, c.y) && map.isBridge(c.x, c.y))) n++;
  const d = n + 1; // one cell past the last bridge row: the bank
  return { a: at, b: rotated ? { x: at.x + d * step, y: at.y } : { x: at.x, y: at.y + d * step } };
}
