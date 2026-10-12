import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';
import { drawTankBlast } from './TankSheets';

/**
 * Army truck sheets, rendered from 3D models by tools/ground_model_sheet.py: 32 columns of 64 px — screen headings
 * clockwise from N — by 2 rows: 0 the truck with its soft shadow, 1 its burnt-out wreck. KamAZ-5330 for Russia, China
 * and the Islamic world, Oshkosh MTVR for the USA, Mercedes-Benz Zetros for Europe. Trucks carry soldiers only.
 */
const CELL = 64;
const DIRS = 32;
/** Iso px per sheet px, as the tank sheets (a truck is a little longer than a tank). */
const SCALE = 0.175;
const FADE_SECONDS = 0.8;
export const TRUCK_DEATH_SECONDS = 4.5;

const sheet = (file: string): HTMLImageElement => {
  const img = new Image();
  img.dataset.src = `${import.meta.env.BASE_URL}sprites/${file}`;
  return img;
};
const KAMAZ = sheet('truck-kamaz.png');
/** Sheet per nation that fields a truck. */
const SHEETS: Partial<Record<FactionId, HTMLImageElement>> = {
  russia: KAMAZ,
  china: KAMAZ,
  islamic: KAMAZ,
  usa: sheet('truck-mtvr.png'),
  europe: sheet('truck-zetros.png'),
};
let loaded: Promise<void> | null = null;

/** Starts (once) and returns the truck sheet downloads. */
export function loadTruckSprites(): Promise<void> {
  loaded ??= Promise.all(
    [...new Set(Object.values(SHEETS))].map(
      (img) =>
        new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error(`Could not load truck sprites '${img.dataset.src ?? ''}'.`));
          img.src = img.dataset.src ?? '';
        }),
    ),
  ).then(() => undefined);
  return loaded;
}

/** The nation's loaded truck sheet, or null. */
function ready(faction: FactionId): HTMLImageElement | null {
  const img = SHEETS[faction];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/** True when `faction`'s trucks are drawn from a sheet (and die with its wreck animation). */
export function hasTruckSheet(faction: FactionId): boolean {
  return SHEETS[faction] !== undefined;
}

/** Sheet direction (0–31) for a world heading: its direction on screen, clockwise from straight up. */
function direction(heading: number): number {
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

/** Draws a truck with its ground point at (x, y) in iso px. Returns false when there is no loaded sheet for its nation. */
export function drawTruckSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  const image = v.type === 'truck' ? ready(v.faction as FactionId) : null;
  if (!image) return false;
  blit(ctx, image, direction(v.heading), 0, x, y, CELL * SCALE);
  return true;
}

/** Sidebar cameo from the truck sheet (`heading` world radians). Returns false when `faction` has none. */
export function drawTruckPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  const image = ready(faction);
  if (!image) return false;
  ctx.save();
  blit(ctx, image, direction(heading), 0, w / 2, h / 2, Math.min(w, h) * 1.25);
  ctx.restore();
  return true;
}

/** A truck's death (`age` s into a `ttl` s effect, world `heading`) at iso ground point (x, y): blast, then a burning wreck. */
export function drawTruckDeath(ctx: CanvasRenderingContext2D, faction: FactionId, heading: number, x: number, y: number, age: number, ttl: number): void {
  const image = ready(faction);
  if (!image) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
  blit(ctx, image, direction(heading), 1, x, y, CELL * SCALE);
  ctx.globalAlpha = prevAlpha;
  drawTankBlast(ctx, x, y, age, CELL * SCALE * 1.5);
}
