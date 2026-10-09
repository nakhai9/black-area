import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';

const SAND = '#e4d2a8';
const STONE = '#cdb98e';
const TILE = '#2fa6b8';
const TILE_DARK = '#1d6f86';
const GOLD = '#e2b23a';
const POOL = '#4f9fc4';
const TILE_DEEP = '#1f4f9c';
/** Screen px per tile along a building face (HALF_TW). */
const SCREEN_PX = 32;

const FLAG_U = [0.35, 3.65] as const;
const FLAG_V = 6.2;
const POLE_H = 30;
/** Art-space depth: 4 units of sanctuary plus the courtyard and gate in front of it. */
const ART_D = 6.4;

/** Minaret: tall sand shaft, tiled balcony, slimmer top, small turquoise dome and gold finial. */
function minaret(p: IsoPainter, u: number, v: number, s: number, z: number): void {
  const h = 62 * s;
  p.cylinder(u, v, 0.15 * s, z, h, SAND, 6);
  p.cylinder(u, v, 0.15 * s, z + h * 0.55, 3 * s, TILE);
  p.cylinder(u, v, 0.21 * s, z + h * 0.78, 2.5 * s, TILE_DARK);
  p.cylinder(u, v, 0.11 * s, z + h * 0.78 + 2.5 * s, 10 * s, SAND);
  p.dome(u, v, 0.13 * s, z + h + 0.5 * s, 7 * s, TILE);
  p.pole(u, v, z + h + 7 * s, 5 * s, GOLD);
}

/**
 * Persian-style mosque in a `4s × 3s` tile block at (u0, v0): prayer hall with a tiled frieze, a turquoise dome on a
 * drum, a tall iwan (arched portal) in front and two minarets flanking it. Shared by the capital, the Allied
 * Building and Happy City.
 */
export function drawMosque(p: IsoPainter, u0: number, v0: number, s: number, z: number, accent = TILE): void {
  const hallH = 22 * s;
  const hu = u0 + 0.5 * s;
  const hv = v0 + 0.4 * s;
  p.box(hu, hv, 3 * s, 2.1 * s, z, hallH, SAND);
  p.windows('left', hu, hv, 3 * s, 2.1 * s, z, hallH, 7, 1, TILE_DARK, 0.2, 0.6);
  p.windows('right', hu, hv, 3 * s, 2.1 * s, z, hallH, 5, 1, TILE_DARK, 0.2, 0.6);
  p.faceRect('left', hu, hv, 3 * s, 2.1 * s, z, hallH, 0, 1, 0.82, 0.95, accent);
  p.faceRect('right', hu, hv, 3 * s, 2.1 * s, z, hallH, 0, 1, 0.82, 0.95, shade(accent, 0.85));

  // Drum and the great dome, with a gold crescent finial.
  const cu = u0 + 2 * s;
  const cv = v0 + 1.45 * s;
  p.cylinder(cu, cv, 0.72 * s, z + hallH, 9 * s, STONE, 12);
  p.cylinder(cu, cv, 0.72 * s, z + hallH + 6 * s, 3 * s, TILE_DARK);
  p.dome(cu, cv, 0.78 * s, z + hallH + 9 * s, 30 * s, TILE);
  const top = z + hallH + 39 * s;
  p.pole(cu, cv, top, 6 * s, GOLD);
  const [x, y] = p.project(cu, cv, top + 7 * s);
  p.ctx.fillStyle = GOLD;
  p.ctx.beginPath();
  p.ctx.arc(x, y, 2.2 * s, 0, Math.PI * 2);
  p.ctx.fill();
  p.ctx.fillStyle = TILE;
  p.ctx.beginPath();
  p.ctx.arc(x + 0.9 * s, y - 0.4 * s, 1.9 * s, 0, Math.PI * 2);
  p.ctx.fill();

  // Iwan: a tall portal block in front of the hall, its deep arch framed in tile.
  const iu = u0 + 1.35 * s;
  const iv = v0 + 2.45 * s;
  const iw = 1.3 * s;
  const id = 0.4 * s;
  const ih = 34 * s;
  p.box(iu, iv, iw, id, z, ih, SAND);
  p.faceRect('left', iu, iv, iw, id, z, ih, 0.12, 0.88, 0, 0.86, accent);
  p.faceRect('left', iu, iv, iw, id, z, ih, 0.22, 0.78, 0, 0.72, '#3a2e22');
  p.faceRect('left', iu, iv, iw, id, z, ih, 0.3, 0.7, 0.66, 0.74, GOLD);

  minaret(p, u0 + 1.0 * s, v0 + 2.75 * s, s, z);
  minaret(p, u0 + 3.0 * s, v0 + 2.75 * s, s, z);
}

// ---------------------------------------------------------------- Capital: Isfahan-style four-iwan grand mosque

