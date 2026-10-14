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
const YELLOW = '#d9b24e';
const GREEN = '#3f7a56';
const SPIRE = '#2f6a48';
const GOLD = '#e6b43c';
const WHITE = '#ece6d6';
const STONE = '#f0ebdf';
const GLASS = '#2c3a4e';
const DOOR = '#2a0f0b';

const WALL_H = 16;
const TOWER = 0.46;
/** Art-space depth: the Kremlin plot only (no Red Square forecourt). */
const ART_D = 4;

/** Glowing red stars: Spasskaya + the four corner towers. [u, v, z, size] */
const STARS: readonly [number, number, number, number][] = [
  [2.0, 3.71, 99, 4.6],
  [0.25, 0.25, 50, 3],
  [3.75, 0.25, 50, 3],
  [0.25, 3.75, 50, 3],
  [3.75, 3.75, 50, 3],
];
/** Russian tricolour on the Grand Palace roof; standard over the Senate dome. */
/** The one flag flies from the highest point: the top of Ivan the Great's golden onion (u, v, z of the pole foot). */
const TOP_FLAG: readonly [number, number, number] = [1.6, 1.75, 106];
const TOP_POLE_H = 16;

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

/** White drum + gold onion. */
function cupola(p: IsoPainter, u: number, v: number, r: number, z: number, h: number): void {
  p.cylinder(u, v, r * 0.75, z, h * 0.45, WHITE, 6);
  p.onion(u, v, r, z + h * 0.45, h * 0.7, GOLD);
  p.pole(u, v, z + h * 1.15, 4, GOLD);
}

/** White-stone cathedral block with a gilded cornice band and gold cupolas. */
function cathedral(p: IsoPainter, u: number, v: number, w: number, d: number, h: number, domes: [number, number, number, number][]): void {
  p.box(u, v, w, d, 0, h, STONE);
  for (const face of ['left', 'right'] as const) {
    p.windows(face, u, v, w, d, 0, h, face === 'left' ? 4 : 3, 2, '#3a2e26', 0.25, 0.55);
    p.faceRect(face, u, v, w, d, 0, h, 0, 1, 0.88, 0.94, shade(GOLD, 0.85));
  }
  p.box(u - 0.02, v - 0.02, w + 0.04, d + 0.04, h, 1.5, shade(GREEN, 0.95));
  for (const [cu, cv, r, hh] of domes) cupola(p, cu, cv, r, h + 1.5, hh);
}

