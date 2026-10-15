/**
 * Pre-drawn bullet sheet (4 × 4 cells of 256 × 140 px), shared by every gun in the game.
 * Row 0: the bullet in flight pointing right (+x), 4 frames; cell 4 (row 1, col 0) is the bullet striking;
 * cells 5–15: the impact — flash, fireball, then smoke drifting away.
 */
const CW = 256;
const CH = 140;
const COLS = 4;
const FLY_FRAMES = 4;
const IMPACT_FIRST = 5;
const IMPACT_FRAMES = 11;
/** Sheet px of the bullet's centre in a flight cell, and of the impact's centre in an impact cell. */
const BULLET_CX = 168;
const IMPACT_CX = 140;
const CY = 70;

/**
 * Bullet size (iso px per sheet px) and impact size per shooter, so a tank round dwarfs a rifle bullet. The impact
 * frames are ~160 sheet px wide: a soldier's hit stays under 5% of a soldier (a pin-prick spark), a tank's under 20%
 * of a tank (~2 iso px).
 */
export const BULLET_SIZES = {
  rifle: { bullet: 0.016, impact: 0.0008 },
  bunker: { bullet: 0.022, impact: 0.045 },
  autocannon: { bullet: 0.028, impact: 0.06 },
  aircraftAir: { bullet: 0.036, impact: 0.075 },
  aircraftGround: { bullet: 0.04, impact: 0.1 },
  tank: { bullet: 0.055, impact: 0.0125 },
} as const;
export type BulletSize = keyof typeof BULLET_SIZES;

/** Seconds a bullet takes to reach its target, and how long its impact plays. */
export const BULLET_FLIGHT_SECONDS = 0.16;
export const BULLET_IMPACT_SECONDS = 0.7;

const image = new Image();
const url = `${import.meta.env.BASE_URL}sprites/bullet.png`;
let loaded: Promise<void> | null = null;

/** Starts (once) and returns the bullet sheet download. */
export function loadBulletSprites(): Promise<void> {
  loaded ??= new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Could not load bullet sprites '${url}'.`));
    image.src = url;
  });
  return loaded;
}

/** True once the sheet is loaded (the game then fires bullets instead of tracers). */
export function hasBulletSheet(): boolean {
  return image.complete && image.naturalWidth > 0;
}

function cell(ctx: CanvasRenderingContext2D, index: number, cx: number, scale: number): void {
  const sx = (index % COLS) * CW;
  const sy = Math.floor(index / COLS) * CH;
  ctx.drawImage(image, sx, sy, CW, CH, -cx * scale, -CY * scale, CW * scale, CH * scale);
}

/** The bullet flying from (x0, y0) to (x1, y1) in iso px at progress t (0..1), turned along its path. */
export function drawBullet(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, t: number, age: number, size: BulletSize): void {
  if (!hasBulletSheet() || t > 1) return;
  ctx.save();
  ctx.translate(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
  cell(ctx, Math.floor(age * 40) % FLY_FRAMES, BULLET_CX, BULLET_SIZES[size].bullet);
  ctx.restore();
}

/** The impact `age` seconds after the hit: flash, fireball and smoke, fading out at the end. */
export function drawBulletImpact(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, ttl: number, size: BulletSize): void {
  if (!hasBulletSheet()) return;
  const frame = Math.min(IMPACT_FRAMES - 1, Math.floor((age / ttl) * IMPACT_FRAMES));
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = Math.min(1, ((ttl - age) / ttl) * 3);
  cell(ctx, IMPACT_FIRST + frame, IMPACT_CX, BULLET_SIZES[size].impact);
  ctx.restore();
}
