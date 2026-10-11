import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';

import type { BuildingArt } from './BuildingArt';
import { RA2, facade, parapet } from './Ra2Kit';

const RUNWAY = '#3a3c40';
const PAINT = '#d4d2c8';
const TAXI = '#c4a83a';

function materials(faction: FactionId): { ground: string; apron: string; tower: string } {
  switch (faction) {
    case 'russia':
    case 'china':
      return { ground: '#7e7c6c', apron: '#86847a', tower: '#9a9880' };
    case 'islamic':
      return { ground: '#a8987a', apron: '#a49a86', tower: '#c2ac86' };
    default:
      return { ground: '#8a8e90', apron: '#8b9095', tower: '#b4bac0' };
  }
}

/** The airfield covers 12×8 tiles (the footprint in constants.ts must match). */
export const AIRFIELD_SIZE = { w: 12, d: 8 } as const;
const W = AIRFIELD_SIZE.w;
const D = AIRFIELD_SIZE.d;
/** The runway occupies the back strip v ∈ [0, RUNWAY_D]; its centre line is v = RUNWAY_D / 2. */
export const RUNWAY_D = 1.6;
const ROW_1 = 3.1;
const ROW_2 = 4.95;
const ROW_3 = 6.8;
/** Nine parking spots on the apron, three rows of three (tile coordinates, mirror-symmetric about u = 6). */
export const AIRFIELD_SLOTS: readonly (readonly [number, number])[] = [
  [2, ROW_1],
  [6, ROW_1],
  [10, ROW_1],
  [2, ROW_2],
  [6, ROW_2],
  [10, ROW_2],
  [2, ROW_3],
  [6, ROW_3],
  [10, ROW_3],
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
 * Airfield (12×8 tiles, mirror-symmetric about its centre line): a long runway along the
 * back, and below it an apron that fills the rest of the block with nine marked parking spots
 * in three rows (the fighters are real units). The only structure on it is the control tower, in the
 * front corner opposite the runway. Aircraft that return here are repaired.
 */
export function createAirfieldArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  const { ground: GROUND, apron: APRON, tower: TOWER } = materials(faction);
  return {
    footprint: { w: W, d: D },
    height: 60,

    drawStatic(p) {
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
      const laneC = 5.95;
      for (const v of [laneA, laneB, laneC]) p.topRect(0.5, v - 0.04, W - 0.5, v + 0.04, 2.2, TAXI);
      for (const u of [0.5, W - 0.5]) p.topRect(u - 0.04, laneA, u + 0.04, laneC, 2.2, TAXI);
      for (const [u, v] of AIRFIELD_SLOTS) {
        const lane = v < 4 ? laneA : v < 5.5 ? laneB : laneC;
        p.topRect(u - 0.04, lane, u + 0.04, v - 0.45, 2.2, TAXI);
        outline(p, u - 1.25, v - 0.45, u + 1.25, v + 0.42);
      }

      // The only structure on the field: the control tower, in the front corner opposite the runway.
      const tu = W - 0.6;
      const tv = D - 0.6;
      p.box(tu - 0.25, tv - 0.25, 0.5, 0.5, 2, 4, shade(TOWER, 0.8));
      p.box(tu - 0.16, tv - 0.16, 0.32, 0.32, 6, 20, TOWER);
      p.faceRect('left', tu - 0.16, tv - 0.16, 0.32, 0.32, 6, 20, 0.35, 0.65, 0.1, 0.9, shade(TOWER, 0.78));
      p.box(tu - 0.34, tv - 0.34, 0.68, 0.68, 26, 1.2, RA2.steelDark);
      p.box(tu - 0.3, tv - 0.3, 0.6, 0.6, 27, 6, RA2.glass, { top: RA2.tar });
      facade(p, 'left', tu - 0.3, tv - 0.3, 0.6, 0.6, 27, 6, { cols: 3, floors: 1, frame: '#c8ccd0', band: 0.1, lit: 0.3, seed: 9 });
      facade(p, 'right', tu - 0.3, tv - 0.3, 0.6, 0.6, 27, 6, { cols: 3, floors: 1, frame: '#c8ccd0', band: 0.1, lit: 0.3, seed: 10 });
      p.box(tu - 0.36, tv - 0.36, 0.72, 0.72, 33, 1.4, shade(team.primary, 0.85));
      parapet(p, tu - 0.36, tv - 0.36, 0.72, 0.72, 34.4, RA2.steelDark, 0.05, 1);
      p.pole(tu, tv, 34.4, 10, '#c0c0c0');
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
        const [x, y] = p.project(W - 0.6, D - 0.6, 45);
        p.ctx.fillStyle = '#ff3b30';
        p.ctx.beginPath();
        p.ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        p.ctx.fill();
      }
    },
  };
}
