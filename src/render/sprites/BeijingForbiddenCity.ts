import { HALF_TW } from '../../constants';
import { archPath } from '../Canvas';
import { shade } from '../Color';
import { drawFlagOnPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import { type BuildingArt, groundShadow } from './BuildingArt';

const RED = '#a92a1f';
const COLUMN = '#c23a2c';
const LATTICE = '#4a150f';
const GOLD_ROOF = '#e2a81e';
const MARBLE = '#ebe7dc';
const PLAZA = '#a8a196';
const TEAL = '#2b8580';
const DOOR = '#3b130e';

const FLAG_POLE: readonly [number, number, number] = [2.0, 3.88, 50];
const LANTERN_U = [1.1, 1.65, 2.35, 2.9] as const;
const LANTERN_V = 3.62;
const LANTERN_Z = 39;
/** Art-space depth: 4 units of palace plus 2.4 of outer courtyard (see the footprint note below). */
const ART_D = 6.4;

/** Outer courtyard: the Golden Water stream and its five marble bridges between long red walls,
 *  watched by a pair of huabiao columns. */
function outerCourt(p: IsoPainter): void {
  p.topRect(0.12, 4.02, 3.88, 6.3, 3, shade(PLAZA, 0.94));
  p.box(0.12, 4.02, 0.26, 2.28, 3, 11, RED);
  p.box(3.62, 4.02, 0.26, 2.28, 3, 11, RED);

  // The stream curves across the court; the bridges step over it.
  p.topRect(0.5, 4.78, 3.5, 5.2, 3, TEAL);
  for (const u of [0.72, 1.3, 1.86, 2.42, 2.98]) {
    p.box(u, 4.7, 0.3, 0.58, 3, 3, MARBLE);
    p.faceRect('left', u, 4.7, 0.3, 0.58, 3, 3, 0, 1, 0.5, 1, shade(MARBLE, 1.05));
  }

  for (const u of [0.78, 3.22]) {
    p.cylinder(u, 5.75, 0.07, 3, 21, MARBLE, 4);
    p.topRect(u - 0.16, 5.59, u + 0.16, 5.91, 24, shade(MARBLE, 1.08));
    p.dome(u, 5.75, 0.1, 25, 6, MARBLE);
  }
}

/** White marble terrace tier with a balustrade band. */
function terrace(p: IsoPainter, u: number, v: number, w: number, d: number, z: number): void {
  p.box(u, v, w, d, z, 6, MARBLE);
  for (const face of ['left', 'right'] as const) {
    p.faceRect(face, u, v, w, d, z, 6, 0, 1, 0.7, 1, shade(MARBLE, 1.05));
    p.faceRect(face, u, v, w, d, z, 6, 0, 1, 0, 0.15, shade(MARBLE, 0.6));
  }
}

/** Red-columned hall body with teal painted beams under the eaves. */
function hall(p: IsoPainter, u: number, v: number, w: number, d: number, z: number, h: number, cols: number): void {
  p.box(u, v, w, d, z, h, RED);
  p.colonnade('left', u, v, w, d, z, h, cols, shade(COLUMN, 0.85), LATTICE);
  p.colonnade('right', u, v, w, d, z, h, Math.max(2, Math.round((cols * d) / w)), COLUMN, shade(LATTICE, 1.2));
  p.faceRect('left', u, v, w, d, z, h, 0, 1, 0.8, 1, shade(TEAL, 0.8));
  p.faceRect('right', u, v, w, d, z, h, 0, 1, 0.8, 1, TEAL);
}

/**
 * Beijing — a stylised Forbidden City: the Hall of Supreme Harmony on three
 * marble terraces behind the Tiananmen gate (red podium, arched gateways,
 * double-eaved golden roofs), huabiao columns and swaying red lanterns.
 */
export const BeijingForbiddenCityArt: BuildingArt = {
  footprint: { w: 4, d: ART_D },
  // The capital sits on a 5 × 8 plot (FOOTPRINT_CAPITAL). The art below is authored in 4 × 6.4 units and drawn
  // 1.25× to fill it: the palace itself keeps its square proportions in v 0…4, and the nation's own ceremonial
  // approach fills v 4…6.4 in front of it.
  scale: 5 / 4,
  height: 96,

  drawStatic(p) {
    groundShadow(p, 4, ART_D);
    p.box(0, 0, 4, ART_D, 0, 3, PLAZA);
    p.topRect(1.7, 3.55, 2.3, 3.95, 3, shade(PLAZA, 1.1));

    // Hall of Supreme Harmony on triple terrace.
    terrace(p, 0.3, 0.25, 3.4, 2.05, 3);
    terrace(p, 0.5, 0.4, 3.0, 1.75, 9);
    terrace(p, 0.7, 0.55, 2.6, 1.45, 15);
    hall(p, 0.95, 0.75, 2.1, 0.95, 21, 18, 9);
    p.hipRoof(0.95, 0.75, 2.1, 0.95, 39, 9, 0.3, GOLD_ROOF, 3);
    hall(p, 1.15, 0.9, 1.7, 0.65, 45, 7, 7);
    p.hipRoof(1.15, 0.9, 1.7, 0.65, 52, 14, 0.26, GOLD_ROOF, 3);

    // Tiananmen podium with five arched gateways.
    p.box(0.2, 2.5, 3.6, 1.05, 3, 22, RED);
    p.faceRect('left', 0.2, 2.5, 3.6, 1.05, 3, 22, 0, 1, 0.88, 1, shade(RED, 0.55));
    p.faceTransform('left', 0.2, 3.55, 3, (ctx) => {
      const width = 3.6 * HALF_TW;
      const gates: [number, number, number][] = [
        [0.2, 7, 11],
        [0.35, 8, 12],
        [0.5, 10, 14],
        [0.65, 8, 12],
        [0.8, 7, 11],
      ];
      ctx.fillStyle = DOOR;
      for (const [s, w, h] of gates) {
        archPath(ctx, s * width, w, h);
        ctx.fill();
      }
    });
    p.faceTransform('right', 3.8, 3.55, 3, (ctx) => {
      ctx.fillStyle = DOOR;
      archPath(ctx, 0.5 * 1.05 * HALF_TW, 7, 11);
      ctx.fill();
    });
    p.box(0.18, 2.48, 3.64, 1.09, 25, 2, MARBLE);

    // Gate tower.
    hall(p, 0.8, 2.72, 2.4, 0.62, 27, 13, 10);
    p.hipRoof(0.8, 2.72, 2.4, 0.62, 40, 7, 0.28, GOLD_ROOF, 3);
    hall(p, 1.0, 2.82, 2.0, 0.42, 45, 6, 8);
    p.hipRoof(1.0, 2.82, 2.0, 0.42, 51, 12, 0.24, GOLD_ROOF, 3);

    // Huabiao columns.
    for (const u of [0.45, 3.55]) {
      p.box(u - 0.08, 3.72, 0.16, 0.16, 3, 3, MARBLE);
      p.cylinder(u, 3.8, 0.045, 6, 30, MARBLE);
      p.cylinder(u, 3.8, 0.09, 36, 2, MARBLE);
    }

    p.pole(FLAG_POLE[0], FLAG_POLE[1], 3, FLAG_POLE[2]);

    outerCourt(p);
  },

  drawAnimated(p, time) {
    const { ctx } = p;
    LANTERN_U.forEach((u, i) => {
      const [ax, ay] = p.project(u, LANTERN_V, LANTERN_Z);
      const sway = Math.sin(time * 2 + i * 1.3) * 1.4;
      const lx = ax + sway;
      const ly = ay + 8;
      ctx.strokeStyle = '#3a2a10';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(lx, ly - 3);
      ctx.stroke();

      const glow = ctx.createRadialGradient(lx - 1, ly - 1, 0.5, lx, ly, 6);
      glow.addColorStop(0, '#ff8a5c');
      glow.addColorStop(0.55, '#d8261b');
      glow.addColorStop(1, 'rgba(160,20,10,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lx, ly, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8261b';
      ctx.beginPath();
      ctx.ellipse(lx, ly, 3, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(lx - 1.6, ly - 4, 3.2, 1);
      ctx.fillRect(lx - 1.6, ly + 3, 3.2, 1);
      ctx.fillRect(lx - 0.4, ly + 4, 0.8, 3);
    });

    drawFlagOnPole(p, 'china', FLAG_POLE[0], FLAG_POLE[1], 3 + FLAG_POLE[2], time, 0.9);
  },
};
