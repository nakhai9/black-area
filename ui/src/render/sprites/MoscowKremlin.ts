import { HALF_TW } from '../../constants';
import { archPath, starPath } from '../Canvas';
import { drawFlagOnPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { shade } from '../Color';
import { facade } from './Ra2Kit';

const BRICK = '#9a3626';
const BRICK_CAP = '#ad4432';
const CREAM = '#e3d6b4';
const GREEN = '#3f7a56';
const SPIRE = '#2f6a48';
const GOLD = '#e6b43c';
const WHITE = '#ece6d6';
const STONE = '#f0ebdf';
const GLASS = '#2c3a4e';
const DOOR = '#2a0f0b';
const PAVING = '#b9ab93';

const WALL_H = 16;
const TOWER = 0.46;
/** Art-space depth: the Kremlin plot only (no Red Square forecourt). */
const ART_D = 4;

/** Spasskaya's front-left corner on the front wall (left of centre, clear of Saint Basil's behind it). */
const SPASSKAYA: readonly [number, number] = [0.62, 3.42];
/** Saint Basil's Cathedral: centre of the plan. */
const BASIL: readonly [number, number] = [2.15, 2.35];
/** Gilded dome on the middle of the Grand Kremlin Palace (the flag flies from it). */
const PALACE_DOME: readonly [number, number] = [2.0, 0.73];

/** Glowing red stars: Spasskaya + the four corner towers. [u, v, z, size] */
const STARS: readonly [number, number, number, number][] = [
  [SPASSKAYA[0] + 0.32, SPASSKAYA[1] + 0.29, 99, 4.6],
  [0.25, 0.25, 50, 3],
  [3.75, 0.25, 50, 3],
  [0.25, 3.75, 50, 3],
  [3.75, 3.75, 50, 3],
];
/** The one flag flies from the top of the palace's gilded dome (u, v, z of the pole foot). */
const TOP_FLAG: readonly [number, number, number] = [PALACE_DOME[0], PALACE_DOME[1], 53];
const TOP_POLE_H = 16;

/** Saint Basil's chapel onions: colour and the twisting stripe over it. */
const BASIL_ONIONS: readonly [string, string][] = [
  ['#c8302a', '#f2efe6'], // red / white
  ['#2f8a4e', '#e8c24a'], // green / gold
  ['#2c6fb6', '#f2efe6'], // blue / white
  ['#e2a72e', '#2f8a4e'], // gold / green
  ['#2f8a4e', '#c8302a'], // green / red
  ['#c8302a', '#e8c24a'], // red / gold
  ['#2c6fb6', '#e8c24a'], // blue / gold
  ['#7a3e8e', '#f2efe6'], // violet / white
];

/** Red-brick wall with swallow-tail (Ghibelline) merlons. */
function wall(p: IsoPainter, u: number, v: number, w: number, d: number): void {
  p.box(u, v, w, d, 0, WALL_H, BRICK);
  for (const face of ['left', 'right'] as const) {
    p.faceRect(face, u, v, w, d, 0, WALL_H, 0, 1, 0, 0.12, shade(BRICK, 0.75));
    p.faceRect(face, u, v, w, d, 0, WALL_H, 0, 1, 0.9, 0.94, shade(BRICK, 0.8));
  }
  const alongU = w >= d;
  const len = alongU ? w : d;
  const n = Math.max(1, Math.floor(len / 0.17));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * (len / n) - 0.05;
    // Merlon stem + the two horns of the swallow tail.
    if (alongU) {
      p.box(u + t, v, 0.1, d, WALL_H, 2.5, BRICK_CAP);
      p.box(u + t, v, 0.035, d, WALL_H + 2.5, 2, BRICK_CAP);
      p.box(u + t + 0.065, v, 0.035, d, WALL_H + 2.5, 2, BRICK_CAP);
    } else {
      p.box(u, v + t, w, 0.1, WALL_H, 2.5, BRICK_CAP);
      p.box(u, v + t, w, 0.035, WALL_H + 2.5, 2, BRICK_CAP);
      p.box(u, v + t + 0.065, w, 0.035, WALL_H + 2.5, 2, BRICK_CAP);
    }
  }
}

