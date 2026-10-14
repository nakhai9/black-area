import { HALF_TW } from '../../constants';
import { shade } from '../Color';
import { drawFlagOnPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

const PLAZA = '#a29d92';
const MARBLE = '#ecebe6';
const GLASS = '#4f7473';

/** The Secretariat slab, centred on the plot: long along u, thin along v, its wide glass face towards the viewer. */
const SLAB = { u: 1.0, v: 1.7, w: 2.0, d: 0.6, z: 9, h: 96 } as const;
/** The one flag, in the middle of the roof. */
const FLAG_U = 2;
const FLAG_V = 2;
const ROOF_Z = SLAB.z + SLAB.h + 4;
const FLAG_POLE = 18;

/** The Secretariat: blue-green glass curtain wall with fine mullions, windowless white marble end walls, grille crown. */
function secretariat(p: IsoPainter): void {
  const { u, v, w, d, z, h } = SLAB;
  p.box(u, v, w, d, z, h, MARBLE, { top: '#9aa0a3' });
  p.faceRect('left', u, v, w, d, z, h, 0.02, 0.98, 0.02, 0.93, GLASS);
  for (let i = 1; i < 24; i++) p.faceRect('left', u, v, w, d, z, h, i / 24 - 0.002, i / 24 + 0.002, 0.02, 0.93, '#7fa3a2');
  for (let f = 1; f < 37; f++) p.faceRect('left', u, v, w, d, z, h, 0.02, 0.98, (f / 37) * 0.91 + 0.02, (f / 37) * 0.91 + 0.024, '#3c5b5b');
  for (const t of [0.3, 0.62]) p.faceRect('left', u, v, w, d, z, h, 0.02, 0.98, t, t + 0.02, '#26393a');
  p.faceRect('left', u, v, w, d, z, h, 0.02, 0.98, 0.93, 1, '#8c9799');
  for (let i = 0; i < 30; i++) p.faceRect('left', u, v, w, d, z, h, 0.02 + (i / 30) * 0.96, 0.025 + (i / 30) * 0.96, 0.94, 0.995, '#6a7577');
  p.faceRect('right', u, v, w, d, z, h, 0, 1, 0.93, 1, shade(MARBLE, 0.92));
  // "GMC" lettering centred on the crown of the glass face.
  p.faceTransform('left', u, v + d, z + h * 0.935, (ctx) => {
    ctx.scale(1, -1);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('GMC', (w * HALF_TW) / 2, -0.4);
  });
  // Roof plant room, centred.
  p.box(1.6, 1.85, 0.8, 0.3, z + h, 4, '#9aa0a3');
}

/**
 * Global Monitoring Center (Zürich, neutral), inspired by the United Nations Headquarters and laid out symmetrically
 * about the centre of its plot: the Secretariat slab (glass curtain wall, marble ends) rising from a low marble
 * podium filling the whole plot with low office wings either side, a central entrance canopy, and one flag flying in the middle of the roof.
 */
export const WorldBankArt: BuildingArt = {
  footprint: { w: 4, d: 4 },
  // Authored in 4 × 4 units, drawn 1.25× to fill its 5 × 5 plot (FOOTPRINT_GMC).
  scale: 5 / 4,
  height: 140,

  drawStatic(p) {
    p.box(0, 0, 4, 4, 0, 3, PLAZA);
    // Podium filling the whole plot, with the glazed lobby all round.
    p.box(0.02, 0.02, 3.96, 3.96, 3, 6, MARBLE, { top: '#c9c7c0' });
    p.faceRect('left', 0.02, 0.02, 3.96, 3.96, 3, 6, 0.03, 0.97, 0.12, 0.85, '#3b4f55');
    p.faceRect('right', 0.02, 0.02, 3.96, 3.96, 3, 6, 0.03, 0.97, 0.12, 0.85, '#34464c');
    // Low office wings on the podium either side of the slab, front and back.
    const wing = (v: number): void => {
      p.box(0.1, v, 3.8, 1.6, 9, 10, MARBLE, { top: '#b9b8b2' });
      p.faceRect('left', 0.1, v, 3.8, 1.6, 9, 10, 0.02, 0.98, 0.2, 0.8, '#3b4f55');
      p.faceRect('right', 0.1, v, 3.8, 1.6, 9, 10, 0.02, 0.98, 0.2, 0.8, '#34464c');
    };
    wing(0.1);
    secretariat(p);
    wing(2.3);
    // Entrance canopy on the centre line of the front edge.
    p.box(1.55, 3.86, 0.9, 0.12, 8, 1.2, '#f4f2ec');
    // The single flag, in the middle of the roof.
    p.pole(FLAG_U, FLAG_V, ROOF_Z, FLAG_POLE);
  },

  drawAnimated(p, time) {
    drawFlagOnPole(p, 'neutral', FLAG_U, FLAG_V, ROOF_Z + FLAG_POLE, time, 0.3, 18, 11);
  },
};
