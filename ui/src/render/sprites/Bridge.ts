import { BRIDGE_L, BRIDGE_W } from '../../constants';
import { BRIDGE_JOIN_HIGH, BRIDGE_JOIN_LOW, BRIDGE_JOIN_SIDE_HIGH, BRIDGE_JOIN_SIDE_LOW } from '../../entities/Bridge';
import type { FactionId } from '../../types';
import { bridgeColors } from '../BridgeLayerModel';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

/** Damage stages of a bridge section (see Bridge.damageLevel). */
export const BRIDGE_DAMAGE_LEVELS = 3;

/** Deck top (px above the ground), girder height above it, the ramp length (cells) at an open end. */
const DECK = 5;
/** Units on a bridge are drawn this many iso px up, on its deck. */
export const BRIDGE_DECK_PX = DECK;
const GIRDER = 3.2;
const RAMP = 0.6;
const LEN = BRIDGE_L;
const WIDE = BRIDGE_W;
/** One ribbed treadway per cell across (u from, u to), and the side girders' thickness (cells). */
const TREADS: readonly [number, number][] = Array.from({ length: WIDE }, (_, i) => [i + 0.17, i + 0.83] as [number, number]);
const SIDE = 0.12;

/** Deck height at v (cells along the bridge): ramps down to the ground at an open end. */
function deckAt(v: number, low: boolean, high: boolean): number {
  if (!low && v < RAMP) return (DECK * v) / RAMP;
  if (!high && v > LEN - RAMP) return (DECK * (LEN - v)) / RAMP;
  return DECK;
}

/** Deck height (px) at v cells along a section whose low / high ends run on into another section (no ramp there). */
export function bridgeDeckAt(v: number, low: boolean, high: boolean): number {
  return deckAt(Math.max(0, Math.min(LEN, v)), low, high);
}

/** A strip across the deck from v0 to v1 between u0 and u1, following the ramps. */
function strip(p: IsoPainter, u0: number, u1: number, v0: number, v1: number, low: boolean, high: boolean, color: string, lift = 0): void {
  p.polygon(
    [
      [u0, v0, deckAt(v0, low, high) + lift],
      [u1, v0, deckAt(v0, low, high) + lift],
      [u1, v1, deckAt(v1, low, high) + lift],
      [u0, v1, deckAt(v1, low, high) + lift],
    ],
    color,
    null,
  );
}

/** One side girder (u0..u0 + SIDE) along the bridge: a steel beam riding GIRDER px over the deck, its outer face striped. */
function girder(p: IsoPainter, u0: number, low: boolean, high: boolean, steel: string, stripe: string, outer: boolean, damage: number): void {
  const segs = LEN * 4;
  for (let i = 0; i < segs; i++) {
    const v0 = (i / segs) * LEN;
    const v1 = ((i + 1) / segs) * LEN;
    // A badly damaged bridge has lost a stretch of one rail.
    if (damage >= 2 && outer && i >= 5 && i <= 6) continue;
    const z0 = deckAt(v0, low, high);
    const z1 = deckAt(v1, low, high);
    const top0 = z0 + GIRDER * Math.min(1, z0 / DECK + 0.35);
    const top1 = z1 + GIRDER * Math.min(1, z1 / DECK + 0.35);
    // Inner face, outer (+u) face with the team stripe, top.
    p.polygon([[u0 + SIDE, v0, z0 - 1.5], [u0 + SIDE, v1, z1 - 1.5], [u0 + SIDE, v1, top1], [u0 + SIDE, v0, top0]], shade(steel, outer ? 0.86 : 0.7), null);
    if (outer) {
      const band = (a: number, b: number): [number, number, number][] => [
        [u0 + SIDE + 0.01, v0, z0 + (top0 - z0) * a],
        [u0 + SIDE + 0.01, v1, z1 + (top1 - z1) * a],
        [u0 + SIDE + 0.01, v1, z1 + (top1 - z1) * b],
        [u0 + SIDE + 0.01, v0, z0 + (top0 - z0) * b],
      ];
      p.polygon(band(0.45, 0.75), stripe, null);
    }
    p.polygon([[u0, v0, top0], [u0 + SIDE, v0, top0], [u0 + SIDE, v1, top1], [u0, v1, top1]], shade(steel, 1.15), null);
  }
  // Rivet plates where the girder sections bolt together.
  for (let v = 0.5; v < LEN; v += 0.5) {
    const z = deckAt(v, low, high);
    p.polygon([[u0 + SIDE + 0.02, v - 0.03, z], [u0 + SIDE + 0.02, v + 0.03, z], [u0 + SIDE + 0.02, v + 0.03, z + GIRDER * 0.9], [u0 + SIDE + 0.02, v - 0.03, z + GIRDER * 0.9]], shade(steel, 0.6), null);
  }
}

