import { HALF_TW } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { BuildingArt } from './BuildingArt';

const PAD = '#a7a79b';
const CONCRETE = '#cfd3d8';
const WHITE = '#f1f3f5';
const LAWN = '#6d9f4a';
const GLASS = '#5d89ad';
const GLASS_UPPER = '#6a98bd';
const PANE = '#a9d6ef';

/**
 * High-Tech Center (4×4 tiles): a glass-and-steel high-rise. A wide podium with a team-colour entrance canopy
 * carries a tall tower with rows of windows and team-colour bands, a stepped-back upper block, a crown and a
 * communications mast with a blinking beacon.
 */
export function createTechCenterArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  return {
    footprint: { w: 4, d: 4 },
    height: 205,

    drawStatic(p) {
      p.box(0, 0, 4, 4, 0, 2, PAD);
      p.topRect(0.15, 3.05, 1.15, 3.85, 2, LAWN);
      p.topRect(2.85, 3.05, 3.85, 3.85, 2, LAWN);
      p.topRect(1.3, 3.05, 2.7, 3.85, 2, '#c4c3b8');

      // Podium.
      p.box(0.25, 0.35, 3.5, 2.65, 2, 20, CONCRETE);
      p.windows('left', 0.25, 0.35, 3.5, 2.65, 2, 20, 7, 2, PANE, 0.08, 0.4);
      p.windows('right', 0.25, 0.35, 3.5, 2.65, 2, 20, 5, 2, shade(PANE, 1.1), 0.08, 0.4);
      p.faceRect('left', 0.25, 0.35, 3.5, 2.65, 2, 20, 0, 1, 0.86, 1, team.primary);

      // Entrance: glass lobby under a team-colour canopy on two posts.
      p.box(1.35, 2.88, 1.3, 0.14, 2, 13, '#e9eef2');
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
      p.windows('left', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, 6, 14, PANE, 0.07, 0.36);
      p.windows('right', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, 5, 14, shade(PANE, 1.1), 0.07, 0.36);
      for (const [t0, t1] of [[0.3, 0.335], [0.66, 0.695]] as const) {
        p.faceRect('left', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, 0, 1, t0, t1, team.primary);
        p.faceRect('right', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, 0, 1, t0, t1, shade(team.primary, 0.85));
      }

      // Stepped-back upper block.
      const upper = { u: 1.25, v: 1.1, w: 1.5, d: 1.3, z: 108, h: 40 };
      p.box(upper.u, upper.v, upper.w, upper.d, upper.z, upper.h, GLASS_UPPER);
      p.windows('left', upper.u, upper.v, upper.w, upper.d, upper.z, upper.h, 4, 6, PANE, 0.08, 0.36);
      p.windows('right', upper.u, upper.v, upper.w, upper.d, upper.z, upper.h, 3, 6, shade(PANE, 1.1), 0.08, 0.36);
      p.faceRect('left', upper.u, upper.v, upper.w, upper.d, upper.z, upper.h, 0, 1, 0.9, 1, team.primary);

      // Crown, dish and mast.
      p.box(1.5, 1.3, 1.0, 0.9, 148, 10, team.primary);
      p.box(1.65, 1.42, 0.7, 0.66, 158, 8, CONCRETE);
      p.dome(1.55, 1.6, 0.16, 166, 8, '#e4e8ec');
      p.pole(2.0, 1.75, 166, 32, '#d8d8d8');
    },

    drawAnimated(p, time) {
      // Lit windows flickering on the tower faces.
      const shaft = { u: 0.95, v: 0.8, w: 2.1, d: 1.9, z: 22, h: 86 };
      for (let i = 0; i < 9; i++) {
        if (Math.sin(time * 1.7 + i * 2.3) < 0.35) continue;
        const col = ((i * 5) % 6) / 6;
        const row = ((i * 7) % 14) / 14;
        p.faceRect('left', shaft.u, shaft.v, shaft.w, shaft.d, shaft.z, shaft.h, col + 0.03, col + 0.12, row + 0.01, row + 0.06, 'rgba(255,238,160,0.95)');
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
