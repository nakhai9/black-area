import type { FactionId } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** Rendered in Blender (tools/blender/building_render.py gate-<nation>), a flat piece (heights not scaled). */
const PICTURE = (faction: FactionId): PictureSpec => ({ file: `building-gate-${faction}`, originX: 38, originY: 96, scale: 3, footprint: { w: 4, d: 1 }, zScale: 1 });

/**
 * Nation Gate (4 × 1): two end towers with the way through the two middle cells, in the nation's own architecture —
 * USA marble portico, Russian Kremlin towers, Chinese paifang, European triumphal gate, Islamic tiled iwan — and a
 * stub of the nation's wall at both ends, so an adjoining wall joins it seamlessly. Turned, the sprite is mirrored.
 */
export function createGateArt(faction: FactionId): BuildingArt {
  return pictureArt(PICTURE(faction));
}
