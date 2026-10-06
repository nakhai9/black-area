import { CELL_SIZE, ELEVATION_M_PER_UNIT, RELIEF_EXAGGERATION, WORLD_SCALE } from '../constants';
import { worldToIso } from '../core/IsoView';
import { lerp, smoothstep } from '../core/MathUtils';
import { ValueNoise, hash2 } from '../core/Random';
import { createCanvas } from '../render/Canvas';
import { type RGB, hexToRgb } from '../render/Color';
import type { Rect } from '../types';
import { type BiomeFields, sampleField } from './Biomes';
import type { EarthData } from './EarthData';
import type { TileMap } from './TileMap';
import type { TreeLayer } from './Trees';

/**
 * Red Alert 2 world-map palette: olive lowlands, khaki plateaus, red-brown
 * rock ridges, lavender snow, sandy-orange beaches and a dark violet sea.
 */
const ELEVATION_RAMP: readonly [number, string][] = [
  [0, '#a7a259'],
  [300, '#9e9b50'],
  [800, '#a8935a'],
  [1400, '#9c714a'],
  [2400, '#83584a'],
  [3600, '#8e8890'],
  [5000, '#dad6e8'],
];
const RAMP_STEP = 25;
const OLIVE_ALT = hexToRgb('#8f9548');
const FOREST = hexToRgb('#6b7834');
const DESERT = hexToRgb('#c9ad6c');
const TUNDRA = hexToRgb('#a29d7c');
const ICE = hexToRgb('#dcd8ea');
const SAND = hexToRgb('#dcb27a');
const SAND_EDGE = hexToRgb('#e2a565');
const ROCKY_SHORE = hexToRgb('#c3a0a6');
const OCEAN_SHALLOW = hexToRgb('#3b355f');
const OCEAN_DEEP = hexToRgb('#28223d');
const SHORE_GLOW = hexToRgb('#6d63a6');

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

