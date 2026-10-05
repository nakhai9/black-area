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
  drawStatic(p: IsoPainter): void;
  drawAnimated?(p: IsoPainter, time: number, active: boolean): void;
}

/** Soft drop shadow cast down-right across the plaza. */
export function groundShadow(p: IsoPainter, w: number, d: number): void {
  p.polygon(
    [
      [0, 0, 0],
      [w + 0.3, 0.15, 0],
      [w + 0.3, d + 0.3, 0],
      [0.15, d + 0.3, 0],
    ],
    'rgba(0,0,0,0.3)',
    null,
  );
}
