import { createCanvas } from '../render/Canvas';
import { CHUNK_PX, SHORE_NONE } from './ChunkPainter';

/**
 * Animated surf on the coasts: waves rolling in and breaking on the shore, then the wash running up the beach.
 *
 * Built to cost almost nothing per frame:
 *  - the painter records, per chunk pixel, its distance to the waterline (only coastal chunks have one, see
 *    ChunkPainter SHORE_NONE); open sea and inland chunks get no surf at all;
 *  - for a coastal chunk on screen, FRAMES pictures of its foam are drawn once, at half size, and cached (LRU,
 *    CACHE_LIMIT chunks); building them is spread over frames (BUILD_PER_FRAME) so panning never stutters;
 *  - each frame then only draws two cached pictures per visible coastal chunk, cross-faded, so the motion is smooth
 *    at any frame rate although only FRAMES pictures exist;
 *  - zoomed out (where the surf could not be seen) nothing is drawn.
 */
const FRAMES = 8;
/** Seconds one wave takes to roll in and break. */
const PERIOD = 4.2;
/** Foam pictures are drawn at this share of the chunk size (the foam is soft: half size looks the same). */
const SCALE = 0.5;
const SIZE = Math.round(CHUNK_PX * SCALE);
/** Coastal chunks whose foam pictures are kept. */
const CACHE_LIMIT = 48;
/** New chunks' pictures built per frame at most, and the time they may take (ms): the rest wait for later frames. */
const BUILD_PER_FRAME = 2;
const BUILD_BUDGET_MS = 3;
/** Cells of sea from the waterline where waves are seen (the encoding covers ±0.5). */
const REACH = 0.48;

type Frames = HTMLCanvasElement[];
/** A chunk's foam being built, one picture at a time (so no frame ever pays for a whole chunk). */
type Building = { frames: Frames; dist: Float32Array; off: Float32Array; grain: Float32Array; active: number[] };

/** Smooth 0..1 step. */
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Cheap stable hash noise 0..1 for (x, y) integers. */
const hash = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

export class ShoreWaves {
  private readonly cache = new Map<string, Frames>();
  private readonly building = new Map<string, Building>();
  private built = 0;
  private buildStart = 0;

  /** Call once per frame before the chunks are drawn: resets the per-frame build budget. */
  beginFrame(): void {
    this.built = 0;
    this.buildStart = performance.now();
  }

  /** Drops a chunk's pictures (its ground was repainted). */
  forget(key: string): void {
    const f = this.cache.get(key);
    if (f) for (const c of f) c.width = c.height = 0;
    this.cache.delete(key);
    this.building.delete(key);
  }

