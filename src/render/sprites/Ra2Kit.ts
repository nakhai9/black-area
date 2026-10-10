import { shade } from '../Color';
import type { Face, IsoPainter } from '../IsoPainter';

/**
 * Red Alert 2 building kit: the recurring details of RA2's pre-rendered city and base art (dense window grids with
 * floor bands, parapets, rooftop plant). Every sprite gets grain, a dark rim and a cast shadow afterwards in
 * SpriteCache (see Ra2Finish), so the art here stays clean and flat-shaded.
 */

/** RA2 material palette: weathered, slightly dirty, never saturated. */
export const RA2 = {
  concrete: '#9c9a90',
  concreteDark: '#6f6e66',
  stone: '#b8ae96',
  sandstone: '#c2a77c',
  brick: '#8a4a36',
  brickDark: '#6a3628',
  steel: '#7d848c',
  steelDark: '#4c525a',
  roof: '#5d6168',
  tar: '#3e4146',
  glass: '#2c3a4e',
  glassLit: '#9fb3c4',
  frame: '#d6d2c4',
  asphalt: '#4b4d50',
  paving: '#a7a399',
  grass: '#5d7a35',
  hazard: '#d8b23a',
} as const;

/** Deterministic 0..1 from integers (the same lit windows every rebuild). */
export function rnd(a: number, b = 0, c = 0): number {
  let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface FacadeOptions {
  /** Window columns across the face and floors up it. */
  cols: number;
  floors: number;
  glass?: string;
  /** Light frame / mullion colour drawn round each window. */
  frame?: string | null;
  /** Darker band between floors (spandrel), as a share of the floor height. */
  band?: number;
  bandColor?: string;
  /** Share of windows lit (pale reflection), 0..1. */
  lit?: number;
  /** Window width share of its column (0..1). */
  fill?: number;
  /** Skip the lowest n floors (lobby, shopfront). */
  skipFloors?: number;
  seed?: number;
}

/**
 * RA2 facade on one visible face of a box: floor bands plus a dense window grid, a few panes catching the light.
 * Box parameters are the same as `IsoPainter.box`.
 */
export function facade(p: IsoPainter, face: Face, u: number, v: number, w: number, d: number, z: number, h: number, o: FacadeOptions): void {
  const glass = o.glass ?? RA2.glass;
  const fill = o.fill ?? 0.62;
  const band = o.band ?? 0.28;
  const seed = o.seed ?? 1;
  const fh = 1 / o.floors;
  for (let f = 0; f < o.floors; f++) {
    const t0 = f * fh;
    if (o.bandColor) p.faceRect(face, u, v, w, d, z, h, 0, 1, t0, t0 + fh * band * 0.6, o.bandColor);
    if (f < (o.skipFloors ?? 0)) continue;
    for (let c = 0; c < o.cols; c++) {
      const cw = 1 / o.cols;
      const s0 = c * cw + (cw * (1 - fill)) / 2;
      const s1 = s0 + cw * fill;
      const w0 = t0 + fh * band;
      const w1 = t0 + fh * 0.9;
      if (o.frame) p.faceRect(face, u, v, w, d, z, h, s0 - cw * 0.06, s1 + cw * 0.06, w0 - fh * 0.06, w1 + fh * 0.04, o.frame);
      const lit = rnd(seed, f, c + (face === 'left' ? 0 : 97)) < (o.lit ?? 0.05);
      p.faceRect(face, u, v, w, d, z, h, s0, s1, w0, w1, lit ? RA2.glassLit : glass);
      // Upper-pane sky reflection.
      p.faceRect(face, u, v, w, d, z, h, s0, s1, w1 - (w1 - w0) * 0.3, w1, shade(lit ? RA2.glassLit : glass, 1.35));
    }
  }
}

/** Low wall round the edge of a flat roof (box top at z). */
export function parapet(p: IsoPainter, u: number, v: number, w: number, d: number, z: number, color: string, t = 0.08, h = 2.5): void {
  p.box(u, v, w, t, z, h, color);
  p.box(u, v, t, d, z, h, color);
  p.box(u + w - t, v, t, d, z, h, color);
  p.box(u, v + d - t, w, t, z, h, color);
}

/** Rooftop plant: HVAC boxes with fan grilles, vents and a stair hut, laid out from a seed (roof top at z). */
export function roofClutter(p: IsoPainter, u: number, v: number, w: number, d: number, z: number, seed = 1): void {
  const n = Math.max(2, Math.round(w * d * 1.4));
  for (let i = 0; i < n; i++) {
    const bw = 0.18 + rnd(seed, i, 1) * 0.25;
    const bd = 0.18 + rnd(seed, i, 2) * 0.25;
    const bu = u + 0.12 + rnd(seed, i, 3) * Math.max(0, w - bw - 0.24);
    const bv = v + 0.12 + rnd(seed, i, 4) * Math.max(0, d - bd - 0.24);
    const kind = rnd(seed, i, 5);
    if (kind < 0.45) {
      p.box(bu, bv, bw, bd, z, 3, '#a9adb2');
      const [x, y] = p.project(bu + bw / 2, bv + bd / 2, z + 3);
      p.ctx.fillStyle = '#3a3d42';
      p.ctx.beginPath();
      p.ctx.ellipse(x, y, bw * 6, bw * 3, 0, 0, Math.PI * 2);
      p.ctx.fill();
    } else if (kind < 0.75) {
      p.box(bu, bv, bw * 0.6, bd * 0.6, z, 4.5, '#8f939a');
    } else {
      p.cylinder(bu + bw / 2, bv + bd / 2, 0.06, z, 4, '#9a9ea4');
    }
  }
}

/** Sandbag ring segment along u or v (bunkers, guard posts). */
export function sandbags(p: IsoPainter, u0: number, v0: number, u1: number, v1: number, z = 0, color = '#a08a5c'): void {
  const len = Math.hypot(u1 - u0, v1 - v0);
  const n = Math.max(1, Math.round(len / 0.18));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const cu = u0 + (u1 - u0) * t;
    const cv = v0 + (v1 - v0) * t;
    const [x, y] = p.project(cu, cv, z + 1.6);
    p.ctx.fillStyle = shade(color, i % 2 ? 0.86 : 1);
    p.ctx.strokeStyle = shade(color, 0.5);
    p.ctx.lineWidth = 0.5;
    p.ctx.beginPath();
    p.ctx.ellipse(x, y, 2.2, 1.5, 0, 0, Math.PI * 2);
    p.ctx.fill();
    p.ctx.stroke();
  }
}

/** Wooden supply crate. */
export function crate(p: IsoPainter, u: number, v: number, s: number, z = 0): void {
  p.box(u, v, s, s, z, s * 16, '#b39a66');
  p.faceRect('left', u, v, s, s, z, s * 16, 0, 1, 0.45, 0.55, '#7d6844');
  p.faceRect('right', u, v, s, s, z, s * 16, 0, 1, 0.45, 0.55, '#7d6844');
}
