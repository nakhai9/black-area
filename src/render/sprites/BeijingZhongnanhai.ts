import { HALF_TW } from '../../constants';
import { archPath } from '../Canvas';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';

const RED = '#9a2a1e';
const COLUMN = '#b23424';
const LATTICE = '#4a150f';
const GOLD_ROOF = '#d9a52c';
const MARBLE = '#e2ddd0';
const MARBLE_DARK = '#b9b3a4';
const TEAL = '#2f6f6a';
const BLUE = '#2b4f7a';
const GOLD = '#f0c445';
const DOOR = '#3b130e';
const STONE = '#8f8a80';
const SLOGAN = '#f4efe2';

/** Art-space depth: the compound only, edge to edge. */
const ART_D = 4;
/** Ridge height of the main (back) hall, where the flag pole stands. */
const MAIN_TOP = 51;
const FLAG_POLE: readonly [number, number, number] = [2.0, 0.68, 34];
const LANTERN_U = [1.35, 2.65] as const;
const LANTERN_V = 3.8;
const LANTERN_Z = 21;

/** White marble terrace with a darker plinth course and a balustrade on its front/right edges. */
function terrace(p: IsoPainter, u: number, v: number, w: number, d: number, z: number, h: number): void {
  p.box(u, v, w, d, z, h, MARBLE);
  p.faceRect('left', u, v, w, d, z, h, 0, 1, 0, 0.3, MARBLE_DARK);
  p.faceRect('right', u, v, w, d, z, h, 0, 1, 0, 0.3, shade(MARBLE_DARK, 0.9));
  p.box(u, v + d - 0.04, w, 0.04, z + h, 2.2, MARBLE);
  p.box(u + w - 0.04, v, 0.04, d, z + h, 2.2, shade(MARBLE, 0.92));
}

/** Red-columned body with the green-blue dougong bands under the eaves. */
function hallBody(p: IsoPainter, u: number, v: number, w: number, d: number, z: number, h: number, cols: number): void {
  p.box(u, v, w, d, z, h, RED);
  p.colonnade('left', u, v, w, d, z, h, cols, shade(COLUMN, 0.9), LATTICE);
  p.colonnade('right', u, v, w, d, z, h, Math.max(2, Math.round((cols * d) / w)), COLUMN, shade(LATTICE, 1.2));
  p.faceRect('left', u, v, w, d, z, h, 0, 1, 0.78, 0.9, shade(TEAL, 0.85));
  p.faceRect('right', u, v, w, d, z, h, 0, 1, 0.78, 0.9, TEAL);
  p.faceRect('left', u, v, w, d, z, h, 0, 1, 0.9, 1, shade(BLUE, 0.85));
  p.faceRect('right', u, v, w, d, z, h, 0, 1, 0.9, 1, BLUE);
}

/** Chiwen finials at both ridge ends plus a gilded centre ornament. */
function finials(p: IsoPainter, u: number, v: number, w: number, d: number, zTop: number): void {
  const cv = v + d / 2;
  for (const fu of [u + w * 0.22, u + w * 0.78 - 0.08]) {
    p.box(fu, cv - 0.04, 0.08, 0.08, zTop - 1, 4, shade(GOLD_ROOF, 0.8));
  }
  p.box(u + w / 2 - 0.05, cv - 0.05, 0.1, 0.1, zTop - 1, 3, GOLD);
}

/** Double-eave wudian hall: lower eave, clerestory, upper eave with finials. */
function doubleEaveHall(
  p: IsoPainter,
  u: number,
  v: number,
  w: number,
  d: number,
  z: number,
  h: number,
  cols: number,
  eaveH: number,
  upperH: number,
  roofH: number,
): void {
  hallBody(p, u, v, w, d, z, h, cols);
  p.hipRoof(u, v, w, d, z + h, eaveH, 0.2, GOLD_ROOF, 3);
  const iu = u + w * 0.1;
  const iv = v + d * 0.18;
  const iw = w * 0.8;
  const id = d * 0.64;
  const z2 = z + h + eaveH;
  hallBody(p, iu, iv, iw, id, z2, upperH, Math.max(4, cols - 2));
  p.hipRoof(iu, iv, iw, id, z2 + upperH, roofH, 0.22, GOLD_ROOF, 3);
  finials(p, iu, iv, iw, id, z2 + upperH + roofH);
}

/** Long red side gallery under a single golden roof. */
function gallery(p: IsoPainter, u: number, v: number, w: number, d: number, cols: number): void {
  terrace(p, u, v, w, d, 3, 2);
  hallBody(p, u + 0.03, v + 0.03, w - 0.06, d - 0.06, 5, 9, cols);
  p.hipRoof(u + 0.03, v + 0.03, w - 0.06, d - 0.06, 14, 6, 0.1, GOLD_ROOF, 2);
}

