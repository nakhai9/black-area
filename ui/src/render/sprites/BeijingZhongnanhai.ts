import { HALF_TW } from '../../constants';
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
const STONE = '#8f8a80';
const SLOGAN = '#f4efe2';

/** Art-space depth: the compound only, edge to edge. */
const ART_D = 4;
/** Glazed roof tiles of Xinhuamen: warm golden orange, as in the photo. */
const TILE = '#e0952e';
/** The tall flag pole stands in front of the gate on its centre line (u, v, pole height). */
const FLAG_POLE: readonly [number, number, number] = [2.0, 3.62, 64];
/** Red lanterns hanging under the lower eave either side of the doors. */
const LANTERN_U = [1.15, 2.85] as const;
const LANTERN_V = 3.02;
const LANTERN_Z = 17;

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
  // Shadow of the eave on the top of the walls, and the left (shaded) face a touch darker overall: the hall reads
  // as a solid block under its roof instead of a flat red band.
  p.faceRect('left', u, v, w, d, z, h, 0, 1, 0.62, 1, 'rgba(20,6,4,0.32)');
  p.faceRect('right', u, v, w, d, z, h, 0, 1, 0.72, 1, 'rgba(20,6,4,0.22)');
  p.faceRect('left', u, v, w, d, z, h, 0, 1, 0, 1, 'rgba(20,6,4,0.12)');
}

/** Soft shadow a block of height h casts on the ground (z) behind it to the right, away from the light. */
function castShadow(p: IsoPainter, u: number, v: number, w: number, d: number, z: number, h: number): void {
  const k = h / 40;
  p.polygon(
    [
      [u + w, v, z],
      [u + w + k, v - k * 0.6, z],
      [u + w + k, v + d - k * 0.6, z],
      [u + w, v + d, z],
    ],
    'rgba(10,8,6,0.22)',
    null,
  );
}

/** Chiwen finials at both ridge ends plus a gilded centre ornament. */
function finials(p: IsoPainter, u: number, v: number, w: number, d: number, zTop: number): void {
  const cv = v + d / 2;
  for (const fu of [u + w * 0.22, u + w * 0.78 - 0.08]) {
    p.box(fu, cv - 0.04, 0.08, 0.08, zTop - 1, 4, shade(GOLD_ROOF, 0.8));
  }
  p.box(u + w / 2 - 0.05, cv - 0.05, 0.1, 0.1, zTop - 1, 3, GOLD);
}

/** Stone guardian lion on its pedestal. */
function lion(p: IsoPainter, u: number, v: number): void {
  p.box(u, v, 0.22, 0.14, 3, 3, MARBLE_DARK);
  p.box(u + 0.04, v + 0.02, 0.14, 0.1, 6, 4, STONE);
  p.box(u + 0.06, v + 0.04, 0.1, 0.08, 10, 3, shade(STONE, 1.1));
}

