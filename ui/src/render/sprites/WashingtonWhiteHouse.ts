import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** Flag on the roof of the residence (plot coordinates, 5 × 3). */
const FLAG_POLE: readonly [number, number] = [2.5, 1.19];
const POLE_Z = 43;
const POLE_HEIGHT = 30;
/** Damage stage 3: pole foot on the masonry block left in the rubble (capital_usa.py RUIN_POLE_Z = 9 px). */
const RUIN_POLE_Z = 9;
const RUIN_POLE_H = 26;

/** Rendered in Blender (tools/blender/building_render.py capital-usa). */
const PICTURE: PictureSpec = { file: 'building-capital-usa', originX: 102, originY: 73.5, scale: 3, footprint: { w: 5, d: 3 }, zScale: 1.35 };


/**
 * Washington, D.C. — the White House: the white Executive Residence with pedimented windows, a balustraded roof and
 * chimneys, fronted by the North Portico (four tall columns under a triangular pediment, a lantern over the door),
 * and the low East and West Wings — the whole 5 × 3 plot is building.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createWashingtonWhiteHouseArt(flag: Allegiance = 'usa'): BuildingArt {
  const at = (file: string, z: number, h: number) =>
    pictureArt({ ...PICTURE, file }, {
      overlay: (p) => drawNationalPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], z, h),
      drawAnimated: (p, time) => drawFlagOnPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], z + h, time, 0),
    });
  // Damage stages (≤80 %, ≤50 %, ≤20 % HP), same script, camera and origin; stage 3: the roof is gone, the pole
  // stands on the masonry block in the rubble.
  const stages = [
    at(`${PICTURE.file}-d1`, POLE_Z, POLE_HEIGHT),
    at(`${PICTURE.file}-d2`, POLE_Z, POLE_HEIGHT),
    at(`${PICTURE.file}-d3`, RUIN_POLE_Z, RUIN_POLE_H),
  ];
  return { ...at(PICTURE.file, POLE_Z, POLE_HEIGHT), damaged: (s) => stages[Math.min(3, Math.max(1, s)) - 1]! };
}
