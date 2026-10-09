/**
 * Pre-drawn air-launched missile sheet (16 × 9 cells of 64 px), shared by every aircraft that fires missiles.
 * Rows 0–1 / 2–3: the missile in level flight, exhaust frames A / B, 32 screen headings clockwise from N (0–15 in the
 * first row of the pair, 16–31 in the second); rows 4–5: diving poses; row 6: shadow; row 7: smoke puff (cols 0–7)
 * and small explosion (8–15); row 8: large explosion (0–7) and launch flash (8–15).
 */
const CELL = 64;
const DIRS = 32;
const PER_ROW = 16;
const ROW = { fly: [0, 2], puff: 7, smallBlast: 7, bigBlast: 8 } as const;
const FRAMES = 8;
/** Iso px per sheet px: the missile and its smoke, and the explosions. */
const MISSILE_SCALE = 0.085;
const BLAST_SCALE = 0.24;
/** Smoke puffs left behind along the flight path. */
const TRAIL_PUFFS = 5;
export const MISSILE_FLIGHT_SECONDS = 0.45;
export const MISSILE_BLAST_SECONDS = 0.6;

const image = new Image();
const url = `${import.meta.env.BASE_URL}sprites/missile-air.png`;
let loaded: Promise<void> | null = null;

/** Starts (once) and returns the missile sheet download. */
export function loadMissileSprites(): Promise<void> {
  loaded ??= new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Could not load missile sprites '${url}'.`));
    image.src = url;
  });
  return loaded;
}

/** True once the sheet is loaded (the game then adds missile effects instead of a tracer). */
export function hasMissileSheet(): boolean {
  return image.complete && image.naturalWidth > 0;
}

function blit(ctx: CanvasRenderingContext2D, row: number, col: number, x: number, y: number, scale: number, alpha = 1): void {
  const size = CELL * scale;
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, col * CELL, row * CELL, CELL, CELL, x - size / 2, y - size / 2, size, size);
}

/** The missile flying from (x0, y0) to (x1, y1) in iso px at progress t (0..1), with a fading smoke trail and a launch flash. */
export function drawMissile(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, t: number, age: number): void {
  if (!hasMissileSheet()) return;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const a = Math.atan2(dx, -dy);
  const dir = ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
  const f = t * (0.6 + 0.4 * t); // speeds up after launch
  ctx.save();
  for (let i = TRAIL_PUFFS; i >= 1; i--) {
    const pt = f - i * 0.07;
    if (pt <= 0) continue;
    const frame = Math.min(FRAMES - 1, Math.floor((i / TRAIL_PUFFS) * FRAMES));
    blit(ctx, ROW.puff, frame, x0 + dx * pt, y0 + dy * pt, MISSILE_SCALE, 0.8);
  }
  if (age < 0.16) blit(ctx, ROW.bigBlast, 8 + Math.floor((age / 0.16) * FRAMES), x0, y0, MISSILE_SCALE * 1.4);
  const flight = ROW.fly[Math.floor(age * 20) % 2] ?? ROW.fly[0];
  blit(ctx, flight + Math.floor(dir / PER_ROW), dir % PER_ROW, x0 + dx * f, y0 + dy * f, MISSILE_SCALE);
  ctx.restore();
}

/** The impact: a small burst on aircraft, the large explosion on the ground, `age` seconds after the hit. */
export function drawMissileBlast(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, ttl: number, air: boolean): void {
  if (!hasMissileSheet()) return;
  const frame = Math.min(FRAMES - 1, Math.floor((age / ttl) * FRAMES));
  ctx.save();
  if (air) blit(ctx, ROW.smallBlast, 8 + frame, x, y, BLAST_SCALE);
  else blit(ctx, ROW.bigBlast, frame, x, y - 3, BLAST_SCALE);
  ctx.restore();
}
