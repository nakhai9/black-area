import type { FactionId } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { pictureArt } from './PictureArt';

/** Neighbour bits of a wall block: which sides another wall block of the same nation touches. */
export const WALL_N = 1;
export const WALL_E = 2;
export const WALL_S = 4;
export const WALL_W = 8;

/** Damage states by HP left (see Wall.damageLevel): 0 sound, 1 cracked, 2 broken (chunks off), 3 partly collapsed. */
export const WALL_DAMAGE_LEVELS = 4;

/**
 * Wall (1×1): rendered in Blender (tools/blender/models/wall.py) as one picture per nation, neighbour mask
 * (WALL_N | WALL_E | WALL_S | WALL_W: the slab runs on to joined sides, so a line reads as one wall) and damage stage
 * (cracks, chipped cap / battlements, rubble, collapsed stump). USA / Europe bare concrete, Russia red brick with
 * battlements, Islamic sandstone with a green cap, China a Great Wall block with a paved walkway and crenels.
 * Every picture shares one camera, so the origin is the same for all.
 */
export function createWallArt(faction: FactionId, mask = 0, damage = 0): BuildingArt {
  return pictureArt(
    { file: `building-wall-${faction}-${mask & 15}-${Math.min(WALL_DAMAGE_LEVELS - 1, Math.max(0, damage))}`, originX: 38, originY: 50, scale: 3, footprint: { w: 1, d: 1 }, zScale: 1 },
    { noRim: true, recolorWhole: false },
  );
}
