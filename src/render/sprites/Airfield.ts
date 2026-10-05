import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';

import { type BuildingArt, groundShadow } from './BuildingArt';

const GROUND = '#9a9a8e';
const RUNWAY = '#3c3f44';
const APRON = '#8d9096';
const PAINT = '#ecebe3';
const TANK = '#bfc3c8';

const LIGHTS_U = [0.15, 1.2, 2.5, 3.8, 4.85] as const;

/**
 * Airfield (5×5 tiles, mirror-symmetric about its centre line, T-shaped): a
 * runway across the top, a 3×3 apron stem below it (three parking spots for the
 * fighters, which are real units), fuel
 * tanks at both sides and a control tower at the front centre.
 */
export function createAirfieldArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  return {
    footprint: { w: 5, d: 5 },
    height: 70,

    drawStatic(p) {
      groundShadow(p, 5, 5);
      p.box(0, 0, 5, 5, 0, 2, GROUND, { edge: null });

      // Runway (the T's bar) with edge lines, centre dashes and threshold marks.
      p.topRect(0, 0, 5, 2, 2.1, RUNWAY);
      p.topRect(0, 0.06, 5, 0.1, 2.2, PAINT);
      p.topRect(0, 1.9, 5, 1.94, 2.2, PAINT);
      for (let u = 0.25; u < 4.8; u += 0.55) p.topRect(u, 0.97, u + 0.3, 1.03, 2.2, PAINT);
      for (const u of [0.18, 4.7]) for (let k = 0; k < 4; k++) p.topRect(u, 0.25 + k * 0.4, u + 0.12, 0.45 + k * 0.4, 2.2, PAINT);

      // Apron / aircraft shelter (the T's stem), joined to the runway.
      p.topRect(1, 2, 4, 5, 2.1, APRON);
      p.topRect(2.47, 2, 2.53, 5, 2.2, '#d6c24a'); // taxi line
      p.topRect(1.02, 2.02, 3.98, 2.06, 2.2, PAINT);

      // Fuel tanks at both sides (mirror images).
      for (const u of [0.5, 4.5]) {
        for (const v of [3.0, 4.0]) {
          p.cylinder(u, v, 0.26, 2, 9, TANK, 6);
          p.cylinder(u, v, 0.27, 11, 1, shade(team.primary, 0.9));
        }
      }

      // Control tower, front centre: shaft, glass cab, team-colour roof, antenna.
      p.box(2.3, 4.45, 0.4, 0.4, 2, 26, '#e9e7df');
      p.box(2.12, 4.28, 0.76, 0.74, 28, 7, '#4f7fa0', { top: shade(team.primary, 0.9) });
      p.box(2.06, 4.22, 0.88, 0.86, 35, 1.5, team.primary);
      p.pole(2.5, 4.65, 36.5, 12, '#d8d8d8');
    },

    drawAnimated(p, time) {
      // Blinking runway threshold lights, mirrored about the centre.
      const on = Math.sin(time * 4) > 0;
      p.ctx.fillStyle = on ? '#ffe9a0' : '#8a7a40';
      for (const u of LIGHTS_U) {
        for (const v of [0.02, 1.98]) {
          const [x, y] = p.project(u, v, 2.3);
          p.ctx.beginPath();
          p.ctx.arc(x, y, 0.9, 0, Math.PI * 2);
          p.ctx.fill();
        }
      }
      // Tower beacon.
      if (Math.sin(time * 2.4) > 0.3) {
        const [x, y] = p.project(2.5, 4.65, 49);
        p.ctx.fillStyle = '#ff3b30';
        p.ctx.beginPath();
        p.ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        p.ctx.fill();
      }
    },
  };
}
