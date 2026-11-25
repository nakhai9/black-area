import { activeDesign } from '../../constants';
import type { FactionId } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';


/**
 * Design codes (BUILDING_DESIGNS.powerPlant) mapped to the nation whose render holds the design (one huge cooling tower:
 * tools/blender/models/powerplant_coolingtower.py; two towers: powerplant_twintowers.py): nations sharing a code share that picture, its team line
 * recoloured to their own.
 */
const DESIGN_PICTURE: Readonly<Record<string, FactionId>> = { coolingTower: 'russia', coolingTowerSand: 'islamic', twinTowers: 'usa' };
/** Design codes drawn as one huge cooling tower; twinTowers (USA, Europe: tools/blender/models/powerplant_twintowers.py) has two. */
const SINGLE_TOWER_DESIGNS: ReadonlySet<string> = new Set(['coolingTower', 'coolingTowerSand']);
const singleTower = (faction: FactionId): boolean => SINGLE_TOWER_DESIGNS.has(activeDesign('powerPlant', faction));

/** Cooling towers of each design: centre on the plot and lip height (px), where the steam rises. */
const TWIN_TOWERS: readonly [number, number, number][] = [
  [1.15, 1.0, 82],
  [2.85, 1.2, 82],
];
const ONE_TOWER: readonly [number, number, number][] = [[2, 2, 130]];

/** Rendered in Blender (tools/blender/building_render.py powerplant-<nation>). */
const PICTURE = (faction: FactionId): PictureSpec => {
  const from = DESIGN_PICTURE[activeDesign('powerPlant', faction)] ?? faction;
  return {
    file: `building-powerplant-${from}`,
    originX: 134,
    originY: singleTower(faction) ? 192.3 : 141,
    scale: 3,
    footprint: { w: 4, d: 4 },
    zScale: 1.35,
    ...(from !== faction ? { recolor: { from, to: faction } } : {}),
  };
};

/** Damage stages (≤80 %, ≤50 %, ≤20 % HP), shared by the design code like the intact picture: same script, camera, origin. */
const damageFiles = (file: string): string[] => [1, 2, 3].map((n) => `${file}-d${n}`);

/**
 * Nuclear Power Plant (4×4 tiles). USA and Europe: two cooling towers (steam rising) and a chimney striped white and in
 * its team colour, a pump house, on a concrete pad behind a wire fence with a guard post. Russia, China and the Islamic
 * world: a single huge cooling tower filling the whole plot with a team-colour band near its lip, nothing else.
 */
export function createPowerPlantArt(faction: FactionId): BuildingArt {
  const towers = singleTower(faction) ? ONE_TOWER : TWIN_TOWERS;
  const spec = PICTURE(faction);
  const files = damageFiles(spec.file);
  const ruin = pictureArt(spec, { recolorWhole: true, damageFiles: files });
  const art = pictureArt(spec, {
    recolorWhole: true,
    damageFiles: files,
    drawAnimated(p, time) {
      // Steam rising from both towers: soft white puffs drifting up and fading.
      const { ctx } = p;
      towers.forEach(([cu, cv, h], n) => {
        const [x, y] = p.project(cu, cv, h);
        const big = h > 100 ? 1.8 : 1;
        for (let k = 0; k < 4; k++) {
          const t = (time * 0.25 + n * 0.37 + k / 4) % 1;
          const r = (8 + t * 14) * big;
          ctx.fillStyle = `rgba(245,247,250,${(0.55 * (1 - t)).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(x + t * 10, y - 4 - t * 34, r, r * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
  });
  // From stage 2 the towers are broken down: no steam.
  return { ...art, damaged: (s) => (s >= 2 ? ruin : art).damaged!(s) };
}
