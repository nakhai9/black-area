import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';
import { drawCraftBlast } from './CraftSheets';

/**
 * Main battle tank sheets rendered from 3D models (tools/tank_model_sheet.py), one hull and one turret sheet per nation: 32 columns of 64 px —
 * screen headings clockwise from N — in one row. Hull (with its soft shadow) and turret share the cell's pivot; the turret
 * is drawn over the hull and turns on its own towards the combat target.
 */
const CELL = 64;
const DIRS = 32;
/** Iso px per sheet px: the hull (≈ 44 sheet px side-on) is drawn ≈ 7.3 iso px long. */
const SCALE = 0.166; // 5% under the old 0.175
/** Death: the blast plays over the wreck, which then burns dark and fades out. */
const FADE_SECONDS = 0.8;
export const TANK_DEATH_SECONDS = 4.5;

const sheet = (file: string): HTMLImageElement => {
  const img = new Image();
  img.dataset.src = `${import.meta.env.BASE_URL}sprites/${file}`;
  return img;
};
const FACTIONS: FactionId[] = ['usa', 'europe', 'russia', 'islamic', 'china'];
/** Sheet name per nation: M1A1 Abrams, Leopard 2A4M, T-14 Armata, Karrar (T-90), ZTZ-96. */
const MODEL: Record<FactionId, string> = { usa: 'm1a1', europe: 'leopard2', russia: 't14', islamic: 't90', china: 'ztz96' };
const SHEETS = Object.fromEntries(FACTIONS.map((f) => [f, sheet(`tank-${MODEL[f]}-hull.png`)])) as Record<FactionId, HTMLImageElement>;
const TURRETS = Object.fromEntries(FACTIONS.map((f) => [f, sheet(`tank-${MODEL[f]}-turret.png`)])) as Record<FactionId, HTMLImageElement>;
/** Tank explosion shared by every nation (tools/tank_fx_sheet.py): 16 frames of BLAST_CELL px in one row. */
const TANK_BLAST = sheet('tank-blast.png');
const BLAST_CELL = 64;
const BLAST_FRAMES = 16;
const BLAST_FRAME_SECONDS = 0.09;
/** Fallback when the tank explosion sheet is missing: which aircraft explosion each nation's tanks blow up with. */
const BLAST: Record<FactionId, string> = { usa: 'apache', europe: 'apache', russia: 'ka52', islamic: 'ka52', china: 'z10' };

let loaded: Promise<void> | null = null;

/** Starts (once) and returns the tank sheet downloads. */
export function loadTankSprites(): Promise<void> {
  loaded ??= Promise.all(
    [...Object.values(SHEETS), ...Object.values(TURRETS), TANK_BLAST].map(
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

function readyTurret(faction: FactionId): HTMLImageElement | null {
  const img = TURRETS[faction];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/** Sheet direction (0–31) for a world heading: its direction on screen, clockwise from straight up. */
function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

/** Burnt-out copies of the sheets (darkened, desaturated), made on first use. */
const BURNT = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
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

function blit(ctx: CanvasRenderingContext2D, img: CanvasImageSource, dir: number, frame: number, x: number, y: number, size: number): void {
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
  const turret = readyTurret(v.faction as FactionId);
  blit(ctx, img, direction(v.heading), 0, x, y, CELL * SCALE);
  if (turret) blit(ctx, turret, direction(v.turretHeading), 0, x, y, CELL * SCALE);
  return true;
}

/** Sidebar cameo from the faction's tank sheet (`heading` world radians). Returns false when there is none. */
export function drawTankPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  const img = ready(faction);
  if (!img) return false;
  const size = Math.min(w, h) * 1.25;
  ctx.save();
  blit(ctx, img, direction(heading), 0, w / 2, h / 2, size);
  const turret = readyTurret(faction);
  if (turret) blit(ctx, turret, direction(heading), 0, w / 2, h / 2, size);
  ctx.restore();
  return true;
}

/** Draws a tank's death (`age` s into a `ttl` s effect, world `heading`) at iso ground point (x, y): blast, then a burnt-out wreck. */
export function drawTankDeath(ctx: CanvasRenderingContext2D, faction: FactionId, heading: number, x: number, y: number, age: number, ttl: number): void {
  const img = ready(faction);
  if (!img) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
  // The burnt look is baked once per sheet (a canvas filter on every frame for every wreck is slow).
  blit(ctx, burnt(img), direction(heading), 0, x, y, CELL * SCALE);
  const turret = readyTurret(faction);
  if (turret) blit(ctx, burnt(turret), direction(heading), 0, x, y, CELL * SCALE);
  ctx.globalAlpha = prevAlpha;
  if (!drawTankBlast(ctx, x, y, age, CELL * SCALE * 1.5)) drawCraftBlast(ctx, `heli:${BLAST[faction]}`, false, x, y, age, CELL * SCALE * 1.6);
}

/** The shared ground-vehicle explosion (`age` s in, `size` iso px across) at (x, y); false when its sheet is not loaded. */
export function drawTankBlast(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, size: number): boolean {
  if (!TANK_BLAST.complete || TANK_BLAST.naturalWidth === 0) return false;
  const frame = Math.floor(age / BLAST_FRAME_SECONDS);
  if (age >= 0 && frame < BLAST_FRAMES) {
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(TANK_BLAST, frame * BLAST_CELL, 0, BLAST_CELL, BLAST_CELL, x - size / 2, y - size * 0.62, size, size);
    ctx.imageSmoothingEnabled = prevSmooth;
  }
  return true;
}
