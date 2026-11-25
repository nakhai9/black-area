import { drawFlagOnPole } from '../Flags';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** The capital's one flag, on the crown of the great dome (plot coordinates, the old 4-unit art × 1.25). */
const TOP_FLAG: readonly [number, number, number] = [2.5, 1.375, 124];
const TOP_POLE_H = 24;
/** Damage stage 3: pole foot on the masonry block in the rubble (capitals.py RUIN_POLE_Z = 14 px). */
const RUIN_POLE_Z = 14;
const RUIN_POLE_H = 26;

/** Rendered in Blender (tools/blender/building_render.py capital-islamic). */
const PICTURE: PictureSpec = { file: 'building-capital-islamic', originX: 166, originY: 200.0625, scale: 3, footprint: { w: 5, d: 5 }, zScale: 1.35 };

/**
 * Riyadh — the Islamic world's capital landmark, a grand mosque in the Isfahan four-iwan plan: the sanctuary under a
 * huge ribbed green-tiled dome at the back; the main iwan with its pair of minarets, the old court roofed over by
 * arcaded prayer halls filling the plot, the one flag flying from the crown of the great dome.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createGrandMosqueArt(flag: Allegiance = 'islamic'): BuildingArt {
  const at = (file: string, z: number, h: number) =>
    pictureArt({ ...PICTURE, file }, {
      overlay: (p) => p.pole(TOP_FLAG[0], TOP_FLAG[1], z, h, '#d8d8d8'),
      drawAnimated: (p, time) => drawFlagOnPole(p, flag, TOP_FLAG[0], TOP_FLAG[1], z + h, time, 0),
    });
  const stages = [
    at(`${PICTURE.file}-d1`, TOP_FLAG[2], TOP_POLE_H),
    at(`${PICTURE.file}-d2`, TOP_FLAG[2], TOP_POLE_H),
    // Stage 3: everything collapsed; the pole stands on the masonry block left in the rubble.
    at(`${PICTURE.file}-d3`, RUIN_POLE_Z, RUIN_POLE_H),
  ];
  return { ...at(PICTURE.file, TOP_FLAG[2], TOP_POLE_H), damaged: (s) => stages[Math.min(3, Math.max(1, s)) - 1]! };
}
