import { drawFlagOnPole } from '../Flags';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** The one flag flies from the gilded finial of the palace's belvedere (printed by the Blender script). */
const TOP_FLAG: readonly [number, number, number] = [2.425, 1.7, 87.7];
const TOP_POLE_H = 12;
/** Damage stage 3: pole foot on the masonry block in the rubble (capital_russia.py RUIN_POLE_Z = 12 px). */
const RUIN_POLE_Z = 12;
const RUIN_POLE_H = 26;

/** Rendered in Blender (tools/blender/models/capital_russia.py, run via building_render.py capital-russia). */
const PICTURE: PictureSpec = { file: 'building-capital-russia', originX: 134, originY: 141, scale: 3, footprint: { w: 5, d: 4 }, zScale: 1.35 };

/**
 * Moscow — the Grand Kremlin Palace as seen from the Moskva: a long ochre-and-white palace with end pavilions, arched
 * windows under kokoshnik hoods, green seamed iron roofs with dormers and railings; the raised centre with its portals
 * and kokoshnik arches, the belvedere with a clock, green ribbed dome and gilded lantern (the flag flies above it);
 * the red Kremlin wall with swallowtail merlons, round and square towers and the gate tower in front.
 */
export function createMoscowKremlinArt(flag: Allegiance = 'russia'): BuildingArt {
  const at = (file: string, z: number, h: number, colour: string) =>
    pictureArt({ ...PICTURE, file }, {
      overlay: (p) => p.pole(TOP_FLAG[0], TOP_FLAG[1], z, h, colour),
      drawAnimated: (p, time) => drawFlagOnPole(p, flag, TOP_FLAG[0], TOP_FLAG[1], z + h, time, 1.5),
    });
  const stages = [
    at(`${PICTURE.file}-d1`, TOP_FLAG[2], TOP_POLE_H, '#e6b43c'),
    at(`${PICTURE.file}-d2`, TOP_FLAG[2], TOP_POLE_H, '#e6b43c'),
    // Stage 3: the belvedere is gone; a plain pole stands on the masonry block left in the rubble.
    at(`${PICTURE.file}-d3`, RUIN_POLE_Z, RUIN_POLE_H, '#8a8a8a'),
  ];
  return { ...at(PICTURE.file, TOP_FLAG[2], TOP_POLE_H, '#e6b43c'), damaged: (s) => stages[Math.min(3, Math.max(1, s)) - 1]! };
}
