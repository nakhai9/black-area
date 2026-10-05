import { HALF_TW } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole } from '../Flags';
import { type BuildingArt, groundShadow } from './BuildingArt';

const PAD = '#a3a095';
const WALL = '#b3aea0';
const ROOF = '#6f747b';
const DOOR = '#2b2f35';
const STEEL = '#8b9199';
const TEST_PAD = '#7b7f86';

const FLAGS: readonly [number, number][] = [
  [0.4, 3.6],
  [4.6, 3.6],
];
const STACKS: readonly [number, number][] = [
  [0.95, 0.6],
  [4.05, 0.6],
];

/**
 * War Factory (5×4 tiles, mirror-symmetric about its centre line): a wide
 * assembly hall with three sawtooth roofs and three roller bay doors, a
 * gantry crane at each end, two exhaust stacks, a vehicle test pad in front
 * and team-coloured trim.
 */
export function createWarFactoryArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  return {
    footprint: { w: 5, d: 4 },
    height: 70,

    drawStatic(p) {
      groundShadow(p, 5, 4);
      p.box(0, 0, 5, 4, 0, 2, PAD);

      // Vehicle test pad in front of the hall, with painted guide lines.
      p.topRect(1.5, 2.95, 3.5, 3.85, 2, TEST_PAD);
      p.topRect(2.47, 2.95, 2.53, 3.85, 2.1, '#d6c24a');
      p.topRect(1.5, 3.8, 3.5, 3.85, 2.1, '#ecebe3');

      // Gantry cranes at both ends (mirror images).
      for (const u of [0.15, 4.7]) {
        p.box(u, 0.5, 0.15, 0.15, 2, 28, STEEL);
        p.box(u, 2.4, 0.15, 0.15, 2, 28, STEEL);
        p.box(u, 0.5, 0.15, 2.05, 30, 1.5, shade(team.primary, 0.9));
      }

      // Assembly hall with a team-colour band and three bay doors.
      p.box(0.5, 0.35, 4.0, 2.4, 2, 20, WALL);
      p.windows('right', 0.5, 0.35, 4.0, 2.4, 2, 20, 4, 1, '#566b7a', 0.2, 0.5);
      p.faceRect('left', 0.5, 0.35, 4.0, 2.4, 2, 20, 0, 1, 0.82, 0.94, team.primary);
      p.faceTransform('left', 0.5, 2.75, 2, (ctx) => {
        for (let i = 0; i < 3; i++) {
          const cx = (0.667 + i * 1.333) * HALF_TW;
          ctx.fillStyle = DOOR;
          ctx.fillRect(cx - 0.45 * HALF_TW, 0, 0.9 * HALF_TW, 13);
          ctx.fillStyle = '#4a4f57';
          for (let k = 3; k < 13; k += 3) ctx.fillRect(cx - 0.45 * HALF_TW, k, 0.9 * HALF_TW, 0.7);
        }
      });

      // Three sawtooth gable roofs (symmetric about u = 2.5).
      for (const u of [0.5, 1.8333, 3.1667]) p.gableRoofV(u, 0.35, 1.3333, 2.4, 22, 7, WALL, ROOF);

      // Exhaust stacks (mirror images).
      for (const [u, v] of STACKS) {
        p.cylinder(u, v, 0.1, 22, 18, '#9a9a96', 4);
        p.cylinder(u, v, 0.12, 40, 1.5, '#4a4a4a');
      }

      for (const [u, v] of FLAGS) p.pole(u, v, 2, 30);
    },

    drawAnimated(p, time) {
      const on = Math.sin(time * 3) > 0;
      p.ctx.fillStyle = on ? '#ffb25a' : '#7a5530';
      for (const [u, v] of STACKS) {
        const [x, y] = p.project(u, v, 43);
        p.ctx.beginPath();
        p.ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        p.ctx.fill();
      }
      FLAGS.forEach(([u, v], i) => drawFlagOnPole(p, faction, u, v, 32, time, i * 1.2, 15, 9));
    },
  };
}
