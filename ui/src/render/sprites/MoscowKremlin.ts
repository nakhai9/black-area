import { starPath } from '../Canvas';
import { drawFlagOnPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { shade } from '../Color';
import { facade } from './Ra2Kit';

const BRICK = '#9a3626';
const BRICK_CAP = '#ad4432';
const CREAM = '#ecdca8'; // the Grand Kremlin Palace's warm cream-yellow
const GREEN = '#4f9a62'; // its bright green roofs
const SPIRE = '#2f6a48';
const GOLD = '#e6b43c';
const WHITE = '#ece6d6';
const STONE = '#f0ebdf';
const GLASS = '#2c3a4e';
const DOOR = '#2a0f0b';

const WALL_H = 16;
const TOWER = 0.46;
/** Art-space depth: the Kremlin plot only. */
const ART_D = 4;

/*
 * After the photo from the river, laid out symmetrically about the picture's centre line (the u = v diagonal): the
 * round Vodovzvodnaya-style tower on the front corner, the Ivan the Great bell tower in the middle, two white
 * cathedrals with golden onion domes either side of it, the long cream Grand Kremlin Palace with green roofs and a
 * gilded dome along the back walls, autumn trees inside red crenellated walls with green-tented towers.
 */
/** The gilded dome on the palace's corner pavilion (the flag flies from it), on the centre line. */
const PALACE_DOME: readonly [number, number] = [0.66, 0.66];
/** Ivan the Great bell tower, on the centre line. */
const IVAN: readonly [number, number] = [2.1, 2.1];

/** Glowing red stars: the front corner tower, the left / right corner towers and the two mid-wall towers. */
const STARS: readonly [number, number, number, number][] = [
  [3.62, 3.62, 84, 4.6],
  [3.75, 0.25, 50, 3],
  [0.25, 3.75, 50, 3],
  [3.85, 1.9, 50, 2.6],
  [1.9, 3.85, 50, 2.6],
];
/** The one flag flies from the top of the palace's gilded dome. */
const TOP_FLAG: readonly [number, number, number] = [PALACE_DOME[0], PALACE_DOME[1], 56];
const TOP_POLE_H = 14;

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

/** Gilded onion dome on a drum, with its cross. */
function goldOnion(p: IsoPainter, u: number, v: number, z: number, r: number): void {
  p.cylinder(u, v, r * 0.75, z, r * 22, WHITE, 8);
  p.onion(u, v, r, z + r * 22, r * 70, GOLD);
  p.pole(u, v, z + r * 22 + r * 70, 4, GOLD);
}

/** A white-stone cathedral (Assumption / Archangel style): cubic body with arched gables, five golden onions. */
function cathedral(p: IsoPainter, u: number, v: number): void {
  const w = 0.62;
  p.box(u, v, w, w, 0, 15, WHITE, { top: shade(GOLD, 0.7) });
  for (const face of ['left', 'right'] as const) {
    p.windows(face, u, v, w, w, 0, 15, 3, 2, '#5a5248', 0.18, 0.6);
    p.faceRect(face, u, v, w, w, 0, 15, 0, 1, 0.9, 1, shade(STONE, 0.9));
  }
  const c = w / 2;
  for (const [du, dv] of [[0.15, 0.15], [w - 0.15, 0.15], [0.15, w - 0.15]] as const) goldOnion(p, u + du, v + dv, 15, 0.1);
  goldOnion(p, u + c, v + c, 15, 0.15);
  goldOnion(p, u + w - 0.15, v + w - 0.15, 15, 0.1);
}

/** Ivan the Great bell tower: white octagonal tiers with arched belfries, a tall gilded drum and onion. */
function ivanTower(p: IsoPainter, u: number, v: number): void {
  const tiers: [number, number, number][] = [
    [0.3, 0, 24],
    [0.25, 24, 14],
    [0.2, 38, 11],
  ];
  for (const [r, z, h] of tiers) {
    p.cylinder(u, v, r, z, h, WHITE, 8);
    p.cylinder(u, v, r + 0.03, z + h - 1.2, 1.2, STONE, 8);
    // Arched belfry openings.
    for (let k = 0; k < 3; k++) {
      const a = Math.PI * (0.1 + k * 0.4);
      const [x, y] = p.project(u + Math.cos(a) * r * 0.9, v + Math.sin(a) * r * 0.9, z + h * 0.62);
      p.ctx.fillStyle = '#4a4238';
      p.ctx.beginPath();
      p.ctx.ellipse(x, y, 1.1, 2.2, 0, 0, Math.PI * 2);
      p.ctx.fill();
    }
  }
  p.cylinder(u, v, 0.15, 49, 9, shade(GOLD, 0.85), 8);
  p.onion(u, v, 0.2, 58, 15, GOLD);
  p.pole(u, v, 73, 6, GOLD);
}

/** Round Vodovzvodnaya-style corner tower: tall brick drum, white-trimmed tiers, a long green tent and the star. */
function bigTower(p: IsoPainter, cu: number, cv: number): void {
  p.cylinder(cu, cv, 0.36, 0, 30, BRICK, 12);
  p.cylinder(cu, cv, 0.39, 30, 3, BRICK_CAP, 12);
  p.cylinder(cu, cv, 0.28, 33, 9, BRICK, 10);
  p.cylinder(cu, cv, 0.3, 42, 1.5, STONE, 10);
  p.cylinder(cu, cv, 0.2, 43.5, 6, BRICK, 8);
  p.pyramid(cu - 0.2, cv - 0.2, 0.4, 0.4, 49.5, 30, SPIRE);
  p.pole(cu, cv, 79.5, 3, GOLD);
}

/** Autumn tree crowns (green, gold, rust) on short trunks. */
function trees(p: IsoPainter, spots: readonly [number, number][]): void {
  const leaf = ['#4f7a34', '#c7962c', '#a5552a', '#6b8a3a'];
  spots.forEach(([u, v], i) => {
    p.cylinder(u, v, 0.03, 0, 4, '#4a3a28', 4);
    p.dome(u, v, 0.2, 4, 9, leaf[i % leaf.length]!);
  });
}

/**
 * Moscow — the Kremlin as seen from the river, symmetric about the picture's vertical centre line: the cream Grand
 * Kremlin Palace with green roofs and a gilded dome along the back walls, the white Ivan the Great bell tower with its
 * golden onion in the middle, two white cathedrals with five golden onions either side, autumn trees, and red
 * crenellated walls with green-tented towers — a tall round one on the front corner, the same towers left / right and
 * mid-way along the front walls.
 */
export function createMoscowKremlinArt(flag: Allegiance = 'russia'): BuildingArt {
  return {
    footprint: { w: 4, d: ART_D },
    // The capital sits on a 5 × 5 plot (FOOTPRINT_CAPITAL). Authored in 4 × 4 units, drawn 1.25×.
    scale: 5 / 4,
    height: 140,

    drawStatic(p) {
      p.topRect(0.02, 0.02, 3.98, 3.98, 0.1, '#7a8a52');
      // Back walls meeting behind the palace.
      wall(p, 0.02, 0.02, 3.5, 0.26);
      wall(p, 0.02, 0.28, 0.26, 3.24);

      // Grand Kremlin Palace: two identical cream wings along the back walls and the corner pavilion with the dome.
      const palace = { glass: GLASS, frame: '#fbf3dc', fill: 0.5, band: 0.3, bandColor: shade(CREAM, 0.86) };
      const wing = (u: number, v: number, w: number, d: number): void => {
        p.box(u, v, w, d, 0, 26, CREAM);
        facade(p, 'left', u, v, w, d, 0, 26, { ...palace, cols: Math.round(w * 7), floors: 3, seed: 21 });
        facade(p, 'right', u, v, w, d, 0, 26, { ...palace, cols: Math.round(d * 7), floors: 3, seed: 21 });
        p.faceRect('left', u, v, w, d, 0, 26, 0, 1, 0, 0.12, shade(CREAM, 0.85));
        p.faceRect('right', u, v, w, d, 0, 26, 0, 1, 0, 0.12, shade(CREAM, 0.8));
        p.box(u - 0.02, v - 0.02, w + 0.04, d + 0.04, 26, 1.5, STONE);
        p.hipRoof(u, v, w, d, 27.5, 7, 0.04, GREEN);
      };
      wing(1.06, 0.28, 2.4, 0.86);
      wing(0.28, 1.06, 0.86, 2.4);
      p.box(0.28, 0.28, 0.78, 0.78, 0, 32, CREAM);
      facade(p, 'left', 0.28, 0.28, 0.78, 0.78, 0, 32, { ...palace, cols: 5, floors: 3, seed: 25 });
      facade(p, 'right', 0.28, 0.28, 0.78, 0.78, 0, 32, { ...palace, cols: 5, floors: 3, seed: 25 });
      p.box(0.26, 0.26, 0.82, 0.82, 32, 2, STONE);
      p.hipRoof(0.28, 0.28, 0.78, 0.78, 34, 4, 0.03, GREEN);
      p.cylinder(PALACE_DOME[0], PALACE_DOME[1], 0.22, 36, 8, CREAM, 8);
      p.dome(PALACE_DOME[0], PALACE_DOME[1], 0.24, 44, 11, GOLD);

      // Left and right corner towers (the same either side of the centre line).
      tower(p, 3.52, 0.02, false);
      tower(p, 0.02, 3.52, false);

      // Trees and the two cathedrals, mirrored; the bell tower in the middle.
      trees(p, [[1.45, 1.45], [2.7, 1.5], [1.5, 2.7], [3.2, 2.2], [2.2, 3.2]]);
      cathedral(p, 2.55, 1.2);
      cathedral(p, 1.2, 2.55);
      ivanTower(p, IVAN[0], IVAN[1]);
      trees(p, [[2.95, 2.95], [3.3, 2.75], [2.75, 3.3]]);

      // Right and front walls with a gate tower mid-way, meeting at the tall round tower on the front corner.
      wall(p, 3.72, 0.48, 0.26, 2.86);
      wall(p, 0.48, 3.72, 2.86, 0.26);
      tower(p, 3.62, 1.67, false);
      tower(p, 1.67, 3.62, false);
      bigTower(p, 3.62, 3.62);

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
