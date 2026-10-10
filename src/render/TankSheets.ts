import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';
import { drawCraftBlast } from './CraftSheets';

/**
 * Main battle tank sheets (tools/build_vehicle_sheets.py, from resources/<model>_move.png): 32 columns of 64 px —
 * screen headings clockwise from N — by 8 rows of track frames. Hull, turret and shadow are one picture.
 */
const CELL = 64;
const DIRS = 32;
const FRAMES = 8;
/** Seconds per track frame while driving. */
const TRACK_FRAME_SECONDS = 0.07;
/** Iso px per sheet px: the hull (≈ 40 sheet px side-on) is drawn ≈ 7 iso px long. */
const SCALE = 0.175;
/** Death: the blast plays over the wreck, which then burns dark and fades out. */
const FADE_SECONDS = 0.8;
export const TANK_DEATH_SECONDS = 4.5;

const sheet = (file: string): HTMLImageElement => {
  const img = new Image();
  img.dataset.src = `${import.meta.env.BASE_URL}sprites/${file}`;
  return img;
};
const M1A2 = sheet('tank-m1a2.png');
const T90M = sheet('tank-t90m.png');

const SHEETS: Partial<Record<FactionId, HTMLImageElement>> = {
  usa: M1A2,
  europe: sheet('tank-leopard2.png'),
  russia: T90M,
  islamic: T90M,
  china: sheet('tank-type99.png'),
};
/** Which aircraft explosion each nation's tanks blow up with. */
const BLAST: Record<FactionId, string> = { usa: 'apache', europe: 'apache', russia: 'ka52', islamic: 'ka52', china: 'z19e' };

let loaded: Promise<void> | null = null;

/** Starts (once) and returns the tank sheet downloads. */
export function loadTankSprites(): Promise<void> {
  loaded ??= Promise.all(
    [...new Set(Object.values(SHEETS))].map(
      (img) =>
        new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error(`Could not load tank sprites '${img.dataset.src}'.`));
          img.src = img.dataset.src ?? '';
        }),
    ),
  ).then(() => undefined);
  return loaded;
}

/** True when `faction` has a tank sheet (its tanks die with the sheet's wreck animation). */
export function hasTankSheet(faction: FactionId): boolean {
  return SHEETS[faction] !== undefined;
}

function ready(faction: FactionId): HTMLImageElement | null {
  const img = SHEETS[faction];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/** Sheet direction (0–31) for a world heading: its direction on screen, clockwise from straight up. */
function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

function blit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, dir: number, frame: number, x: number, y: number, size: number): void {
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, dir * CELL, frame * CELL, CELL, CELL, x - size / 2, y - size / 2, size, size);
  ctx.imageSmoothingEnabled = prevSmooth;
}

/**
 * Draws a main battle tank from its faction's sheet with its ground point at (x, y) in iso px.
 * Returns false when there is no loaded sheet for it (the caller draws the vector art).
 */
export function drawTankSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  if (v.type !== 'tank') return false;
  const img = ready(v.faction as FactionId);
  if (!img) return false;
  const frame = v.moving ? Math.floor(performance.now() / 1000 / TRACK_FRAME_SECONDS) % FRAMES : 0;
  blit(ctx, img, direction(v.heading), frame, x, y, CELL * SCALE);
  return true;
}

/** Sidebar cameo from the faction's tank sheet (`heading` world radians). Returns false when there is none. */
export function drawTankPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  const img = ready(faction);
  if (!img) return false;
  const size = Math.min(w, h) * 1.25;
  ctx.save();
  blit(ctx, img, direction(heading), 0, w / 2, h / 2, size);
  ctx.restore();
  return true;
}

/** Draws a tank's death (`age` s into a `ttl` s effect, world `heading`) at iso ground point (x, y): blast, then a burnt-out wreck. */
export function drawTankDeath(ctx: CanvasRenderingContext2D, faction: FactionId, heading: number, x: number, y: number, age: number, ttl: number): void {
  const img = ready(faction);
  if (!img) return;
  const prevAlpha = ctx.globalAlpha;
  const prevFilter = ctx.filter;
  ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
  ctx.filter = 'brightness(0.32) saturate(0.4)';
  blit(ctx, img, direction(heading), 0, x, y, CELL * SCALE);
  ctx.filter = prevFilter;
  ctx.globalAlpha = prevAlpha;
  drawCraftBlast(ctx, `heli:${BLAST[faction]}`, false, x, y, age, CELL * SCALE * 1.6);
}
