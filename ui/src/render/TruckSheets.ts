import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';
import { drawTankBlast } from './TankSheets';

/**
 * Army truck sheets, rendered from 3D models by tools/ground_model_sheet.py: 32 columns of 64 px — screen headings
 * clockwise from N — by 2 rows: 0 the truck with its soft shadow, 1 its burnt-out wreck. KamAZ-5330 for the
 * Islamic world (Russia, the USA and China: the modular KAMAZ-4310, HEMTT and Shacman below), Europe: the modular MAN SV 6x6. Trucks carry soldiers only.
 */
const CELL = 64;
const DIRS = 32;
/** Iso px per sheet px, as the tank sheets (a truck is a little longer than a tank). */
const SCALE = 0.1785; // 0.175 x 1.2 x 0.85 (v3.64.1)
const FADE_SECONDS = 0.8;
export const TRUCK_DEATH_SECONDS = 4.5;

const sheet = (file: string): HTMLImageElement => {
  const img = new Image();
  img.dataset.src = `${import.meta.env.BASE_URL}sprites/${file}`;
  return img;
};
const KAMAZ = sheet('truck-kamaz.webp');
/**
 * Russia's KAMAZ-4310 (tools/blender/kamaz_render.py), modular: the chassis + cab sheet (with the truck's shadow) and a
 * module sheet drawn over it (now the cargo body; later a weapon module). Both share the cell's ground point, 32 columns,
 * cells of width / 32 px. The model is built in real metres at the tanks' px per metre.
 */
/** Iso px per 64 px layout cell px for the modular KAMAZ: 0.166 = true scale next to the tanks. Raise it to draw the truck bigger. */
export const KAMAZ_SCALE = 0.1693; // true scale 0.166 x 1.2 x 0.85
/** Same for Europe's MAN SV 6x6 (tools/blender/mansv_render.py, dark moss green): 0.166 = true scale (8.6 m long). */
export const MANSV_SCALE = 0.1693; // true scale 0.166 x 1.2 x 0.85
/** Same for the USA's HEMTT M977 8x8 (tools/blender/hemtt_render.py, desert tan): 0.166 = true scale (10.17 m long). */
export const HEMTT_SCALE = 0.1693; // true scale 0.166 x 1.2 x 0.85
/** Same for China's Shacman SX2190 6x6 (tools/blender/shacman_render.py, PLA pixel camo): 0.166 = true scale (10.5 m long). */
export const SHACMAN_SCALE = 0.1693; // true scale 0.166 x 1.2 x 0.85
/** pivotY: the ground point's row in the 64 px layout cell (kamaz_render.py / hemtt_render.py PIVOT). */
type Layered = { chassis: HTMLImageElement; module: HTMLImageElement; scale: number; pivotY: number };
const KAMAZ_RUSSIA: Layered = { chassis: sheet('truck-kamaz-russia-chassis.webp'), module: sheet('truck-kamaz-russia-body.webp'), scale: KAMAZ_SCALE, pivotY: 39 };
const HEMTT_USA: Layered = { chassis: sheet('truck-hemtt-usa-chassis.webp'), module: sheet('truck-hemtt-usa-body.webp'), scale: HEMTT_SCALE, pivotY: 45 };
const SHACMAN_CHINA: Layered = { chassis: sheet('truck-shacman-china-chassis.webp'), module: sheet('truck-shacman-china-body.webp'), scale: SHACMAN_SCALE, pivotY: 45 };
const MANSV_EUROPE: Layered = { chassis: sheet('truck-mansv-europe-chassis.webp'), module: sheet('truck-mansv-europe-body.webp'), scale: MANSV_SCALE, pivotY: 39 };
const BURNT = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
/** Burnt-out copy of a sheet (darkened, desaturated) for the wreck, made on first use. */
function burnt(img: HTMLImageElement): HTMLCanvasElement {
  let c = BURNT.get(img);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    if (g) {
      g.filter = 'brightness(0.32) saturate(0.4)';
      g.drawImage(img, 0, 0);
    }
    BURNT.set(img, c);
  }
  return c;
}
const loadedImg = (img: HTMLImageElement): boolean => img.complete && img.naturalWidth > 0;
/** Modular truck layers per nation (drawn instead of its one-piece sheet). */
const LAYERED: Partial<Record<FactionId, Layered>> = { russia: KAMAZ_RUSSIA, usa: HEMTT_USA, europe: MANSV_EUROPE, china: SHACMAN_CHINA };
/** Draw scale of `faction`'s modular truck. */
const layeredScale = (faction: FactionId): number => LAYERED[faction]?.scale ?? SCALE;
/** Loaded layers for `faction`, or null. */
function layers(faction: FactionId): HTMLImageElement[] | null {
  const l = LAYERED[faction];
  return l && loadedImg(l.chassis) ? [l.chassis, l.module].filter(loadedImg) : null;
}
/** Screen offset (px, up) that puts the layered sheet's ground point on the unit when drawn `size` px square. */
const lift = (faction: FactionId, size: number): number => (((LAYERED[faction]?.pivotY ?? CELL / 2) - CELL / 2) / CELL) * size;
/** Draws column `col` of every layer (cells of width / 32 px), ground point at (x, y), `size` iso px square. */
function blitLayers(ctx: CanvasRenderingContext2D, imgs: CanvasImageSource[], col: number, x: number, y: number, size: number): void {
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  for (const img of imgs) {
    const src = (img as HTMLImageElement | HTMLCanvasElement).width / DIRS;
    ctx.drawImage(img, col * src, 0, src, src, x - size / 2, y - size / 2, size, size);
  }
  ctx.imageSmoothingEnabled = prev;
}
/** Sheet per nation that fields a truck. */
const SHEETS: Partial<Record<FactionId, HTMLImageElement>> = {
  russia: KAMAZ,

  islamic: KAMAZ,
  europe: sheet('truck-zetros.webp'),
};
let loaded: Promise<void> | null = null;

