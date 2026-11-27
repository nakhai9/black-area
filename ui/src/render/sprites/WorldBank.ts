import { HALF_TW } from '../../constants';
import { drawFlagOnPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** Plot coordinates (5 × 5) = the old 4-unit art × 1.25. */
const S = 1.25;
/** The Secretariat slab (old art units). */
const SLAB = { u: 1.0, v: 1.7, w: 2.0, d: 0.6, z: 9, h: 96 } as const;
/** The one flag, in the middle of the roof. */
const FLAG_U = 2 * S;
const FLAG_V = 2 * S;
const ROOF_Z = (SLAB.z + SLAB.h + 4) * S;
const FLAG_POLE = 22;
/** Damage stage 3: pole foot on the masonry block in the rubble (capitals.py RUIN_POLE_Z = 16 px). */
const RUIN_POLE_Z = 16;
const RUIN_POLE_H = 26;

/** Rendered in Blender (tools/blender/building_render.py worldbank). */
const PICTURE: PictureSpec = { file: 'building-worldbank', originX: 166, originY: 191.625, scale: 3, footprint: { w: 5, d: 5 }, zScale: 1.35 };

/**
 * Global Monitoring Center (Bern, neutral), inspired by the United Nations Headquarters: the Secretariat slab
 * (blue-green glass curtain wall, marble ends, grille crown with "GMC") rising from a marble podium filling the plot,
 * low glazed office wings either side, a central entrance canopy, and one flag flying in the middle of the roof.
 */
const RUIN_STAGES = [1, 2, 3].map((n) => worldBankArt(`${PICTURE.file}-d${n}`, n));

export const WorldBankArt: BuildingArt = { ...worldBankArt(PICTURE.file, 0), damaged: (s) => RUIN_STAGES[Math.min(3, Math.max(1, s)) - 1]! };

/** One stage's art: the crown lettering while the slab's crown stands (stage 0-1), the pole on the roof or, at stage 3, on the masonry block in the rubble. */
function worldBankArt(file: string, stage: number): BuildingArt {
  const poleZ = stage >= 3 ? RUIN_POLE_Z : ROOF_Z;
  const poleH = stage >= 3 ? RUIN_POLE_H : FLAG_POLE;
  return pictureArt({ ...PICTURE, file }, {
  overlay(p) {
    const { u, v, w, d, z, h } = SLAB;
    if (stage < 2)
    p.faceTransform('left', u * S, (v + d) * S, (z + h * 0.935) * S, (ctx) => {
      ctx.scale(1, -1);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 7px "Courier New", Courier, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('GMC', (w * S * HALF_TW) / 2, -0.5);
    });
    p.pole(FLAG_U, FLAG_V, poleZ, poleH);
  },
  drawAnimated(p, time) {
    drawFlagOnPole(p, 'neutral', FLAG_U, FLAG_V, poleZ + poleH, time, 0.3);
  },
  });
}
