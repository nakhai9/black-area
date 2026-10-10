import { HALF_TW } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { BuildingArt } from './BuildingArt';
import { facade, parapet, RA2, roofClutter } from './Ra2Kit';

const PAD = RA2.paving;
const WHITE = RA2.frame;
const LAWN = RA2.grass;

/** Per-nation materials: podium/frame stone, glass, crown style. */
const LOOK: Record<FactionId, { stone: string; glass: string; crown: 'deco' | 'spire' | 'pagoda' | 'mansard' | 'dome' }> = {
  usa: { stone: '#9c9a90', glass: '#2c3a4e', crown: 'deco' },
  russia: { stone: '#b8ae96', glass: '#3a4048', crown: 'spire' },
  china: { stone: '#a29c90', glass: '#2e4450', crown: 'pagoda' },
  europe: { stone: '#c0b69e', glass: '#34404c', crown: 'mansard' },
  islamic: { stone: '#c2a77c', glass: '#3a4a50', crown: 'dome' },
};

/**
 * High-Tech Center (4×4 tiles): a glass-and-steel high-rise. A wide podium with a team-colour entrance canopy
 * carries a tall tower with rows of windows and team-colour bands, a stepped-back upper block, a crown and a
 * communications mast with a blinking beacon.
 */
export function createTechCenterArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  const look = LOOK[faction];
  const CONCRETE = look.stone;
  const GLASS = look.glass;
  const GLASS_UPPER = shade(look.glass, 1.1);
  return {
    footprint: { w: 4, d: 4 },
    height: 205,

    drawStatic(p) {
      p.box(0, 0, 4, 4, 0, 2, PAD);
      p.topRect(0.15, 3.05, 1.15, 3.85, 2, LAWN);
      p.topRect(2.85, 3.05, 3.85, 3.85, 2, LAWN);
      p.topRect(1.3, 3.05, 2.7, 3.85, 2, shade(RA2.paving, 1.08));

      // Podium.
      p.box(0.25, 0.35, 3.5, 2.65, 2, 20, CONCRETE);
      facade(p, 'left', 0.25, 0.35, 3.5, 2.65, 2, 20, { cols: 18, floors: 3, glass: GLASS, bandColor: shade(CONCRETE, 0.8), seed: 3 });
      facade(p, 'right', 0.25, 0.35, 3.5, 2.65, 2, 20, { cols: 14, floors: 3, glass: GLASS, bandColor: shade(CONCRETE, 0.8), seed: 4 });
      p.faceRect('left', 0.25, 0.35, 3.5, 2.65, 2, 20, 0, 1, 0.92, 1, shade(team.primary, 0.75));
      p.topRect(0.3, 0.4, 3.7, 2.95, 22, RA2.roof);
      parapet(p, 0.25, 0.35, 3.5, 2.65, 22, shade(CONCRETE, 1.05), 0.06, 2);
      roofClutter(p, 3.05, 0.45, 0.6, 2.4, 22, 11);
      roofClutter(p, 0.35, 2.65, 3.3, 0.3, 22, 12);

      // Entrance: glass lobby under a team-colour canopy on two posts.
      p.box(1.35, 2.88, 1.3, 0.14, 2, 13, RA2.glassLit);
      p.box(1.2, 3.0, 1.6, 0.62, 14, 2, team.primary);
      p.box(1.25, 3.52, 0.08, 0.08, 2, 12, WHITE);
      p.box(2.67, 3.52, 0.08, 0.08, 2, 12, WHITE);

      // Name plate on the podium front.
      p.faceTransform('left', 0.25, 3.0, 2, (ctx) => {
        ctx.fillStyle = 'rgba(8,16,24,0.85)';
        ctx.fillRect(0.55 * HALF_TW, 14, 2.4 * HALF_TW, 7);
        ctx.fillStyle = '#e8f6ff';
        ctx.font = '700 5.6px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.save();
        ctx.scale(1, -1); // the face space has y growing up
        ctx.fillText('HIGH-TECH CENTER', 1.75 * HALF_TW, -17.5);
        ctx.restore();
      });

      // Main tower: 14 floors of glass, two team-colour bands.
      const shaft = { u: 0.95, v: 0.8, w: 2.1, d: 1.9, z: 22, h: 86 };
      p.box(shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, GLASS);
      facade(p, 'left', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, { cols: 12, floors: 14, glass: GLASS, frame: CONCRETE, fill: 0.7, band: 0.2, seed: 5 });
      facade(p, 'right', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, { cols: 11, floors: 14, glass: GLASS, frame: CONCRETE, fill: 0.7, band: 0.2, seed: 6 });
      // Stone corner piers.
      p.faceRect('left', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, 0, 0.04, 0, 1, CONCRETE);
      p.faceRect('left', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, 0.96, 1, 0, 1, CONCRETE);
      p.faceRect('right', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, 0.96, 1, 0, 1, CONCRETE);
      p.faceRect('left', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, 0, 1, 0.66, 0.68, shade(team.primary, 0.8));
      p.faceRect('right', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, 0, 1, 0.66, 0.68, shade(team.primary, 0.68));
      p.topRect(shaft.u, shaft.v, shaft.u + shaft.w, shaft.v + shaft.d, shaft.z + shaft.h, RA2.roof);
      parapet(p, shaft.u, shaft.v, shaft.w, shaft.d, shaft.z + shaft.h, CONCRETE, 0.05, 2);

      // Stepped-back upper block.
      const upper = { u: 1.25, v: 1.1, w: 1.5, d: 1.3, z: 108, h: 40 };
      p.box(upper.u, upper.v, upper.w, upper.d, upper.z, upper.h, GLASS_UPPER);
      facade(p, 'left', upper.u, upper.v, upper.w, upper.d, upper.z, upper.h, { cols: 9, floors: 6, glass: GLASS_UPPER, frame: CONCRETE, fill: 0.7, band: 0.2, seed: 7 });
      facade(p, 'right', upper.u, upper.v, upper.w, upper.d, upper.z, upper.h, { cols: 8, floors: 6, glass: GLASS_UPPER, frame: CONCRETE, fill: 0.7, band: 0.2, seed: 8 });
      p.faceRect('left', upper.u, upper.v, upper.w, upper.d, upper.z, upper.h, 0, 1, 0.93, 1, shade(team.primary, 0.8));

      // National crown and mast (top ends near z 200 for the beacon).
      const cz = 148;
      if (look.crown === 'deco') {
        p.box(1.4, 1.2, 1.2, 1.1, cz, 10, CONCRETE);
        p.box(1.55, 1.35, 0.9, 0.8, cz + 10, 9, shade(CONCRETE, 1.06));
        p.box(1.7, 1.5, 0.6, 0.5, cz + 19, 8, shade(CONCRETE, 1.12));
        p.pole(2.0, 1.75, cz + 27, 25, '#c8c8c8');
      } else if (look.crown === 'spire') {
        p.box(1.45, 1.25, 1.1, 1.0, cz, 12, CONCRETE);
        p.box(1.65, 1.45, 0.7, 0.6, cz + 12, 10, shade(CONCRETE, 1.06));
        p.pyramid(1.75, 1.55, 0.5, 0.4, cz + 22, 18, '#b89a52');
        p.pole(2.0, 1.75, cz + 40, 12, '#c8a850');
      } else if (look.crown === 'pagoda') {
        p.box(1.45, 1.25, 1.1, 1.0, cz, 8, CONCRETE);
        p.hipRoof(1.45, 1.25, 1.1, 1.0, cz + 8, 9, 0.16, '#6e3a2c', 3);
        p.box(1.75, 1.55, 0.5, 0.4, cz + 17, 6, CONCRETE);
        p.hipRoof(1.75, 1.55, 0.5, 0.4, cz + 23, 7, 0.1, '#6e3a2c', 2);
        p.pole(2.0, 1.75, cz + 30, 22, '#c8c8c8');
      } else if (look.crown === 'mansard') {
        p.hipRoof(1.25, 1.1, 1.5, 1.3, cz, 16, 0.02, '#4d5560');
        p.box(1.85, 1.6, 0.3, 0.3, cz + 10, 12, CONCRETE);
        p.pyramid(1.85, 1.6, 0.3, 0.3, cz + 22, 10, '#4d6a5c');
        p.pole(2.0, 1.75, cz + 32, 20, '#c8c8c8');
      } else {
        p.box(1.45, 1.25, 1.1, 1.0, cz, 8, CONCRETE);
        p.cylinder(1.5, 1.3, 0.06, cz, 30, CONCRETE);
        p.dome(1.5, 1.3, 0.08, cz + 30, 5, '#4f8a86');
        p.cylinder(2.0, 1.75, 0.38, cz + 8, 6, shade(CONCRETE, 1.05));
        p.dome(2.0, 1.75, 0.4, cz + 14, 16, '#4f8a86');
        p.pole(2.0, 1.75, cz + 30, 22, '#c8a850');
      }
    },

    drawAnimated(p, time) {
      // Lit windows flickering on the tower faces.
      const shaft = { u: 0.95, v: 0.8, w: 2.1, d: 1.9, z: 22, h: 86 };
      for (let i = 0; i < 9; i++) {
        if (Math.sin(time * 1.7 + i * 2.3) < 0.35) continue;
        const col = ((i * 5) % 6) / 6;
        const row = ((i * 7) % 14) / 14;
        p.faceRect('left', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, col + 0.03, col + 0.12, row + 0.01, row + 0.06, 'rgba(230,214,150,0.85)');
      }
      // Mast beacon.
      if (Math.sin(time * 2.6) > 0.2) {
        const [x, y] = p.project(2.0, 1.75, 200);
        p.ctx.fillStyle = '#ff3b30';
        p.ctx.beginPath();
        p.ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        p.ctx.fill();
      }
    },
  };
}
