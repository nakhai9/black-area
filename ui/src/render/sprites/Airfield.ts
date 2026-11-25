import { activeDesign } from '../../constants';
import type { FactionId } from '../../types';

import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt, preloadPicture } from './PictureArt';

/** The airfield covers 12×8 tiles (the footprint in constants.ts must match). */
export const AIRFIELD_SIZE = { w: 12, d: 8 } as const;
const W = AIRFIELD_SIZE.w;
const D = AIRFIELD_SIZE.d;
/** The runway occupies the back strip v ∈ [0, RUNWAY_D]; its centre line is v = RUNWAY_D / 2. */
export const RUNWAY_D = 1.6;
const ROW_1 = 3.1;
const ROW_2 = 4.95;
const ROW_3 = 6.8;
/** Nine parking spots on the apron, three rows of three (tile coordinates, mirror-symmetric about u = 6). */
export const AIRFIELD_SLOTS: readonly (readonly [number, number])[] = [
  [2, ROW_1],
  [6, ROW_1],
  [10, ROW_1],
  [2, ROW_2],
  [6, ROW_2],
  [10, ROW_2],
  [2, ROW_3],
  [6, ROW_3],
  [10, ROW_3],
];
/**
 * Russia's own layout (tools/blender/models/airfield_russia.py): the runway runs down the middle along v, as long as
 * the airfield is wide (u ∈ [5.2, 6.8], centre u = 6), with stands either side: two columns west, one east.
 */
/** Design codes (BUILDING_DESIGNS.airfield) with Russia's runway-down-the-middle layout. */
const MIDDLE_RUNWAY: ReadonlySet<string> = new Set(['middleRunway', 'middleRunwaySand']);
export const RUSSIA_RUNWAY = { u0: 5.2, u1: 6.8, cu: 6 } as const;
const RU_ROWS = [1.4, 4.0, 6.6];
export const RUSSIA_SLOTS: readonly (readonly [number, number])[] = RU_ROWS.flatMap((v) => [[1.4, v], [3.6, v], [8.4, v]] as const);

/** Runway centre line ends (tile u, v; take-off rolls start → end) and parking spots of a nation's airfield design. */
export function airfieldLayout(faction: string): { start: readonly [number, number]; end: readonly [number, number]; slots: readonly (readonly [number, number])[] } {
  if (MIDDLE_RUNWAY.has(activeDesign('airfield', faction))) return { start: [RUSSIA_RUNWAY.cu, 0.5], end: [RUSSIA_RUNWAY.cu, D - 0.5], slots: RUSSIA_SLOTS };
  return { start: [0.5, RUNWAY_D / 2], end: [W - 0.5, RUNWAY_D / 2], slots: AIRFIELD_SLOTS };
}
const LIGHTS_U: number[] = [];
for (let u = 0.15; u < W; u += 1.1) LIGHTS_U.push(u);

/**
 * Rendered in Blender (tools/blender/building_render.py airfield-<nation>, a flat piece: heights not scaled).
 * One picture per design code (BUILDING_DESIGNS.airfield): nations sharing a code share the picture, drawn with its
 * team line recoloured to their own. Value = the nation whose render holds that design.
 */
const DESIGN_PICTURE: Readonly<Record<string, FactionId>> = { middleRunway: 'russia', middleRunwaySand: 'islamic' };
const PICTURE = (faction: FactionId): PictureSpec => {
  const from = DESIGN_PICTURE[activeDesign('airfield', faction)] ?? faction;
  return { file: `building-airfield-${from}`, originX: 262, originY: 66, scale: 3, footprint: { w: W, d: D }, zScale: 1, ...(from !== faction ? { recolor: { from, to: faction } } : {}) };
};

/**
 * Airfield (12×8 tiles, mirror-symmetric about its centre line): a long runway along the
 * back, and below it an apron that fills the rest of the block with nine marked parking spots
 * in three rows (the fighters are real units). The only structure on it is the control tower, in the
 * front corner opposite the runway. Aircraft that return here are repaired.
 */
export function createAirfieldArt(faction: FactionId, stage = 0): BuildingArt {
  // Damage stages share the design's picture (same recolour): building-airfield-<design nation>-d<n> (_wreck.py wreck_flat).
  const spec = PICTURE(faction);
  // Damage pictures are built lazily (art.damaged): register them now so loadPictureArts downloads them before play.
  if (stage === 0) for (const n of [1, 2, 3]) preloadPicture(`${spec.file}-d${n}`);
  const art = pictureArt(stage ? { ...spec, file: `${spec.file}-d${stage}` } : spec, {
    drawAnimated(p, time) {
      // Blinking runway lights along both edges.
      const on = Math.sin(time * 4) > 0;
      p.ctx.fillStyle = on ? '#ffe9a0' : '#8a7a40';
      const lamp = (u: number, v: number): void => {
        const [x, y] = p.project(u, v, 2.3);
        p.ctx.beginPath();
        p.ctx.arc(x, y, 0.9, 0, Math.PI * 2);
        p.ctx.fill();
      };
      if (MIDDLE_RUNWAY.has(faction)) {
        for (let v = 0.15; v < D; v += 1.1) for (const u of [RUSSIA_RUNWAY.u0 + 0.03, RUSSIA_RUNWAY.u1 - 0.03]) lamp(u, v);
      } else {
        for (const u of LIGHTS_U) for (const v of [0.03, RUNWAY_D - 0.03]) lamp(u, v);
      }
      // Tower beacon (gone once the tower is blown open).
      if (stage < 2 && Math.sin(time * 2.4) > 0.3) {
        const [x, y] = MIDDLE_RUNWAY.has(faction) ? p.project(11.2, 7.1, 45) : p.project(W - 0.6, D - 0.6, 45);
        p.ctx.fillStyle = '#ff3b30';
        p.ctx.beginPath();
        p.ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        p.ctx.fill();
      }
    },
  });
  if (stage === 0) art.damaged = (n) => createAirfieldArt(faction, Math.min(3, Math.max(1, n)));
  return art;
}