export type Box = readonly [u: number, v: number, w: number, d: number, z: number, h: number];

/** Pointed (Persian) arch on a box face: `x0` and `w` in face px from the face's left edge, `h` px tall. */
export function arch(p: IsoPainter, face: 'left' | 'right', b: Box, x0: number, w: number, h: number, fill: string, z = b[4]): void {
  const [u, v, bw, bd] = b;
  p.faceTransform(face, face === 'left' ? u : u + bw, v + bd, z, (ctx) => {
    const spring = h * 0.62;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, spring);
    ctx.quadraticCurveTo(x0, h * 0.92, x0 + w / 2, h);
    ctx.quadraticCurveTo(x0 + w, h * 0.92, x0 + w, spring);
    ctx.lineTo(x0 + w, 0);
    ctx.closePath();
    ctx.fill();
  });
}

/** `n` arched bays per storey along a face (the arcades round the courtyard). */
export function arcade(p: IsoPainter, face: 'left' | 'right', b: Box, n: number, rows: number): void {
  const bay = ((face === 'left' ? b[2] : b[3]) * SCREEN_PX) / n;
  for (let r = 0; r < rows; r++) {
    const z = b[4] + (b[5] / rows) * r + 1;
    const hh = b[5] / rows - 2.5;
    for (let i = 0; i < n; i++) {
      arch(p, face, b, i * bay + bay * 0.14, bay * 0.72, hh, TILE, z);
      arch(p, face, b, i * bay + bay * 0.24, bay * 0.52, hh * 0.86, '#2b2219', z);
    }
  }
}

/** Sand box with a band of tile along the top of both visible faces. */
function tiledBox(p: IsoPainter, b: Box): void {
  const [u, v, w, d, z, h] = b;
  p.box(u, v, w, d, z, h, SAND);
  p.faceRect('left', u, v, w, d, z, h, 0, 1, 0.9, 0.97, TILE);
  p.faceRect('right', u, v, w, d, z, h, 0, 1, 0.9, 0.97, shade(TILE, 0.85));
}

/** Iwan: a tall portal block whose `face` holds a deep pointed arch in a tiled frame, with a gold muqarnas hood. */
export function iwan(p: IsoPainter, face: 'left' | 'right', b: Box): void {
  const [u, v, w, d, z, h] = b;
  p.box(u, v, w, d, z, h, SAND);
  const len = (face === 'left' ? w : d) * SCREEN_PX;
  p.faceRect(face, u, v, w, d, z, h, 0.08, 0.92, 0, 0.94, TILE_DEEP);
  arch(p, face, b, len * 0.17, len * 0.66, h * 0.86, TILE);
  arch(p, face, b, len * 0.24, len * 0.52, h * 0.78, '#2b2219');
  arch(p, face, b, len * 0.34, len * 0.32, h * 0.2, GOLD, z + h * 0.56);
  p.faceRect(face, u, v, w, d, z, h, 0.08, 0.92, 0.94, 1, GOLD);
}

