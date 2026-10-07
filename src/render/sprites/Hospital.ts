import { HALF_TW } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';

const PAD = '#b9b6ac';
const WHITE = '#f4f4f0';
const GLASS = '#6fa6c4';
const LAWN = '#6d9f4a';
const ROOF = '#7b8089';
const CROSS = '#d22b2b';

const FLAGS: readonly [number, number][] = [
  [0.45, 3.55],
  [4.55, 3.55],
];

/**
 * Hospital (5×4 tiles, mirror-symmetric about its centre line): a tall central
 * block with a red cross and rooftop helipad, two matching wings, a
 * team-coloured entrance canopy, lawns and a flag at each side.
 */
export function createHospitalArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  return {
    footprint: { w: 5, d: 4 },
    height: 72,

    drawStatic(p) {
      p.box(0, 0, 5, 4, 0, 2, PAD);
      p.topRect(0.2, 2.95, 1.7, 3.8, 2, LAWN);
      p.topRect(3.1, 2.95, 4.8, 3.8, 2, LAWN);

      // Wings (mirror images about u = 2.5), with a team-colour band.
      for (const u of [0.3, 3.5]) {
        p.box(u, 0.7, 1.2, 1.9, 2, 14, WHITE);
        p.windows('left', u, 0.7, 1.2, 1.9, 2, 14, 3, 2, GLASS, 0.12, 0.45);
        p.windows('right', u, 0.7, 1.2, 1.9, 2, 14, 3, 2, shade(GLASS, 1.1), 0.12, 0.45);
        p.faceRect('left', u, 0.7, 1.2, 1.9, 2, 14, 0, 1, 0.82, 0.94, team.primary);
        p.topRect(u + 0.1, 0.8, u + 1.1, 2.5, 16, shade(ROOF, 1.05));
      }

      // Central tower.
      p.box(1.6, 0.5, 1.8, 2.2, 2, 28, WHITE);
      p.windows('left', 1.6, 0.5, 1.8, 2.2, 2, 28, 4, 3, GLASS, 0.1, 0.45);
      p.windows('right', 1.6, 0.5, 1.8, 2.2, 2, 28, 4, 3, shade(GLASS, 1.1), 0.1, 0.45);
      p.faceRect('left', 1.6, 0.5, 1.8, 2.2, 2, 28, 0, 1, 0.9, 1, team.primary);

      // Red cross sign on the front face.
      p.faceTransform('left', 1.6, 2.7, 2, (ctx) => {
        const cx = 0.9 * HALF_TW;
        const cy = 20;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = CROSS;
        ctx.fillRect(cx - 1.6, cy - 5, 3.2, 10);
        ctx.fillRect(cx - 5, cy - 1.6, 10, 3.2);
      });

      // Rooftop helipad with an H.
      p.topRect(1.75, 0.65, 3.25, 2.55, 30, ROOF);
      p.topRect(2.1, 1.0, 2.2, 2.2, 30, '#ffffff');
      p.topRect(2.8, 1.0, 2.9, 2.2, 30, '#ffffff');
      p.topRect(2.1, 1.55, 2.9, 1.65, 30, '#ffffff');

      // Entrance canopy on two posts.
      p.box(2.0, 2.72, 0.08, 0.08, 2, 9, WHITE);
      p.box(2.92, 2.72, 0.08, 0.08, 2, 9, WHITE);
      p.box(1.9, 2.7, 1.2, 0.55, 11, 2, team.primary);

      for (const [u, v] of FLAGS) drawNationalPole(p, faction, u, v, 2, 30);
    },

    drawAnimated(p, time) {
      FLAGS.forEach(([u, v], i) => drawFlagOnPole(p, faction, u, v, 32, time, i * 1.3, 15, 9));
    },
  };
}