/** Starts (once) and returns the truck sheet downloads. */
export function loadTruckSprites(): Promise<void> {
  loaded ??= Promise.all(
    [...new Set([...Object.values(SHEETS), ...Object.values(LAYERED).flatMap((l) => [l.chassis, l.module])])].map(
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
  return SHEETS[faction] !== undefined || LAYERED[faction] !== undefined;
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
  if (v.type !== 'truck') return false;
  const lay = layers(v.faction as FactionId);
  if (lay) {
    const size = CELL * layeredScale(v.faction as FactionId);
    blitLayers(ctx, lay, direction(v.heading), x, y - lift(v.faction as FactionId, size), size);
    return true;
  }
  const image = ready(v.faction as FactionId);
  if (!image) return false;
  blit(ctx, image, direction(v.heading), 0, x, y, CELL * SCALE);
  return true;
}

/** Sidebar cameo from the truck sheet (`heading` world radians). Returns false when `faction` has none. */
export function drawTruckPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  const lay = layers(faction);
  if (lay) {
    blitLayers(ctx, lay, direction(heading), w / 2, h / 2, Math.min(w, h) * 1.25);
    return true;
  }
  const image = ready(faction);
  if (!image) return false;
  ctx.save();
  blit(ctx, image, direction(heading), 0, w / 2, h / 2, Math.min(w, h) * 1.25);
  ctx.restore();
  return true;
}

/** A truck's death (`age` s into a `ttl` s effect, world `heading`) at iso ground point (x, y): blast, then a burning wreck. */
export function drawTruckDeath(ctx: CanvasRenderingContext2D, faction: FactionId, heading: number, x: number, y: number, age: number, ttl: number): void {
  const lay = layers(faction);
  if (lay) {
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
    const size = CELL * layeredScale(faction);
    blitLayers(ctx, lay.map(burnt), direction(heading), x, y - lift(faction, size), size);
    ctx.globalAlpha = prevAlpha;
    drawTankBlast(ctx, x, y, age, CELL * layeredScale(faction) * 1.5);
    return;
  }
  const image = ready(faction);
  if (!image) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
  blit(ctx, image, direction(heading), 1, x, y, CELL * SCALE);
  ctx.globalAlpha = prevAlpha;
  drawTankBlast(ctx, x, y, age, CELL * SCALE * 1.5);
}
