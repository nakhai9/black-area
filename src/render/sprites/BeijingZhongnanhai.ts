import { HALF_TW } from '../../constants';
import { archPath } from '../Canvas';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { facade } from './Ra2Kit';

const RED = '#8c2e22';
const COLUMN = '#a23a2a';
const LATTICE = '#4a150f';
const GOLD_ROOF = '#c4952e';
const GREEN_ROOF = '#4a6a52';
const GREY_ROOF = '#5d6468';
const MARBLE = '#cdc8bb';
const PAVING = '#99948a';
const ROAD = '#4b4d50';
const TEAL = '#3a6e68';
const WATER = '#466b78';
const LAWN = '#5a7634';
const DOOR = '#3b130e';
const GLASS = '#2c3a4e';

const FLAG_POLE: readonly [number, number, number] = [2.0, 4.15, 44];
const LANTERN_U = [1.25, 2.75] as const;
const LANTERN_V = 3.72;
const LANTERN_Z = 26;
/** Art-space depth: 4 units of compound plus 2.4 of Chang'an Avenue (see the footprint note below). */
const ART_D = 6.4;

/** Weeping willow on the lake shore. */
function willow(p: IsoPainter, u: number, v: number): void {
  p.cylinder(u, v, 0.04, 3, 6, '#6b513a');
  p.dome(u, v, 0.2, 8, 9, '#5f7d3c');
}

/** Red-columned pavilion body with teal painted beams under the eaves. */
function hall(p: IsoPainter, u: number, v: number, w: number, d: number, z: number, h: number, cols: number): void {
  p.box(u, v, w, d, z, h, RED);
  p.colonnade('left', u, v, w, d, z, h, cols, shade(COLUMN, 0.85), LATTICE);
  p.colonnade('right', u, v, w, d, z, h, Math.max(2, Math.round((cols * d) / w)), COLUMN, shade(LATTICE, 1.2));
  p.faceRect('left', u, v, w, d, z, h, 0, 1, 0.8, 1, shade(TEAL, 0.8));
  p.faceRect('right', u, v, w, d, z, h, 0, 1, 0.8, 1, TEAL);
}

/** Inside the walls: Nanhai lake with Yingtai island, Qinzheng Hall and courtyard halls among willows. */
function compound(p: IsoPainter): void {
  p.topRect(0.12, 0.12, 3.88, 3.4, 3, LAWN);
  // Nanhai lake and the Yingtai island pavilion.
  p.topRect(0.25, 0.25, 2.2, 2.0, 3, shade(MARBLE, 0.85));
  p.topRect(0.3, 0.3, 2.15, 1.95, 3, WATER);
  p.topRect(0.85, 0.75, 1.6, 1.45, 3, shade(PAVING, 1.05));
  hall(p, 0.95, 0.85, 0.55, 0.45, 3, 7, 4);
  p.hipRoof(0.95, 0.85, 0.55, 0.45, 10, 6, 0.12, GREEN_ROOF, 2);
  p.box(1.55, 1.05, 0.65, 0.12, 3, 1.5, MARBLE); // bridge to the shore
  // Qinzheng Hall: the modern office block of the State Council.
  p.box(2.45, 0.35, 1.25, 0.9, 3, 14, '#c9c4b8');
  facade(p, 'left', 2.45, 0.35, 1.25, 0.9, 3, 14, { cols: 9, floors: 3, glass: GLASS, frame: '#d8d2c4', fill: 0.5, bandColor: '#aaa498', seed: 31 });
  facade(p, 'right', 2.45, 0.35, 1.25, 0.9, 3, 14, { cols: 6, floors: 3, glass: GLASS, frame: '#d8d2c4', fill: 0.5, bandColor: '#aaa498', seed: 32 });
  p.hipRoof(2.45, 0.35, 1.25, 0.9, 17, 5, 0.08, GREY_ROOF, 1);
  // Traditional courtyard halls with green tiles.
  hall(p, 2.55, 1.6, 1.1, 0.5, 3, 8, 6);
  p.hipRoof(2.55, 1.6, 1.1, 0.5, 11, 6, 0.14, GREEN_ROOF, 2);
  hall(p, 0.4, 2.35, 0.9, 0.45, 3, 7, 5);
  p.hipRoof(0.4, 2.35, 0.9, 0.45, 10, 5, 0.12, GREEN_ROOF, 2);
  const willows: readonly [number, number][] = [[0.3, 2.1], [2.3, 0.4], [2.3, 1.9], [2.4, 2.6], [3.6, 2.5], [1.6, 2.6]];
  for (const [u, v] of willows) willow(p, u, v);
  // Screen wall inside the gate ("Serve the People").
  p.box(1.45, 2.95, 1.1, 0.12, 3, 9, RED, { top: GOLD_ROOF });
  p.faceRect('left', 1.45, 2.95, 1.1, 0.12, 3, 9, 0.15, 0.85, 0.35, 0.75, shade(GOLD_ROOF, 1.05));
}

