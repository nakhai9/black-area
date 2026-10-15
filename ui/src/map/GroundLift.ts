import { CELL_SIZE } from '../constants';
import { hillHeight } from './Relief';
import type { TileMap } from './TileMap';

/**
 * Raised ground: the rolling hills (Relief.hillHeight) lift the land up the screen, like the terrain heights of
 * Red Alert 2. The lift (iso px, up the screen) is set on the corners of the cells and blended bilinearly in
 * between, so it is smooth. The sea and the shore stay at 0; the ground under a building (and a ring of one cell
 * round it) is levelled to 0, so a base stands on flat ground. Everything placed with worldToIso (units, building
 * art, trees, bars) is lifted by it; TileTerrain bakes the same lift into the painted ground.
 */
/** Iso px of lift per metre of hill: a little more on the lowlands (low mounds), less in the mountains (big hills). */
const LIFT_LOW = 0.0035;
const LIFT_HIGH = 0.002;

const smooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export class GroundLift {
  constructor(private readonly map: TileMap) {}

  /** Lift (iso px) at cell corner (vx, vy): shared by the four cells (vx-1..vx, vy-1..vy). */
  vertex(vx: number, vy: number): number {
    const { map } = this;
    const W = map.width;
    if (vx < 1 || vy < 1 || vx >= W || vy >= map.height) return 0;
    let h = 0;
    for (let y = vy - 1; y <= vy; y++) {
      for (let x = vx - 1; x <= vx; x++) {
        const i = y * W + x;
        if (map.types[i] === 0 || map.occupied[i] !== 0) return 0;
        h += map.heights[i]!;
      }
    }
    h *= 0.25;
    // Shore and bases: the 4×4 cells round the corner (its own four are neither sea nor built on, see above).
    let near = 1;
    for (let y = vy - 2; y <= vy + 1; y++) {
      for (let x = vx - 2; x <= vx + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= map.height) continue;
        const i = y * W + x;
        if (map.occupied[i] !== 0) near = 0.4;
        else if (map.types[i] === 0 && near > 0.5) near = 0.5;
      }
    }
    const k = LIFT_LOW + (LIFT_HIGH - LIFT_LOW) * smooth(200, 3000, h);
    return hillHeight(h, vx, vy) * k * near;
  }

  /** Lift (iso px) at world point (wx, wy). */
  at(wx: number, wy: number): number {
    const fx = wx / CELL_SIZE;
    const fy = wy / CELL_SIZE;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = this.vertex(x0, y0);
    const b = this.vertex(x0 + 1, y0);
    const c = this.vertex(x0, y0 + 1);
    const d = this.vertex(x0 + 1, y0 + 1);
    if (a === 0 && b === 0 && c === 0 && d === 0) return 0;
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
}
