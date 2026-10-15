import { CELL_SIZE, ELEVATION_M_PER_UNIT, MOUNTAIN_CREST, MOUNTAIN_PASS, RELIEF_EXAGGERATION, WORLD_SCALE } from '../constants';
import { worldToIso } from '../core/IsoView';
import { lerp, smoothstep } from '../core/MathUtils';
import { ValueNoise, hash2 } from '../core/Random';
import { createCanvas } from '../render/Canvas';
import { type RGB, hexToRgb, mixRgb } from '../render/Color';
import type { Rect } from '../types';
import { type BiomeFields, sampleField } from './Biomes';
import type { EarthData } from './EarthData';
import type { TileMap } from './TileMap';
import { TileTerrain } from './TileTerrain';
import type { TreeLayer } from './Trees';

/**
 * Red Alert 2 palette: deep green lowlands, ochre plateaus, brown-orange rock ridges, grey-white snow, sand
 * beaches with a dark wet band, and a dark navy sea.
 */
const ELEVATION_RAMP: readonly [number, string][] = [
  [0, '#6a9a3e'],
  [300, '#729c40'],
  [800, '#93964e'],
  [1400, '#9a7d52'],
  [2400, '#86664a'],
  [3600, '#8e8a86'],
  [5000, '#e4e6e8'],
];
const RAMP_STEP = 25;
const OLIVE_ALT = hexToRgb('#5c8f36');
const FOREST = hexToRgb('#45702e');
const DESERT = hexToRgb('#d9b062');
const TUNDRA = hexToRgb('#8a8a70');
const ICE = hexToRgb('#eceef0');
const SAND = hexToRgb('#dcc184');
const SAND_EDGE = hexToRgb('#9a8c5e');
const ROCKY_SHORE = hexToRgb('#8f7558');
const OCEAN_SHALLOW = hexToRgb('#3b6f9a');
const OCEAN_DEEP = hexToRgb('#1b3a68');
const SHORE_GLOW = hexToRgb('#3d6670');

/** Light from the north-east (x east, y south, z up). */
const LIGHT = (() => {
  const l = [1, -1, 1.4];
  const n = Math.hypot(l[0], l[1], l[2]);
  return [l[0] / n, l[1] / n, l[2] / n] as const;
})();

/** Margin (world px) so tree canopies crossing a tile edge are drawn. */
const TREE_MARGIN = 4;
const WATER_GLINT_CHANCE = (0.012 * (CELL_SIZE / 4) ** 2) / WORLD_SCALE ** 2;
/** Earth texels per grid cell. */
const TEXELS_PER_CELL = CELL_SIZE / WORLD_SCALE;

/** Mountain relief: bucketed by PEAK_BUCKET world px, drawn from PEAK_MIN_ZOOM. */
const PEAK_BUCKET = 224;
const PEAK_MIN_ZOOM = 0.8;
/** Peak height on screen: PEAK_BASE_PX plus one px per PEAK_M_PER_PX metres of real elevation (at least PEAK_MIN_M). */
const PEAK_BASE_PX = 6;
const PEAK_M_PER_PX = 450;
const PEAK_MIN_M = 2500;
/** Snow from this height up (more of the peak is white the higher it is). */
const PEAK_SNOW_M = 3200;

export interface Peak {
  x: number;
  y: number;
  ridge: { x: number; y: number }[];
  split: number;
  snowAt: number;
  tall: number;
  half: number;
  /** Face gradients in the peak's own coordinates, made on first draw. */
  shade: CanvasGradient | null;
  lit: CanvasGradient | null;
}

/** Trees are drawn from this zoom on. */
const DETAIL_MIN_ZOOM = 2;
/** Water colours are smooth, so they are kept at 1/4 resolution. */
const WATER_RES = 4;

/**
 * Paints the whole map once into an offscreen canvas: per-pixel smooth
 * relief in the RA2 palette, beaches, glowing shorelines and tree clumps.
 *
 * When zoomed in close, visible areas are re-rendered on demand as cached
 * high-resolution detail tiles (crisp coastline, ground texture, sharp trees),
 * so units and vehicles sit on a detailed battlefield.
 */
