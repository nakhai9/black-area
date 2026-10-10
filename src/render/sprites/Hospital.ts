import { HALF_TW } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';
import { facade, parapet, RA2, roofClutter } from './Ra2Kit';

const PAD = RA2.paving;
const GLASS = RA2.glass;
const LAWN = RA2.grass;
const ROOF = RA2.roof;
const CROSS = '#b8302a';

/** National wall material and roof accent. */
const LOOK: Record<FactionId, { wall: string; accent: 'flat' | 'stalin' | 'pagoda' | 'mansard' | 'dome' }> = {
  usa: { wall: '#c9c4b4', accent: 'flat' },
  russia: { wall: '#bfb39a', accent: 'stalin' },
  china: { wall: '#c4beb0', accent: 'pagoda' },
  europe: { wall: '#cbc2aa', accent: 'mansard' },
  islamic: { wall: '#cdb48a', accent: 'dome' },
};

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
  const look = LOOK[faction];
  const WHITE = look.wall;
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
        facade(p, 'left', u, 0.7, 1.2, 1.9, 2, 14, { cols: 6, floors: 2, glass: GLASS, bandColor: shade(WHITE, 0.82), seed: Math.round(u * 10) });
        facade(p, 'right', u, 0.7, 1.2, 1.9, 2, 14, { cols: 9, floors: 2, glass: GLASS, bandColor: shade(WHITE, 0.82), seed: Math.round(u * 10) + 1 });
        p.faceRect('left', u, 0.7, 1.2, 1.9, 2, 14, 0, 1, 0.9, 0.97, shade(team.primary, 0.8));
        if (look.accent === 'pagoda') p.hipRoof(u, 0.7, 1.2, 1.9, 16, 7, 0.1, '#6e3a2c', 2);
        else if (look.accent === 'mansard') p.hipRoof(u, 0.7, 1.2, 1.9, 16, 7, 0, '#4d5560');
        else {
          p.topRect(u + 0.04, 0.74, u + 1.16, 2.56, 16, ROOF);
          parapet(p, u, 0.7, 1.2, 1.9, 16, shade(WHITE, 1.05), 0.05, 1.8);
          roofClutter(p, u + 0.05, 0.75, 1.1, 1.8, 16, Math.round(u * 7) + 2);
        }
      }

      // Central tower.
      p.box(1.6, 0.5, 1.8, 2.2, 2, 28, WHITE);
      facade(p, 'left', 1.6, 0.5, 1.8, 2.2, 2, 28, { cols: 9, floors: 4, glass: GLASS, bandColor: shade(WHITE, 0.82), seed: 21 });
      facade(p, 'right', 1.6, 0.5, 1.8, 2.2, 2, 28, { cols: 11, floors: 4, glass: GLASS, bandColor: shade(WHITE, 0.82), seed: 22 });
      p.faceRect('left', 1.6, 0.5, 1.8, 2.2, 2, 28, 0, 1, 0.94, 1, shade(team.primary, 0.8));

      // Red cross sign on the front face.
      p.faceTransform('left', 1.6, 2.7, 2, (ctx) => {
        const cx = 0.9 * HALF_TW;
        const cy = 20;
        ctx.fillStyle = '#e6e2d6';
        ctx.beginPath();
        ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = CROSS;
        ctx.fillRect(cx - 1.6, cy - 5, 3.2, 10);
        ctx.fillRect(cx - 5, cy - 1.6, 10, 3.2);
      });

      // Rooftop helipad with an H.
      p.topRect(1.75, 0.65, 3.25, 2.55, 30, ROOF);
      p.topRect(2.1, 1.0, 2.2, 2.2, 30, '#d6d2c4');
      p.topRect(2.8, 1.0, 2.9, 2.2, 30, '#d6d2c4');
      p.topRect(2.1, 1.55, 2.9, 1.65, 30, '#d6d2c4');
      parapet(p, 1.6, 0.5, 1.8, 2.2, 30, shade(WHITE, 1.05), 0.05, 2);

      // National rooftop accent at the back corner of the tower.
      if (look.accent === 'stalin') {
        p.box(1.7, 0.6, 0.35, 0.35, 30, 10, shade(WHITE, 1.05));
        p.pyramid(1.72, 0.62, 0.31, 0.31, 40, 14, '#b89a52');
      } else if (look.accent === 'dome') {
        p.cylinder(1.88, 0.78, 0.16, 30, 4, shade(WHITE, 1.05));
        p.dome(1.88, 0.78, 0.17, 34, 9, '#4f8a86');
      } else if (look.accent === 'pagoda') {
        p.box(1.7, 0.6, 0.4, 0.4, 30, 5, shade(WHITE, 1.05));
        p.hipRoof(1.7, 0.6, 0.4, 0.4, 35, 6, 0.08, '#6e3a2c', 2);
      } else if (look.accent === 'mansard') {
        p.box(1.7, 0.6, 0.4, 0.4, 30, 6, shade(WHITE, 1.05));
        p.pyramid(1.7, 0.6, 0.4, 0.4, 36, 10, '#4d6a5c');
      } else {
        roofClutter(p, 1.65, 0.55, 0.4, 0.4, 30, 33);
      }

      // Entrance canopy on two posts.
      p.box(2.0, 2.72, 0.08, 0.08, 2, 9, WHITE);
      p.box(2.92, 2.72, 0.08, 0.08, 2, 9, WHITE);
      p.box(1.9, 2.7, 1.2, 0.55, 11, 2, shade(team.primary, 0.8));

      for (const [u, v] of FLAGS) drawNationalPole(p, faction, u, v, 2, 30);
    },

    drawAnimated(p, time) {
      FLAGS.forEach(([u, v], i) => drawFlagOnPole(p, faction, u, v, 32, time, i * 1.3, 15, 9));
    },
  };
}