/** Corner tower: square (Beklemishevskaya-like) or round (Vodovzvodnaya-like), green tent, star. */
function tower(p: IsoPainter, u: number, v: number, round: boolean): void {
  const s = TOWER;
  const cu = u + s / 2;
  const cv = v + s / 2;
  if (round) {
    p.cylinder(cu, cv, s / 2, 0, 22, BRICK, 10);
    p.cylinder(cu, cv, s / 2 + 0.02, 22, 3, BRICK_CAP, 10);
    p.cylinder(cu, cv, s * 0.36, 25, 6, BRICK);
  } else {
    p.box(u, v, s, s, 0, 22, BRICK);
    p.windows('left', u, v, s, s, 0, 22, 1, 2, DOOR, 0.3, 0.5);
    p.windows('right', u, v, s, s, 0, 22, 1, 2, DOOR, 0.3, 0.5);
    p.box(u - 0.03, v - 0.03, s + 0.06, s + 0.06, 22, 3, BRICK_CAP);
    p.box(u + 0.08, v + 0.08, s - 0.16, s - 0.16, 25, 6, BRICK);
  }
  p.pyramid(u + 0.06, v + 0.06, s - 0.12, s - 0.12, 31, 16, SPIRE);
  p.pole(cu, cv, 47, 3, GOLD);
}

function clockFace(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#0f1a2e';
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 3.4);
  ctx.moveTo(x, y);
  ctx.lineTo(x + 2.4, y + 0.6);
  ctx.stroke();
}

/** Spasskaya Tower on the front wall, its front-left corner at (u, v). */
function spasskaya(p: IsoPainter, u: number, v: number): void {
  p.box(u, v, 0.64, 0.58, 0, 34, BRICK);
  p.faceTransform('left', u, v + 0.58, 0, (ctx) => {
    ctx.fillStyle = DOOR;
    archPath(ctx, 0.32 * HALF_TW, 7, 16);
    ctx.fill();
  });
  p.box(u - 0.03, v - 0.03, 0.7, 0.64, 34, 3, STONE);
  // Clock stage.
  p.box(u + 0.08, v + 0.06, 0.48, 0.46, 37, 16, BRICK);
  p.faceTransform('left', u + 0.08, v + 0.52, 37, (ctx) => clockFace(ctx, 0.24 * HALF_TW, 8));
  p.faceTransform('right', u + 0.56, v + 0.52, 37, (ctx) => clockFace(ctx, 0.23 * HALF_TW, 8));
  p.box(u + 0.06, v + 0.04, 0.52, 0.5, 53, 2, STONE);
  // Tiered white-stone stages.
  p.box(u + 0.14, v + 0.12, 0.36, 0.34, 55, 8, STONE);
  p.windows('left', u + 0.14, v + 0.12, 0.36, 0.34, 55, 8, 2, 1, DOOR, 0.3, 0.6);
  p.windows('right', u + 0.14, v + 0.12, 0.36, 0.34, 55, 8, 2, 1, DOOR, 0.3, 0.6);
  p.cylinder(u + 0.32, v + 0.29, 0.13, 63, 7, STONE, 8);
  // Green tent spire.
  p.pyramid(u + 0.19, v + 0.16, 0.26, 0.26, 70, 26, SPIRE);
  p.pole(u + 0.32, v + 0.29, 94, 3, GOLD);
}

/**
 * Saint Basil's Cathedral: a red-brick gallery with a white band, the tall central tent church (green tent, gold onion)
 * ringed by eight chapels, each crowned by a twisted, striped onion of its own colours.
 */
function saintBasil(p: IsoPainter, cu: number, cv: number): void {
  const base = 7;
  p.box(cu - 0.78, cv - 0.78, 1.56, 1.56, 0, base, BRICK, { top: shade(BRICK, 1.15) });
  for (const face of ['left', 'right'] as const) {
    p.faceRect(face, cu - 0.78, cv - 0.78, 1.56, 1.56, 0, base, 0, 1, 0.78, 0.86, WHITE);
    p.windows(face, cu - 0.78, cv - 0.78, 1.56, 1.56, 0, base, 6, 1, DOOR, 0.35, 0.5);
  }
  // Eight chapels: four big ones on the axes, four small ones on the diagonals. [u, v, r, drum height, colour, stripe]
  type Chapel = [number, number, number, number, string, string];
  const chapels: Chapel[] = BASIL_ONIONS.map(([color, stripe], k) => {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 4;
    const big = k % 2 === 0;
    const dist = big ? 0.5 : 0.56;
    return [cu + Math.cos(a) * dist, cv + Math.sin(a) * dist, big ? 0.2 : 0.14, big ? 28 : 20, color, stripe];
  });
  const depth = (c: Chapel): number => c[0] + c[1];
  const chapel = ([u, v, r, h, color, stripe]: Chapel): void => {
    p.cylinder(u, v, r * 1.05, base, h, BRICK, 8);
    p.cylinder(u, v, r * 1.1, base + h - 1.5, 1.5, WHITE, 8);
    p.cylinder(u, v, r * 0.78, base + h, 5, WHITE, 8);
    const onionH = r * 100;
    p.onion(u, v, r * 1.25, base + h + 5, onionH, color, stripe);
    p.pole(u, v, base + h + 5 + onionH, 4, GOLD);
  };
  // Back to front: the chapels behind the centre, the central tent church, then the ones in front of it.
  chapels.filter((c) => depth(c) <= cu + cv).sort((a, b) => depth(a) - depth(b)).forEach(chapel);
  p.cylinder(cu, cv, 0.3, base, 30, BRICK, 10);
  p.cylinder(cu, cv, 0.31, base + 14, 2, WHITE, 10);
  p.cylinder(cu, cv, 0.32, base + 28, 2.5, WHITE, 10);
  p.cylinder(cu, cv, 0.24, base + 30.5, 6, shade(GOLD, 0.9), 8);
  p.pyramid(cu - 0.22, cv - 0.22, 0.44, 0.44, base + 36.5, 30, SPIRE);
  p.onion(cu, cv, 0.08, base + 66, 9, GOLD);
  p.pole(cu, cv, base + 75, 4, GOLD);
  chapels.filter((c) => depth(c) > cu + cv).sort((a, b) => depth(a) - depth(b)).forEach(chapel);
}

