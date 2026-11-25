import { drawFlagOnPole } from '../Flags';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** The capital's one flag, on the crown of the glass tower (its highest point): pole foot (u, v, z) and pole height. */
const TOP_FLAG: readonly [number, number, number] = [2.5, 1.5625, 105];
const TOP_POLE_H = 30;
/** Damage stage 3: pole foot on the masonry block in the rubble (capitals.py RUIN_POLE_Z = 14 px). */
const RUIN_POLE_Z = 14;
const RUIN_POLE_H = 26;

/** Rendered in Blender (tools/blender/building_render.py capital-europe). */
const PICTURE: PictureSpec = { file: 'building-capital-europe', originX: 166, originY: 164.625, scale: 3, footprint: { w: 5, d: 5 }, zScale: 1.35 };

/**
 * The seat of the European Union's unified government (inspired by the European Parliament): a tall round glass
 * tower with an open steel crown, the domed glass hemicycle of the assembly ringed with twelve gold stars before it,
 * and glass curtain-wall office wings filling the plot round a low podium.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createBrusselsEUHeadquartersArt(flag: Allegiance = 'europe'): BuildingArt {
  const at = (file: string, z: number, h: number) =>
    pictureArt({ ...PICTURE, file }, {
      overlay: (p) => p.pole(TOP_FLAG[0], TOP_FLAG[1], z, h, '#d8d8d8'),
      drawAnimated: (p, time) => drawFlagOnPole(p, flag, TOP_FLAG[0], TOP_FLAG[1], z + h, time, 0),
    });
  const stages = [
    at(`${PICTURE.file}-d1`, TOP_FLAG[2], TOP_POLE_H),
    at(`${PICTURE.file}-d2`, TOP_FLAG[2], TOP_POLE_H),
    // Stage 3: everything collapsed; the pole stands on the masonry block left in the rubble.
    at(`${PICTURE.file}-d3`, RUIN_POLE_Z, RUIN_POLE_H),
  ];
  return { ...at(PICTURE.file, TOP_FLAG[2], TOP_POLE_H), damaged: (s) => stages[Math.min(3, Math.max(1, s)) - 1]! };
}
