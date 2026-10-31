import type { MonumentId } from '../../constants';
import type { BuildingArt } from './BuildingArt';
import { pictureArt } from './PictureArt';

/** Symbol landmarks rendered from 3D models by tools/monument_model_sheet.py (flat pieces: no extra height scale). */
export const MONUMENT_ARTS: Readonly<Record<`monument:${MonumentId}`, BuildingArt>> = {
  'monument:liberty': pictureArt({ file: 'statue-of-liberty', originX: 68, originY: 153.82, scale: 3, footprint: { w: 2, d: 2 }, zScale: 1 }, { noShadow: true }),
};
