import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** Flag on the roof of the residence (plot coordinates, 5 × 3). */
const FLAG_POLE: readonly [number, number] = [2.5, 1.19];
const POLE_Z = 43;
const POLE_HEIGHT = 30;

/** Rendered in Blender (tools/blender/building_render.py capital-usa). */
const PICTURE: PictureSpec = { file: 'building-capital-usa', originX: 102, originY: 73.5, scale: 3, footprint: { w: 5, d: 3 }, zScale: 1.35 };

/**
 * Washington, D.C. — the White House: the white Executive Residence with pedimented windows, a balustraded roof and
 * chimneys, fronted by the North Portico (four tall columns under a triangular pediment, a lantern over the door),
 * and the low East and West Wings — the whole 5 × 3 plot is building.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createWashingtonWhiteHouseArt(flag: Allegiance = 'usa'): BuildingArt {
  return pictureArt(PICTURE, {
    overlay: (p) => drawNationalPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], POLE_Z, POLE_HEIGHT),
    drawAnimated: (p, time) => drawFlagOnPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], POLE_Z + POLE_HEIGHT, time, 0),
  });
}
