import { ISO_X, ISO_Y } from '../constants';
import { worldToIso } from '../core/IsoView';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';
import { drawTankSheet } from './TankSheets';

/**
 * Pre-drawn army truck sheets — KamAZ (Russia, China and the Islamic world share it), the USA's Oshkosh LVSR and
 * Europe's IVECO, all laid out the same way: 16 × 14 cells of 80 px, the truck's
 * ground centre in the middle of each cell. 32 screen headings, clockwise from N: headings 0–15 in a row pair's first
 * row, 16–31 in its second.
 * Row pairs 0, 2: covered cargo truck (troop carrier), wheel frames A–B; pairs 4, 6: the same truck without its box
 * (flatbed, carrying a tank), frames A–B; pair 8: cargo truck shadow; pair 10: flatbed shadow.
 * Row 12: burning wreck, 8 headings (N, NE, … NW) for the cargo truck, then 8 for the flatbed; row 13: 8 explosion frames.
 */
const CELL = 80;
const DIRS = 32;
const PER_ROW = 16;
const ROW = { cargo: [0, 2], flatbed: [4, 6], cargoShadow: 8, flatbedShadow: 10, wreck: 12, blast: 13 } as const;
const WHEEL_FRAME_SECONDS = 0.12;
const BLOW_FRAMES = 8;
const BLOW_FRAME_SECONDS = 0.1;
const FADE_SECONDS = 0.8;
export const TRUCK_DEATH_SECONDS = 4.5;
/** Iso px per sheet px: a little bigger than the main battle tanks (0.2), so a tank fits nicely on the bed. */
const SCALE = 0.23;
/** World px from the truck's centre back to the middle of its bed (where a carried tank sits), and how high it rides. */
const BED_BACK = 2.3;
const BED_LIFT = 1.6;
/** A tank on the bed is drawn a little smaller than on the ground so it fits the truck. */
const TANK_ON_BED = 0.9;

const sheet = (file: string): HTMLImageElement => {
  const img = new Image();
  img.dataset.src = `${import.meta.env.BASE_URL}sprites/${file}`;
  return img;
};
const KAMAZ = sheet('kamaz-truck.png');
const LVSR = sheet('lvsr-usa.png');
const IVECO = sheet('iveco-europe.png');
/** Sheet per nation that fields a truck. */
const SHEETS: Partial<Record<FactionId, HTMLImageElement>> = { russia: KAMAZ, china: KAMAZ, islamic: KAMAZ, usa: LVSR, europe: IVECO };
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

/**
 * Draws a truck with its ground point at (x, y) in iso px: the covered cargo truck, or — with a tank aboard — the
 * flatbed with that tank riding on its back. Returns false when there is no loaded sheet for its nation.
 */
export function drawTruckSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  const image = v.type === 'truck' ? ready(v.faction as FactionId) : null;
  if (!image) return false;
  const tank = v.cargo.find((c): c is Vehicle => 'type' in c && (c as Vehicle).type === 'tank') ?? null;
  const d = direction(v.heading);
  const size = CELL * SCALE;
  const half = size / 2;
  const blit = (col: number, row: number): void => ctx.drawImage(image, col * CELL, row * CELL, CELL, CELL, x - half, y - half, size, size);
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = 0.35;
  blit(d % PER_ROW, (tank ? ROW.flatbedShadow : ROW.cargoShadow) + Math.floor(d / PER_ROW));
  ctx.globalAlpha = alpha;
  const rows = tank ? ROW.flatbed : ROW.cargo;
  const frame = v.moving ? Math.floor(((v.walkPhase % 0.5) + 0.5) % 0.5 / WHEEL_FRAME_SECONDS) % rows.length : 0;
  blit(d % PER_ROW, (rows[frame] ?? rows[0]) + Math.floor(d / PER_ROW));
  ctx.imageSmoothingEnabled = prevSmooth;
  if (tank) {
    // The tank rides on the bed behind the cab, facing the way the truck goes.
    const back = worldToIso(-Math.cos(v.heading) * BED_BACK, -Math.sin(v.heading) * BED_BACK);
    const prevHeading = tank.heading;
    tank.heading = v.heading;
    ctx.save();
    ctx.translate(x + back.x, y + back.y - BED_LIFT);
    ctx.scale(TANK_ON_BED, TANK_ON_BED);
    drawTankSheet(ctx, tank, 0, 0);
    ctx.restore();
    tank.heading = prevHeading;
  }
  return true;
}

/** Sidebar cameo from the truck sheet (`heading` world radians). Returns false when `faction` has none. */
export function drawTruckPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  const image = ready(faction);
  if (!image) return false;
  const d = direction(heading);
  const size = Math.min(w, h) * 1.6;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, (d % PER_ROW) * CELL, (ROW.cargo[0] + Math.floor(d / PER_ROW)) * CELL, CELL, CELL, (w - size) / 2, (h - size) / 2, size, size);
  ctx.restore();
  return true;
}

/** A truck's death (`age` s into a `ttl` s effect, world `heading`) at iso ground point (x, y): blast, then a burning wreck. */
export function drawTruckDeath(ctx: CanvasRenderingContext2D, faction: FactionId, heading: number, flatbed: boolean, x: number, y: number, age: number, ttl: number): void {
  const image = ready(faction);
  if (!image) return;
  const wreckCol = (Math.round(direction(heading) / 4) % 8) + (flatbed ? 8 : 0);
  const size = CELL * SCALE;
  const half = size / 2;
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevAlpha = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
  ctx.drawImage(image, wreckCol * CELL, ROW.wreck * CELL, CELL, CELL, x - half, y - half, size, size);
  if (age < BLOW_FRAMES * BLOW_FRAME_SECONDS) {
    ctx.drawImage(image, Math.floor(age / BLOW_FRAME_SECONDS) * CELL, ROW.blast * CELL, CELL, CELL, x - half, y - half, size, size);
  }
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
}
