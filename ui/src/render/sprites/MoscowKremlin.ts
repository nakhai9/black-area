import { starPath } from '../Canvas';
import { drawFlagOnPole } from '../Flags';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** Plot coordinates (5 × 5) = the old 4-unit art × 1.25. */
const S = 1.25;
/** Glowing red stars on the tower tips: the front corner tower, the left / right corner towers and the two mid-wall towers. */
const STARS: readonly [number, number, number, number][] = [
  [3.62, 3.62, 84, 4.6],
  [3.75, 0.25, 50, 3],
  [0.25, 3.75, 50, 3],
  [3.85, 1.9, 50, 2.6],
  [1.9, 3.85, 50, 2.6],
];
/** The one flag flies from the top of the palace's gilded dome. */
const TOP_FLAG: readonly [number, number, number] = [0.66 * S, 0.66 * S, 56 * S];
const TOP_POLE_H = 18;

/** Rendered in Blender (tools/blender/building_render.py capital-russia). */
const PICTURE: PictureSpec = { file: 'building-capital-russia', originX: 166, originY: 161.25, scale: 3, footprint: { w: 5, d: 5 }, zScale: 1.35 };

/**
 * Moscow — the Kremlin as seen from the river: the cream Grand Kremlin Palace with green roofs and a gilded dome
 * along the back walls, the white Ivan the Great bell tower with its golden onion in the middle, two white
 * cathedrals with five golden onions either side, autumn trees, and red crenellated walls with green-tented towers.
 */
export function createMoscowKremlinArt(flag: Allegiance = 'russia'): BuildingArt {
  return pictureArt(PICTURE, {
    overlay(p) {
      p.pole(TOP_FLAG[0], TOP_FLAG[1], TOP_FLAG[2], TOP_POLE_H, '#e6b43c');
    },
    drawAnimated(p, time) {
      const { ctx } = p;
      for (const [u, v, z, s] of STARS) {
        const [x, y] = p.project(u * S, v * S, z * S);
        ctx.save();
        ctx.shadowColor = 'rgba(255,40,30,0.9)';
        ctx.shadowBlur = 5 + Math.sin(time * 3 + u) * 2.5;
        ctx.fillStyle = '#e8261c';
        ctx.strokeStyle = '#ffd36b';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        starPath(ctx, x, y - s * S, s * S);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      drawFlagOnPole(p, flag, TOP_FLAG[0], TOP_FLAG[1], TOP_FLAG[2] + TOP_POLE_H, time, 1.5, 16, 10);
    },
  });
}