export class TerrainRenderer {
  readonly canvas: HTMLCanvasElement;
  /** World size in px (Earth texels × WORLD_SCALE). */
  readonly width: number;
  readonly height: number;
  /** Earth data size in texels (size of the base canvas). */
  readonly texW: number;
  readonly texH: number;
  private readonly waterSpots: { x: number; y: number; phase: number }[] = [];
  /** Shaded land colour per world px (no trees / water), for detail tiles. */
  private readonly landRgb: Uint8ClampedArray;
  /** Water colour at 1/WATER_RES resolution. */
  private readonly waterRgb: Uint8ClampedArray;
  /** The tile-by-tile ground painted for the visible area. */
  private readonly tiles: TileTerrain;

  constructor(
    earth: EarthData,
    private readonly map: TileMap,
    biomes: BiomeFields,
    private readonly trees: TreeLayer,
    private readonly seed: number,
  ) {
    this.texW = earth.width;
    this.texH = earth.height;
    this.width = earth.width * WORLD_SCALE;
    this.height = earth.height * WORLD_SCALE;
    this.landRgb = new Uint8ClampedArray(this.texW * this.texH * 3);
    this.waterRgb = new Uint8ClampedArray((this.texW / WATER_RES) * (this.texH / WATER_RES) * 3);
    this.tiles = new TileTerrain(map, earth, seed);
    const { canvas, ctx } = createCanvas(this.texW, this.texH);
    this.canvas = canvas;
    this.paintRelief(ctx, earth, biomes);
    // Trees are drawn live as upright billboards (drawTrees), not into the ground textures.
    this.collectWaterSpots();
    this.collectPeaks();
  }

  /**
   * Mountain relief to draw, bucketed by PEAK_BUCKET world px: crest peaks (a jagged silhouette in iso px offsets from
   * its foot — `ridge` runs from the left foot over the summit to the right foot, `split` is the summit's index,
   * `snowAt` the share of its height that is white) and pass cells (slopes).
   */
  private readonly peaks = new Map<number, Peak[]>();
  private readonly rocks = new Map<number, { cx: number; cy: number; kind: number }[]>();

  /** Walks the mountain grid once: a peak on about every other crest cell, sized by the real elevation there. */
  private collectPeaks(): void {
    const { map } = this;
    for (let cy = 0; cy < map.height; cy++) {
      for (let cx = 0; cx < map.width; cx++) {
        const code = map.mountain[map.index(cx, cy)];
        if (code === MOUNTAIN_PASS) {
          const key = Math.floor((cy * CELL_SIZE) / PEAK_BUCKET) * 100000 + Math.floor((cx * CELL_SIZE) / PEAK_BUCKET);
          const list = this.rocks.get(key);
          const item = { cx, cy, kind: code };
          if (list) list.push(item);
          else this.rocks.set(key, [item]);
          continue;
        }
        if (code !== MOUNTAIN_CREST) continue;
        const r = hash2(cx, cy, this.seed + 31);
        if ((cx + cy) % 2 === 1 && r < 0.6) continue;
        const x = (cx + 0.2 + r * 0.6) * CELL_SIZE;
        const y = (cy + 0.2 + hash2(cy, cx, this.seed + 32) * 0.6) * CELL_SIZE;
        this.addPeak(x, y, Math.max(PEAK_MIN_M, map.heightAt(cx, cy)) * (0.85 + r * 0.3), r);
      }
    }
  }

