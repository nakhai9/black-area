import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';
import { ISO_X, ISO_Y } from '../constants';

/**
 * Self-propelled air-defence vehicle (`mantis`) sheets, rendered from 3D models by tools/ground_model_sheet.py: 32 columns
 * of 64 px — screen headings clockwise from N — by 2 rows: 0 the vehicle, 1 its burnt-out wreck. USA and Europe field
 * NOMADS, the other nations Buk-M3. The blasts of its death still come from mantis.png (tools/mantis_sheet.py:
 * 96 px cells, 13–14).
 */
const CELL = 64;
const DIRS = 32;
/** Iso px per sheet px, as the tank sheets. */
const SCALE = 0.166; // 5% under the old 0.175
const BLAST_CELL = 96;
const BLASTS = [13, 14];
const BLAST_FRAME_SECONDS = 0.25;
const FADE_SECONDS = 0.8;
export const MANTIS_DEATH_SECONDS = 3;

const img = (file: string): HTMLImageElement => {
  const i = new Image();
  i.dataset.src = `${import.meta.env.BASE_URL}sprites/${file}`;
  return i;
};
const NOMADS = img('sam-nomads.png');
const BUK = img('sam-buk.png');
const SHEETS: Record<FactionId, HTMLImageElement> = { usa: NOMADS, europe: NOMADS, russia: BUK, china: BUK, islamic: BUK };
const FX = img('mantis.png');
let loaded: Promise<void> | null = null;

/** Starts (once) and returns the air-defence sheet downloads. */
export function loadMantisSprites(): Promise<void> {
  loaded ??= Promise.all(
    [NOMADS, BUK, FX].map(
      (i) =>
        new Promise<void>((resolve, reject) => {
          i.onload = () => resolve();
          i.onerror = () => reject(new Error(`Could not load air-defence sprites '${i.dataset.src}'.`));
          i.src = i.dataset.src ?? '';
        }),
    ),
  ).then(() => undefined);
  return loaded;
}

const ok = (i: HTMLImageElement): boolean => i.complete && i.naturalWidth > 0;

/** True once `faction`'s sheet is loaded (its air-defence vehicles then die with its wreck). */
export function hasMantisSheet(faction: FactionId): boolean {
  return ok(SHEETS[faction]);
}

/** Sheet column (0–31) for a world heading: its direction on screen, clockwise from straight up. */
function column(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

function blit(ctx: CanvasRenderingContext2D, image: HTMLImageElement, col: number, row: number, x: number, y: number, size: number): void {
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, col * CELL, row * CELL, CELL, CELL, x - size / 2, y - size / 2, size, size);
  ctx.imageSmoothingEnabled = prev;
}

/** Draws an air-defence vehicle with its ground point at (x, y) in iso px. Returns false when its sheet is not loaded. */
export function drawMantisSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  const image = SHEETS[v.faction as FactionId];
  if (v.type !== 'mantis' || !image || !ok(image)) return false;
  blit(ctx, image, column(v.heading), 0, x, y, CELL * SCALE);
  return true;
}

/** Sidebar cameo. Returns false when the sheet is not loaded. */
export function drawMantisPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  const image = SHEETS[faction];
  if (!image || !ok(image)) return false;
  ctx.save();
  blit(ctx, image, column(heading), 0, w / 2, h / 2, Math.min(w, h) * 1.25);
  ctx.restore();
  return true;
}

/** An air-defence vehicle's death (`age` s into a `ttl` s effect, world `heading`) at iso ground point (x, y): the blasts over its burning wreck, fading out. */
export function drawMantisDeath(ctx: CanvasRenderingContext2D, faction: FactionId, heading: number, x: number, y: number, age: number, ttl: number): void {
  const image = SHEETS[faction];
  if (!image || !ok(image)) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
  blit(ctx, image, column(heading), 1, x, y, CELL * SCALE);
  const blast = BLASTS[Math.floor(age / BLAST_FRAME_SECONDS)];
  if (blast !== undefined && ok(FX)) {
    const size = BLAST_CELL * 0.125;
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(FX, blast * BLAST_CELL, 0, BLAST_CELL, BLAST_CELL, x - size / 2, y - size * 0.62, size, size);
    ctx.imageSmoothingEnabled = prev;
  }
  ctx.globalAlpha = prevAlpha;
}
