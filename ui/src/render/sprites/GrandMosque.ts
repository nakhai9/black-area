import { drawFlagOnPole } from '../Flags';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** The capital's one flag, on the crown of the great dome (plot coordinates, the old 4-unit art × 1.25). */
const TOP_FLAG: readonly [number, number, number] = [2.5, 1.375, 124];
const TOP_POLE_H = 24;

/** Rendered in Blender (tools/blender/building_render.py capital-islamic). */
const PICTURE: PictureSpec = { file: 'building-capital-islamic', originX: 166, originY: 200.0625, scale: 3, footprint: { w: 5, d: 5 }, zScale: 1.35 };

/**
 * Riyadh — the Islamic world's capital landmark, a grand mosque in the Isfahan four-iwan plan: the sanctuary under a
 * huge ribbed green-tiled dome at the back; the main iwan with its pair of minarets, the old court roofed over by
 * arcaded prayer halls filling the plot, the one flag flying from the crown of the great dome.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createGrandMosqueArt(flag: Allegiance = 'islamic'): BuildingArt {
  return pictureArt(PICTURE, {
    overlay: (p) => p.pole(TOP_FLAG[0], TOP_FLAG[1], TOP_FLAG[2], TOP_POLE_H, '#d8d8d8'),
    drawAnimated: (p, time) => drawFlagOnPole(p, flag, TOP_FLAG[0], TOP_FLAG[1], TOP_FLAG[2] + TOP_POLE_H, time, 0),
  });
}
