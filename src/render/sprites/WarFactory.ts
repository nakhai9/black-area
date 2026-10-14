import { HALF_TW } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';
import { RA2, roofClutter } from './Ra2Kit';

const DOOR = '#262a2f';

/** Per-nation materials: Allied grey-blue steel, Soviet olive/red concrete, Islamic sandstone. */
function materials(faction: FactionId): { wall: string; roof: string; steel: string; plinth: string } {
  switch (faction) {
    case 'russia':
    case 'china':
      return { wall: '#8a8a6c', roof: '#5a4a3e', steel: '#6c6e62', plinth: '#6e5a4a' };
    case 'islamic':
      return { wall: '#c2ab84', roof: '#7a6a52', steel: '#8a8072', plinth: '#9a845e' };
    default:
      return { wall: '#a3abb3', roof: RA2.roof, steel: RA2.steel, plinth: '#6f7880' };
  }
}

/** Flags on the front roof corners. */
const FLAGS: readonly [number, number][] = [
  [0.3, 3.7],
  [4.7, 3.7],
];
const FLAG_BASE = 22;
const STACKS: readonly [number, number][] = [
  [0.95, 0.6],
  [4.05, 0.6],
];

/**
 * War Factory (5×4 tiles, mirror-symmetric about its centre line): a wide
 * assembly hall with three sawtooth roofs and three roller bay doors, a
 * rooftop gantry crane at each end, two exhaust stacks and team-coloured trim.
 * The hall fills the whole plot; vehicles roll out of the front bays.
 */
export function createWarFactoryArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  const { wall: WALL, roof: ROOF, steel: STEEL, plinth: PLINTH } = materials(faction);
  return {
    footprint: { w: 5, d: 4 },
    height: 74,

    drawStatic(p) {
      // The whole plot is the assembly hall: no apron, test pad or yard.
      const U = 0.05;
      const V = 0.05;
      const W = 4.9;
      const D = 3.9;
      p.box(0, 0, 5, 4, 0, 2, PLINTH);

      // Assembly hall with a team-colour band and three bay doors on the front face.
      p.box(U, V, W, D, 2, 20, WALL);
      // Heavy plinth, vertical steel pilasters and a riveted team-colour band.
      p.faceRect('left', U, V, W, D, 2, 20, 0, 1, 0, 0.12, PLINTH);
      p.faceRect('right', U, V, W, D, 2, 20, 0, 1, 0, 0.12, PLINTH);
      for (let i = 0; i <= 8; i++) {
        const s0 = i / 8 - 0.012;
        p.faceRect('right', U, V, W, D, 2, 20, s0, s0 + 0.024, 0.12, 1, shade(WALL, 0.78));
      }
      p.windows('right', U, V, W, D, 2, 20, 8, 1, RA2.glass, 0.25, 0.4);
      p.faceRect('left', U, V, W, D, 2, 20, 0, 1, 0.8, 0.95, shade(team.primary, 0.85));
      p.faceRect('right', U, V, W, D, 2, 20, 0, 1, 0.8, 0.95, shade(team.primary, 0.7));
      p.faceRect('left', U, V, W, D, 2, 20, 0, 1, 0.95, 1, shade(WALL, 0.7));
      p.faceTransform('left', U, V + D, 2, (ctx) => {
        // Rivet line on the team band.
        ctx.fillStyle = 'rgba(20,20,20,0.45)';
        for (let x = 2; x < W * HALF_TW; x += 4) ctx.fillRect(x, 16.6, 0.8, 0.8);
        for (let i = 0; i < 3; i++) {
          const cx = ((i + 0.5) * W) / 3 * HALF_TW;
          const hw = 0.55 * HALF_TW;
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

      // Three sawtooth gable roofs (symmetric about u = 2.5).
      const bay = W / 3;
      for (let i = 0; i < 3; i++) p.gableRoofV(U + i * bay, V, bay, D, 22, 7, WALL, ROOF);
      // Roof vents along each ridge.
      for (let i = 0; i < 3; i++) for (const v of [0.8, 1.6, 2.4, 3.2]) p.box(U + (i + 0.5) * bay - 0.08, v - 0.08, 0.16, 0.16, 28, 2.5, shade(STEEL, 0.9));
      roofClutter(p, 0.2, 0.15, 0.5, 0.5, 22, 7);
      // Rooftop gantry crane spanning the hall at each end (mirror images).
      for (const u of [0.25, 4.6]) {
        p.box(u, 0.3, 0.15, 0.15, 22, 12, STEEL);
        p.box(u, 3.4, 0.15, 0.15, 22, 12, STEEL);
        p.box(u, 0.3, 0.15, 3.25, 34, 1.5, shade(team.primary, 0.9));
      }

      // Exhaust stacks (mirror images).
      for (const [u, v] of STACKS) {
        p.cylinder(u, v, 0.11, 22, 18, shade(STEEL, 1.05), 4);
        p.cylinder(u, v, 0.12, 30, 1.6, shade(team.primary, 0.85));
        p.cylinder(u, v, 0.12, 40, 1.5, '#4a4a4a');
      }

      for (const [u, v] of FLAGS) drawNationalPole(p, faction, u, v, FLAG_BASE, 22);
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
      FLAGS.forEach(([u, v], i) => drawFlagOnPole(p, faction, u, v, FLAG_BASE + 22, time, i * 1.2, 15, 9));
    },
  };
}