/** Slogan panel in white characters on a red wall face (face space, y up), centred at x over width w. */
function slogan(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, -1);
  ctx.fillStyle = SLOGAN;
  ctx.font = `700 ${Math.max(2, (w / text.length) * 0.9).toFixed(2)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** The national emblem as a gold-ringed red disc with gold stars (face space, y up). */
function emblem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8261d';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.fillRect(x - r * 0.5, y - r * 0.35, r, r * 0.22);
  ctx.beginPath();
  ctx.arc(x, y + r * 0.25, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Beijing — Zhongnanhai's Xinhuamen (New China Gate), after the photo, mirrored about the middle of its long front:
 * a two-storey red gate tower on a grey stone base — five bays of red columns and red doors below, a golden-orange
 * glazed lower eave with a white balustrade, a red upper storey of lattice windows with the national emblem, and a
 * tall double-curved hip-and-gable roof with finials; red slogan walls with golden coping either side, stone lions,
 * the tall flag pole on the centre line in front, and the roofs and trees of the compound behind.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createBeijingZhongnanhaiArt(flag: Allegiance = 'china'): BuildingArt {
  return {
    footprint: { w: 4, d: ART_D },
    // The capital sits on a 5 × 5 plot (FOOTPRINT_CAPITAL). Authored in 4 × 4 units and drawn 1.25× to fill it.
    scale: 5 / 4,
    height: 130, // room for the tall flag pole

    drawStatic(p) {
      // Paved ground, the compound behind: a low hall and trees, mirrored either side of the middle.
      p.box(0, 0, 4, ART_D, 0, 1, STONE);
      p.topRect(0.03, 0.03, 3.97, ART_D - 0.03, 1.01, '#a9a49a');
      for (const u of [0.25, 2.95]) {
        p.cylinder(u + 0.4, 0.45, 0.06, 1, 8, '#4a3a28');
        p.dome(u + 0.4, 0.45, 0.45, 8, 16, '#3f6a3a');
      }
      terrace(p, 1.0, 0.1, 2.0, 0.9, 1, 2);
      hallBody(p, 1.1, 0.2, 1.8, 0.7, 3, 9, 7);
      castShadow(p, 1.0, 0.1, 2.0, 0.9, 1, 18);
      p.hipRoof(1.1, 0.2, 1.8, 0.7, 12, 6, 0.12, shade(TILE, 0.92), 2);
      // Inner walls running back from the slogan walls (the compound's enclosure).
      for (const u of [0.05, 3.7]) {
        p.box(u, 1.2, 0.25, 1.4, 1, 8, RED);
        p.hipRoof(u, 1.2, 0.25, 1.4, 9, 2.5, 0.05, TILE, 0.8);
      }

      // Xinhuamen: grey stone base, ground storey of five red bays with doors.
      const G0 = 0.55;
      const GW = 2.9;
      const GV = 1.75;
      const GD = 1.2;
      castShadow(p, G0 - 0.12, GV - 0.12, GW + 0.24, GD + 0.24, 1, 42);
      p.box(G0 - 0.12, GV - 0.12, GW + 0.24, GD + 0.24, 1, 2, '#8c8880');
      hallBody(p, G0, GV, GW, GD, 3, 15, 10);
      p.faceTransform('left', G0, GV + GD, 3, (ctx) => {
        // Red doors with gold studs in bays 2–4, the middle one under a gold-framed name plaque.
        for (const [k, w] of [[1, 9], [2, 11], [3, 9]] as const) {
          const cx = ((k + 0.5) / 5) * GW * HALF_TW;
          ctx.fillStyle = '#7c1a12';
          ctx.fillRect(cx - w / 2, 0, w, 9.5);
          ctx.fillStyle = '#e8b13a';
          for (let r = 1; r < 5; r++) for (let c = 1; c < 4; c++) ctx.fillRect(cx - w / 2 + (c * w) / 4 - 0.3, r * 1.9 - 0.3, 0.6, 0.6);
        }
        const cx = 0.5 * GW * HALF_TW;
        ctx.fillStyle = GOLD;
        ctx.fillRect(cx - 4.5, 10.3, 9, 2.6);
        ctx.fillStyle = '#c8261d';
        ctx.fillRect(cx - 4, 10.6, 8, 2);
      });
      // Lower eave: golden-orange tiles, white marble balustrade on the platform above it.
      // A narrow eave (not a wide hat), so the storeys below and above stay readable as two stacked blocks.
      p.hipRoof(G0, GV, GW, GD, 18, 4, 0.16, TILE, 1.8);
      p.box(G0 + 0.12, GV + GD - 0.06, GW - 0.24, 0.04, 21, 2, MARBLE);
      p.box(G0 + GW - 0.16, GV + 0.12, 0.04, GD - 0.24, 21, 2, shade(MARBLE, 0.92));
      for (let i = 0; i <= 12; i++) p.box(G0 + 0.12 + (i * (GW - 0.24)) / 12 - 0.02, GV + GD - 0.07, 0.04, 0.06, 21, 2.6, MARBLE);
      // Upper storey: red lattice windows between red columns, the national emblem in the middle.
      const U0 = G0 + 0.22;
      const UW = GW - 0.44;
      const UV = GV + 0.2;
      const UD = GD - 0.4;
      hallBody(p, U0, UV, UW, UD, 21, 12, 9);
      p.faceTransform('left', U0, UV + UD, 21, (ctx) => emblem(ctx, 0.5 * UW * HALF_TW, 8.6, 2.8));
      // Upper roof: tall, flared hip-and-gable roof with ridge finials.
      p.hipRoof(U0, UV, UW, UD, 33, 9, 0.2, TILE, 3);
      finials(p, U0, UV, UW, UD, 42);

      // Slogan walls either side of the gate (red, golden coping, white characters).
      const wall = (u: number, w: number, text: string): void => {
        const v = 2.75;
        const d = 0.3;
        p.box(u, v, w, d, 1, 10, RED);
        p.faceRect('left', u, v, w, d, 1, 10, 0, 1, 0, 0.12, MARBLE_DARK);
        p.faceTransform('left', u, v + d, 1, (ctx) => slogan(ctx, text, 0.5 * w * HALF_TW, 6, w * HALF_TW * 0.85));
        p.hipRoof(u, v, w, d, 11, 2.6, 0.06, TILE, 0.8);
      };
      wall(0.0, 0.5, '伟大的中国共产党万岁');
      wall(3.5, 0.5, '毛泽东思想万岁');

      // Stone lions on their pedestals, potted pines, either side of the doors.
      lion(p, 0.62, 3.2);
      lion(p, 3.16, 3.2);
      for (const u of [1.0, 3.0]) {
        p.box(u - 0.08, 3.2, 0.16, 0.16, 1, 2, MARBLE_DARK);
        p.dome(u, 3.28, 0.14, 3, 7, '#35603a');
      }

      drawNationalPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], 1, FLAG_POLE[2]);
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

      drawFlagOnPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], 1 + FLAG_POLE[2], time, 0.9);
    },
  };
}
