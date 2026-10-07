import type { IsoPainter } from '../IsoPainter';

/**
 * Procedural artwork for one building type.
 * `drawStatic` is rendered once into a cached sprite; `drawAnimated` runs every
 * frame on top of it (flags, lights…) using the same local coordinate space.
 */
export interface BuildingArt {
  readonly footprint: { readonly w: number; readonly d: number };
  /** Max height above ground in px — sizes the sprite canvas. */
  readonly height: number;
  /**
   * Draws the art this many times larger, so a piece authored in a 4×4 art space can fill a 5×5 plot without
   * every coordinate in it being rewritten. `footprint` and `height` above stay as authored; the sprite is
   * built from them multiplied by this. Defaults to 1.
   */
  readonly scale?: number;
  drawStatic(p: IsoPainter): void;
  drawAnimated?(p: IsoPainter, time: number, active: boolean): void;
}
