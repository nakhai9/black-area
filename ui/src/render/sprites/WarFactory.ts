import { HALF_TW } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';
import { roofStar } from './PowerPlant';
import { RA2, roofClutter } from './Ra2Kit';
import { FACTORY_DESIGNS, towerCrane } from './WarFactoryNations';

const DOOR = '#262a2f';

/** USA materials: Allied grey-blue steel (the other nations: WarFactoryNations). */
const WALL = '#a3abb3';
const ROOF = RA2.roof;
const STEEL = RA2.steel;
const PLINTH = '#6f7880';

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
  return {
    footprint: { w: 5, d: 4 },
    height: 74,

    drawStatic(p) {
      // Every nation but the USA has its own architecture (WarFactoryNations).
      const own = FACTORY_DESIGNS[faction];
      if (own) {
        own.draw(p, team);
        for (const [u, v, z] of own.flags) drawNationalPole(p, faction, u, v, z, 22);
        return;
      }
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

      // Flat steel roof with a great white star in a blue disc.
      p.box(U, V, W, D, 20, 2, shade(WALL, 0.9));
      p.topRect(U + 0.1, V + 0.1, U + W - 0.1, V + D - 0.1, 22.01, ROOF);
      p.cylinder(2.5, 2, 1.1, 22, 0.6, team.primary);
      roofStar(p, 2.5, 2, 22.7, 0.95, '#ffffff');
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

      towerCrane(p, 2.6, 0.45, 22, 34, 1.8, -1);
      for (const [u, v] of FLAGS) drawNationalPole(p, faction, u, v, FLAG_BASE, 22);
    },

    drawAnimated(p, time) {
      const on = Math.sin(time * 3) > 0;
      p.ctx.fillStyle = on ? '#ffb25a' : '#7a5530';
      const own = FACTORY_DESIGNS[faction];
      if (own) {
        for (const [u, v, z] of own.lights) {
          const [x, y] = p.project(u, v, z);
          p.ctx.beginPath();
          p.ctx.arc(x, y, 1.1, 0, Math.PI * 2);
          p.ctx.fill();
        }
        own.flags.forEach(([u, v, z], i) => drawFlagOnPole(p, faction, u, v, z + 22, time, i * 1.2, 15, 9));
        return;
      }
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
