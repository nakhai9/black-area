import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';
import { ISO_X, ISO_Y } from '../constants';

/**
 * Aircraft carrier sheets, rendered from 3D models by tools/carrier_model_sheet.py: 32 columns of 192 px — screen
 * headings clockwise from N — by 2 rows: 0 the ship, 1 its burnt-out wreck. USA: USS Enterprise (CVN-80), Europe:
 * HMS Queen Elizabeth (R08), China: Type 004.
 */
const CELL = 192;
const DIRS = 32;
/** Iso px per sheet px: a carrier (~176 sheet px long) is drawn about 40 iso px long. */
const SCALE = 0.23;

const img = (file: string): HTMLImageElement => {
  const i = new Image();
  i.dataset.src = `${import.meta.env.BASE_URL}sprites/${file}`;
  return i;
};
const SHEETS: Partial<Record<FactionId, HTMLImageElement>> = { usa: img('ship-cvn80.png'), europe: img('ship-r08.png'), china: img('ship-type004.png') };
let loaded: Promise<void> | null = null;

/** Starts (once) and returns the carrier sheet downloads. */
export function loadCarrierSprites(): Promise<void> {
  loaded ??= Promise.all(
    Object.values(SHEETS).map(
      (i) =>
        new Promise<void>((resolve, reject) => {
          i.onload = () => resolve();
          i.onerror = () => reject(new Error(`Could not load carrier sprites '${i.dataset.src}'.`));
          i.src = i.dataset.src ?? '';
        }),
    ),
  ).then(() => undefined);
  return loaded;
}

const ok = (i: HTMLImageElement | undefined): i is HTMLImageElement => !!i && i.complete && i.naturalWidth > 0;

/** Sheet column (0–31) for a world heading: its direction on screen, clockwise from straight up. */
function column(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  // The sheets were rendered with the model's bow pointing the opposite way: half a turn more puts the bow forward.
  return ((Math.round((a / (Math.PI * 2)) * DIRS + DIRS / 2) % DIRS) + DIRS) % DIRS;
}

/** Draws a carrier with its waterline centre at (x, y) in iso px. Returns false when its sheet is not loaded. */
export function drawCarrierSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  const image = SHEETS[v.faction as FactionId];
  if (v.type !== 'carrier' || !ok(image)) return false;
  const size = CELL * SCALE;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, column(v.heading) * CELL, 0, CELL, CELL, x - size / 2, y - size / 2, size, size);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

/** Sidebar cameo. Returns false when the sheet is not loaded. */
export function drawCarrierPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  const image = SHEETS[faction];
  if (!ok(image)) return false;
  const size = Math.min(w, h) * 1.4;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, column(heading) * CELL, 0, CELL, CELL, w / 2 - size / 2, h / 2 - size / 2, size, size);
  ctx.restore();
  return true;
}
