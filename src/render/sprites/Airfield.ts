import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';

import type { BuildingArt } from './BuildingArt';
import { RA2, crate, facade, parapet, rnd } from './Ra2Kit';

const RUNWAY = '#3a3c40';
const PAINT = '#d4d2c8';
const TAXI = '#c4a83a';
const TANK = '#a9aeb3';

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
 * in three rows (the fighters are real units), a control tower beside the runway, and fuel
 * tanks and service lanes at both ends. Aircraft that return here are repaired.
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
      // Concrete slab joints and weathered patches on the apron.
      for (let u = 1; u < W - 0.2; u += 1) p.topRect(u - 0.01, RUNWAY_D + 0.1, u + 0.01, D - 0.14, 2.15, shade(APRON, 0.85));
      for (let v = RUNWAY_D + 1; v < D - 0.2; v += 1) p.topRect(0.15, v - 0.01, W - 0.15, v + 0.01, 2.15, shade(APRON, 0.85));
      for (let i = 0; i < 14; i++) {
        const u = 0.4 + rnd(5, i, 1) * (W - 1);
        const v = RUNWAY_D + 0.2 + rnd(5, i, 2) * (D - RUNWAY_D - 0.6);
        p.topRect(u, v, u + 0.3 + rnd(5, i, 3) * 0.4, v + 0.15 + rnd(5, i, 4) * 0.25, 2.12, 'rgba(40,38,32,0.14)');
      }
      // Tyre skid marks on the runway and hazard stripes at both ends.
      for (const u of [1.2, 2.4, W - 3.2, W - 1.8]) p.topRect(u, 0.55, u + 0.8, 0.62, 2.15, 'rgba(15,15,15,0.35)');
      for (const u of [0, W - 0.08]) for (let k = 0; k < 8; k++) p.topRect(u, k * 0.2, u + 0.08, k * 0.2 + 0.1, 2.25, RA2.hazard);

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

      // Fuel tanks at both ends (mirror images).
      for (const u of [1.0, W - 1.0]) {
        for (const du of [-0.35, 0.35]) {
          p.cylinder(u + du, 1.95, 0.27, 2, 1.5, '#5a5d60');
          p.cylinder(u + du, 1.95, 0.24, 3.5, 7.5, TANK, 6);
          p.cylinder(u + du, 1.95, 0.25, 6, 1, shade(team.primary, 0.85));
          p.cylinder(u + du, 1.95, 0.05, 11, 1.5, '#5a5d60');
        }
        crate(p, u + (u < W / 2 ? 0.6 : -0.8), 1.75, 0.2, 2);
      }

      // Control tower beside the runway: shaft, glass cab, team-colour roof, antenna.
      const c = W / 2;
      p.box(c - 0.32, 1.66, 0.64, 0.5, 2, 6, shade(TOWER, 0.8));
      p.box(c - 0.2, 1.7, 0.4, 0.36, 8, 18, TOWER);
      p.faceRect('left', c - 0.2, 1.7, 0.4, 0.36, 8, 18, 0.35, 0.65, 0.1, 0.9, shade(TOWER, 0.78));
      p.box(c - 0.45, 1.52, 0.9, 0.76, 25, 1.2, RA2.steelDark);
      p.box(c - 0.4, 1.55, 0.8, 0.7, 26, 6, RA2.glass, { top: RA2.tar });
      facade(p, 'left', c - 0.4, 1.55, 0.8, 0.7, 26, 6, { cols: 4, floors: 1, frame: '#c8ccd0', band: 0.1, lit: 0.3, seed: 9 });
      facade(p, 'right', c - 0.4, 1.55, 0.8, 0.7, 26, 6, { cols: 3, floors: 1, frame: '#c8ccd0', band: 0.1, lit: 0.3, seed: 10 });
      p.box(c - 0.47, 1.5, 0.94, 0.84, 32, 1.4, shade(team.primary, 0.85));
      parapet(p, c - 0.47, 1.5, 0.94, 0.84, 33.4, RA2.steelDark, 0.05, 1);
      p.box(c + 0.1, 1.6, 0.18, 0.18, 33.4, 2.5, '#8f939a');
      p.pole(c, 1.9, 33.4, 11, '#c0c0c0');
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
