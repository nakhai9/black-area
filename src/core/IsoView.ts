import { ISO_X, ISO_Y } from '../constants';
import type { WorldPoint } from '../types';

/**
 * The battlefield is shown isometrically, like Red Alert 2: the square gameplay grid (world x → down-right,
 * world y → down-left) appears as a 2:1 diamond grid. "Iso space" is the screen plane at zoom 1:
 * ground things are placed with `worldToIso`, upright things (units, building art, health bars) are
 * drawn at that point and rise up the screen.
 */
export function worldToIso(x: number, y: number): WorldPoint {
  return { x: (x - y) * ISO_X, y: (x + y) * ISO_Y };
}

export function isoToWorld(a: number, b: number): WorldPoint {
  return { x: (a / ISO_X + b / ISO_Y) / 2, y: (b / ISO_Y - a / ISO_X) / 2 };
}

/**
 * A heading in the world plane (radians) as the angle the same direction has on screen. The vehicle art
 * draws its footprint in a ground plane squashed vertically by `squash`, so the angle is measured there.
 */
export function isoHeading(theta: number, squash: number): number {
  const sx = (Math.cos(theta) - Math.sin(theta)) * ISO_X;
  const sy = ((Math.cos(theta) + Math.sin(theta)) * ISO_Y) / squash;
  return Math.atan2(sy, sx);
}

/** Does a world-plane movement (dx, dy) go to the right on screen? (soldiers face the way they walk) */
export function movesRight(dx: number, dy: number): boolean {
  return dx - dy >= 0;
}
