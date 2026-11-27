import { CELL_SIZE } from '../constants';
import { ValueNoise, hash2 } from '../core/Random';
import { CELL_METRES, RELIEF_LIFT } from './Relief';

/**
 * The ground painting of one terrain chunk (see TileTerrain), with no DOM: the same code runs on the main thread and
 * in the chunk workers (chunkWorker.ts), so chunks are painted in parallel off the main thread.
 */
export const CHUNK_CELLS = 16;
export const TILE_PX = 14;
export const CHUNK_PX = CHUNK_CELLS * TILE_PX;
/**
 * Raised ground (GroundLift): a chunk is painted flat with PAD extra cells all round, then warped so each pixel
 * shows the ground point lifted onto it (the lift reaches up to ~1.7 cells, from the neighbours of the chunk).
 */
export const PAD = 2;
export const SRC_CELLS = CHUNK_CELLS + 2 * PAD;
export const SRC_PX = SRC_CELLS * TILE_PX;
/** Corners of the lift grid per side. */
export const LV = SRC_CELLS + 1;

type RGB = readonly [number, number, number];
const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

// Terrain codes follow TERRAIN_TYPES: 0 water, 1 sand, 2 grass, 3 forest, 4 desert, 5 rock, 6 snow.
// Red Alert 2 palette: deep mottled grass with bare-earth patches, orange-yellow desert sand, brown-orange rock,
// grey-white snow, and a dark navy sea whose shore is a black-green wet band.
// RA2 temperate grass: bright yellow-green, a fine blade grain and darker clumps (see base()).
const GRASS_A = rgb('#8cae3c');
const GRASS_B = rgb('#a4c04e');
const GRASS_DARK = rgb('#6a8e30');
const DIRT = rgb('#b09c62');
/** RA2 dirt tracks worn into grass / desert: a pale packed centre with darker trodden edges. */
const TRAIL = rgb('#b4a06a');
const TRAIL_EDGE = rgb('#7a6a40');
const FOREST_A = rgb('#45702e');
const FOREST_B = rgb('#568338');
const SAND = rgb('#e2cc94');
const BEACH = rgb('#ead6a0');
const WET_SAND = rgb('#b0a070');
const DESERT_A = rgb('#d9b062');
const DESERT_B = rgb('#e6c47c');
const DESERT_DARK = rgb('#bf9450');
const ROCK_A = rgb('#8f7558');
const ROCK_B = rgb('#a68a68');
const SNOW_A = rgb('#eceef0');
const SNOW_B = rgb('#c9cdd2');
const SEA_SHALLOW = rgb('#3b6f9a');
const SEA_MID = rgb('#2a5582');
const SEA_DEEP = rgb('#1b3a68');
const SEA_COAST = rgb('#3d6670');
const FOAM = rgb('#c8dade');
const CLIFF = rgb('#4f4232');

/**
 * RA2 pixel grain (about −0.8 … 0.6) at cell position (fx, fy): one value per world px (2×2 texture px, so it survives
 * the quarter-size copy drawn when zoomed out), plus sparse dark blade specks and light glints like the original tiles.
 */
