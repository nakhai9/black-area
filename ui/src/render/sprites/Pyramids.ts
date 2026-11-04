import type { BuildingArt } from './BuildingArt';
import { pictureArt } from './PictureArt';

/**
 * Pyramids of Giza (neutral monument, 6 × 6), rendered in Blender (tools/blender/building_render.py pyramids) with no
 * ground plot of its own (the desert shows between them): the Great Pyramid of Khufu with its flat, worn summit,
 * Khafre still capped with white casing, Menkaure and its three queens' pyramids, and the Sphinx in front — stepped
 * limestone courses with missing blocks, each sitting in a drift of sand. A flat piece: height scale 1.
 */
export const PyramidsArt: BuildingArt = pictureArt({ file: 'building-pyramids', originX: 198, originY: 90, scale: 3, footprint: { w: 6, d: 6 }, zScale: 1 });
