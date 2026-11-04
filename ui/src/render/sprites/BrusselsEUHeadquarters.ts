import { drawFlagOnPole } from '../Flags';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** The capital's one flag, on the crown of the glass tower (its highest point): pole foot (u, v, z) and pole height. */
const TOP_FLAG: readonly [number, number, number] = [2.5, 1.5625, 105];
const TOP_POLE_H = 30;

/** Rendered in Blender (tools/blender/building_render.py capital-europe). */
const PICTURE: PictureSpec = { file: 'building-capital-europe', originX: 166, originY: 164.625, scale: 3, footprint: { w: 5, d: 5 }, zScale: 1.35 };

/**
 * The seat of the European Union's unified government (inspired by the European Parliament): a tall round glass
 * tower with an open steel crown, the domed glass hemicycle of the assembly ringed with twelve gold stars before it,
 * and glass curtain-wall office wings filling the plot round a low podium.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createBrusselsEUHeadquartersArt(flag: Allegiance = 'europe'): BuildingArt {
  return pictureArt(PICTURE, {
    overlay: (p) => p.pole(TOP_FLAG[0], TOP_FLAG[1], TOP_FLAG[2], TOP_POLE_H, '#d8d8d8'),
    drawAnimated: (p, time) => drawFlagOnPole(p, flag, TOP_FLAG[0], TOP_FLAG[1], TOP_FLAG[2] + TOP_POLE_H, time, 0, 18, 11),
  });
}