/** Ivan the Great Bell Tower — the highest point. */
function ivanTheGreat(p: IsoPainter, u: number, v: number): void {
  const tiers: [number, number, number][] = [
    [0.27, 0, 30],
    [0.22, 30, 24],
    [0.17, 54, 20],
  ];
  for (const [r, z, h] of tiers) {
    p.cylinder(u, v, r, z, h, STONE, 8);
    p.cylinder(u, v, r + 0.02, z + h - 1.5, 1.5, shade(GOLD, 0.9), 8);
  }
  p.cylinder(u, v, 0.12, 74, 12, STONE, 8);
  p.onion(u, v, 0.15, 86, 20, GOLD);
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

/** Spasskaya Tower centred on the front wall. */
function spasskaya(p: IsoPainter): void {
  const u = 1.68;
  const v = 3.42;
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
  p.cylinder(2.0, 3.71, 0.13, 63, 7, STONE, 8);
  // Green tent spire.
  p.pyramid(1.87, 3.58, 0.26, 0.26, 70, 26, SPIRE);
  p.pole(2.0, 3.71, 94, 3, GOLD);
}

/**
 * Moscow — the Kremlin as one dense walled mass filling the whole plot:
 * swallow-tail crenellated red walls with green-tented corner towers (round and square) carrying
 * red stars; the Grand Kremlin Palace and the yellow Senate along the back, the gold-domed
 * Cathedral Square (Assumption, Archangel, Annunciation) and the white Ivan the Great Bell Tower
 * (highest point) in the middle, palace ranges in front and the Spasskaya clock tower on the front wall.
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

      // Grand Kremlin Palace along the back.
      const pu = 0.28, pv = 0.28, pw = 2.3, pd = 0.95;
      const palace = { glass: GLASS, frame: '#f4ecd6', fill: 0.5, band: 0.3, bandColor: shade(CREAM, 0.86) };
      p.box(pu, pv, pw, pd, 0, 26, CREAM);
      facade(p, 'left', pu, pv, pw, pd, 0, 26, { ...palace, cols: 16, floors: 3, seed: 21 });
      facade(p, 'right', pu, pv, pw, pd, 0, 26, { ...palace, cols: 6, floors: 3, seed: 22 });
      p.box(pu - 0.02, pv - 0.02, pw + 0.04, pd + 0.04, 26, 1.5, STONE);
      p.hipRoof(pu, pv, pw, pd, 27.5, 8, 0.03, GREEN);
      p.cylinder(1.43, 0.75, 0.16, 33, 8, CREAM, 8);
      p.dome(1.43, 0.75, 0.17, 41, 9, GOLD);
      p.pole(1.43, 0.75, 50, 4, GOLD);

      // Senate (yellow, triangular plan hinted on the roof) with its green dome.
      const sen = { glass: GLASS, frame: '#f6eccf', fill: 0.45, band: 0.3, bandColor: shade(YELLOW, 0.85) };
      p.box(2.58, 0.28, 1.14, 1.2, 0, 22, YELLOW, { top: shade(GREEN, 1.05) });
      facade(p, 'left', 2.58, 0.28, 1.14, 1.2, 0, 22, { ...sen, cols: 7, floors: 2, seed: 31 });
      facade(p, 'right', 2.58, 0.28, 1.14, 1.2, 0, 22, { ...sen, cols: 7, floors: 2, seed: 32 });
      p.polygon([[2.64, 0.34, 22.2], [3.66, 0.34, 22.2], [3.15, 1.42, 22.2]], shade(YELLOW, 1.1));
      p.cylinder(3.15, 0.95, 0.26, 22, 8, WHITE, 12);
      p.dome(3.15, 0.95, 0.27, 30, 13, GREEN);
      p.cylinder(3.15, 0.95, 0.05, 43, 3, WHITE);

      // Cathedral Square cluster.
      cathedral(p, 0.28, 1.23, 1.0, 0.95, 22, [
        [0.55, 1.5, 0.11, 20], [1.01, 1.5, 0.11, 20], [0.55, 1.92, 0.11, 20], [1.01, 1.92, 0.11, 20], [0.78, 1.71, 0.16, 28],
      ]); // Assumption
      ivanTheGreat(p, 1.6, 1.75);
      cathedral(p, 1.95, 1.48, 0.8, 0.85, 20, [
        [2.12, 1.68, 0.09, 16], [2.58, 1.68, 0.09, 16], [2.35, 1.9, 0.15, 24], [2.12, 2.14, 0.09, 16], [2.58, 2.14, 0.09, 16],
      ]); // Archangel
      cathedral(p, 2.75, 1.48, 0.97, 0.9, 18, [
        [3.0, 1.75, 0.09, 16], [3.45, 1.75, 0.09, 16], [3.22, 1.95, 0.13, 22], [3.0, 2.17, 0.09, 16], [3.45, 2.17, 0.09, 16],
      ]); // Annunciation

      // Front ranges (Armoury / Terem blocks) filling the ground up to the front wall.
      const range = (u: number, v: number, w: number, d: number, h: number, c: string, seed: number): void => {
        const st = { glass: GLASS, frame: '#f4ecd6', fill: 0.45, band: 0.3, bandColor: shade(c, 0.86), floors: 2 };
        p.box(u, v, w, d, 0, h, c, { top: shade(GREEN, 1.05) });
        facade(p, 'left', u, v, w, d, 0, h, { ...st, cols: Math.max(2, Math.round(w * 7)), seed });
        facade(p, 'right', u, v, w, d, 0, h, { ...st, cols: Math.max(2, Math.round(d * 7)), seed: seed + 1 });
      };
      range(0.28, 2.18, 1.4, 1.54, 17, CREAM, 41);
      range(1.68, 2.33, 0.64, 1.09, 15, YELLOW, 43);
      range(2.32, 2.38, 1.4, 1.34, 17, CREAM, 45);
      p.pyramid(0.6, 2.5, 0.5, 0.5, 17, 7, GREEN);
      p.pyramid(2.9, 2.65, 0.5, 0.5, 17, 7, GREEN);
      cupola(p, 0.85, 2.75, 0.1, 24, 16);
      cupola(p, 3.15, 2.9, 0.1, 24, 16);

      // Right and front walls, Spasskaya, front corner tower.
      wall(p, 3.72, 0.48, 0.26, 3.04);
      wall(p, 0.48, 3.72, 1.2, 0.26);
      wall(p, 2.32, 3.72, 1.2, 0.26);
      spasskaya(p);
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
