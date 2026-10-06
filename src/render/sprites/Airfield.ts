import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';

import { type BuildingArt, groundShadow } from './BuildingArt';

const GROUND = '#9a9a8e';
const RUNWAY = '#3c3f44';
const APRON = '#8d9096';
const PAINT = '#ecebe3';
const TAXI = '#d6c24a';
const TANK = '#bfc3c8';

/** The airfield covers 12×6 tiles (the footprint in constants.ts must match). */
export const AIRFIELD_SIZE = { w: 12, d: 6 } as const;
const W = AIRFIELD_SIZE.w;
const D = AIRFIELD_SIZE.d;
/** The runway occupies the back strip v ∈ [0, RUNWAY_D]; its centre line is v = RUNWAY_D / 2. */
export const RUNWAY_D = 1.6;
const ROW_1 = 3.1;
const ROW_2 = 4.95;
/** Six parking spots on the apron, two rows of three (tile coordinates, mirror-symmetric about u = 6). */
export const AIRFIELD_SLOTS: readonly (readonly [number, number])[] = [
  [2, ROW_1],
  [6, ROW_1],
  [10, ROW_1],
  [2, ROW_2],
  [6, ROW_2],
  [10, ROW_2],
];
const LIGHTS_U: number[] = [];
for (let u = 0.15; u < W; u += 1.1) LIGHTS_U.push(u);

/** Thin painted rectangle outline on the apron. */
function outline(p: IsoPainter, u0: number, v0: number, u1: number, v1: number): void {
  const t = 0.04;
  p.topRect(u0, v0, u1, v0 + t, 2.2, PAINT);
  p.topRect(u0, v1 - t, u1, v1, 2.2, PAINT);
  p.topRect(u0, v0, u0 + t, v1, 2.2, PAINT);
  p.topRect(u1 - t, v0, u1, v1, 2.2, PAINT);
}

/**
 * Airfield (12×6 tiles, mirror-symmetric about its centre line): a long runway along the
 * back, and below it an apron that fills the rest of the block with six marked parking spots
 * in two rows (the fighters are real units), a control tower beside the runway, and fuel
 * tanks and service lanes at both ends. Aircraft that return here are repaired.
 */
export function createAirfieldArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  return {
    footprint: { w: W, d: D },
    height: 60,

    drawStatic(p) {
      groundShadow(p, W, D);
      // The whole block is paved.
      p.box(0, 0, W, D, 0, 2, GROUND, { edge: null });

      // Runway with edge lines, centre dashes and threshold marks.
      p.topRect(0, 0, W, RUNWAY_D, 2.1, RUNWAY);
      p.topRect(0, 0.06, W, 0.12, 2.2, PAINT);
      p.topRect(0, RUNWAY_D - 0.12, W, RUNWAY_D - 0.06, 2.2, PAINT);
      const mid = RUNWAY_D / 2;
      for (let u = 0.6; u < W - 0.7; u += 0.9) p.topRect(u, mid - 0.04, u + 0.5, mid + 0.04, 2.2, PAINT);
      for (const u of [0.15, W - 0.3]) for (let k = 0; k < 4; k++) p.topRect(u, 0.22 + k * 0.33, u + 0.15, 0.4 + k * 0.33, 2.2, PAINT);

      // Apron fills the rest of the block, edge to edge.
      p.topRect(0.15, RUNWAY_D, W - 0.15, D - 0.12, 2.1, APRON);
      p.topRect(0.15, RUNWAY_D + 0.02, W - 0.15, RUNWAY_D + 0.08, 2.2, PAINT);

      // Taxi lanes: one above each row of parking spots, joined at both ends.
      const laneA = 2.4;
      const laneB = 4.1;
      for (const v of [laneA, laneB]) p.topRect(0.5, v - 0.04, W - 0.5, v + 0.04, 2.2, TAXI);
      for (const u of [0.5, W - 0.5]) p.topRect(u - 0.04, laneA, u + 0.04, laneB, 2.2, TAXI);
      for (const [u, v] of AIRFIELD_SLOTS) {
        const lane = v < 4 ? laneA : laneB;
        p.topRect(u - 0.04, lane, u + 0.04, v - 0.45, 2.2, TAXI);
        outline(p, u - 1.25, v - 0.45, u + 1.25, v + 0.42);
      }

      // Fuel tanks at both ends (mirror images).
      for (const u of [1.0, W - 1.0]) {
        for (const du of [-0.35, 0.35]) {
          p.cylinder(u + du, 1.95, 0.24, 2, 9, TANK, 6);
          p.cylinder(u + du, 1.95, 0.25, 11, 1, shade(team.primary, 0.9));
        }
      }

      // Control tower beside the runway: shaft, glass cab, team-colour roof, antenna.
      const c = W / 2;
      p.box(c - 0.2, 1.7, 0.4, 0.36, 2, 24, '#e9e7df');
      p.box(c - 0.4, 1.55, 0.8, 0.7, 26, 6, '#4f7fa0', { top: shade(team.primary, 0.9) });
      p.box(c - 0.47, 1.5, 0.94, 0.84, 32, 1.4, team.primary);
      p.pole(c, 1.9, 33.4, 11, '#d8d8d8');
    },

    drawAnimated(p, time) {
      // Blinking runway lights along both edges.
      const on = Math.sin(time * 4) > 0;
      p.ctx.fillStyle = on ? '#ffe9a0' : '#8a7a40';
      for (const u of LIGHTS_U) {
        for (const v of [0.03, RUNWAY_D - 0.03]) {
          const [x, y] = p.project(u, v, 2.3);
          p.ctx.beginPath();
          p.ctx.arc(x, y, 0.9, 0, Math.PI * 2);
          p.ctx.fill();
        }
      }
      // Tower beacon.
      if (Math.sin(time * 2.4) > 0.3) {
        const [x, y] = p.project(W / 2, 1.9, 45);
        p.ctx.fillStyle = '#ff3b30';
        p.ctx.beginPath();
        p.ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        p.ctx.fill();
      }
    },
  };
}
