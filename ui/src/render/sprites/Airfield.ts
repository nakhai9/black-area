import type { FactionId } from '../../types';

import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** The airfield covers 12×8 tiles (the footprint in constants.ts must match). */
export const AIRFIELD_SIZE = { w: 12, d: 8 } as const;
const W = AIRFIELD_SIZE.w;
const D = AIRFIELD_SIZE.d;
/** The runway occupies the back strip v ∈ [0, RUNWAY_D]; its centre line is v = RUNWAY_D / 2. */
export const RUNWAY_D = 1.6;
const ROW_1 = 3.1;
const ROW_2 = 4.95;
const ROW_3 = 6.8;
/** Nine parking spots on the apron, three rows of three (tile coordinates, mirror-symmetric about u = 6). */
export const AIRFIELD_SLOTS: readonly (readonly [number, number])[] = [
  [2, ROW_1],
  [6, ROW_1],
  [10, ROW_1],
  [2, ROW_2],
  [6, ROW_2],
  [10, ROW_2],
  [2, ROW_3],
  [6, ROW_3],
  [10, ROW_3],
];
const LIGHTS_U: number[] = [];
for (let u = 0.15; u < W; u += 1.1) LIGHTS_U.push(u);

/** Rendered in Blender (tools/blender/building_render.py airfield-<nation>, a flat piece: heights not scaled). */
const PICTURE = (faction: FactionId): PictureSpec => ({ file: `building-airfield-${faction}`, originX: 262, originY: 66, scale: 3, footprint: { w: W, d: D }, zScale: 1 });

/**
 * Airfield (12×8 tiles, mirror-symmetric about its centre line): a long runway along the
 * back, and below it an apron that fills the rest of the block with nine marked parking spots
 * in three rows (the fighters are real units). The only structure on it is the control tower, in the
 * front corner opposite the runway. Aircraft that return here are repaired.
 */
export function createAirfieldArt(faction: FactionId): BuildingArt {
  return pictureArt(PICTURE(faction), {
    drawAnimated(p, time) {
      // Blinking runway lights along both edges.
      const on = Math.sin(time * 4) > 0;
      p.ctx.fillStyle = on ? '#ffe9a0' : '#8a7a40';
      for (const u of LIGHTS_U) {
        for (const v of [0.03, RUNWAY_D - 0.03]) {
          const [x, y] = p.project(u, v, 2.3);
          p.ctx.beginPath();
          p.ctx.arc(x, y, 0.9, 0, Math.PI * 2);
          p.ctx.fill();
        }
      }
      // Tower beacon.
      if (Math.sin(time * 2.4) > 0.3) {
        const [x, y] = p.project(W - 0.6, D - 0.6, 45);
        p.ctx.fillStyle = '#ff3b30';
        p.ctx.beginPath();
        p.ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        p.ctx.fill();
      }
    },
  });
}
