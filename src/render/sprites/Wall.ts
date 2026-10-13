import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

/** Wall height (px), and how far (px) the rounded (bullnose) top curls in. */
const WALL_H = 22;
const ROUND_H = 2;
/** Corner radius (cells) on the open corners, and the inset (cells) of the open sides. */
const RADIUS = 0.08;
const INSET = 0.04;

/** Concrete tint per nation: Russia / China red, Islamic blue, USA / Europe bare concrete. */
const TINT: Record<FactionId, string> = {
  russia: '#9a3b31',
  china: '#a5352c',
  islamic: '#2f6aa6',
  usa: '#a6a49c',
  europe: '#a6a49c',
};

/** Neighbour bits of a wall block: which sides another wall block of the same nation touches. */
export const WALL_N = 1;
export const WALL_E = 2;
export const WALL_S = 4;
export const WALL_W = 8;

/**
 * Plan outline (u, v points) of a block: the whole cell, each open side pulled in by `inset`, each corner between two
 * open sides rounded with radius `r`. Joined sides stay flat on the cell edge, so neighbouring blocks run on unbroken.
 */
function outline(mask: number, inset: number, r: number): [number, number][] {
  const n = mask & WALL_N ? 0 : inset;
  const e = mask & WALL_E ? 1 : 1 - inset;
  const so = mask & WALL_S ? 1 : 1 - inset;
  const w = mask & WALL_W ? 0 : inset;
  const pts: [number, number][] = [];
  // Corners clockwise from north-west: centre of the arc and its start angle (u = cos, v = sin).
  const corners: [number, number, boolean, number][] = [
    [w, n, !(mask & (WALL_N | WALL_W)), Math.PI],
    [e, n, !(mask & (WALL_N | WALL_E)), -Math.PI / 2],
    [e, so, !(mask & (WALL_S | WALL_E)), 0],
    [w, so, !(mask & (WALL_S | WALL_W)), Math.PI / 2],
  ];
  for (const [cu, cv, round, a0] of corners) {
    if (!round || r <= 0) {
      pts.push([cu, cv]);
      continue;
    }
    // Arc centre sits r inside the corner.
    const ou = cu + (cu === w ? r : -r);
    const ov = cv + (cv === n ? r : -r);
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push([ou + r * Math.cos(a), ov + r * Math.sin(a)]);
    }
  }
  return pts;
}

/** Fills a plan outline at height z. */
function fillAt(p: IsoPainter, pts: readonly [number, number][], z: number, color: string): void {
  p.ctx.fillStyle = color;
  p.ctx.beginPath();
  pts.forEach(([u, v], i) => {
    const [x, y] = p.project(u, v, z);
    if (i === 0) p.ctx.moveTo(x, y);
    else p.ctx.lineTo(x, y);
  });
  p.ctx.closePath();
  p.ctx.fill();
}

/**
 * Wall (1×1): a full-cell block of modern concrete with soft, rounded edges — rounded corners in plan wherever the
 * block ends, and a rounded (bullnose) top. `mask` (WALL_N | WALL_E | WALL_S | WALL_W) marks the sides joined to
 * neighbouring blocks: those stay flat on the cell edge so a wall line reads as one long piece.
 */
export function createWallArt(faction: FactionId, mask = 0): BuildingArt {
  const c = TINT[faction];
  const body = outline(mask, INSET, RADIUS);
  return {
    footprint: { w: 1, d: 1 },
    height: WALL_H + 4,
    noRim: true, // joined blocks read as one piece
    drawStatic(p) {
      // Extruded body: the outline stacked up layer by layer, darker at the foot.
      const straight = WALL_H - ROUND_H;
      for (let z = 0; z <= straight; z += 0.5) fillAt(p, body, z, shade(c, 0.7 + (0.15 * z) / straight));
      // Bullnose top: each layer pulled in a little more (quarter circle), getting lighter.
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const pull = 0.04 * (1 - Math.cos((t * Math.PI) / 2)); // cells the open sides draw in at this layer
        fillAt(p, outline(mask, INSET + pull, RADIUS), straight + Math.sin((t * Math.PI) / 2) * ROUND_H, shade(c, 0.9 + 0.25 * t));
      }
    },
  };
}