/** Chang'an Avenue in front of the gate: wide road with lane lines, pavements and trees. */
function avenue(p: IsoPainter): void {
  p.topRect(0.05, 4.0, 3.95, 4.45, 3, shade(PAVING, 1.05));
  p.topRect(0.05, 4.45, 3.95, 6.0, 3, ROAD);
  for (const v of [4.95, 5.5]) {
    for (let u = 0.2; u < 3.8; u += 0.5) p.topRect(u, v - 0.02, u + 0.28, v + 0.02, 3, '#e8e4d8');
  }
  p.topRect(0.05, 6.0, 3.95, 6.35, 3, shade(PAVING, 1.05));
  // Curbs and street lamps.
  p.box(0.05, 4.43, 3.9, 0.04, 3, 0.8, '#bcb6a8');
  p.box(0.05, 5.98, 3.9, 0.04, 3, 0.8, '#bcb6a8');
  for (let u = 0.6; u < 4; u += 0.85) {
    p.pole(u, 4.3, 3, 10, '#3a3c3e');
    p.box(u - 0.03, 4.27, 0.06, 0.06, 13, 1.5, '#e8dfb8');
  }
  for (let u = 0.3; u < 4; u += 0.85) {
    p.cylinder(u, 6.18, 0.035, 3, 5, '#6b513a');
    p.dome(u, 6.18, 0.15, 8, 7, '#47652f');
  }
}

/**
 * Beijing — a stylised Zhongnanhai: the Xinhuamen gate (red pavilion with a double-eaved golden roof) in the long
 * red wall on Chang'an Avenue, and behind it Nanhai lake, Yingtai island, Qinzheng Hall and willows.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createBeijingZhongnanhaiArt(flag: Allegiance = 'china'): BuildingArt {
  return {
    footprint: { w: 4, d: ART_D },
    // The capital sits on a 5 × 8 plot (FOOTPRINT_CAPITAL). The art below is authored in 4 × 6.4 units and drawn
    // 1.25× to fill it: the compound keeps its square proportions in v 0…4, and Chang'an Avenue fills v 4…6.4.
    scale: 5 / 4,
    height: 80,

    drawStatic(p) {
      p.box(0, 0, 4, ART_D, 0, 3, PAVING);

      compound(p);

      // Red perimeter wall with grey coping, Xinhuamen in the middle of the south side.
      p.box(0.05, 0.05, 0.12, 3.5, 3, 9, RED, { top: GREY_ROOF });
      p.box(3.83, 0.05, 0.12, 3.5, 3, 9, RED, { top: GREY_ROOF });
      p.box(0.05, 3.42, 1.0, 0.16, 3, 9, RED, { top: GREY_ROOF });
      p.box(2.95, 3.42, 1.0, 0.16, 3, 9, RED, { top: GREY_ROOF });

      // Xinhuamen: marble base, red hall with one arched gateway, double-eaved golden roof.
      p.box(1.0, 3.2, 2.0, 0.65, 3, 3, MARBLE);
      p.box(1.1, 3.3, 1.8, 0.45, 6, 16, RED);
      p.faceTransform('left', 1.1, 3.75, 6, (ctx) => {
        ctx.fillStyle = DOOR;
        archPath(ctx, 0.5 * 1.8 * HALF_TW, 12, 13);
        ctx.fill();
      });
      p.faceRect('left', 1.1, 3.3, 1.8, 0.45, 6, 16, 0, 1, 0.82, 1, shade(TEAL, 0.8));
      p.faceRect('right', 1.1, 3.3, 1.8, 0.45, 6, 16, 0, 1, 0.82, 1, TEAL);
      p.hipRoof(1.1, 3.3, 1.8, 0.45, 22, 5, 0.22, GOLD_ROOF, 3);
      hall(p, 1.3, 3.38, 1.4, 0.3, 27, 6, 7);
      p.hipRoof(1.3, 3.38, 1.4, 0.3, 33, 9, 0.2, GOLD_ROOF, 3);

      // Guardian lions either side of the gate.
      for (const u of [0.85, 3.05]) {
        p.box(u - 0.08, 3.85, 0.16, 0.16, 3, 3, MARBLE);
        p.dome(u, 3.93, 0.08, 6, 6, '#8a8478');
      }

      drawNationalPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], 3, FLAG_POLE[2]);

      avenue(p);
    },

    drawAnimated(p, time) {
      const { ctx } = p;
      LANTERN_U.forEach((u, i) => {
        const [ax, ay] = p.project(u, LANTERN_V, LANTERN_Z);
        const sway = Math.sin(time * 2 + i * 1.3) * 1.2;
        const lx = ax + sway;
        const ly = ay + 7;
        ctx.strokeStyle = '#3a2a10';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(lx, ly - 3);
        ctx.stroke();
        ctx.fillStyle = '#d8261b';
        ctx.beginPath();
        ctx.ellipse(lx, ly, 3, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f2c94c';
        ctx.fillRect(lx - 1.6, ly - 4, 3.2, 1);
        ctx.fillRect(lx - 1.6, ly + 3, 3.2, 1);
      });

      drawFlagOnPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], 3 + FLAG_POLE[2], time, 0.9);
    },
  };
}
export const BeijingZhongnanhaiArt: BuildingArt = createBeijingZhongnanhaiArt();
