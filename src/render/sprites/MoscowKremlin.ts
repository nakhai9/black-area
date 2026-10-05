import { HALF_TW } from '../../constants';
import { archPath, starPath } from '../Canvas';
import { drawFlagOnPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import { type BuildingArt, groundShadow } from './BuildingArt';

const BRICK = '#a5372c';
const BRICK_CAP = '#b9483a';
const COBBLE = '#857d70';
const CREAM = '#e7d8b2';
const GREEN = '#3d6b50';
const SPIRE = '#2f5640';
const GOLD = '#e0b03a';
const WHITE = '#eee8dc';
const GLASS = '#6a7d8e';
const DOOR = '#2a0f0b';

const WALL_Z = 3;
const WALL_H = 14;
const TOWER = 0.44;
const FLAGS: readonly [number, number][] = [
  [1.15, 1.5],
  [2.85, 1.5],
];
const FLAG_Z = 34;
const SPIRE_TOP: readonly [number, number, number] = [2.0, 3.7, 94];

/** Kremlin wall segment with swallow-tail merlons. */
function wall(p: IsoPainter, u: number, v: number, w: number, d: number): void {
  p.box(u, v, w, d, WALL_Z, WALL_H, BRICK);
  const alongU = w >= d;
  const len = alongU ? w : d;
  const n = Math.max(1, Math.floor(len / 0.2));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * (len / n) - 0.045;
    if (alongU) p.box(u + t, v, 0.09, d, WALL_Z + WALL_H, 3, BRICK_CAP);
    else p.box(u, v + t, w, 0.09, WALL_Z + WALL_H, 3, BRICK_CAP);
  }
}

/** Corner tower with green tented roof and gilded finial. */
function tower(p: IsoPainter, u: number, v: number, h = 24, roof = 18): void {
  const s = TOWER;
  p.box(u, v, s, s, 3, h, BRICK);
  p.windows('left', u, v, s, s, 3, h, 1, 2, DOOR, 0.3, 0.55);
  p.windows('right', u, v, s, s, 3, h, 1, 2, DOOR, 0.3, 0.55);
  p.box(u - 0.03, v - 0.03, s + 0.06, s + 0.06, 3 + h, 3, BRICK_CAP);
  p.pyramid(u, v, s, s, 6 + h, roof, SPIRE);
  p.pole(u + s / 2, v + s / 2, 6 + h + roof, 4, GOLD);
}

/** Drum + golden onion dome (cathedral cupola). */
function cupola(p: IsoPainter, u: number, v: number, r: number, z: number, h: number): void {
  p.cylinder(u, v, r * 0.8, z, h * 0.45, WHITE, 6);
  p.onion(u, v, r, z + h * 0.45, h * 0.75, GOLD);
  p.pole(u, v, z + h * 1.2, 4, GOLD);
}

/** Tiered white bell tower with a golden onion (Ivan the Great style). */
function bellTower(p: IsoPainter, u: number, v: number): void {
  p.cylinder(u, v, 0.21, 3, 24, WHITE, 8);
  p.cylinder(u, v, 0.17, 27, 16, WHITE, 8);
  p.cylinder(u, v, 0.13, 43, 12, WHITE, 6);
  p.onion(u, v, 0.15, 55, 18, GOLD);
  p.pole(u, v, 73, 5, GOLD);
}

/** St. Basil's style striped onion dome on a small brick chapel. */
function chapel(p: IsoPainter, u: number, v: number): void {
  p.box(u - 0.15, v - 0.15, 0.3, 0.3, 3, 12, '#b14a3a');
  p.windows('left', u - 0.15, v - 0.15, 0.3, 0.3, 3, 12, 1, 1, DOOR, 0.3, 0.5);
  p.windows('right', u - 0.15, v - 0.15, 0.3, 0.3, 3, 12, 1, 1, DOOR, 0.3, 0.5);
  p.cylinder(u, v, 0.1, 15, 9, '#c9634a', 4);
  p.onion(u, v, 0.13, 24, 18, '#2f8f5b', '#f2efe6');
  p.pole(u, v, 42, 4, GOLD);
}

function clockFace(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#f4f0e0';
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 3);
  ctx.moveTo(x, y);
  ctx.lineTo(x + 2.2, y - 0.8);
  ctx.stroke();
}

/**
 * Moscow — a stylised Kremlin, mirror-symmetric about its centre line:
 * crenellated red walls and four corner towers, the Grand Palace along the
 * back, a five-domed cathedral in the middle flanked by two bell towers and
 * two chapels, and the Spasskaya clock tower with its glowing red star at the
 * centre of the front wall.
 */
