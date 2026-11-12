import type { FactionId } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';
import { FOOTPRINT_FUEL_STATION } from '../../constants';

/**
 * Fuel Station (10 × 8 plot), rendered in Blender (tools/blender/building_render.py fuelstation-<nation>, a flat piece:
 * heights not scaled): fuel canopy in the nation's colour over 3 pump islands, shop, 3 aircraft parking spots,
 * 2 helipads and a 6-bay vehicle lot. originX / originY as printed by the render.
 */
const PICTURE = (faction: FactionId): PictureSpec => ({
  file: `building-fuelstation-${faction}`,
  originX: ORIGIN_X,
  originY: ORIGIN_Y,
  scale: 3,
  footprint: FOOTPRINT_FUEL_STATION,
  zScale: 1,
});
const ORIGIN_X = 262;
const ORIGIN_Y = 56;

export function createFuelStationArt(faction: FactionId): BuildingArt {
  return pictureArt(PICTURE(faction));
}
