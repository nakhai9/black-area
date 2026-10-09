import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';

/**
 * Pre-drawn armoured recovery vehicle sheets (BREM-1, ARV, Type 90 II): 16 × 15 cells of 80 px, hull centre in the middle of each cell.
 * 32 screen headings, clockwise from N: headings 0–15 sit in a row pair's first row, 16–31 in its second.
 * Row pairs 0, 2, 4, 6: hull track frames A–D; pair 8: hull shadow (dark, semi-transparent).
 * Rows 10–13: crane at work with sparks, 8 frames for each of 8 headings (N, NE | E, SE | S, SW | W, NW, two per row).
 * Row 14: the burning wreck for the 8 headings (N, NE, … NW), then 8 explosion frames.
 */
const CELL = 80;
const DIRS = 32;
const PER_ROW = 16;
const ROW = { hull: [0, 2, 4, 6], shadow: 8, work: 10, wreck: 14 } as const;
const WORK_FRAMES = 8;
const WORK_FRAME_SECONDS = 0.12;
const TRACK_FRAME_SECONDS = 0.15;
/** Death: 8 explosion frames over the burning wreck (facing the way the vehicle did), fading out at the end. */
const BLOW_FRAMES = 8;
const BLOW_FRAME_SECONDS = 0.1;
const FADE_SECONDS = 0.8;
export const REPAIR_DEATH_SECONDS = 4.5;

interface RepairSheet {
  readonly url: string;
  readonly image: HTMLImageElement;
  /** Iso px per sheet px. */
  readonly scale: number;
}

const sheet = (file: string, scale: number): RepairSheet => ({
  url: `${import.meta.env.BASE_URL}sprites/${file}`,
  image: new Image(),
  scale,
});

// Side-on the hull spans ≈ 33 sheet px, like the tank sheets: drawn about tank-sized.
const BREM1 = sheet('brem1-russia.png', 0.16);
const ARV = sheet('arv-usa.png', 0.16);
const TYPE90II = sheet('type90ii-china.png', 0.16);

/** Sheet per nation; nations may share one (the USA and Europe both field the ARV, China and the Islamic world the Type 90 II). */
const SHEETS: Partial<Record<FactionId, RepairSheet>> = {
  russia: BREM1,
  usa: ARV,
  europe: ARV,
  china: TYPE90II,
  islamic: TYPE90II,
};

let loaded: Promise<void> | null = null;

/** Starts (once) and returns the repair vehicle sheet downloads. */
export function loadRepairSprites(): Promise<void> {
  loaded ??= Promise.all(
    [...new Set(Object.values(SHEETS))].map(
      (s) =>
        new Promise<void>((resolve, reject) => {
          s.image.onload = () => resolve();
          s.image.onerror = () => reject(new Error(`Could not load repair vehicle sprites '${s.url}'.`));
          s.image.src = s.url;
        }),
    ),
  ).then(() => undefined);
  return loaded;
}

/** True when `faction` has a repair vehicle sheet (its repair vehicles die with the sheet's wreck animation). */
export function hasRepairSheet(faction: FactionId): boolean {
  return SHEETS[faction] !== undefined;
}

/** Sheet direction (0–31) for a world heading: its direction on screen, clockwise from straight up. */
function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

function ready(faction: FactionId): RepairSheet | null {
  const sh = SHEETS[faction];
  return sh && sh.image.complete && sh.image.naturalWidth > 0 ? sh : null;
}

/**
 * Draws a repair vehicle from its faction's sheet with its ground point at (x, y) in iso px: the crane animation
 * while it is mending, the hull with its track frames otherwise. Returns false when there is no loaded sheet.
 */
export function drawRepairSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  if (v.type !== 'repair') return false;
  const sh = ready(v.faction as FactionId);
  if (!sh) return false;
  const img = sh.image;
  const d = direction(v.heading);
  const size = CELL * sh.scale;
  const half = size / 2;
  const blit = (col: number, row: number): void => ctx.drawImage(img, col * CELL, row * CELL, CELL, CELL, x - half, y - half, size, size);
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.save();
  ctx.globalAlpha = 0.35;
  blit(d % PER_ROW, ROW.shadow + Math.floor(d / PER_ROW));
  ctx.restore();
  if (v.mending) {
    // 8 work headings: every 4th of the 32 sheet directions.
    const d8 = Math.round(d / 4) % 8;
    const frame = Math.floor(performance.now() / 1000 / WORK_FRAME_SECONDS) % WORK_FRAMES;
    blit((d8 % 2) * WORK_FRAMES + frame, ROW.work + Math.floor(d8 / 2));
  } else {
    const track = v.moving ? Math.floor(((v.walkPhase % 0.6) + 0.6) % 0.6 / TRACK_FRAME_SECONDS) % ROW.hull.length : 0;
    blit(d % PER_ROW, (ROW.hull[track] ?? ROW.hull[0]) + Math.floor(d / PER_ROW));
  }
  ctx.imageSmoothingEnabled = prevSmooth;
  return true;
}

/** Sidebar cameo from the faction's repair vehicle sheet (`heading` world radians). Returns false when there is none. */
export function drawRepairPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  const sh = ready(faction);
  if (!sh) return false;
  const d = direction(heading);
  const size = Math.min(w, h) * 1.6;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sh.image, (d % PER_ROW) * CELL, (ROW.hull[0] + Math.floor(d / PER_ROW)) * CELL, CELL, CELL, (w - size) / 2, (h - size) / 2, size, size);
  ctx.restore();
  return true;
}

/** Draws a repair vehicle's death (`age` s into a `ttl` s effect, world `heading`) at iso ground point (x, y): blast, then a burning wreck. */
export function drawRepairDeath(ctx: CanvasRenderingContext2D, faction: FactionId, heading: number, x: number, y: number, age: number, ttl: number): void {
  const sh = ready(faction);
  if (!sh) return;
  const blowEnd = BLOW_FRAMES * BLOW_FRAME_SECONDS;
  const wreckCol = Math.round(direction(heading) / 4) % 8;
  const size = CELL * sh.scale;
  const half = size / 2;
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevAlpha = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
  ctx.drawImage(sh.image, wreckCol * CELL, ROW.wreck * CELL, CELL, CELL, x - half, y - half, size, size);
  if (age < blowEnd) ctx.drawImage(sh.image, (BLOW_FRAMES + Math.floor(age / BLOW_FRAME_SECONDS)) * CELL, ROW.wreck * CELL, CELL, CELL, x - half, y - half, size, size);
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
}
