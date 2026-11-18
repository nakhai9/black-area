import { FACTIONS } from '../factions';
import type { FactionId } from '../types';
import { lazyImage } from './onDemand';
import { spriteUrl } from './spriteUrl';

/**
 * RS-24 Yars missile (tools/blender/yars_render.py): 32 facings in one row, "yars-missile" plus the faction band mask
 * "yars-missile-team" (tinted with the owner's hex colour). Only the Defense-tab cameo uses it for now.
 */
const IMAGES = new Map<string, HTMLImageElement>();
function image(file: string): HTMLImageElement {
  let img = IMAGES.get(file);
  if (!img) {
    img = lazyImage(spriteUrl(`${file}.webp`));
    IMAGES.set(file, img);
  }
  return img;
}
const ready = (img: HTMLImageElement): boolean => img.complete && img.naturalWidth > 0;
image('yars-missile');
image('yars-missile-team');

/** Facing shown on the cameo: nose to the upper right (NE). */
const CAMEO_DIR = 4;

/** Defense-tab cameo in `faction` colours (null while the sheets load). */
export function yarsPreview(faction: FactionId): HTMLCanvasElement | null {
  const body = image('yars-missile');
  const team = image('yars-missile-team');
  if (!ready(body) || !ready(team)) return null;
  const cell = body.naturalHeight;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d')!;
  // The missile fills about the middle 70 % of the stored cell: crop to it.
  const crop = cell * 0.7;
  const sx = CAMEO_DIR * cell + (cell - crop) / 2;
  const sy = (cell - crop) / 2;
  const size = 116;
  const dx = (c.width - size) / 2;
  const dy = (c.height - size) / 2;
  g.imageSmoothingEnabled = true;
  g.drawImage(body, sx, sy, crop, crop, dx, dy, size, size);
  // Faction band: mask tinted with the owner's colour.
  const t = document.createElement('canvas');
  t.width = c.width;
  t.height = c.height;
  const tg = t.getContext('2d')!;
  tg.drawImage(team, sx, sy, crop, crop, dx, dy, size, size);
  tg.globalCompositeOperation = 'multiply';
  tg.fillStyle = FACTIONS[faction]?.colors.primary ?? '#c8c8c8';
  tg.fillRect(0, 0, t.width, t.height);
  tg.globalCompositeOperation = 'destination-in';
  tg.drawImage(team, sx, sy, crop, crop, dx, dy, size, size);
  g.drawImage(t, 0, 0);
  return c;
}