/** Great dome clad in blue tile, dotted with rows of gold and cream arabesque points, an inscription band at its foot. */
function tiledDome(p: IsoPainter, cu: number, cv: number, r: number, z: number, h: number): void {
  p.dome(cu, cv, r, z, h, TILE);
  const [cx, cy] = p.project(cu, cv, z);
  const rx = r * Math.SQRT2 * SCREEN_PX;
  const ry = rx / 2;
  const { ctx } = p;
  for (let k = 1; k <= 5; k++) {
    const t = (k / 6) * (Math.PI / 2);
    const n = Math.max(4, Math.round(16 * Math.cos(t)));
    for (let i = 0; i <= n; i++) {
      const phi = (i / n) * Math.PI;
      const x = cx - Math.cos(phi) * rx * Math.cos(t);
      const y = cy - Math.sin(t) * h + Math.sin(phi) * ry * Math.cos(t) * 0.9;
      ctx.fillStyle = (i + k) % 2 ? '#f2e6c4' : GOLD;
      ctx.beginPath();
      ctx.arc(x, y, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = '#f2e6c4';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.stroke();
}

/** Gold crescent on a pole. */
function finial(p: IsoPainter, u: number, v: number, z: number, k = 1): void {
  p.pole(u, v, z, 8 * k, GOLD);
  const [x, y] = p.project(u, v, z + 10 * k);
  p.ctx.fillStyle = GOLD;
  p.ctx.beginPath();
  p.ctx.arc(x, y, 2.6 * k, 0, Math.PI * 2);
  p.ctx.fill();
  p.ctx.fillStyle = TILE;
  p.ctx.beginPath();
  p.ctx.arc(x + 1.1 * k, y - 0.5 * k, 2.2 * k, 0, Math.PI * 2);
  p.ctx.fill();
}

/** Slim tiled minaret standing on top of the main iwan. */
function iwanMinaret(p: IsoPainter, u: number, v: number, z: number): void {
  p.cylinder(u, v, 0.13, z, 34, TILE, 8);
  p.cylinder(u, v, 0.19, z + 34, 3, TILE_DEEP);
  p.cylinder(u, v, 0.1, z + 37, 9, SAND);
  p.dome(u, v, 0.12, z + 46, 6, TILE);
  p.pole(u, v, z + 52, 4, GOLD);
}

/**
 * Riyadh — the Islamic world's capital landmark, a grand mosque in the Isfahan four-iwan plan: the sanctuary under a huge tiled
 * dome at the back; the main iwan with its pair of minarets facing a courtyard (sahn) with a cross-shaped pool;
 * side iwans set in two-storey arcades; a tiled entrance gate in the front wall, flanked by the nation's flags.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createGrandMosqueArt(flag: Allegiance = 'islamic'): BuildingArt {
  const Z = 3;
  return {
    footprint: { w: 4, d: ART_D },
    // Same 5 × 8 plot as every capital: authored in 4 × 6.4 units and drawn 1.25× to fill it.
    scale: 5 / 4,
    height: 140,

    drawStatic(p) {
      p.box(0, 0, 4, ART_D, 0, Z, STONE);

      // Sanctuary and its great dome.
      tiledBox(p, [0.7, 0.15, 2.6, 1.9, Z, 30]);
      p.windows('right', 0.7, 0.15, 2.6, 1.9, Z, 30, 4, 1, TILE_DEEP, 0.15, 0.5);
      p.cylinder(2.0, 1.1, 0.8, Z + 30, 14, SAND, 16);
      p.cylinder(2.0, 1.1, 0.8, Z + 38, 4, TILE_DEEP);
      tiledDome(p, 2.0, 1.1, 0.88, Z + 44, 46);
      finial(p, 2.0, 1.1, Z + 90, 1.2);

      // Courtyard floor and cross-shaped pool.
      p.topRect(0.5, 2.6, 3.5, 6.0, Z, shade(STONE, 1.1));
      p.topRect(1.75, 3.0, 2.25, 5.7, Z + 0.2, POOL, shade(TILE_DARK, 1.1));
      p.topRect(0.9, 4.1, 3.1, 4.6, Z + 0.2, POOL, shade(TILE_DARK, 1.1));
      p.cylinder(2.0, 4.35, 0.18, Z + 0.2, 2.5, TILE);

      // West arcade and its side iwan, facing the courtyard.
      const west: Box = [0.1, 2.3, 0.4, 3.75, Z, 20];
      tiledBox(p, west);
      arcade(p, 'right', west, 7, 2);
      iwan(p, 'right', [0.05, 3.85, 0.5, 1.0, Z, 34]);
      p.dome(0.3, 4.35, 0.2, Z + 34, 9, TILE);

      // Main (north) iwan facing the courtyard, crowned by two minarets.
      iwan(p, 'left', [1.15, 1.95, 1.7, 0.6, Z, 56]);
      iwanMinaret(p, 1.3, 2.25, Z + 56);
      iwanMinaret(p, 2.7, 2.25, Z + 56);

      // Garden trees in the corners of the court.
      for (const [u, v] of [[0.85, 3.0], [3.15, 3.0], [0.85, 5.6], [3.15, 5.6]] as const) {
        p.cylinder(u, v, 0.04, Z, 6, '#6b5b47');
        p.dome(u, v, 0.18, Z + 6, 8, '#4f8a3c');
      }

      // East arcade (its outer face shows) and the east iwan block.
      const east: Box = [3.5, 2.3, 0.4, 3.75, Z, 20];
      tiledBox(p, east);
      arcade(p, 'right', east, 7, 2);
      tiledBox(p, [3.45, 3.85, 0.5, 1.0, Z, 34]);
      p.dome(3.7, 4.35, 0.2, Z + 34, 9, TILE);

      // Front wall and the tiled entrance gate.
      tiledBox(p, [0.1, 6.05, 3.8, 0.3, Z, 16]);
      arcade(p, 'left', [0.1, 6.05, 1.3, 0.3, Z, 16], 3, 1);
      arcade(p, 'left', [2.6, 6.05, 1.3, 0.3, Z, 16], 3, 1);
      iwan(p, 'left', [1.4, 5.9, 1.2, 0.5, Z, 38]);
      finial(p, 2.0, 6.15, Z + 38, 0.7);

      for (const u of FLAG_U) drawNationalPole(p, flag, u, FLAG_V, Z + 16, POLE_H);
    },

    drawAnimated(p, time) {
      FLAG_U.forEach((u, i) => drawFlagOnPole(p, flag, u, FLAG_V, Z + 16 + POLE_H, time, i * 0.9, 16, 10));
    },
  };
}

