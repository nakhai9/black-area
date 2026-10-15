import { ISLAMIC_GREEN } from './IslamicPalette';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

/** Wall height (px): a tall slab, well above a one-cell block; the cap lip on top (px). */
const WALL_H = 34;
const CAP_H = 3;
/** Slab thickness (cells), how far the cap sticks out on each side (cells), and the inset of an open end (cells). */
const THICK = 0.3;
const LIP = 0.05;
const END_INSET = 0.1;

/** Body tint per nation: Russia / China red, Islamic sandstone (like its buildings), USA / Europe bare concrete. */
const TINT: Record<FactionId, string> = {
  russia: '#9a3b31',
  china: '#a5352c',
  islamic: '#cbb58a',
  usa: '#a6a49c',
  europe: '#a6a49c',
};

/** Cap colour where it differs from the body: the Islamic wall wears a cap in Islamic green (the faction colour). */
const CAP_TINT: Partial<Record<FactionId, string>> = {
  islamic: ISLAMIC_GREEN,
};

/** Neighbour bits of a wall block: which sides another wall block of the same nation touches. */
export const WALL_N = 1;
export const WALL_E = 2;
export const WALL_S = 4;
export const WALL_W = 8;

/** Plan rectangle [u0, v0, u1, v1] (cells). */
type Rect = [number, number, number, number];

/**
 * Plan of a block as a thin slab (THICK cells, centred in the cell) running towards every joined side, so a wall
 * line reads as one long T-wall and corners / T-junctions meet in the middle. A block with no neighbour, or joined on
 * one side only, still runs straight through the cell (its open end pulled in by END_INSET). `grow` widens it (cap).
 */
function slab(mask: number, grow = 0): Rect[] {
  const h = THICK / 2 + grow;
  const lo = 0.5 - h;
  const hi = 0.5 + h;
  let m = mask;
  // Single blocks and line ends: a straight piece through the cell.
  if (!(m & (WALL_N | WALL_S)) && !(m & (WALL_E | WALL_W))) m = WALL_E | WALL_W;
  else if (!(m & (WALL_E | WALL_W)) && (m & (WALL_N | WALL_S)) !== (WALL_N | WALL_S)) m |= WALL_N | WALL_S;
  else if (!(m & (WALL_N | WALL_S)) && (m & (WALL_E | WALL_W)) !== (WALL_E | WALL_W)) m |= WALL_E | WALL_W;
  const end = (side: number): number => (mask & side ? 0 : END_INSET);
  const rects: Rect[] = [[lo, lo, hi, hi]];
  if (m & WALL_N) rects.push([lo, end(WALL_N), hi, 0.5]);
  if (m & WALL_S) rects.push([lo, 0.5, hi, 1 - end(WALL_S)]);
  if (m & WALL_W) rects.push([end(WALL_W), lo, 0.5, hi]);
  if (m & WALL_E) rects.push([0.5, lo, 1 - end(WALL_E), hi]);
  return rects;
}

/** Fills the plan rectangles at height z. */
function fillAt(p: IsoPainter, rects: readonly Rect[], z: number, color: string): void {
  p.ctx.fillStyle = color;
  p.ctx.beginPath();
  for (const [u0, v0, u1, v1] of rects) {
    const pts: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    pts.forEach(([u, v], i) => {
      const [x, y] = p.project(u, v, z);
      if (i === 0) p.ctx.moveTo(x, y);
      else p.ctx.lineTo(x, y);
    });
    p.ctx.closePath();
  }
  p.ctx.fill('nonzero');
}

/**
 * Wall (1×1): a tall, thin concrete slab (T-wall) standing in the middle of its cell, with a slightly wider cap on top.
 * `mask` (WALL_N | WALL_E | WALL_S | WALL_W) marks the sides joined to neighbouring blocks: the slab runs on to those
 * edges, so a wall line is one unbroken slab and corners / junctions meet in the cell's middle.
 */
export function createWallArt(faction: FactionId, mask = 0): BuildingArt {
  const c = TINT[faction];
  const top = CAP_TINT[faction] ?? c;
  const body = slab(mask);
  const cap = slab(mask, LIP);
  return {
    footprint: { w: 1, d: 1 },
    height: WALL_H + 4,
    noRim: true, // joined blocks read as one piece
    drawStatic(p) {
      // Extruded slab: stacked layer by layer, darker at the foot.
      const straight = WALL_H - CAP_H;
      for (let z = 0; z <= straight; z += 0.5) fillAt(p, body, z, shade(c, 0.65 + (0.2 * z) / straight));
      // Cap: a little wider than the slab, lighter, its top lightest.
      for (let z = straight; z <= WALL_H; z += 0.5) fillAt(p, cap, z, shade(top, 0.95 + (0.1 * (z - straight)) / CAP_H));
      fillAt(p, cap, WALL_H, shade(top, 1.2));
    },
  };
}
