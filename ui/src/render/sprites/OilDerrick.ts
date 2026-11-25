import type { FactionColors } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** Team colour (FactionColors.primary) → the picture rendered in that colour; anything else gets the neutral grey tank. */
const PICTURE_BY_COLOR: Record<string, string> = {
  '#2f6fe0': 'usa',
  '#d22b2b': 'russia',
  '#e8b10a': 'china',
  '#6532d6': 'europe',
  '#1f9d4a': 'islamic',
};

/** Rendered in Blender (tools/blender/building_render.py oil-<colour>). */
const PICTURE = (key: string): PictureSpec => ({ file: `building-oil-${key}`, originX: 134, originY: 84.3, scale: 3, footprint: { w: 4, d: 4 }, zScale: 1.35 });

/**
 * Oil derrick (4 × 4 plot), drawn as one round fuel storage tank: a tall welded steel shell with a team-colour band,
 * a low conical roof with a vent and handrail, inside a concrete bund wall (no stair, pipe or valve). A small lamp on the roof shows whether the field is pumping (green) or resting (red).
 */
/** Damage stages (≤80 %, ≤50 %, ≤20 % HP): same script (oil.py oil-<colour>-d1..d3), camera and origin. */
const damageFiles = (file: string): string[] => [1, 2, 3].map((n) => `${file}-d${n}`);

export function createOilDerrickArt(team: FactionColors): BuildingArt {
  const spec = PICTURE(PICTURE_BY_COLOR[team.primary.toLowerCase()] ?? 'neutral');
  const files = damageFiles(spec.file);
  const ruin = pictureArt(spec, { damageFiles: files });
  const art = pictureArt(spec, {
    damageFiles: files,
    drawAnimated(p, _time, active) {
      const [lx, ly] = p.project(2, 2, 54);
      p.ctx.fillStyle = active ? '#5cff6a' : '#ff4a3a';
      p.ctx.beginPath();
      p.ctx.arc(lx, ly, 1.8, 0, Math.PI * 2);
      p.ctx.fill();
    },
  });
  // From stage 2 the roof (and its lamp) is gone.
  return { ...art, damaged: (s) => (s >= 2 ? ruin : art).damaged!(s) };
}