/** High-zoom detail tiles: CHUNK world px rendered at DETAIL_SCALE x resolution. */
const DETAIL_MIN_ZOOM = 2;
const DETAIL_SCALE = 8;
const CHUNK = 64;
const DETAIL_CACHE_LIMIT = 96;
/** Time budget per frame for building new detail tiles (at least one is always built). */
const DETAIL_BUILD_BUDGET_MS = 6;
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
  private readonly detailNoise: ValueNoise;
  /** LRU cache of detail tiles keyed by "cx,cy". */
  private readonly detail = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly earth: EarthData,
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
    this.detailNoise = new ValueNoise(seed + 47);
    const { canvas, ctx } = createCanvas(this.texW, this.texH);
    this.canvas = canvas;
    this.paintRelief(ctx, earth, biomes);
    // Trees are drawn live as upright billboards (drawTrees), not into the ground textures.
    this.collectWaterSpots();
  }

  /**
   * Overlays crisp detail tiles for the visible area when zoomed in.
   * Missing tiles are built progressively within a small per-frame budget;
   * the base texture shows through until they are ready.
   */
  drawDetail(ctx: CanvasRenderingContext2D, view: Rect, zoom: number): void {
    if (zoom < DETAIL_MIN_ZOOM) return;
    const x0 = Math.max(0, Math.floor(view.x / CHUNK));
    const y0 = Math.max(0, Math.floor(view.y / CHUNK));
    const x1 = Math.min(Math.ceil(this.width / CHUNK) - 1, Math.floor((view.x + view.w) / CHUNK));
    const y1 = Math.min(Math.ceil(this.height / CHUNK) - 1, Math.floor((view.y + view.h) / CHUNK));
    const midX = (view.x + view.w / 2) / CHUNK;
    const midY = (view.y + view.h / 2) / CHUNK;

    const chunks: [number, number][] = [];
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) chunks.push([cx, cy]);
    const dist = (c: [number, number]): number => Math.hypot(c[0] + 0.5 - midX, c[1] + 0.5 - midY);
    chunks.sort((a, b) => dist(a) - dist(b));

    const start = performance.now();
    let built = 0;
    for (const [cx, cy] of chunks) {
      const key = `${cx},${cy}`;
      let tile = this.detail.get(key);
      if (tile) {
        this.detail.delete(key); // refresh LRU position
      } else if (built === 0 || performance.now() - start < DETAIL_BUILD_BUDGET_MS) {
        tile = this.buildDetailTile(cx, cy);
        built++;
      }
      if (!tile) continue;
      this.detail.set(key, tile);
      ctx.drawImage(tile, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
    }
    while (this.detail.size > DETAIL_CACHE_LIMIT) {
      const oldest = this.detail.keys().next().value;
      if (oldest === undefined) break;
      this.detail.delete(oldest);
    }
  }

  /** Animated glints on visible water. `view` is in world coordinates. */
  drawWaterShimmer(ctx: CanvasRenderingContext2D, view: Rect, time: number): void {
    ctx.fillStyle = '#a9a3e0';
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

  /** Renders one CHUNK x CHUNK world-px area at DETAIL_SCALE x resolution. */
  private buildDetailTile(cx: number, cy: number): HTMLCanvasElement {
    const size = CHUNK * DETAIL_SCALE;
    const { canvas, ctx } = createCanvas(size, size);
    const img = ctx.createImageData(size, size);
    const out = img.data;
    const { earth, texW: W, texH: H } = this;
    const ww = W / WATER_RES;
    const wh = H / WATER_RES;
    const land = [0, 0, 0];
    const water = [0, 0, 0];

    for (let py = 0; py < size; py++) {
      const wy = cy * CHUNK + (py + 0.5) / DETAIL_SCALE;
      for (let px = 0; px < size; px++) {
        const wx = cx * CHUNK + (px + 0.5) / DETAIL_SCALE;
        const tx = wx / WORLD_SCALE - 0.5;
        const ty = wy / WORLD_SCALE - 0.5;
        const raw = bilerp1(earth.land, W, H, tx, ty) / 255;
        const cov = smoothstep(0.4, 0.6, raw);
        bilerp3(this.landRgb, W, H, tx, ty, land);
        bilerp3(this.waterRgb, ww, wh, (tx + 0.5) / WATER_RES - 0.5, (ty + 0.5) / WATER_RES - 0.5, water);

        // Ground texture: mid-frequency mottling + fine speckle.
        const tex =
          1 +
          (this.detailNoise.noise(wx * 0.6, wy * 0.6) - 0.5) * 0.16 +
          (hash2(Math.floor(wx * 2), Math.floor(wy * 2), this.seed) - 0.5) * 0.08;
        const wave = 1 + (this.detailNoise.noise(wx * 0.15, wy * 0.5) - 0.5) * 0.1;
        // Thin bright foam just outside the waterline.
        const foam = raw > 0.15 && raw < 0.4 ? (1 - Math.abs(raw - 0.27) / 0.13) * 0.35 : 0;

        const o = (py * size + px) * 4;
        for (let c = 0; c < 3; c++) {
          const wcol = water[c] * wave + (235 - water[c]) * Math.max(0, foam);
          out[o + c] = wcol + (land[c] * tex - wcol) * cov;
        }
        out[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
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
function bilerp1(data: Uint8Array, w: number, h: number, x: number, y: number): number {
  const cx = Math.min(Math.max(x, 0), w - 1.001);
  const cy = Math.min(Math.max(y, 0), h - 1.001);
  const ix = cx | 0;
  const iy = cy | 0;
  const fx = cx - ix;
  const fy = cy - iy;
  const i = iy * w + ix;
  const top = data[i] + (data[i + 1] - data[i]) * fx;
  const bottom = data[i + w] + (data[i + w + 1] - data[i + w]) * fx;
  return top + (bottom - top) * fy;
}

/** Bilinear sample of an interleaved RGB byte grid into `out`. */
function bilerp3(data: Uint8ClampedArray, w: number, h: number, x: number, y: number, out: number[]): void {
  const cx = Math.min(Math.max(x, 0), w - 1.001);
  const cy = Math.min(Math.max(y, 0), h - 1.001);
  const ix = cx | 0;
  const iy = cy | 0;
  const fx = cx - ix;
  const fy = cy - iy;
  const i = (iy * w + ix) * 3;
  const j = i + w * 3;
  for (let c = 0; c < 3; c++) {
    const top = data[i + c] + (data[i + 3 + c] - data[i + c]) * fx;
    const bottom = data[j + c] + (data[j + 3 + c] - data[j + c]) * fx;
    out[c] = top + (bottom - top) * fy;
  }
}

const mixRgb = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

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