  private addPeak(x: number, y: number, m: number, r: number): void {
    const tall = PEAK_BASE_PX + m / PEAK_M_PER_PX;
    const half = tall * (0.75 + r * 0.45);
    // A rough ridge: a few shoulders up to the summit and down again, each nudged by a hash (no straight edges).
    const ridge: { x: number; y: number }[] = [{ x: -half, y: half * 0.12 }];
    const steps = 4;
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      const j = hash2(Math.floor(x) + s, Math.floor(y), this.seed + 40) - 0.5;
      ridge.push({ x: -half * (1 - f) + j * half * 0.08, y: -tall * Math.pow(f, 1.25) * (0.88 + j * 0.2) });
    }
    const split = ridge.length;
    ridge.push({ x: (r - 0.5) * half * 0.3, y: -tall });
    for (let s = steps - 1; s >= 1; s--) {
      const f = s / steps;
      const j = hash2(Math.floor(x) - s, Math.floor(y) + 3, this.seed + 41) - 0.5;
      ridge.push({ x: half * (1 - f) + j * half * 0.08, y: -tall * Math.pow(f, 1.1) * (0.84 + j * 0.2) });
    }
    ridge.push({ x: half, y: half * 0.12 });
    const snowAt = m >= PEAK_SNOW_M ? Math.min(0.75, 0.25 + (m - PEAK_SNOW_M) / 9000) : 0;
    const key = Math.floor(y / PEAK_BUCKET) * 100000 + Math.floor(x / PEAK_BUCKET);
    const peak: Peak = { x, y, ridge, split, snowAt, tall, half, shade: null, lit: null };
    const list = this.peaks.get(key);
    if (list) list.push(peak);
    else this.peaks.set(key, [peak]);
  }

  /**
   * Mountain ranges stand upright on the iso ground, back to front. Crest peaks are rough silhouettes, west face in shadow and east face lit (light from
   * the north-east), rock shading into snow up high; passes are worn earth slopes. Call with the "iso space" transform active.
   */
  drawMountains(ctx: CanvasRenderingContext2D, view: Rect, zoom: number, peaksOut: Peak[]): void {
    peaksOut.length = 0;
    if (zoom < PEAK_MIN_ZOOM) return;
    const m = CELL_SIZE * 6;
    for (let by = Math.floor((view.y - m) / PEAK_BUCKET); by <= Math.floor((view.y + view.h + m) / PEAK_BUCKET); by++) {
      for (let bx = Math.floor((view.x - m) / PEAK_BUCKET); bx <= Math.floor((view.x + view.w + m) / PEAK_BUCKET); bx++) {
        const key = by * 100000 + bx;
        for (const p of this.peaks.get(key) ?? []) peaksOut.push(p);
        // Slopes lie flat on the ground: under everything else.
        for (const r of this.rocks.get(key) ?? []) if (r.kind === MOUNTAIN_PASS) this.drawPass(ctx, r.cx, r.cy);
      }
    }
  }

  private drawPass(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const a = worldToIso(cx * CELL_SIZE, cy * CELL_SIZE);
    const b = worldToIso((cx + 1) * CELL_SIZE, cy * CELL_SIZE);
    const c = worldToIso((cx + 1) * CELL_SIZE, (cy + 1) * CELL_SIZE);
    const d = worldToIso(cx * CELL_SIZE, (cy + 1) * CELL_SIZE);
    ctx.fillStyle = hash2(cx, cy, this.seed + 60) < 0.5 ? 'rgba(138,104,70,0.55)' : 'rgba(156,120,82,0.55)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  drawPeak(ctx: CanvasRenderingContext2D, p: Peak): void {
    const o = worldToIso(p.x, p.y);
    const pts = p.ridge;
    const top = pts[p.split]!;
    const foot = { x: top.x * 0.4 + p.half * 0.1, y: p.half * 0.3 };
    ctx.save();
    ctx.translate(o.x, o.y);
    // Soft shadow at the foot.
    ctx.fillStyle = 'rgba(30,24,16,0.2)';
    ctx.beginPath();
    ctx.ellipse(p.half * 0.15, p.half * 0.16, p.half * 1.05, p.half * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    p.shade ??= this.faceGradient(ctx, p, false);
    p.lit ??= this.faceGradient(ctx, p, true);
    // Soft silhouette: the ridge runs as curves through the midpoints between its shoulders (same path cost as
    // straight lines, so no extra work per frame).
    const face = (from: number, to: number, fill: CanvasGradient): void => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(foot.x, foot.y);
      ctx.lineTo(pts[from]!.x, pts[from]!.y);
      for (let k = from + 1; k < to; k++) {
        const a = pts[k]!;
        const b = pts[k + 1]!;
        ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      ctx.lineTo(pts[to]!.x, pts[to]!.y);
      ctx.closePath();
      ctx.fill();
    };
    face(0, p.split, p.shade);
    face(p.split, pts.length - 1, p.lit);
    ctx.restore();
  }

  /** Rock shading into snow up high: the lit east face or the shaded west face of a peak (local coordinates). */
  private faceGradient(ctx: CanvasRenderingContext2D, p: Peak, light: boolean): CanvasGradient {
    const g = ctx.createLinearGradient(0, -p.tall, 0, p.half * 0.2);
    const snow = p.snowAt;
    if (snow > 0) {
      g.addColorStop(0, light ? '#f4f6f8' : '#c3cad3');
      g.addColorStop(snow * 0.9, light ? '#e6eaee' : '#aab3be');
      g.addColorStop(Math.min(1, snow + 0.08), light ? '#9b8366' : '#5f4d3b');
    } else {
      g.addColorStop(0, light ? '#a88c6a' : '#6a5643');
    }
    g.addColorStop(1, light ? '#7d6a4c' : '#4a3d2e');
    return g;
  }

  /**
   * Paints the ground tile by tile (see TileTerrain) for the visible area; chunks that are not ready yet show the
   * smooth Earth texture for a few frames. Call with the ground transform active.
   */
  drawTiles(ctx: CanvasRenderingContext2D, view: Rect, zoom: number): void {
    this.tiles.draw(ctx, view, zoom, (x, y, w, h) => {
      const k = WORLD_SCALE;
      const sx = Math.max(0, x / k);
      const sy = Math.max(0, y / k);
      const ex = Math.min(this.canvas.width, (x + w) / k);
      const ey = Math.min(this.canvas.height, (y + h) / k);
      if (ex > sx && ey > sy) ctx.drawImage(this.canvas, sx, sy, ex - sx, ey - sy, sx * k, sy * k, (ex - sx) * k, (ey - sy) * k);
    });
  }

  /** Animated glints on visible water. `view` is in world coordinates. */
  /** Housekeeping: see TileTerrain.sweep. */
  sweepChunks(): { dropped: number; freedMB: number } {
    return this.tiles.sweep();
  }

  drawWaterShimmer(ctx: CanvasRenderingContext2D, view: Rect, time: number): void {
    ctx.fillStyle = '#b4cad8';
    for (const s of this.waterSpots) {
      if (s.x < view.x - 10 || s.x > view.x + view.w + 10 || s.y < view.y - 10 || s.y > view.y + view.h + 10) continue;
      const k = Math.sin(time * 1.6 + s.phase);
      if (k < 0.4) continue;
      ctx.globalAlpha = (k - 0.4) * 0.45;
      const drift = Math.sin(time * 0.5 + s.phase) * 1.5;
      ctx.fillRect(s.x - 3 + drift, s.y, 5, 0.6);
      ctx.fillRect(s.x + 1 + drift, s.y + 2, 3, 0.6);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ relief

  private paintRelief(ctx: CanvasRenderingContext2D, earth: EarthData, biomes: BiomeFields): void {
    const W = this.texW;
    const H = this.texH;
    const gw = this.map.width;
    const gh = this.map.height;

    // Smoothed elevation (removes the 25 m quantisation steps → no terracing).
    const heights = new Float32Array(W * H);
    for (let i = 0; i < heights.length; i++) heights[i] = earth.elevation[i] * ELEVATION_M_PER_UNIT;
    boxBlur(heights, W, H, 1);
    boxBlur(heights, W, H, 1);

    // Distance-to-coast proxies: fine (beaches) and coarse (shore glow).
    const nearLand = new Float32Array(W * H);
    for (let i = 0; i < nearLand.length; i++) nearLand[i] = earth.land[i] / 255;
    boxBlur(nearLand, W, H, 2);
    boxBlur(nearLand, W, H, 2);
    const cover = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const px = Math.min(W - 1, Math.floor((x + 0.5) * TEXELS_PER_CELL));
        const py = Math.min(earth.height - 1, Math.floor((y + 0.5) * TEXELS_PER_CELL));
        cover[y * gw + x] = (earth.land[py * W + px] ?? 0) / 255;
      }
    }
    boxBlur(cover, gw, gh, 2);
    boxBlur(cover, gw, gh, 2);

    const ramp = buildRamp();
    const patches = new ValueNoise(this.seed + 21);
    const img = ctx.createImageData(W, H);
    const out = img.data;
    const k = RELIEF_EXAGGERATION;
    const flat = LIGHT[2];

    for (let y = 0; y < H; y++) {
      const lat = 90 - ((y + 0.5) / H) * 180;
      const tundra = smoothstep(57, 70, lat) * 0.7;
      const gy = (y + 0.5) / TEXELS_PER_CELL - 0.5;
      const up = y > 0 ? -W : 0;
      const down = y < H - 1 ? W : 0;

      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const gx = (x + 0.5) / TEXELS_PER_CELL - 0.5;
        const cov = earth.land[i] / 255;
        let r = 0;
        let g = 0;
        let b = 0;

        // Water: dark violet, glowing lighter along the shore.
        if (cov < 1) {
          const t = smoothstep(0, 0.4, earth.depth[i] / 255);
          const glow = smoothstep(0.02, 0.5, sampleField(cover, gw, gh, gx, gy)) * 0.75;
          r = lerp(lerp(OCEAN_SHALLOW[0], OCEAN_DEEP[0], t), SHORE_GLOW[0], glow);
          g = lerp(lerp(OCEAN_SHALLOW[1], OCEAN_DEEP[1], t), SHORE_GLOW[1], glow);
          b = lerp(lerp(OCEAN_SHALLOW[2], OCEAN_DEEP[2], t), SHORE_GLOW[2], glow);
        }

        // Land.
        if (cov > 0) {
          const h = heights[i];
          const ri = Math.min(ramp.length / 3 - 1, (h / RAMP_STEP) | 0) * 3;
          let lr = ramp[ri];
          let lg = ramp[ri + 1];
          let lb = ramp[ri + 2];

          const lowland = 1 - smoothstep(600, 1500, h);
          const patch = smoothstep(0.42, 0.62, patches.fbm(gx / 9, gy / 9, 2)) * lowland * 0.6;
          if (patch > 0) [lr, lg, lb] = mix3(lr, lg, lb, OLIVE_ALT, patch);
          const forest = sampleField(biomes.forest, gw, gh, gx, gy) * lowland;
          if (forest > 0) [lr, lg, lb] = mix3(lr, lg, lb, FOREST, forest * 0.7);
          const desert = sampleField(biomes.desert, gw, gh, gx, gy) * (1 - smoothstep(1800, 3000, h));
          if (desert > 0) [lr, lg, lb] = mix3(lr, lg, lb, DESERT, desert * 0.85);
          if (tundra > 0) [lr, lg, lb] = mix3(lr, lg, lb, TUNDRA, tundra * (1 - smoothstep(1500, 3000, h)));
          const ice = sampleField(biomes.ice, gw, gh, gx, gy);
          if (ice > 0) [lr, lg, lb] = mix3(lr, lg, lb, ICE, ice);

          // Beaches: sand on low coasts, pinkish rock on high ones.
          const shore = 1 - smoothstep(0.55, 0.93, nearLand[i]);
          if (shore > 0 && ice < 0.5) {
            const rocky = smoothstep(150, 500, h);
            const sand = mixRgb(mixRgb(SAND, SAND_EDGE, shore), ROCKY_SHORE, rocky);
            [lr, lg, lb] = mix3(lr, lg, lb, sand, Math.min(1, shore * 1.6));
          }

          // Hill-shading (Lambert, normal from central differences).
          const left = x > 0 ? heights[i - 1] : h;
          const right = x < W - 1 ? heights[i + 1] : h;
          const nx = -(right - left) * k;
          const ny = -(heights[i + down] - heights[i + up]) * k;
          const shade = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / Math.hypot(nx, ny, 1) / flat;
          const s = Math.min(1.3, Math.max(0.5, shade));

          r = lerp(r, lr * s, cov);
          g = lerp(g, lg * s, cov);
          b = lerp(b, lb * s, cov);
          this.landRgb[i * 3] = lr * s;
          this.landRgb[i * 3 + 1] = lg * s;
          this.landRgb[i * 3 + 2] = lb * s;
        } else {
          // Open water: land colour only matters right at the coast, so use beach sand.
          this.landRgb[i * 3] = SAND[0] * 0.92;
          this.landRgb[i * 3 + 1] = SAND[1] * 0.92;
          this.landRgb[i * 3 + 2] = SAND[2] * 0.92;
        }

        if (x % WATER_RES === 0 && y % WATER_RES === 0) {
          const t = smoothstep(0, 0.4, earth.depth[i] / 255);
          const glow = smoothstep(0.02, 0.5, sampleField(cover, gw, gh, gx, gy)) * 0.75;
          const wi = ((y / WATER_RES) * (W / WATER_RES) + x / WATER_RES) * 3;
          this.waterRgb[wi] = lerp(lerp(OCEAN_SHALLOW[0], OCEAN_DEEP[0], t), SHORE_GLOW[0], glow);
          this.waterRgb[wi + 1] = lerp(lerp(OCEAN_SHALLOW[1], OCEAN_DEEP[1], t), SHORE_GLOW[1], glow);
          this.waterRgb[wi + 2] = lerp(lerp(OCEAN_SHALLOW[2], OCEAN_DEEP[2], t), SHORE_GLOW[2], glow);
        }

        // 2×2 pixel grain for the hand-painted RA2 look.
        const grain = 1 + (hash2(x >> 1, y >> 1, this.seed) - 0.5) * 0.09;
        const o = i * 4;
        out[o] = r * grain;
        out[o + 1] = g * grain;
        out[o + 2] = b * grain;
        out[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ------------------------------------------------------------------ overlays

  /** Draws the trees of the TreeLayer that touch the given world rect. */
  /**
   * Trees stand upright on the iso ground: drawn as billboards at the screen position of their trunk,
   * back to front. Call with the "iso space" transform active (1 unit = 1 px at zoom 1).
   */
  drawTrees(ctx: CanvasRenderingContext2D, view: Rect, zoom: number): void {
    if (zoom < DETAIL_MIN_ZOOM) return;
    const { xs, ys, rs, tones } = this.trees;
    const m = TREE_MARGIN;
    const visible: number[] = [];
    this.trees.forEachIn(view.x - m, view.y - m, view.x + view.w + m, view.y + view.h + m, (i) => visible.push(i));
    visible.sort((p, q) => (xs[p] ?? 0) + (ys[p] ?? 0) - ((xs[q] ?? 0) + (ys[q] ?? 0)));
    for (const i of visible) {
      const iso = worldToIso(xs[i] ?? 0, ys[i] ?? 0);
      const r = rs[i] ?? 1;
      const cx = iso.x;
      const cy = iso.y - r * 1.2; // the canopy sits above the trunk
      ctx.fillStyle = 'rgba(25,30,10,0.4)';
      ctx.beginPath();
      ctx.ellipse(iso.x - r * 0.3, iso.y + r * 0.1, r * 1.2, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tones[i] === 0 ? '#3f5222' : '#4b5f28';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(70,92,38,0.9)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.35, cy + r * 0.2, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(160,180,90,0.45)';
      ctx.beginPath();
      ctx.arc(cx + r * 0.3, cy - r * 0.35, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private collectWaterSpots(): void {
    const { map } = this;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!map.isWater(x, y)) continue;
        const r = hash2(x, y, this.seed + 9);
        if (r < WATER_GLINT_CHANCE) this.waterSpots.push({ x: (x + 0.5) * CELL_SIZE, y: (y + 0.5) * CELL_SIZE, phase: r * 520 });
      }
    }
  }
}

// -------------------------------------------------------------------- helpers

function buildRamp(): Float32Array {
  const max = ELEVATION_RAMP[ELEVATION_RAMP.length - 1][0] + 1500;
  const n = Math.ceil(max / RAMP_STEP) + 1;
  const out = new Float32Array(n * 3);
  for (let s = 0; s < n; s++) {
    const m = s * RAMP_STEP;
    let j = 0;
    while (j < ELEVATION_RAMP.length - 2 && m > ELEVATION_RAMP[j + 1][0]) j++;
    const [m0, c0] = ELEVATION_RAMP[j];
    const [m1, c1] = ELEVATION_RAMP[j + 1];
    const t = Math.min(1, Math.max(0, (m - m0) / (m1 - m0)));
    const a = hexToRgb(c0);
    const b = hexToRgb(c1);
    out[s * 3] = lerp(a[0], b[0], t);
    out[s * 3 + 1] = lerp(a[1], b[1], t);
    out[s * 3 + 2] = lerp(a[2], b[2], t);
  }
  return out;
}

/** Bilinear sample of a single-channel byte grid. */
/** Bilinear sample of an interleaved RGB byte grid into `out`. */

function mix3(r: number, g: number, b: number, c: RGB, t: number): [number, number, number] {
  return [r + (c[0] - r) * t, g + (c[1] - g) * t, b + (c[2] - b) * t];
}

/** In-place separable box blur (radius r) on a float field. */
function boxBlur(data: Float32Array, w: number, h: number, r: number): void {
  const tmp = new Float32Array(Math.max(w, h));
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += data[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[x] = sum / span;
      sum += data[row + Math.min(w - 1, x + r + 1)] - data[row + Math.max(0, x - r)];
    }
    data.set(tmp.subarray(0, w), row);
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += data[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      tmp[y] = sum / span;
      sum += data[Math.min(h - 1, y + r + 1) * w + x] - data[Math.max(0, y - r) * w + x];
    }
    for (let y = 0; y < h; y++) data[y * w + x] = tmp[y];
  }
}
