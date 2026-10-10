import { HALF_TW } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';
import { RA2, roofClutter } from './Ra2Kit';

const DOOR = '#262a2f';
const TEST_PAD = RA2.asphalt;

/** Per-nation materials: Allied grey-blue steel, Soviet olive/red concrete, Islamic sandstone. */
function materials(faction: FactionId): { pad: string; wall: string; roof: string; steel: string; plinth: string } {
  switch (faction) {
    case 'russia':
    case 'china':
      return { pad: '#8d8a7c', wall: '#8a8a6c', roof: '#5a4a3e', steel: '#6c6e62', plinth: '#6e5a4a' };
    case 'islamic':
      return { pad: '#a89c84', wall: '#c2ab84', roof: '#7a6a52', steel: '#8a8072', plinth: '#9a845e' };
    default:
      return { pad: RA2.paving, wall: '#a3abb3', roof: RA2.roof, steel: RA2.steel, plinth: '#6f7880' };
  }
}

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
  const { pad: PAD, wall: WALL, roof: ROOF, steel: STEEL, plinth: PLINTH } = materials(faction);
  return {
    footprint: { w: 5, d: 4 },
    height: 74,

    drawStatic(p) {
      p.box(0, 0, 5, 4, 0, 2, PAD);

      // Vehicle test pad in front of the hall, with painted guide lines.
      p.topRect(1.5, 2.95, 3.5, 3.85, 2, TEST_PAD);
      p.topRect(2.47, 2.95, 2.53, 3.85, 2.1, '#d6c24a');
      p.topRect(1.5, 3.8, 3.5, 3.85, 2.1, '#d8d6cc');
      // Hazard chevrons along both sides of the test pad.
      for (let k = 0; k < 6; k++) {
        const v0 = 2.98 + k * 0.145;
        for (const u of [1.5, 3.42]) p.topRect(u, v0, u + 0.08, v0 + 0.07, 2.15, k % 2 ? '#2a2a2a' : RA2.hazard);
      }
      // Oil stains and tyre marks on the apron.
      p.topRect(2.2, 3.2, 2.4, 3.5, 2.12, 'rgba(30,28,24,0.25)');
      p.topRect(2.62, 3.0, 2.78, 3.6, 2.12, 'rgba(30,28,24,0.18)');

      // Gantry cranes at both ends (mirror images).
      for (const u of [0.15, 4.7]) {
        p.box(u, 0.5, 0.15, 0.15, 2, 28, STEEL);
        p.box(u, 2.4, 0.15, 0.15, 2, 28, STEEL);
        p.box(u, 0.5, 0.15, 2.05, 30, 1.5, shade(team.primary, 0.9));
      }

      // Assembly hall with a team-colour band and three bay doors.
      p.box(0.5, 0.35, 4.0, 2.4, 2, 20, WALL);
      // Heavy plinth, vertical steel pilasters and a riveted team-colour band.
      p.faceRect('left', 0.5, 0.35, 4.0, 2.4, 2, 20, 0, 1, 0, 0.12, PLINTH);
      p.faceRect('right', 0.5, 0.35, 4.0, 2.4, 2, 20, 0, 1, 0, 0.12, PLINTH);
      for (let i = 0; i <= 6; i++) {
        const s0 = i / 6 - 0.012;
        p.faceRect('right', 0.5, 0.35, 4.0, 2.4, 2, 20, s0, s0 + 0.024, 0.12, 1, shade(WALL, 0.78));
      }
      p.windows('right', 0.5, 0.35, 4.0, 2.4, 2, 20, 6, 1, RA2.glass, 0.25, 0.4);
      p.faceRect('left', 0.5, 0.35, 4.0, 2.4, 2, 20, 0, 1, 0.8, 0.95, shade(team.primary, 0.85));
      p.faceRect('right', 0.5, 0.35, 4.0, 2.4, 2, 20, 0, 1, 0.8, 0.95, shade(team.primary, 0.7));
      p.faceRect('left', 0.5, 0.35, 4.0, 2.4, 2, 20, 0, 1, 0.95, 1, shade(WALL, 0.7));
      p.faceTransform('left', 0.5, 2.75, 2, (ctx) => {
        // Rivet line on the team band.
        ctx.fillStyle = 'rgba(20,20,20,0.45)';
        for (let x = 2; x < 4 * HALF_TW; x += 4) ctx.fillRect(x, 16.6, 0.8, 0.8);
        for (let i = 0; i < 3; i++) {
          const cx = (0.667 + i * 1.333) * HALF_TW;
          const hw = 0.45 * HALF_TW;
          // Hazard-striped door frame.
          for (let k = 0; k < 15; k += 2) {
            ctx.fillStyle = (k / 2) % 2 ? '#2a2a2a' : RA2.hazard;
            ctx.fillRect(cx - hw - 2, k, 2, 2);
            ctx.fillRect(cx + hw, k, 2, 2);
          }
          ctx.fillStyle = shade(STEEL, 0.7);
          ctx.fillRect(cx - hw - 2, 13, hw * 2 + 4, 2);
          ctx.fillStyle = DOOR;
          ctx.fillRect(cx - hw, 0, hw * 2, 13);
          ctx.fillStyle = '#41464d';
          for (let k = 2; k < 13; k += 2) ctx.fillRect(cx - hw, k, hw * 2, 0.6);
          // Lamp over each bay.
          ctx.fillStyle = '#e8d690';
          ctx.fillRect(cx - 1, 14.6, 2, 1);
        }
      });
      // Pipe run and catwalk along the right side of the hall.
      p.box(4.5, 0.55, 0.1, 2.0, 12, 1.2, '#5c6168');
      p.box(4.5, 0.55, 0.14, 2.0, 15, 0.6, shade(STEEL, 1.1));
      for (let k = 0; k < 5; k++) p.box(4.5, 0.6 + k * 0.48, 0.12, 0.05, 2, 13, '#5c6168');

      // Three sawtooth gable roofs (symmetric about u = 2.5).
      for (const u of [0.5, 1.8333, 3.1667]) p.gableRoofV(u, 0.35, 1.3333, 2.4, 22, 7, WALL, ROOF);
      // Roof vents along each ridge.
      for (const u of [1.1667, 2.5, 3.8333]) for (const v of [0.8, 1.5, 2.2]) p.box(u - 0.08, v - 0.08, 0.16, 0.16, 28, 2.5, shade(STEEL, 0.9));
      roofClutter(p, 0.6, 0.4, 0.5, 0.5, 22, 7);

      // Exhaust stacks (mirror images).
      for (const [u, v] of STACKS) {
        p.cylinder(u, v, 0.11, 22, 18, shade(STEEL, 1.05), 4);
        p.cylinder(u, v, 0.12, 30, 1.6, shade(team.primary, 0.85));
        p.cylinder(u, v, 0.12, 40, 1.5, '#4a4a4a');
      }

      for (const [u, v] of FLAGS) drawNationalPole(p, faction, u, v, 2, 30);
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
