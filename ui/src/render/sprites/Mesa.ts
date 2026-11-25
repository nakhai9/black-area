import type { BuildingArt } from './BuildingArt';
import { pictureArt } from './PictureArt';

/**
 * Red sandstone mesa (12 × 12, round organic outline, no plot of its own), rendered in Blender
 * (tools/blender/mesa_render.py): flat plateau, stratified terracotta cliffs, a flat ramp up the camera side,
 * talus skirt fading to the ground. Indestructible terrain: no damage pictures. A flat piece: height scale 1.
 */
export const MesaArt: BuildingArt = pictureArt({ file: 'building-mesa-usa-west', originX: 390, originY: 108.6, scale: 3, footprint: { w: 12, d: 12 }, zScale: 1 });