/** Stone guardian lion on its pedestal. */
function lion(p: IsoPainter, u: number, v: number): void {
  p.box(u, v, 0.22, 0.14, 3, 3, MARBLE_DARK);
  p.box(u + 0.04, v + 0.02, 0.14, 0.1, 6, 4, STONE);
  p.box(u + 0.06, v + 0.04, 0.1, 0.08, 10, 3, shade(STONE, 1.1));
}

/** Red front wall with golden tile coping and a white slogan panel. */
function frontWall(p: IsoPainter, u: number, w: number): void {
  const v = 3.45;
  const d = 0.5;
  p.box(u, v, w, d, 3, 13, RED);
  p.faceRect('left', u, v, w, d, 3, 13, 0, 1, 0, 0.12, MARBLE_DARK);
  p.faceRect('left', u, v, w, d, 3, 13, 0.12, 0.88, 0.4, 0.72, SLOGAN);
  p.faceRect('left', u, v, w, d, 3, 13, 0.16, 0.84, 0.48, 0.64, shade(SLOGAN, 0.9));
  p.faceRect('right', u, v, w, d, 3, 13, 0, 1, 0, 0.12, shade(MARBLE_DARK, 0.9));
  p.hipRoof(u, v, w, d, 16, 4, 0.06, GOLD_ROOF, 1);
}

/**
 * Beijing — a dense Zhongnanhai / Forbidden-City compound filling the whole plot: the Xinhuamen gate (double-eave
 * golden roof, slogan walls, stone lions) on the front edge, Huairen/Qinzheng hall on a marble terrace behind it,
 * red side galleries on both flanks and a tall double-eave main hall at the back carrying the flag.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createBeijingZhongnanhaiArt(flag: Allegiance = 'china'): BuildingArt {
  return {
    footprint: { w: 4, d: ART_D },
    // The capital sits on a 5 × 5 plot (FOOTPRINT_CAPITAL). Authored in 4 × 4 units and drawn 1.25× to fill it.
    scale: 5 / 4,
    height: 130, // room for the flag on the back hall ridge

    drawStatic(p) {
      // Marble plinth under the whole compound.
      terrace(p, 0, 0, 4, ART_D, 0, 3);

      // Main hall at the back: two-step marble terrace, tall double-eave wudian roof.
      terrace(p, 0.15, 0.05, 3.7, 1.35, 3, 3);
      terrace(p, 0.3, 0.12, 3.4, 1.18, 6, 3);
      doubleEaveHall(p, 0.4, 0.18, 3.2, 1.0, 9, 16, 11, 6, 8, 12);

      // Left gallery, middle Huairen/Qinzheng hall, right gallery.
      gallery(p, 0.05, 1.4, 0.6, 2.05, 3);
      terrace(p, 0.65, 1.45, 2.7, 1.25, 3, 4);
      doubleEaveHall(p, 0.8, 1.55, 2.4, 1.0, 7, 12, 9, 5, 6, 9);
      gallery(p, 3.35, 1.4, 0.6, 2.05, 3);

      // Front range: slogan walls either side of Xinhuamen.
      frontWall(p, 0.05, 0.95);
      frontWall(p, 3.0, 0.95);

      // Xinhuamen: marble base, red hall with arched gateway and gilded plaque, double-eave golden roof.
      terrace(p, 1.0, 2.75, 2.0, 1.2, 3, 3);
      hallBody(p, 1.1, 2.9, 1.8, 0.9, 6, 15, 7);
      p.faceTransform('left', 1.1, 3.8, 6, (ctx) => {
        const cx = 0.5 * 1.8 * HALF_TW;
        ctx.fillStyle = DOOR;
        archPath(ctx, cx, 11, 12);
        ctx.fill();
        ctx.fillStyle = GOLD;
        ctx.fillRect(cx - 4, -13.5, 8, 2.5);
      });
      p.hipRoof(1.1, 2.9, 1.8, 0.9, 21, 5, 0.22, GOLD_ROOF, 3);
      hallBody(p, 1.3, 3.05, 1.4, 0.6, 26, 6, 7);
      p.hipRoof(1.3, 3.05, 1.4, 0.6, 32, 9, 0.22, GOLD_ROOF, 3);
      finials(p, 1.3, 3.05, 1.4, 0.6, 41);

      // Stone lions on the very front edge.
      lion(p, 1.15, 3.82);
      lion(p, 2.63, 3.82);

      drawNationalPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], MAIN_TOP, FLAG_POLE[2]);
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

      drawFlagOnPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], MAIN_TOP + FLAG_POLE[2], time, 0.9);
    },
  };
}
