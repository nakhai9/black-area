import type { FactionId } from '../types';

/**
 * Pre-drawn falling-bomb sheets (8 × 11 cells of 96 px), per bomber nation. Columns: 8 screen headings, clockwise
 * from N. Rows: small bomb level / nose-down 45° / nearly vertical, small shadow; the same four rows large; then a
 * small and a large explosion and a burning crater (8 frames each).
 */
const CELL = 96;
const ROW = { pitch: [0, 1, 2], shadow: 3, blast: 9, crater: 10 } as const;
const FRAMES = 8;
/** Iso px per sheet px: the falling bomb, and the explosion / crater. */
const BOMB_SCALE = 0.11;
const BLAST_SCALE = 0.32;
/** Explosion: 8 frames over BLAST_SECONDS, then the crater burns (looping) and fades out. */
export const BLAST_SECONDS = 0.8;
export const BOMB_BLAST_TTL = 3.2;

interface BombSheet {
  readonly url: string;
  readonly image: HTMLImageElement;
}

const sheet = (file: string): BombSheet => ({ url: `${import.meta.env.BASE_URL}sprites/${file}`, image: new Image() });

const SHEETS: Partial<Record<FactionId, BombSheet>> = {
  russia: sheet('bomb-tu16.png'),
  usa: sheet('bomb-b52.png'),
};

let loaded: Promise<void> | null = null;

/** Starts (once) and returns the bomb sheet downloads. */
export function loadBombSprites(): Promise<void> {
  loaded ??= Promise.all(
    Object.values(SHEETS).map(
      (s) =>
        new Promise<void>((resolve, reject) => {
          s.image.onload = () => resolve();
          s.image.onerror = () => reject(new Error(`Could not load bomb sprites '${s.url}'.`));
          s.image.src = s.url;
        }),
    ),
  ).then(() => undefined);
  return loaded;
}

/** True when `faction`'s bomb sheet is loaded (the game then adds bombFall effects instead of a tracer). */
export function hasBombSheet(faction: string): boolean {
  return ready(faction as FactionId) !== null;
}

function ready(faction: FactionId): HTMLImageElement | null {
  const img = SHEETS[faction]?.image;
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

function blit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, row: number, col: number, x: number, y: number, scale: number): void {
  const size = CELL * scale;
  ctx.drawImage(img, col * CELL, row * CELL, CELL, CELL, x - size / 2, y - size / 2, size, size);
}

/**
 * A bomb falling from (x0, y0) to (x1, y1) in iso px at progress t (0..1): it accelerates, pitches from level to
 * nose-down, and its shadow slides along the ground from (gx, gy) to the impact.
 */
export function drawBombFall(
  ctx: CanvasRenderingContext2D,
  faction: FactionId,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  gx: number,
  gy: number,
  t: number,
): boolean {
  const img = ready(faction);
  if (!img) return false;
  const f = t * t;
  const dx = x1 - gx;
  const dy = y1 - gy;
  const a = Math.atan2(dx, -dy);
  const col = Math.hypot(dx, dy) < 0.5 ? 4 : ((Math.round((a / (Math.PI * 2)) * FRAMES) % FRAMES) + FRAMES) % FRAMES;
  const row = ROW.pitch[Math.min(2, Math.floor(t * 3))] ?? ROW.pitch[0];
  ctx.save();
  ctx.globalAlpha = 0.35;
  blit(ctx, img, ROW.shadow, col, gx + dx * t, gy + dy * t, BOMB_SCALE);
  ctx.restore();
  blit(ctx, img, row, col, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, BOMB_SCALE);
  return true;
}

/** The large explosion, then the burning crater fading out, `age` seconds after impact. */
export function drawBombBlast(ctx: CanvasRenderingContext2D, faction: FactionId, x: number, y: number, age: number, ttl: number): boolean {
  const img = ready(faction);
  if (!img) return false;
  ctx.save();
  if (age < BLAST_SECONDS) {
    blit(ctx, img, ROW.blast, Math.min(FRAMES - 1, Math.floor((age / BLAST_SECONDS) * FRAMES)), x, y - 4, BLAST_SCALE);
  } else {
    const burn = age - BLAST_SECONDS;
    ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / 0.8));
    // Smoking crater (frames 0-3) once, then the fire in it (4-7) loops.
    const k = Math.floor(burn / 0.14);
    blit(ctx, img, ROW.crater, k < 4 ? k : 4 + (k % 4), x, y, BLAST_SCALE);
  }
  ctx.restore();
  return true;
}