export const MoscowKremlinArt: BuildingArt = {
  footprint: { w: 4, d: 4 },
  height: 104,

  drawStatic(p) {
    groundShadow(p, 4, 4);
    p.box(0, 0, 4, 4, 0, 3, COBBLE);

    // Back and side walls, corner towers (all mirrored about u = 2).
    tower(p, 0.08, 0.08);
    wall(p, 0.52, 0.2, 2.96, 0.2);
    wall(p, 0.2, 0.52, 0.2, 2.96);
    tower(p, 3.48, 0.08);
    tower(p, 0.08, 3.48);

    // Grand Kremlin Palace across the back, centred.
    p.box(0.8, 0.55, 2.4, 0.8, 3, 22, CREAM);
    p.windows('left', 0.8, 0.55, 2.4, 0.8, 3, 22, 9, 3, GLASS);
    p.windows('right', 0.8, 0.55, 2.4, 0.8, 3, 22, 3, 3, GLASS);
    p.hipRoof(0.8, 0.55, 2.4, 0.8, 25, 9, 0.04, GREEN);
    p.cylinder(2.0, 0.95, 0.13, 30, 6, CREAM);
    p.dome(2.0, 0.95, 0.13, 36, 8, GREEN);

    // Left bell tower + chapel, central cathedral, right chapel + bell tower.
    bellTower(p, 0.95, 2.2);
    chapel(p, 0.95, 3.0);

    p.box(1.5, 1.7, 1.0, 1.0, 3, 20, WHITE);
    p.windows('left', 1.5, 1.7, 1.0, 1.0, 3, 20, 3, 2, GLASS, 0.15, 0.55);
    p.windows('right', 1.5, 1.7, 1.0, 1.0, 3, 20, 3, 2, GLASS, 0.15, 0.55);
    cupola(p, 1.65, 1.85, 0.11, 23, 22);
    cupola(p, 2.35, 1.85, 0.11, 23, 22);
    cupola(p, 2.0, 2.2, 0.16, 23, 30);
    cupola(p, 1.65, 2.55, 0.11, 23, 22);
    cupola(p, 2.35, 2.55, 0.11, 23, 22);

    bellTower(p, 3.05, 2.2);
    chapel(p, 3.05, 3.0);

    // Right wall, then the front wall split around the central Spasskaya Tower.
    wall(p, 3.6, 0.52, 0.2, 2.96);
    wall(p, 0.52, 3.6, 1.18, 0.2);
    wall(p, 2.3, 3.6, 1.18, 0.2);

    p.box(1.75, 3.45, 0.5, 0.5, 3, 32, BRICK);
    p.faceTransform('left', 1.75, 3.95, 3, (ctx) => {
      ctx.fillStyle = DOOR;
      archPath(ctx, 0.25 * HALF_TW, 6, 14);
      ctx.fill();
    });
    p.box(1.72, 3.42, 0.56, 0.56, 35, 3, BRICK_CAP);
    p.box(1.82, 3.52, 0.36, 0.36, 38, 14, BRICK);
    p.faceTransform('left', 1.82, 3.88, 38, (ctx) => clockFace(ctx, 0.18 * HALF_TW, 7));
    p.faceTransform('right', 2.18, 3.88, 38, (ctx) => clockFace(ctx, 0.18 * HALF_TW, 7));
    p.box(1.8, 3.5, 0.4, 0.4, 52, 3, BRICK_CAP);
    p.box(1.88, 3.58, 0.24, 0.24, 55, 9, '#d8cfbd');
    p.pyramid(1.88, 3.58, 0.24, 0.24, 64, 30, SPIRE);

    tower(p, 3.48, 3.48);

    for (const [u, v] of FLAGS) p.pole(u, v, 3, FLAG_Z);
  },

  drawAnimated(p, time) {
    // Glowing ruby star on the Spasskaya spire.
    const [x, y] = p.project(SPIRE_TOP[0], SPIRE_TOP[1], SPIRE_TOP[2]);
    const { ctx } = p;
    ctx.save();
    ctx.shadowColor = 'rgba(255,40,30,0.9)';
    ctx.shadowBlur = 6 + Math.sin(time * 3) * 3;
    ctx.fillStyle = '#e8261c';
    ctx.strokeStyle = '#ffd36b';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    starPath(ctx, x, y - 4, 4.5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    FLAGS.forEach(([u, v], i) => drawFlagOnPole(p, 'russia', u, v, 3 + FLAG_Z, time, 0.4 + i * 1.1, 18, 11));
  },
};
