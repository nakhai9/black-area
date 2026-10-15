import type { BuildingArt } from './BuildingArt';

/**
 * Bunker (1×1): every nation's bunker is drawn from a pre-drawn sheet (render/BunkerSheet: west for USA / Europe,
 * east for Russia / China / Islamic). This empty one-cell art only sizes the sprite box (rise clip, health bar).
 */
export function createBunkerArt(): BuildingArt {
  return { footprint: { w: 1, d: 1 }, height: 52, drawStatic() {} };
}
