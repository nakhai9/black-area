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

const SIZE = 4;
/** Runway occupies the back strip v ∈ [0, RUNWAY_D]; its centre line is v = RUNWAY_D / 2. */
const RUNWAY_D = 1.35;
const LIGHTS_U = [0.15, 1.05, 2, 2.95, 3.85] as const;
/** Parking spots on the apron (tile coordinates, mirror-symmetric about u = 2). Used by Game.airfieldGeometry. */
export const AIRFIELD_SLOTS: readonly (readonly [number, number])[] = [
  [0.95, 2.75],
  [3.05, 2.75],
  [2, 3.45],
];

/** Thin painted rectangle outline on the apron. */
function outline(p: IsoPainter, u0: number, v0: number, u1: number, v1: number): void {
  const t = 0.035;
  p.topRect(u0, v0, u1, v0 + t, 2.2, PAINT);
  p.topRect(u0, v1 - t, u1, v1, 2.2, PAINT);
  p.topRect(u0, v0, u0 + t, v1, 2.2, PAINT);
  p.topRect(u1 - t, v0, u1, v1, 2.2, PAINT);
}

/**
 * Airfield (4×4 tiles, mirror-symmetric about its centre line): a runway across the
 * back, and below it an apron that fills the rest of the square with three marked
 * parking spots for the fighters (which are real units), a control tower beside the
 * runway and a fuel tank at each side.
 */
export function createAirfieldArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  return {
    footprint: { w: SIZE, d: SIZE },
    height: 60,

    drawStatic(p) {
      groundShadow(p, SIZE, SIZE);
      // The whole 4×4 block is paved.
      p.box(0, 0, SIZE, SIZE, 0, 2, GROUND, { edge: null });

      // Runway with edge lines, centre dashes and threshold marks.
      p.topRect(0, 0, SIZE, RUNWAY_D, 2.1, RUNWAY);
      p.topRect(0, 0.05, SIZE, 0.1, 2.2, PAINT);
      p.topRect(0, RUNWAY_D - 0.1, SIZE, RUNWAY_D - 0.05, 2.2, PAINT);
      const mid = RUNWAY_D / 2;
      for (let u = 0.25; u < SIZE - 0.3; u += 0.5) p.topRect(u, mid - 0.03, u + 0.28, mid + 0.03, 2.2, PAINT);
      for (const u of [0.1, SIZE - 0.22]) for (let k = 0; k < 3; k++) p.topRect(u, 0.2 + k * 0.33, u + 0.12, 0.38 + k * 0.33, 2.2, PAINT);

      // Apron fills the rest of the square, edge to edge.
      p.topRect(0.12, RUNWAY_D, SIZE - 0.12, SIZE - 0.1, 2.1, APRON);
      p.topRect(0.12, RUNWAY_D + 0.02, SIZE - 0.12, RUNWAY_D + 0.06, 2.2, PAINT);

      // Taxi line across the apron, with a stub down to every parking spot.
      p.topRect(0.4, 2.27, SIZE - 0.4, 2.33, 2.2, TAXI);
      for (const [u, v] of AIRFIELD_SLOTS) {
        p.topRect(u - 0.03, 2.3, u + 0.03, v - 0.4, 2.2, TAXI);
        outline(p, u - 0.85, v - 0.45, u + 0.85, v + 0.4);
      }

      // Fuel tanks at both sides, next to the tower (mirror images).
      for (const u of [0.42, SIZE - 0.42]) {
        for (const v of [1.7, 2.0]) {
          p.cylinder(u, v, 0.22, 2, 9, TANK, 6);
          p.cylinder(u, v, 0.23, 11, 1, shade(team.primary, 0.9));
        }
      }

      // Control tower beside the runway: shaft, glass cab, team-colour roof, antenna.
      p.box(1.82, 1.58, 0.36, 0.36, 2, 24, '#e9e7df');
      p.box(1.64, 1.42, 0.72, 0.68, 26, 6, '#4f7fa0', { top: shade(team.primary, 0.9) });
      p.box(1.58, 1.36, 0.84, 0.8, 32, 1.4, team.primary);
      p.pole(2, 1.76, 33.4, 11, '#d8d8d8');
    },

    drawAnimated(p, time) {
      // Blinking runway lights along both edges, mirrored about the centre.
      const on = Math.sin(time * 4) > 0;
      p.ctx.fillStyle = on ? '#ffe9a0' : '#8a7a40';
      for (const u of LIGHTS_U) {
        for (const v of [0.02, RUNWAY_D - 0.02]) {
          const [x, y] = p.project(u, v, 2.3);
          p.ctx.beginPath();
          p.ctx.arc(x, y, 0.9, 0, Math.PI * 2);
          p.ctx.fill();
        }
      }
      // Tower beacon.
      if (Math.sin(time * 2.4) > 0.3) {
        const [x, y] = p.project(2, 1.76, 45);
        p.ctx.fillStyle = '#ff3b30';
        p.ctx.beginPath();
        p.ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        p.ctx.fill();
      }
    },
  };
}
