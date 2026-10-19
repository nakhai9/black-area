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
function slab(mask: number, grow = 0, thick = THICK): Rect[] {
  const h = thick / 2 + grow;
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
/**
 * Great Wall crenels: along both long edges of every plan rectangle, merlons (raised blocks) with gaps between them,
 * as on the Great Wall's battlements.
 */
function battlements(rects: readonly Rect[]): Rect[] {
  const out: Rect[] = [];
  const W = 0.07; // merlon thickness across the wall
  const STEP = 0.2;
  const LEN = 0.12;
  for (const [u0, v0, u1, v1] of rects) {
    const alongU = u1 - u0 >= v1 - v0;
    const len = alongU ? u1 - u0 : v1 - v0;
    const n = Math.max(1, Math.round(len / STEP));
    for (let i = 0; i < n; i++) {
      const a = (alongU ? u0 : v0) + (i + 0.5) * (len / n) - LEN / 2;
      const b = a + LEN;
      if (alongU) out.push([a, v0, b, v0 + W], [a, v1 - W, b, v1]);
      else out.push([u0, a, u0 + W, b], [u1 - W, a, u1, b]);
    }
  }
  return out;
}

export function createWallArt(faction: FactionId, mask = 0): BuildingArt {
  if (faction === 'china') return greatWall(mask);
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

/**
 * China's wall block in the manner of the Great Wall: a thick body of grey stone with brick courses, a paved walkway on
 * top and crenellated battlements (merlons and gaps) along both of its edges.
 */
function greatWall(mask: number): BuildingArt {
  const STONE = '#8f8a80';
  const BRICK = '#a49c8e';
  const PAVE = '#b8b1a2';
  const thick = 0.5;
  const body = slab(mask, 0, thick);
  const top = slab(mask, 0.03, thick);
  // The middle square is where the arms meet: no merlons across the walkway there.
  const crenels = battlements(top.length > 1 ? top.slice(1) : top);
  const H = WALL_H - 4;
  return {
    footprint: { w: 1, d: 1 },
    height: H + 10,
    noRim: true,
    drawStatic(p) {
      // Stone base, then brick courses (a darker mortar line every few px), the walkway on top.
      for (let z = 0; z <= H; z += 0.5) {
        const course = z > 8 && Math.round(z * 2) % 6 === 0;
        fillAt(p, body, z, course ? shade(BRICK, 0.7) : shade(z <= 8 ? STONE : BRICK, 0.7 + (0.22 * z) / H));
      }
      for (let z = H; z <= H + 1.5; z += 0.5) fillAt(p, top, z, shade(BRICK, 0.95));
      fillAt(p, top, H + 1.5, PAVE);
      // Battlements: merlons with gaps along both edges of the walkway.
      for (let z = H + 1.5; z <= H + 6; z += 0.5) fillAt(p, crenels, z, shade(BRICK, 0.85 + (0.15 * (z - H)) / 6));
      fillAt(p, crenels, H + 6, shade(BRICK, 1.15));
    },
  };
}