/**
 * A laid Bridge section (BRIDGE_W × BRIDGE_L cells, long along v) of a nation's bridge layer: painted steel treadway bridge — one
 * ribbed treadway per cell across with gaps between, side girders with the team stripe, the deck carried DECK px over the ground or
 * water, ramps down at the open ends only (`joins`: ends running on into another section). Damage: scorch, holes in the
 * deck, then a stretch of rail torn away.
 */
export function createBridgeArt(faction: FactionId, joins = 0, damage = 0): BuildingArt {
  const { deck, steel, stripe } = bridgeColors(faction);
  const low = (joins & BRIDGE_JOIN_LOW) !== 0;
  const high = (joins & BRIDGE_JOIN_HIGH) !== 0;
  // A section alongside: that girder goes and the deck runs out to the edge, so the two read as one wide bridge.
  const sideLow = (joins & BRIDGE_JOIN_SIDE_LOW) !== 0;
  const sideHigh = (joins & BRIDGE_JOIN_SIDE_HIGH) !== 0;
  const u0 = sideLow ? 0 : SIDE;
  const u1 = sideHigh ? WIDE : WIDE - SIDE;
  return {
    footprint: { w: WIDE, d: LEN },
    height: DECK + GIRDER + 3,
    noRim: true, // joined sections read as one bridge
    drawStatic(p) {
      // Under-structure: the deck's front edge seen at the open ends, and the dark underside between the girders.
      p.polygon([[u0, 0, deckAt(0, low, high) - 1.5], [u1, 0, deckAt(0, low, high) - 1.5], [u1, LEN, deckAt(LEN, low, high) - 1.5], [u0, LEN, deckAt(LEN, low, high) - 1.5]], shade(steel, 0.35), null);
      if (!sideLow) girder(p, 0, low, high, steel, stripe, false, damage);
      // Deck plate between the girders, then the two treadways with their cross ribs.
      strip(p, u0, u1, 0, LEN, low, high, shade(deck, 0.62));
      for (const [u0, u1] of TREADS) {
        strip(p, u0, u1, 0, LEN, low, high, shade(deck, 1.02), 0.05);
        for (let v = 0.06; v < LEN; v += 0.14) strip(p, u0, u1, v, v + 0.05, low, high, shade(deck, 0.8), 0.08);
        // Kerbs along the treadway edges.
        strip(p, u0, u0 + 0.04, 0, LEN, low, high, shade(steel, 1.2), 0.12);
        strip(p, u1 - 0.04, u1, 0, LEN, low, high, shade(steel, 1.2), 0.12);
      }
      // Front face of the deck at a joined high end: a straight seam (no ramp) into the next section.
      if (high) p.polygon([[u0, LEN, DECK - 1.5], [u1, LEN, DECK - 1.5], [u1, LEN, DECK], [u0, LEN, DECK]], shade(steel, 0.55), null);
      if (damage >= 1) {
        for (const [u, v, r] of [[0.6, 1.1, 0.22], [WIDE - 0.6, 2.1, 0.18], [WIDE / 2, 0.7, 0.14]] as const) {
          const z = deckAt(v, low, high) + 0.15;
          p.polygon(Array.from({ length: 7 }, (_, k) => [u + Math.cos((k / 7) * Math.PI * 2) * r, v + Math.sin((k / 7) * Math.PI * 2) * r, z] as [number, number, number]), 'rgba(30,24,18,0.55)', null);
        }
      }
      if (damage >= 2) {
        for (const [u, v] of [[0.55, 1.5], [WIDE - 0.55, 0.9]] as const) {
          const z = deckAt(v, low, high) + 0.2;
          p.polygon([[u - 0.18, v - 0.2, z], [u + 0.2, v - 0.12, z], [u + 0.14, v + 0.22, z], [u - 0.2, v + 0.16, z]], '#0e0c0a', null);
        }
      }
      if (!sideHigh) girder(p, WIDE - SIDE, low, high, steel, stripe, true, damage);
    },
  };
}
