/**
 * Pre-drawn tank shell sheet (16 × 7 cells of 64 px), shared by every main battle tank.
 * Rows 0–1 / 2–3: the shell in flight with its tracer, frames A / B, 32 screen headings clockwise from N (0–15 in
 * the first row of the pair, 16–31 in the second); row 4: shadow; row 5: ground explosion (cols 0–7) and sparks off
 * armour (8–15); row 6: muzzle flash and dust (0–7) and the scorch mark left on the ground (8–15).
 */
const CELL = 64;
const DIRS = 32;
const PER_ROW = 16;
const ROW = { fly: [0, 2], blast: 5, muzzle: 6 } as const;
const FRAMES = 8;
/** Iso px per sheet px: shell and muzzle flash, and the impact. */
const SHELL_SCALE = 0.09;
const BLAST_SCALE = 0.2;
export const SHELL_FLIGHT_SECONDS = 0.22;
/** Impact: explosion or sparks over SHELL_BURST_SECONDS, then (on the ground) the scorch mark fades out. */
const SHELL_BURST_SECONDS = 0.45;
export const SHELL_IMPACT_SECONDS = 1.8;

const image = new Image();
const url = `${import.meta.env.BASE_URL}sprites/shell-tank.png`;
let loaded: Promise<void> | null = null;

/** Starts (once) and returns the shell sheet download. */
export function loadShellSprites(): Promise<void> {
  loaded ??= new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Could not load shell sprites '${url}'.`));
    image.src = url;
  });
  return loaded;
}

/** True once the sheet is loaded (the game then adds shell effects instead of a tracer). */
export function hasShellSheet(): boolean {
  return image.complete && image.naturalWidth > 0;
}

function blit(ctx: CanvasRenderingContext2D, row: number, col: number, x: number, y: number, scale: number, alpha = 1): void {
  const size = CELL * scale;
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, col * CELL, row * CELL, CELL, CELL, x - size / 2, y - size / 2, size, size);
}

/** The shell flying from (x0, y0) to (x1, y1) in iso px at progress t (0..1), with the muzzle flash at launch. */
export function drawShell(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, t: number, age: number): void {
  if (!hasShellSheet()) return;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dir = ((Math.round((Math.atan2(dx, -dy) / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
  ctx.save();
  if (age < 0.2) blit(ctx, ROW.muzzle, Math.floor((age / 0.2) * FRAMES), x0, y0, SHELL_SCALE * 1.5);
  const flight = ROW.fly[Math.floor(age * 25) % 2] ?? ROW.fly[0];
  blit(ctx, flight + Math.floor(dir / PER_ROW), dir % PER_ROW, x0 + dx * t, y0 + dy * t, SHELL_SCALE);
  ctx.restore();
}

/** The impact `age` seconds after the hit: sparks off armour, or an explosion that leaves a fading scorch mark. */
export function drawShellImpact(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, ttl: number, armour: boolean): void {
  if (!hasShellSheet()) return;
  ctx.save();
  if (age < SHELL_BURST_SECONDS) {
    const frame = Math.min(FRAMES - 1, Math.floor((age / SHELL_BURST_SECONDS) * FRAMES));
    blit(ctx, ROW.blast, (armour ? 8 : 0) + frame, x, y - 2, BLAST_SCALE);
  } else if (!armour) {
    const k = Math.min(FRAMES - 1, Math.floor((age - SHELL_BURST_SECONDS) / 0.12));
    blit(ctx, ROW.muzzle, 8 + k, x, y, BLAST_SCALE, Math.max(0, Math.min(1, (ttl - age) / 0.6)));
  }
  ctx.restore();
}
