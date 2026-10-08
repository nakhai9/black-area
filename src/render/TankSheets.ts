import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';

/**
 * Pre-drawn main battle tank sheets (RA2 style): 16 × 16 cells of 64 px, tank centre in the middle of each cell.
 * 32 screen headings, clockwise from N: headings 0–15 sit in a row pair's first row, 16–31 in its second.
 * Row pairs: hull track frames A/B/C, turret, turret firing, hull shadow, turret shadow; then a wreck row and an explosion row (16 frames each).
 */
const CELL = 64;
const DIRS = 32;
const PER_ROW = 16;
const ROW = { hull: [0, 2, 4], turret: 6, fire: 8, hullShadow: 10, turretShadow: 12, wreck: 14, explosion: 15 } as const;
/** Turret traverse speed (rad/s). */
const TURRET_TURN = 3.2;
/** Death: 8 frames of the tank blowing apart, then 8 of the burning wreck (looped), fading out at the end. */
const BLOW_FRAMES = 8;
const BLOW_FRAME_SECONDS = 0.1;
const BURN_FRAME_SECONDS = 0.14;
const FADE_SECONDS = 0.8;
export const TANK_DEATH_SECONDS = 4.5;
/** How long the muzzle-flash turret is shown after a shot (s). */
const FIRE_SECONDS = 0.18;

interface TankSheet {
  readonly url: string;
  readonly image: HTMLImageElement;
  /** Iso px per sheet px. */
  readonly scale: number;
}

const sheet = (file: string, scale: number): TankSheet => ({
  url: `${import.meta.env.BASE_URL}sprites/${file}`,
  image: new Image(),
  scale,
});

const SHEETS: Partial<Record<FactionId, TankSheet>> = {
  // Side-on the hull spans ≈ 33 sheet px; drawn about as long as the vector tank (6.6 × 0.7 iso px), a touch bigger.
  usa: sheet('abrams-usa.png', 0.16),
  europe: sheet('leopard2-europe.png', 0.16),
  russia: sheet('t90-russia.png', 0.16),
  china: sheet('type99-china.png', 0.16),
};

let loaded: Promise<void> | null = null;

/** Starts (once) and returns the tank sheet downloads. */
export function loadTankSprites(): Promise<void> {
  loaded ??= Promise.all(
    Object.values(SHEETS).map(
      (s) =>
        new Promise<void>((resolve, reject) => {
          s.image.onload = () => resolve();
          s.image.onerror = () => reject(new Error(`Could not load tank sprites '${s.url}'.`));
          s.image.src = s.url;
        }),
    ),
  ).then(() => undefined);
  return loaded;
}

/** True when `faction` has a tank sheet (its tanks die with the sheet's wreck animation). */
export function hasTankSheet(faction: FactionId): boolean {
  return SHEETS[faction] !== undefined;
}

/** Turret world heading per tank, eased towards its target (or the hull's heading when idle). */
const turrets = new WeakMap<Vehicle, { heading: number; at: number }>();

function turretHeading(v: Vehicle): number {
  const now = performance.now() / 1000;
  const want = v.combatTarget !== null ? v.aimHeading : v.heading;
  const t = turrets.get(v);
  if (!t) {
    turrets.set(v, { heading: want, at: now });
    return want;
  }
  const dt = Math.min(0.1, now - t.at);
  t.at = now;
  const diff = Math.atan2(Math.sin(want - t.heading), Math.cos(want - t.heading));
  const step = TURRET_TURN * dt;
  t.heading = Math.abs(diff) <= step ? want : t.heading + Math.sign(diff) * step;
  return t.heading;
}

/** Sheet direction (0–31) for a world heading: its direction on screen, clockwise from straight up. */
function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

/**
 * Draws a main battle tank from its faction's sheet with its ground point at (x, y) in iso px.
 * Returns false when there is no loaded sheet for it (the caller draws the vector art).
 */
export function drawTankSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  const sh = SHEETS[v.faction as FactionId];
  if (!sh || v.type !== 'tank') return false;
  const img = sh.image;
  if (!img.complete || img.naturalWidth === 0) return false;
  const d = direction(v.heading);
  const td = direction(turretHeading(v));
  const track = v.moving ? (Math.floor(((v.walkPhase % 0.6) + 0.6) % 0.6 / 0.2) % 3) : 0;
  const sinceShot = v.weapon ? v.weapon.cooldown - v.cooldown : Infinity;
  const turretRow = sinceShot >= 0 && sinceShot < FIRE_SECONDS ? ROW.fire : ROW.turret;
  const size = CELL * sh.scale;
  const half = size / 2;
  const blit = (row: number, dir: number): void =>
    ctx.drawImage(img, (dir % PER_ROW) * CELL, (row + Math.floor(dir / PER_ROW)) * CELL, CELL, CELL, x - half, y - half, size, size);

  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.save();
  ctx.globalAlpha = 0.35;
  blit(ROW.hullShadow, d);
  blit(ROW.turretShadow, td);
  ctx.restore();
  blit(ROW.hull[track] ?? ROW.hull[0], d);
  blit(turretRow, td);
  ctx.imageSmoothingEnabled = prevSmooth;
  return true;
}

/** Sidebar cameo from the faction's tank sheet (`heading` world radians). Returns false when there is none. */
export function drawTankPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  const sh = SHEETS[faction];
  if (!sh) return false;
  const img = sh.image;
  if (!img.complete || img.naturalWidth === 0) return false;
  const d = direction(heading);
  const sx = (d % PER_ROW) * CELL;
  const pair = Math.floor(d / PER_ROW);
  const size = Math.min(w, h) * 1.6;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  for (const row of [ROW.hull[0], ROW.turret]) ctx.drawImage(img, sx, (row + pair) * CELL, CELL, CELL, (w - size) / 2, (h - size) / 2, size, size);
  ctx.restore();
  return true;
}

/** Draws a tank's death (`age` s into a `ttl` s effect) at iso ground point (x, y): blast, then a burning wreck. */
export function drawTankDeath(ctx: CanvasRenderingContext2D, faction: FactionId, x: number, y: number, age: number, ttl: number): void {
  const sh = SHEETS[faction];
  if (!sh) return;
  const img = sh.image;
  if (!img.complete || img.naturalWidth === 0) return;
  const blowEnd = BLOW_FRAMES * BLOW_FRAME_SECONDS;
  const wreckCol = age < blowEnd ? Math.floor(age / BLOW_FRAME_SECONDS) : BLOW_FRAMES + (Math.floor((age - blowEnd) / BURN_FRAME_SECONDS) % 8);
  // The fireball plays once over the blast; its trailing dust frames once over the first burning frames.
  const fxCol = age < blowEnd + 8 * BURN_FRAME_SECONDS ? wreckCol : -1;
  const size = CELL * sh.scale;
  const half = size / 2;
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevAlpha = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
  ctx.drawImage(img, wreckCol * CELL, ROW.wreck * CELL, CELL, CELL, x - half, y - half, size, size);
  if (fxCol >= 0) ctx.drawImage(img, fxCol * CELL, ROW.explosion * CELL, CELL, CELL, x - half, y - half, size, size);
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
}
