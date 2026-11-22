import { CELL_SIZE, ISO_X } from '../constants';
import { spriteUrl } from './spriteUrl';

/**
 * Ground scars (tools/blender/crater_render.py): 4 variants × 4 kinds (rows: shell, rocket, bomb, missile) of
 * CELL_W × CELL_H px, rendered from the game's 30° view. The impact point is the cell centre; the scar's outer edge
 * (its ejecta fading into the ground) spans DIAMETER_PX across.
 */
const CELL_W = 512;
const CELL_H = 320;
const VARIANTS = 4;
const DIAMETER_PX = (CELL_W * 2) / 2.2;

export type CraterKind = 'shell' | 'rocket' | 'bomb' | 'missile';
const ROW: Record<CraterKind, number> = { shell: 0, rocket: 1, bomb: 2, missile: 3 };
/** Outer radius of each kind's scar on the ground (world px). */
export const CRATER_RADIUS: Record<CraterKind, number> = { shell: 1.6 * CELL_SIZE, rocket: 1.9 * CELL_SIZE, bomb: 3.2 * CELL_SIZE, missile: 2.5 * CELL_SIZE };

const image = new Image();
let ready = false;
let loading = false;

function load(): void {
  if (loading) return;
  loading = true;
  image.onload = () => (ready = true);
  image.src = spriteUrl('craters.webp');
}

/**
 * Draws a scar centred on iso point (x, y): `radius` world px, `variant` 0..3, mirrored when `flip`; `alpha` fades it.
 * Upright (iso px) transform expected. False while the sheet is still loading.
 */
export function drawCrater(ctx: CanvasRenderingContext2D, x: number, y: number, kind: CraterKind, variant: number, radius: number, flip: boolean, alpha: number): boolean {
  load();
  if (!ready) return false;
  // A ground circle of `radius` world px is radius·√2·ISO_X iso px from its centre to the side.
  const k = (radius * Math.SQRT2 * ISO_X * 2) / DIAMETER_PX;
  const w = CELL_W * k;
  const h = CELL_H * k;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.imageSmoothingQuality = 'high';
  const sx = (((variant % VARIANTS) + VARIANTS) % VARIANTS) * CELL_W;
  const sy = ROW[kind] * CELL_H;
  if (flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(image, sx, sy, CELL_W, CELL_H, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else ctx.drawImage(image, sx, sy, CELL_W, CELL_H, x - w / 2, y - h / 2, w, h);
  ctx.globalAlpha = prev;
  return true;
}

/** A fresh scar still hot: an ember glow in the bowl and a thin haze of smoke rising, fading over `life` seconds. */
export function drawCraterHeat(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, age: number, life: number, seed: number): void {
  if (age >= life) return;
  const t = age / life;
  const r = radius * Math.SQRT2 * ISO_X * 0.38;
  // Embers: flickering orange glow, strongest right after the blast.
  const flicker = 0.75 + 0.25 * Math.sin(age * 23 + seed) * Math.sin(age * 7.3 + seed * 2);
  const glow = (1 - t) ** 2 * flicker;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,140,40,${0.55 * glow})`);
  g.addColorStop(0.5, `rgba(200,60,10,${0.25 * glow})`);
  g.addColorStop(1, 'rgba(120,20,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Smoke: a few soft grey puffs drifting up and out, thinning as the ground cools.
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const p = (age * 0.35 + i / 4 + (seed % 1)) % 1;
    const px = x + Math.sin(seed * 3 + i * 1.9 + p * 2) * r * 0.6;
    const py = y - p * r * 3.2;
    const pr = r * (0.45 + p * 0.9);
    const a = 0.22 * (1 - t) * Math.sin(Math.PI * p);
    const s = ctx.createRadialGradient(px, py, 0, px, py, pr);
    s.addColorStop(0, `rgba(58,55,52,${a})`);
    s.addColorStop(1, 'rgba(58,55,52,0)');
    ctx.fillStyle = s;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
