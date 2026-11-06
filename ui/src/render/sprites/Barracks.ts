import { activeDesign } from '../../constants';
import type { FactionId } from '../../types';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** Where the national flag pole stands, per design (art units, z = foot of the pole, h = pole height). */
interface FlagSpot {
  u: number;
  v: number;
  z: number;
  h: number;
}

/**
 * Ministry of Defence (the infantry building), drawn in each nation's own architecture and rendered in Blender
 * (tools/blender/building_render.py barracks-<nation>): West Point's Davis Barracks (USA; the Pentagon on its own 4 × 4
 * plot is kept as a hidden design, see BUILDING_DESIGNS), the Frunzenskaya
 * Ministry of Defence (Russia), the August 1st Building with its 八一 emblem (China), the NATO-style headquarters
 * (Europe) and a mud-brick desert fortress with green domes (Islamic). Every other design fills its 5 × 3 plot.
 */
const PICTURES: Record<FactionId, PictureSpec> = {
  usa: { file: 'building-barracks-usa-westpoint', originX: 102, originY: 95.1, scale: 3, footprint: { w: 5, d: 3 }, zScale: 1.35 },
  russia: { file: 'building-barracks-russia', originX: 102, originY: 95.1, scale: 3, footprint: { w: 5, d: 3 }, zScale: 1.35 },
  china: { file: 'building-barracks-china', originX: 102, originY: 89.7, scale: 3, footprint: { w: 5, d: 3 }, zScale: 1.35 },
  europe: { file: 'building-barracks-europe', originX: 102, originY: 54.6, scale: 3, footprint: { w: 5, d: 3 }, zScale: 1.35 },
  islamic: { file: 'building-barracks-islamic', originX: 102, originY: 78.9, scale: 3, footprint: { w: 5, d: 3 }, zScale: 1.35 },
};

/** Flag pole of each design (art units; z already divided by the cache's height scale). */
const FLAGS: Record<FactionId, FlagSpot> = {
  // On top of the atrium between the two limestone pylons.
  usa: { u: 2.5, v: 2.05, z: 52, h: 14 },
  // On the crowning pavilion of the central block.
  russia: { u: 2.5, v: 1.75, z: 40.6, h: 14 },
  // On the front steps before the pillared entrance.
  china: { u: 2.5, v: 2.95, z: 1.2, h: 30 },
  // On the high inner end of the front wing, by the central spine.
  europe: { u: 2.72, v: 2.64, z: 22, h: 14 },
  // On top of the iwan gateway.
  islamic: { u: 2.5, v: 2.8, z: 34.5, h: 14 },
};

/** `flagOf`: the nation whose flag flies (its owner after a capture; the design stays `faction`'s). */
/** Hidden designs, kept to be switched back on in BUILDING_DESIGNS. */
const ALT_PICTURES: Record<string, PictureSpec> = {
  'usa:pentagon': { file: 'building-barracks-usa-pentagon', originX: 134, originY: 60, scale: 3, footprint: { w: 4, d: 4 }, zScale: 1.35 },
};
const ALT_FLAGS: Record<string, FlagSpot> = {
  // In the middle of the Pentagon's central courtyard.
  'usa:pentagon': { u: 2, v: 2, z: 1.2, h: 30 },
};

export function createBarracksArt(faction: FactionId, flagOf: FactionId = faction): BuildingArt {
  const alt = `${faction}:${activeDesign('barracks', faction)}`;
  const f = ALT_FLAGS[alt] ?? FLAGS[faction];
  return pictureArt(ALT_PICTURES[alt] ?? PICTURES[faction], {
    overlay: (p) => drawNationalPole(p, faction, f.u, f.v, f.z, f.h),
    drawAnimated: (p, time) => drawFlagOnPole(p, flagOf, f.u, f.v, f.z + f.h, time, 0.6),
  });
}
