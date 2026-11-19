import { lazyImage } from './onDemand';
import { spriteUrl } from './spriteUrl';

/**
 * Nuclear mushroom cloud (tools/nuke_cloud_sheet.py): 36 frames of CELL px in one row. The fireball rises into a column, the cap
 * forms and burns, turns to dark smoke and drifts away. The column foot sits at (CELL / 2, ANCHOR_Y) in every cell.
 */
const CELL = 208;
const FRAMES = 36;
const ANCHOR_Y = 200;
/** Sheet px across the cap at its widest: `width` (iso px) maps to this. */
const BODY_PX = 175;

const image = lazyImage(spriteUrl('nuke-cloud.webp'));
const ready = (): boolean => image.complete && image.naturalWidth > 0;

/** True once the sheet has loaded. */
export const hasNukeCloud = ready;

/**
 * Draws the cloud at progress `k` (0..1 through the frames), its cap `width` iso px wide, column foot at (x, y), with
 * opacity `alpha`. False while the sheet loads.
 */
export function drawNukeCloud(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, width: number, alpha: number): boolean {
  if (!ready()) return false;
  const frame = Math.max(0, Math.min(FRAMES - 1, Math.floor(k * FRAMES)));
  const s = width / BODY_PX;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.drawImage(image, frame * CELL, 0, CELL, CELL, x - (CELL / 2) * s, y - ANCHOR_Y * s, CELL * s, CELL * s);
  ctx.globalAlpha = prev;
  return true;
}