const grain = (fx: number, fy: number): number => {
  const gx = Math.floor(fx * CELL_SIZE);
  const gy = Math.floor(fy * CELL_SIZE);
  // One integer hash: its low bits give the grain, its high bits the speck (cheap: this runs for every painted pixel).
  let h = Math.imul(gx, 374761393) ^ Math.imul(gy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  const s = (h >>> 24) / 256;
  return (h & 0xffff) / 65536 - 0.5 + (s < 0.14 ? -0.3 : s > 0.92 ? 0.15 : 0);
};

const clamp01 =(t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---- Shaded relief: the real elevation, smoothed between cell centres, lit like a 3D surface.
/** Light from the upper left of the screen (world −x, a little −y) and fairly high: x, y on the ground, z up. */
const SUN = (() => {
  const v = [-0.62, -0.28, 0.73];
  const n = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / n, v[1]! / n, v[2]! / n] as const;
})();
/** How strongly the lighting changes the ground colour (0: flat, 1: full). */
const RELIEF_STRENGTH = 0.6;
/** Snow caps: from SNOW_FROM metres the ground whitens, fully white by SNOW_FULL (a little noise on the line). */
const SNOW_FROM = 3700;
const SNOW_FULL = 4700;
/** Steep slopes show bare rock (slope = rise / run as drawn). */
const ROCK_SLOPE = 0.55;
const ROCK_FULL = 1.1;
const BARE_ROCK = rgb('#8a7c6c');
/** Dirt tracks (see trail()): noise frequency per cell (about one bend every ~20 cells), half-width in cells, and the
 * coarse region noise above which tracks appear (frequency per cell, threshold). */
const TRAIL_SCALE = 0.05;
const TRAIL_WIDTH = 1;
const TRAIL_REGION = 0.012;
const TRAIL_REGION_MIN = 0.4;
const SNOWCAP = rgb('#f1f3f6');
// Farmland on grass: paddy rice (lush green, flooded sheen) and wheat (golden), split into plots by earthen dikes.
const RICE_A = rgb('#6fb43c');
const RICE_B = rgb('#88c84a');
const RICE_WATER = rgb('#5f8f86');
const WHEAT_A = rgb('#d8b452');
const WHEAT_B = rgb('#e8c868');
const WHEAT_DRY = rgb('#c49a40');
const DIKE = rgb('#8a7a4a');
/** Plot size in cells. */
const FARM_PLOT = 4;
/** Coarse noise scale / threshold choosing which grassland regions are farmed. */
const FARM_REGION = 0.035;
const FARM_MIN = 0.62;

/**
 * Height (m) and slope (m per cell, along x and y) at a point between cell centres (array coords: cell (i, j) centre at
 * (i, j)), all three blended bilinearly from the cell centres: the shading is smooth across cells.
 */
const between = { h: 0, gx: 0, gy: 0 };
function sampleRelief(H: Float32Array, GX: Float32Array, GY: Float32Array, W: number, x: number, y: number): void {
  const cx = x < 0 ? 0 : x > W - 1 ? W - 1 : x;
  const cy = y < 0 ? 0 : y > W - 1 ? W - 1 : y;
  const x0 = Math.min(W - 2, Math.floor(cx));
  const y0 = Math.min(W - 2, Math.floor(cy));
  const tx = cx - x0;
  const ty = cy - y0;
  const i00 = y0 * W + x0;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  const mix = (A: Float32Array): number => A[i00]! * w00 + A[i00 + 1]! * w10 + A[i00 + W]! * w01 + A[i00 + W + 1]! * w11;
  between.h = mix(H);
  between.gx = mix(GX);
  between.gy = mix(GY);
}

/** Everything a chunk's painting needs (gathered on the main thread from the map, the Earth data and the lift). */
export interface ChunkData {
  qx: number;
  qy: number;
  T: Uint8Array;
  H: Float32Array;
  /** Slope (m per cell) at each cell centre along x / y. */
  GX: Float32Array;
  GY: Float32Array;
  depth: Float32Array;
  /** Lift (iso px) at the LV x LV cell corners of the painted area. */
  L: Float32Array;
}

/** A chunk being painted: its data, the flat painting (SRC_PX square, PAD cells wider all round) and the output. */
export interface PaintJob extends ChunkData {
  src: Uint8ClampedArray;
  /** CHUNK_PX × CHUNK_PX RGBA output (the warped painting). */
  out: Uint8ClampedArray;
  /** Next pixel row to paint (of `src`). */
  row: number;
  /** Next output row to warp (of `out`). */
  warpRow: number;
  /** Per flat pixel (SRC_PX²): signed distance to the waterline, encoded (see SHORE_NONE); for the surf (ShoreWaves). */
  shoreSrc: Uint8Array;
  /** The same per output pixel (CHUNK_PX², warped like the painting). */
  shore: Uint8Array;
  /** Some pixel of the chunk lies on a coast. */
  hasShore: boolean;
}

/**
 * Waterline distance map: 255 = not near a coast; else round((d + 0.5) × 254), d = cells from the (smooth) waterline,
 * > 0 out to sea, < 0 up the beach (|d| ≤ 0.5).
 */
export const SHORE_NONE = 255;

export const paintJob = (d: ChunkData): PaintJob => ({ ...d, src: new Uint8ClampedArray(SRC_PX * SRC_PX * 4), out: new Uint8ClampedArray(CHUNK_PX * CHUNK_PX * 4), row: 0, warpRow: 0, shoreSrc: new Uint8Array(SRC_PX * SRC_PX).fill(SHORE_NONE), shore: new Uint8Array(CHUNK_PX * CHUNK_PX), hasShore: false });

export class ChunkPainter {
  private readonly noise: ValueNoise;
  private readonly col: [number, number, number] = [0, 0, 0];

  constructor(
    seed: number,
    private readonly mapHeight: number,
  ) {
    this.noise = new ValueNoise(seed + 91);
  }

  /** Paints the whole chunk at once (worker side); returns its CHUNK_PX × CHUNK_PX RGBA pixels. */
  paint(d: ChunkData): { pixels: Uint8ClampedArray; shore: Uint8Array | null } {
    const job = paintJob(d);
    while (job.row < SRC_PX) this.paintRow(job, job.row++);
    while (job.warpRow < CHUNK_PX) this.warpRow(job, job.warpRow++);
    return { pixels: job.out, shore: job.hasShore ? job.shore : null };
  }

  /** Base colour of terrain `t` at cell position (fx, fy) (cell units, fractional) into this.col. */
  /**
   * Land colour at (u, v) inside chunk cell (i, j) of type `t`: where the land type changes (grass / sand / desert /
   * snow / forest / rock), the colours of the four nearest cells are blended with smoothstep weights, the sample point
   * wobbled by noise, so borders read as soft, irregular transitions instead of square cell edges. Sea cells count
   * as `t` here (the coast has its own beach blend).
   */
  private landBase(T: Uint8Array, W: number, i: number, j: number, u: number, v: number, t: number, fx: number, fy: number, n1: number, mott: number): void {
    const c = this.col;
    const ju = Math.min(0.999, Math.max(0.001, u + (this.noise.noise(fx * 1.3 + 17, fy * 1.3) - 0.5) * 0.7));
    const jv = Math.min(0.999, Math.max(0.001, v + (this.noise.noise(fx * 1.3, fy * 1.3 + 29) - 0.5) * 0.7));
    const gx = ju - 0.5;
    const gy = jv - 0.5;
    const i0 = gx < 0 ? i - 1 : i;
    const j0 = gy < 0 ? j - 1 : j;
    const tx = gx < 0 ? gx + 1 : gx;
    const ty = gy < 0 ? gy + 1 : gy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const typeAt = (a: number, b: number): number => {
      const k = T[b * W + a] ?? t;
      return k === 0 ? t : k;
    };
    const k00 = typeAt(i0, j0);
    const k10 = typeAt(i0 + 1, j0);
    const k01 = typeAt(i0, j0 + 1);
    const k11 = typeAt(i0 + 1, j0 + 1);
    if (k00 === t && k10 === t && k01 === t && k11 === t) {
      this.base(t, fx, fy, n1, mott);
      return;
    }
    const w = [(1 - sx) * (1 - sy), sx * (1 - sy), (1 - sx) * sy, sx * sy];
    const ks = [k00, k10, k01, k11];
    let r = 0;
    let g = 0;
    let b = 0;
    for (let q = 0; q < 4; q++) {
      const wq = w[q] ?? 0;
      if (wq <= 0) continue;
      const kq = ks[q] ?? t;
      // Same type as an earlier corner: add its weight there (one base() call per type).
      let dup = false;
      for (let e = 0; e < q; e++) if (ks[e] === kq) dup = true;
      if (dup) continue;
      let wsum = wq;
      for (let e = q + 1; e < 4; e++) if (ks[e] === kq) wsum += w[e] ?? 0;
      this.base(kq, fx, fy, n1, mott);
      r += c[0] * wsum;
      g += c[1] * wsum;
      b += c[2] * wsum;
    }
    c[0] = r;
    c[1] = g;
    c[2] = b;
  }

  /**
   * Land share (0 sea … 1 land) at (u, v) inside chunk cell (i, j): the four nearest cell centres' land / sea values,
   * blended with a smoothstep so the 0.5 contour runs as soft curves and diagonals instead of cell edges.
   */
  private landField(T: Uint8Array, W: number, i: number, j: number, u: number, v: number): number {
    const gx = u - 0.5;
    const gy = v - 0.5;
    const i0 = gx < 0 ? i - 1 : i;
    const j0 = gy < 0 ? j - 1 : j;
    const tx = gx < 0 ? gx + 1 : gx;
    const ty = gy < 0 ? gy + 1 : gy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const at = (a: number, b: number): number => ((T[b * W + a] ?? 1) === 0 ? 0 : 1);
    const top = at(i0, j0) + (at(i0 + 1, j0) - at(i0, j0)) * sx;
    const bottom = at(i0, j0 + 1) + (at(i0 + 1, j0 + 1) - at(i0, j0 + 1)) * sx;
    return top + (bottom - top) * sy;
  }

  /**
   * Dirt track share (0 none … 1 track centre) at cell position (fx, fy), and how much of it is the darker edge:
   * the tracks are the 0.5 contour of a domain-warped noise, so they wind and branch in continuous lines, and a
   * second, coarse noise keeps them to some regions only (open country is crossed by a few, not covered).
   */
  private trail(fx: number, fy: number): { core: number; edge: number } {
    const none = { core: 0, edge: 0 };
    const region = this.noise.noise(fx * TRAIL_REGION + 53, fy * TRAIL_REGION + 71);
    if (region < TRAIL_REGION_MIN) return none;
    const wx = fx + (this.noise.noise(fx * 0.09 + 11, fy * 0.09 + 5) - 0.5) * 5;
    const wy = fy + (this.noise.noise(fx * 0.09 + 41, fy * 0.09 + 23) - 0.5) * 5;
    // Distance to the contour in cells (value / slope), so a track keeps one width wherever the noise is steep or flat.
    const f = (a: number, b: number): number => this.noise.noise(a * TRAIL_SCALE + 97, b * TRAIL_SCALE + 13);
    const v = f(wx, wy);
    const g = Math.hypot(f(wx + 0.25, wy) - v, f(wx, wy + 0.25) - v) * 4 + 1e-4;
    const d = Math.abs(v - 0.5) / g + (this.noise.noise(fx * 2.1, fy * 2.1 + 7) - 0.5) * 0.35;
    const fade = smooth(TRAIL_REGION_MIN, TRAIL_REGION_MIN + 0.08, region);
    const w = TRAIL_WIDTH * (0.8 + this.noise.noise(fx * 0.3, fy * 0.3 + 61) * 0.4);
    if (d > w * 1.6) return none;
    return { core: smooth(w, w * 0.45, d) * fade, edge: smooth(w * 1.6, w, d) * (1 - smooth(w, w * 0.6, d)) * fade };
  }

  /**
   * Rice paddies and wheat fields on farmed grassland: a coarse noise picks farm regions; inside, the ground is cut
   * into FARM_PLOT-cell plots (every other row shifted half a plot), each one rice or wheat (rice likelier in the
   * tropics), with furrow stripes and a darker dike round each plot. Ground paint only: no effect on movement/building.
   */
  private farm(fx: number, fy: number, blend: (q: RGB, w: number) => void): void {
    const region = this.noise.noise(fx * FARM_REGION + 131, fy * FARM_REGION + 7);
    if (region < FARM_MIN) return;
    const fade = smooth(FARM_MIN, FARM_MIN + 0.05, region);
    const row = Math.floor(fy / FARM_PLOT);
    const sx = fx / FARM_PLOT + (row % 2) * 0.5;
    const col = Math.floor(sx);
    const h = hash2(col, row, 977);
    if (h < 0.15) return; // a few plots left fallow (plain grass)
    const lat = 90 - (fy / this.mapHeight) * 180;
    const riceChance = 0.25 + 0.5 * (1 - smooth(15, 35, Math.abs(lat)));
    const rice = hash2(row, col, 433) < riceChance;
    const u = sx - col;
    const v = fy / FARM_PLOT - row;
    const edge = Math.min(u, 1 - u, v, 1 - v) * FARM_PLOT; // cells from the plot border
    const along = hash2(col, row, 211) < 0.5 ? fx : fy; // furrow direction per plot
    const stripe = 0.5 + 0.5 * Math.sin(along * Math.PI * 3);
    if (rice) {
      blend(RICE_A, 0.85 * fade);
      blend(RICE_B, stripe * 0.5 * fade);
      blend(RICE_WATER, smooth(0.6, 0.85, this.noise.noise(fx * 0.9 + 3, fy * 0.9 + 1)) * 0.35 * fade);
    } else {
      blend(h > 0.6 ? WHEAT_B : WHEAT_A, 0.85 * fade);
      blend(WHEAT_DRY, stripe * 0.35 * fade);
    }
    blend(DIKE, smooth(0.14, 0.04, edge) * 0.8 * fade);
  }

  private base(t: number, fx: number, fy: number, _n1: number, mott: number): void {
    const c = this.col;
    let a: RGB;
    let b: RGB;
    switch (t) {
      case 1:
        a = SAND;
        b = BEACH;
        break;
      case 2:
        a = GRASS_A;
        b = GRASS_B;
        break;
      case 3:
        a = FOREST_A;
        b = FOREST_B;
        break;
      case 4:
        a = DESERT_A;
        b = DESERT_B;
        break;
      case 5:
        a = ROCK_A;
        b = ROCK_B;
        break;
      case 6:
        a = SNOW_A;
        b = SNOW_B;
        break;
      default:
        a = SEA_MID;
        b = SEA_MID;
    }
    const m = mott;
    c[0] = a[0] + (b[0] - a[0]) * m;
    c[1] = a[1] + (b[1] - a[1]) * m;
    c[2] = a[2] + (b[2] - a[2]) * m;
    // RA2 hand-painted look, smooth and clean: soft mottling at a few broad scales, no per-pixel grain or speckle.
    const soft = this.noise.noise(fx * 0.6, fy * 0.6);
    let k = 1 + (soft - 0.5) * 0.08;
    const blend = (q: RGB, w: number): void => {
      c[0] += (q[0] - c[0]) * w;
      c[1] += (q[1] - c[1]) * w;
      c[2] += (q[2] - c[2]) * w;
    };
    if (t === 2) {
      // RA2 grass texture: darker clumps, then bare-earth patches, dirt tracks and broad swathes.
      const clump = this.noise.noise(fx * 1.8 + 71, fy * 1.8 + 23);
      if (clump > 0.55) blend(GRASS_DARK, smooth(0.55, 0.8, clump) * 0.45);
      const patch = this.noise.noise(fx * 0.55 + 31, fy * 0.55 + 17);
      if (patch > 0.66) blend(DIRT, smooth(0.66, 0.84, patch) * 0.6);
      this.farm(fx, fy, blend);
      const tr = this.trail(fx, fy);
      if (tr.edge > 0) blend(TRAIL_EDGE, tr.edge * 0.45);
      if (tr.core > 0) blend(TRAIL, tr.core * 0.8);
      k += (this.noise.noise(fx * 0.25 + 5, fy * 0.25 + 9) - 0.5) * 0.12;
      k += grain(fx, fy) * 0.38;
    } else if (t === 3) {
      k += grain(fx, fy) * 0.3;
      // Canopy: soft dark hollows between lighter crowns.
      k -= smooth(0.35, 0.9, this.noise.fbm(fx * 0.45 + 3, fy * 0.45 + 41, 2)) * 0.12;
    } else if (t === 4) {
      // Gentle dune ripples and darker ochre drifts.
      k += Math.sin(fx * 2.2 + fy * 1.1 + mott * 6) * 0.018;
      const drift = this.noise.noise(fx * 0.7 + 7, fy * 0.7 + 3);
      if (drift > 0.6) blend(DESERT_DARK, smooth(0.6, 0.82, drift) * 0.45);
      const tr = this.trail(fx, fy);
      if (tr.edge > 0) blend(DESERT_DARK, tr.edge * 0.5);
      if (tr.core > 0) blend(TRAIL, tr.core * 0.35);
      k += grain(fx, fy) * 0.16;
    } else if (t === 1) {
      k += grain(fx, fy) * 0.16;
    } else if (t === 5) {
      // Smooth strata bands and the odd soft crack in the rock.
      k += Math.sin((fx + fy) * 3 + soft * 3) * 0.05;
      const crack = Math.abs(this.noise.noise(fx * 1.6, fy * 1.6) - 0.5);
      k -= smooth(0.03, 0.0, crack) * 0.2;
    } else if (t === 6) {
      // Wind-blown snow: soft blue-grey hollows.
      k -= smooth(0.4, 0.9, this.noise.fbm(fx * 0.4 + 19, fy * 0.4 + 2, 2)) * 0.06;
    }
    c[0] *= k;
    c[1] *= k;
    c[2] *= k;
  }

  /**
   * Output row `oy` of a chunk: every pixel shows the ground point q whose lifted picture lands on it. Lifting by
   * L iso px moves a point up the screen, i.e. by -2L world px along x and y, so q = p + 2L(q)(1, 1) / CELL_SIZE
   * cells, found by a few damped fixed-point steps.
   */
  warpRow(job: PaintJob, oy: number): void {
    const { L, src } = job;
    const out = job.out;
    const py = PAD + (oy + 0.5) / TILE_PX;
    const k = 2 / CELL_SIZE;
    const lift = (x: number, y: number): number => {
      const cx = x < 0 ? 0 : x > LV - 1.001 ? LV - 1.001 : x;
      const cy = y < 0 ? 0 : y > LV - 1.001 ? LV - 1.001 : y;
      const x0 = Math.floor(cx);
      const y0 = Math.floor(cy);
      const tx = cx - x0;
      const ty = cy - y0;
      const i = y0 * LV + x0;
      const a = L[i]!;
      const b = L[i + 1]!;
      const c = L[i + LV]!;
      const d = L[i + LV + 1]!;
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    };
    for (let ox = 0; ox < CHUNK_PX; ox++) {
      const px = PAD + (ox + 0.5) / TILE_PX;
      let qx = px;
      let qy = py;
      for (let n = 0; n < 5; n++) {
        const s = lift(qx, qy) * k;
        qx += (px + s - qx) * 0.8;
        qy += (py + s - qy) * 0.8;
      }
      const sx = Math.min(SRC_PX - 1, Math.max(0, Math.floor(qx * TILE_PX)));
      const sy = Math.min(SRC_PX - 1, Math.max(0, Math.floor(qy * TILE_PX)));
      const si = (sy * SRC_PX + sx) * 4;
      const o = (oy * CHUNK_PX + ox) * 4;
      out[o] = src[si]!;
      out[o + 1] = src[si + 1]!;
      out[o + 2] = src[si + 2]!;
      out[o + 3] = 255;
      job.shore[o >> 2] = job.shoreSrc[si >> 2]!;
    }
  }

  /** One pixel row `py` of a chunk. */
  paintRow(job: PaintJob, py: number): void {
    const { qx, qy, T, H, GX, GY, depth } = job;
    const W = SRC_CELLS + 2;
    const out = job.src;
    const col = this.col;
    {
      const j = Math.floor(py / TILE_PX) + 1;
      const v = ((py % TILE_PX) + 0.5) / TILE_PX;
      const cy = qy * CHUNK_CELLS - PAD + j - 1;
      const fy = cy + v;
      // Per tile (constant over its TILE_PX pixels): terrain codes around it and its colour variation.
      for (let i = 1; i <= SRC_CELLS; i++) {
        const here = j * W + i;
        const t = T[here] ?? 0;
        const cx = qx * CHUNK_CELLS - PAD + i - 1;
        const L = T[here - 1] ?? 0;
        const R = T[here + 1] ?? 0;
        const U = T[here - W] ?? 0;
        const D = T[here + W] ?? 0;
        const UL = T[here - W - 1] ?? 0;
        const UR = T[here - W + 1] ?? 0;
        const DL = T[here + W - 1] ?? 0;
        const DR = T[here + W + 1] ?? 0;
        const d01 = depth[here] ?? 0;
        for (let sx = 0; sx < TILE_PX; sx++) {
          const px = (i - 1) * TILE_PX + sx;
          const u = (sx + 0.5) / TILE_PX;
          const fx = cx + u;
          // Smooth variation only (no per-pixel hash, no per-cell step): seamless ground with no grain or tile squares.
          const n1 = this.noise.noise(fx * 1.1 + 13, fy * 1.1 + 7);
          const mott = clamp01(this.noise.noise(fx * 0.22, fy * 0.22) * 0.8 + this.noise.noise(fx * 0.07 + 3, fy * 0.07 + 11) * 0.2);
          // Smooth coastline: the shore follows a soft land / sea field interpolated between cell centres (with a
          // little noise), not the cell edges, so a staircase of cells reads as a rounded, natural coast. The game
          // grid (what is passable) is unchanged; only the painting differs by up to half a cell.
          const coastal = (t === 0 || L === 0 || R === 0 || U === 0 || D === 0 || UL === 0 || UR === 0 || DL === 0 || DR === 0) && (t !== 0 || L !== 0 || R !== 0 || U !== 0 || D !== 0 || UL !== 0 || UR !== 0 || DL !== 0 || DR !== 0);
          const f = coastal ? this.landField(T, W, i, j, u, v) + (this.noise.noise(fx * 1.6, fy * 1.6) - 0.5) * 0.22 : t === 0 ? 0 : 1;
          const land = f >= 0.5;
          if (coastal && f > 0 && f < 1) {
            job.shoreSrc[py * SRC_PX + px] = Math.round(Math.min(1, Math.max(0, 1 - f)) * 254); // d + 0.5 = 1 - f
            job.hasShore = true;
          }
          // A sea cell painted as land takes beach sand; a land cell painted as sea is sea.
          const lt = t === 0 ? 1 : t;
          if (land) this.landBase(T, W, i, j, u, v, lt, fx, fy, n1, mott);

          if (land) {
            // ---- land: beach strip / cliff towards the sea, ragged blend into a different land type
            const dW = coastal ? f - 0.5 : 9; // cells from the (smooth) waterline
            if (dW < 9) {
              if (lt === 5) {
                const k = smooth(0.2, 0.0, dW);
                col[0] += (CLIFF[0] - col[0]) * k;
                col[1] += (CLIFF[1] - col[1]) * k;
                col[2] += (CLIFF[2] - col[2]) * k;
              } else if (lt !== 6) {
                const k = smooth(0.42, 0.14, dW + (n1 - 0.5) * 0.08);
                col[0] += (BEACH[0] - col[0]) * k;
                col[1] += (BEACH[1] - col[1]) * k;
                col[2] += (BEACH[2] - col[2]) * k;
                // RA2 shore: the sand darkens to a wet band right at the waterline.
                const wet = smooth(0.1, 0.0, dW + (n1 - 0.5) * 0.05) * 0.6;
                col[0] += (WET_SAND[0] - col[0]) * wet;
                col[1] += (WET_SAND[1] - col[1]) * wet;
                col[2] += (WET_SAND[2] - col[2]) * wet;
              }
            }
            // Shaded relief, per pixel: the height surface (smoothed between cell centres) gets a normal and is lit
            // by the sun, so ranges and plateaus read as soft 3D slopes instead of flat steps.
            sampleRelief(H, GX, GY, W, i + u - 0.5, j + v - 0.5);
            const h0 = between.h;
            const sx2 = between.gx * (RELIEF_LIFT / CELL_METRES);
            const sy2 = between.gy * (RELIEF_LIFT / CELL_METRES);
            const slope = Math.hypot(sx2, sy2);
            // Bare rock on steep ground, snow caps up high (snow settles less on the steepest faces).
            const rock = smooth(ROCK_SLOPE, ROCK_FULL, slope) * 0.6;
            if (rock > 0 && lt !== 0) {
              col[0] += (BARE_ROCK[0] - col[0]) * rock;
              col[1] += (BARE_ROCK[1] - col[1]) * rock;
              col[2] += (BARE_ROCK[2] - col[2]) * rock;
            }
            const snow = smooth(SNOW_FROM, SNOW_FULL, h0 + (mott - 0.5) * 500) * (1 - smooth(ROCK_FULL, ROCK_FULL * 1.8, slope) * 0.6);
            if (snow > 0) {
              col[0] += (SNOWCAP[0] - col[0]) * snow;
              col[1] += (SNOWCAP[1] - col[1]) * snow;
              col[2] += (SNOWCAP[2] - col[2]) * snow;
            }
            const nz = 1 / Math.sqrt(1 + sx2 * sx2 + sy2 * sy2);
            const lit = (-sx2 * SUN[0] - sy2 * SUN[1] + SUN[2]) * nz; // n · sun, n = (−sx, −sy, 1) normalised
            // Soft: the darkest shaded face keeps ~60 % of its colour, a face turned to the sun gains up to ~25 %.
            const shade = Math.min(1.25, Math.max(0.6, 1 + (lit / SUN[2] - 1) * RELIEF_STRENGTH));
            col[0] *= shade;
            col[1] *= shade;
            col[2] *= shade;
          } else {
            // ---- sea: depth from the bathymetry, lighter coastal shelf, foam where it meets land
            const deep = clamp01(d01 * 1.7);
            const wave = (n1 - 0.5) * 0.05;
            const a = deep < 0.5 ? SEA_SHALLOW : SEA_MID;
            const b = deep < 0.5 ? SEA_MID : SEA_DEEP;
            const k = deep < 0.5 ? deep * 2 : (deep - 0.5) * 2;
            col[0] = (a[0] + (b[0] - a[0]) * k) * (1 + wave);
            col[1] = (a[1] + (b[1] - a[1]) * k) * (1 + wave);
            col[2] = (a[2] + (b[2] - a[2]) * k) * (1 + wave);
            const dL = coastal ? 0.5 - f : 9; // cells from the (smooth) waterline
            if (dL < 9) {
              const shelf = smooth(0.55, 0.0, dL) * 0.85;
              col[0] += (SEA_COAST[0] - col[0]) * shelf;
              col[1] += (SEA_COAST[1] - col[1]) * shelf;
              col[2] += (SEA_COAST[2] - col[2]) * shelf;
              // Only the thin line at the water's edge is painted in: the rolling surf is animated over it (ShoreWaves).
              const foam = smooth(0.06, 0.0, dL) * 0.35;
              col[0] += (FOAM[0] - col[0]) * foam;
              col[1] += (FOAM[1] - col[1]) * foam;
              col[2] += (FOAM[2] - col[2]) * foam;
            }
          }
  
          const o = (py * SRC_PX + px) * 4;
          out[o] = col[0];
          out[o + 1] = col[1];
          out[o + 2] = col[2];
          out[o + 3] = 255;
        }
      }
    }
  }
}