/**
 * Moscow — the Kremlin, kept simple: swallow-tail crenellated red walls with green-tented corner towers carrying red
 * stars, the long Grand Kremlin Palace along the back (gilded dome and flag), an open square with Saint Basil's
 * Cathedral and its striped, many-coloured onions in the middle, and the Spasskaya clock tower on the front wall.
 */
export function createMoscowKremlinArt(flag: Allegiance = 'russia'): BuildingArt {
  return {
    footprint: { w: 4, d: ART_D },
    // The capital sits on a 5 × 5 plot (FOOTPRINT_CAPITAL). Authored in 4 × 4 units, drawn 1.25×.
    scale: 5 / 4,
    height: 140,

    drawStatic(p) {
      // Back walls and towers.
      tower(p, 0.02, 0.02, false);
      wall(p, 0.48, 0.02, 3.04, 0.26);
      wall(p, 0.02, 0.48, 0.26, 3.04);
      tower(p, 3.52, 0.02, false);
      tower(p, 0.02, 3.52, true);

      // Grand Kremlin Palace along the back: one long cream range, green roof, gilded dome carrying the flag.
      const pu = 0.28, pv = 0.28, pw = 3.44, pd = 0.9;
      const palace = { glass: GLASS, frame: '#f4ecd6', fill: 0.5, band: 0.3, bandColor: shade(CREAM, 0.86) };
      p.box(pu, pv, pw, pd, 0, 26, CREAM);
      facade(p, 'left', pu, pv, pw, pd, 0, 26, { ...palace, cols: 20, floors: 3, seed: 21 });
      facade(p, 'right', pu, pv, pw, pd, 0, 26, { ...palace, cols: 6, floors: 3, seed: 22 });
      p.box(pu - 0.02, pv - 0.02, pw + 0.04, pd + 0.04, 26, 1.5, STONE);
      p.hipRoof(pu, pv, pw, pd, 27.5, 8, 0.03, GREEN);
      p.cylinder(PALACE_DOME[0], PALACE_DOME[1], 0.2, 33, 9, CREAM, 8);
      p.dome(PALACE_DOME[0], PALACE_DOME[1], 0.21, 42, 11, GOLD);

      // Open square, and Saint Basil's standing in the middle of it: the one landmark of the capital.
      p.topRect(0.28, 1.18, 3.72, 3.72, 0.2, PAVING);
      saintBasil(p, BASIL[0], BASIL[1]);

      // Right and front walls with Spasskaya, front corner tower.
      wall(p, 3.72, 0.48, 0.26, 3.04);
      wall(p, 0.48, 3.72, SPASSKAYA[0] - 0.48, 0.26);
      wall(p, SPASSKAYA[0] + 0.64, 3.72, 3.52 - (SPASSKAYA[0] + 0.64), 0.26);
      spasskaya(p, SPASSKAYA[0], SPASSKAYA[1]);
      tower(p, 3.52, 3.52, true);

      p.pole(TOP_FLAG[0], TOP_FLAG[1], TOP_FLAG[2], TOP_POLE_H, GOLD);
    },

    drawAnimated(p, time) {
      const { ctx } = p;
      for (const [u, v, z, s] of STARS) {
        const [x, y] = p.project(u, v, z);
        ctx.save();
        ctx.shadowColor = 'rgba(255,40,30,0.9)';
        ctx.shadowBlur = 5 + Math.sin(time * 3 + u) * 2.5;
        ctx.fillStyle = '#e8261c';
        ctx.strokeStyle = '#ffd36b';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        starPath(ctx, x, y - s, s);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      drawFlagOnPole(p, flag, TOP_FLAG[0], TOP_FLAG[1], TOP_FLAG[2] + TOP_POLE_H, time, 1.5, 14, 9);
    },
  };
}