  /**
   * Draws the surf of chunk `key` over its ground at (x, y, w, h) (world px, current ground transform). `shore` is the
   * chunk's waterline distance map (CHUNK_PX², SHORE_NONE where not coastal); `qx`, `qy` its chunk position (the waves
   * along a coast are out of step from place to place, as at a real shore).
   */
  draw(ctx: CanvasRenderingContext2D, key: string, shore: Uint8Array, qx: number, qy: number, x: number, y: number, w: number, h: number, now: number): void {
    let frames = this.cache.get(key);
    if (frames) {
      this.cache.delete(key);
      this.cache.set(key, frames);
    } else {
      if (this.built >= BUILD_PER_FRAME || (this.built > 0 && performance.now() - this.buildStart > BUILD_BUDGET_MS)) return;
      this.built++;
      let b = this.building.get(key);
      if (!b) {
        b = this.prepare(shore, qx, qy);
        this.building.set(key, b);
        return;
      }
      b.frames.push(this.picture(b, b.frames.length));
      if (b.frames.length < FRAMES) return;
      this.building.delete(key);
      frames = b.frames;
      this.cache.set(key, frames);
      while (this.cache.size > CACHE_LIMIT) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        this.forget(oldest);
      }
    }
    const p = ((now / 1000 / PERIOD) % 1) * FRAMES;
    const a = Math.floor(p) % FRAMES;
    const b = (a + 1) % FRAMES;
    const t = p - Math.floor(p);
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * (1 - t);
    ctx.drawImage(frames[a]!, x, y, w, h);
    ctx.globalAlpha = alpha * t;
    ctx.drawImage(frames[b]!, x, y, w, h);
    ctx.globalAlpha = alpha;
  }

  /** What every foam picture of a chunk needs (computed once). */
  private prepare(shore: Uint8Array, qx: number, qy: number): Building {
    const n = SIZE * SIZE;
    // Per pixel: signed distance to the waterline (cells; > 0 sea, < 0 beach), the wave's phase offset there and a
    // breakup value (foam is never a solid line).
    const dist = new Float32Array(n);
    const off = new Float32Array(n);
    const grain = new Float32Array(n);
    const step = CHUNK_PX / SIZE;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const s = shore[Math.floor(y * step) * CHUNK_PX + Math.floor(x * step)]!;
        const i = y * SIZE + x;
        dist[i] = s === SHORE_NONE ? 99 : s / 254 - 0.5;
        const gx = qx * SIZE + x;
        const gy = qy * SIZE + y;
        // Phase drifts slowly along the coast (a broad smooth field), so waves arrive at different moments.
        off[i] = (Math.sin(gx * 0.021 + gy * 0.013) * 0.5 + Math.sin(gx * 0.007 - gy * 0.017 + 1.3) * 0.5) * 0.5 + 0.5;
        grain[i] = (hash(gx >> 1, gy >> 1) * 0.6 + hash(gx, gy) * 0.4);
      }
    }
    // Only pixels near the waterline can show foam: the frames loop over those alone.
    const active: number[] = [];
    for (let i = 0; i < n; i++) if (dist[i]! <= REACH && dist[i]! >= -0.25) active.push(i);
    return { frames: [], dist, off, grain, active };
  }

  /** Foam picture `f` (of FRAMES) of a chunk. */
  private picture(b: Building, f: number): HTMLCanvasElement {
    const { dist, off, grain, active } = b;
    const train = (d: number, k: number, g: number): number => {
      const crest = REACH * (1 - k);
      const width = 0.03 + 0.05 * k;
      const x = (d - crest) / width;
      if (x > 3 || x < -3) return 0;
      const strength = smooth(0.05, 0.6, k) * (1 - smooth(0.88, 1, k));
      return Math.exp(-x * x) * strength * (g > 0.62 - 0.45 * strength ? 1 : 0.35);
    };
    {
      const { canvas, ctx } = createCanvas(SIZE, SIZE);
      const img = ctx.createImageData(SIZE, SIZE);
      const px = img.data;
      for (const i of active) {
        const d = dist[i]!;
        const q = (f / FRAMES + off[i]!) % 1; // this pixel's place in the wave cycle
        // Two wave trains half a cycle apart: a crest rolls shoreward, steepens, whitens and breaks at the waterline.
        let a = Math.max(train(d, q, grain[i]!), train(d, (q + 0.5) % 1, grain[i]!));
        // Swash: after the wave breaks a thin film of foam runs up the beach and drains back.
        if (d < 0.06) {
          const run = Math.sin(Math.PI * smooth(0.72, 1, q)) * 0.16; // how far up the beach the wash reaches now
          if (d > -run) a = Math.max(a, (0.55 - 0.4 * grain[i]!) * smooth(-run, -run + 0.05, d) * smooth(0.72, 0.85, q));
          // The breaking line at the water's edge, always a little white.
          a = Math.max(a, smooth(0.05, 0, Math.abs(d)) * 0.28 * (0.6 + 0.4 * grain[i]!));
        }
        if (a <= 0.02) continue;
        const o = i * 4;
        px[o] = 236;
        px[o + 1] = 246;
        px[o + 2] = 250;
        px[o + 3] = Math.min(255, a * 235);
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    }
  }
}
