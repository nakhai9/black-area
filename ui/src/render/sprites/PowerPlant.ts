import type { FactionId } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';


/** Cooling towers: height (px) and their centres on the plot (where the steam rises). */
const TOWER_H = 80;
const TOWERS: readonly [number, number][] = [
  [1.15, 1.0],
  [2.85, 1.2],
];

/** Rendered in Blender (tools/blender/building_render.py powerplant-<nation>): the same plant in each nation's concrete and chimney colour. */
const PICTURE = (faction: FactionId): PictureSpec => ({ file: `building-powerplant-${faction}`, originX: 134, originY: 141, scale: 3, footprint: { w: 4, d: 4 }, zScale: 1.35 });

/**
 * Nuclear Power Plant (4×4 tiles), the same for every nation: two cooling towers (steam rising) and a chimney striped
 * white and in its team colour, a pump house, on a concrete pad behind a wire fence with a guard post (each nation's own concrete).
 */
export function createPowerPlantArt(faction: FactionId): BuildingArt {
  return pictureArt(PICTURE(faction), {
    recolorWhole: true,
    drawAnimated(p, time) {
      // Steam rising from both towers: soft white puffs drifting up and fading.
      const { ctx } = p;
      TOWERS.forEach(([cu, cv], n) => {
        const [x, y] = p.project(cu, cv, 2 + TOWER_H);
        for (let k = 0; k < 4; k++) {
          const t = (time * 0.25 + n * 0.37 + k / 4) % 1;
          const r = 8 + t * 14;
          ctx.fillStyle = `rgba(245,247,250,${(0.55 * (1 - t)).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(x + t * 10, y - 4 - t * 34, r, r * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
  });
}
