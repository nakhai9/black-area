import { CELL_SIZE, WORLD_SCALE } from '../constants';
import { ValueNoise, hash2 } from '../core/Random';
import { createCanvas } from '../render/Canvas';
import type { EarthData } from './EarthData';
import type { TileMap } from './TileMap';

/**
 * Tile-based ground. The Earth (real land, lakes, elevation and sea depth from NASA / Natural Earth data) has
 * been turned into the hidden grid of the game: every cell is one terrain tile (water, sand, grass, forest,
 * desert, rock, snow). The ground is painted tile by tile, crisp and flat-shaded like the building art:
 * tiles carry their own texture, shores get a beach strip and foam, mountains get hill-shading, and the sea
 * deepens with the real bathymetry. Chunks of CHUNK_CELLS × CHUNK_CELLS tiles are rendered on demand and cached.
 */
const CHUNK_CELLS = 16;
const TILE_PX = 20;
const CHUNK_PX = CHUNK_CELLS * TILE_PX;
const CACHE_LIMIT = 260;
/** Time budget per frame for painting new chunks (at least one is always painted). */
const BUILD_BUDGET_MS = 4;
/** Rows of the nearest unfinished chunk painted each frame even when the budget is spent (it always moves on). */
const MIN_ROWS_PER_FRAME = 16;
/** Unfinished chunks kept before those out of view are dropped. */
const PENDING_LIMIT = 24;
/** Below this zoom the quarter-size copies are drawn. */
const ZOOMED_OUT = 5;

type RGB = readonly [number, number, number];
const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

// Terrain codes follow TERRAIN_TYPES: 0 water, 1 sand, 2 grass, 3 forest, 4 desert, 5 rock, 6 snow.
// Red Alert 2 palette: deep mottled grass with bare-earth patches, orange-yellow desert sand, brown-orange rock,
// grey-white snow, and a dark navy sea whose shore is a black-green wet band.
const GRASS_A = rgb('#6ca044'); // a little lighter than RA2's so green-camo vehicles stand out
const GRASS_B = rgb('#86b852');
const DIRT = rgb('#a09058');
const FOREST_A = rgb('#45702e');
const FOREST_B = rgb('#568338');
const SAND = rgb('#dcc184');
const BEACH = rgb('#dcc68a');
const WET_SAND = rgb('#9a8c5e');
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

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export class TileTerrain {
  /** Painted chunks; `half` is a quarter-size copy used when zoomed out (much cheaper to draw). */
  private readonly cache = new Map<string, { full: HTMLCanvasElement; half: HTMLCanvasElement | null }>();
  /** Chunk keys drawn since the last sweep (see sweep()). */
  private readonly touched = new Set<string>();
  private readonly noise: ValueNoise;
  private readonly col: [number, number, number] = [0, 0, 0];
  /** Chunks being painted, a few rows per frame (see stepBuild). */
  private readonly pending = new Map<string, BuildJob>();

  constructor(
    private readonly map: TileMap,
    private readonly earth: EarthData,
    private readonly seed: number,
  ) {
    this.noise = new ValueNoise(seed + 91);
  }

  /** Size of a chunk in world px. */
  static readonly CHUNK_WORLD = CHUNK_CELLS * CELL_SIZE;

  /**
   * Draws the chunks that cover `view` (world rect) under the current ground transform. Chunks that are not
   * painted yet are handed to `fallback` (the smooth base texture) and are painted over the next frames.
   */
  draw(ctx: CanvasRenderingContext2D, view: { x: number; y: number; w: number; h: number }, zoom: number, fallback: (x: number, y: number, w: number, h: number) => void): void {
    const cw = TileTerrain.CHUNK_WORLD;
    const x0 = Math.max(0, Math.floor(view.x / cw));
    const y0 = Math.max(0, Math.floor(view.y / cw));
    const x1 = Math.min(Math.ceil(this.map.width / CHUNK_CELLS) - 1, Math.floor((view.x + view.w) / cw));
    const y1 = Math.min(Math.ceil(this.map.height / CHUNK_CELLS) - 1, Math.floor((view.y + view.h) / cw));
    const midX = (view.x + view.w / 2) / cw;
    const midY = (view.y + view.h / 2) / cw;

    const wanted: [number, number][] = [];
    for (let qy = y0; qy <= y1; qy++) for (let qx = x0; qx <= x1; qx++) wanted.push([qx, qy]);
    wanted.sort((a, b) => Math.hypot(a[0] + 0.5 - midX, a[1] + 0.5 - midY) - Math.hypot(b[0] + 0.5 - midX, b[1] + 0.5 - midY));

    const start = performance.now();
    let built = 0;
    for (const [qx, qy] of wanted) {
      const key = `${qx},${qy}`;
      let tile = this.cache.get(key);
      if (tile) {
        this.cache.delete(key); // refresh LRU position
      } else if (built === 0 || performance.now() - start < BUILD_BUDGET_MS) {
        // Painting a chunk takes longer than a frame's budget: it is done a few rows at a time over several
        // frames (no hitch while the camera pans); the smooth fallback shows until it is finished.
        let job = this.pending.get(key);
        if (!job) {
          job = this.startBuild(qx, qy);
          this.pending.set(key, job);
        }
        const canvas = this.stepBuild(job, start + BUILD_BUDGET_MS, built === 0 ? MIN_ROWS_PER_FRAME : 0);
        built++;
        if (canvas) {
          this.pending.delete(key);
          tile = { full: canvas, half: null };
        }
      }
      if (!tile) {
        fallback(qx * cw, qy * cw, cw, cw);
        continue;
      }
      this.cache.set(key, tile);
      this.touched.add(key);
      if (zoom < ZOOMED_OUT && !tile.half) {
        const { canvas: half, ctx: hctx } = createCanvas(CHUNK_PX / 2, CHUNK_PX / 2);
        hctx.imageSmoothingQuality = 'high';
        hctx.drawImage(tile.full, 0, 0, CHUNK_PX / 2, CHUNK_PX / 2);
        tile.half = half;
      }
      // A hair of overlap hides the seams that anti-aliased chunk borders would show on the diamond ground.
      ctx.drawImage(zoom < ZOOMED_OUT && tile.half ? tile.half : tile.full, qx * cw - 0.2, qy * cw - 0.2, cw + 0.4, cw + 0.4);
    }
    // Unfinished chunks the camera has left are dropped (restarted if it comes back).
    if (this.pending.size > PENDING_LIMIT) {
      const wantedKeys = new Set(wanted.map(([qx, qy]) => `${qx},${qy}`));
      for (const k of [...this.pending.keys()]) if (!wantedKeys.has(k)) this.pending.delete(k);
    }
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  /**
   * Drops every painted chunk that was not drawn since the previous sweep — ground the player has panned away
   * from. They are repainted on demand if the camera goes back.
   */
  sweep(): { dropped: number; freedMB: number } {
    let dropped = 0;
    let freed = 0;
    for (const [key, tile] of [...this.cache]) {
      if (this.touched.has(key)) continue;
      freed += (tile.full.width * tile.full.height + (tile.half ? tile.half.width * tile.half.height : 0)) * 4;
      tile.full.width = 0;
      tile.full.height = 0;
      if (tile.half) {
        tile.half.width = 0;
        tile.half.height = 0;
      }
      this.cache.delete(key);
      dropped++;
    }
    this.touched.clear();
    return { dropped, freedMB: freed / 1048576 };
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

  private base(t: number, fx: number, fy: number, n1: number, mott: number): void {
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
    // RA2 texture: coarse pixel grain plus a finer mottle (several noise scales), never a flat fill.
    const fine = this.noise.noise(fx * 1.7, fy * 1.7);
    let k = 1 + (n1 - 0.5) * 0.12 + (fine - 0.5) * 0.1;
    const blend = (q: RGB, w: number): void => {
      c[0] += (q[0] - c[0]) * w;
      c[1] += (q[1] - c[1]) * w;
      c[2] += (q[2] - c[2]) * w;
    };
    if (t === 2) {
      // Bare-earth patches worn into the grass, and tufts (light / dark flecks).
      const patch = this.noise.noise(fx * 0.55 + 31, fy * 0.55 + 17);
      if (patch > 0.68) blend(DIRT, smooth(0.68, 0.8, patch) * 0.75);
      if (n1 > 0.88) k += 0.16;
      else if (n1 < 0.1) k -= 0.18;
    } else if (t === 3) {
      // Undergrowth: dark dapples.
      if (n1 > 0.72) k -= 0.26;
      else if (n1 < 0.1) k += 0.1;
    } else if (t === 4) {
      // Dune ripples and darker ochre drifts with pebbles.
      k += Math.sin(fx * 5 + fy * 2.4 + mott * 6) * 0.05;
      const drift = this.noise.noise(fx * 0.7 + 7, fy * 0.7 + 3);
      if (drift > 0.62) blend(DESERT_DARK, smooth(0.62, 0.78, drift) * 0.55);
      if (n1 > 0.93) k -= 0.22;
    } else if (t === 5) {
      // Strata and cracks in the rock.
      k += Math.sin((fx + fy) * 6 + fine * 4) * 0.07;
      const crack = Math.abs(this.noise.noise(fx * 2.4, fy * 2.4) - 0.5);
      if (crack < 0.025) k -= 0.35;
    } else if (t === 6) {
      // Grey speckles of rock and scrub in the snow.
      if (n1 > 0.94) k -= 0.3;
    } else if (t === 1) {
      if (n1 > 0.9) k -= 0.14;
    }
    c[0] *= k;
    c[1] *= k;
    c[2] *= k;
  }

  /** Sets a chunk up for painting: the terrain codes, heights and sea depths around it, and an empty image. */
  private startBuild(qx: number, qy: number): BuildJob {
    const { map, earth } = this;
    const W = CHUNK_CELLS + 2;
    const T = new Uint8Array(W * W);
    const H = new Float32Array(W * W);
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        const cx = qx * CHUNK_CELLS + i - 1;
        const cy = qy * CHUNK_CELLS + j - 1;
        T[j * W + i] = map.codeAt(cx, cy);
        H[j * W + i] = map.heightAt(cx, cy);
      }
    }
    // Sea depth of every cell from the bathymetry of the Earth data (0 shallow … 1 deepest).
    const depth = new Float32Array(W * W);
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        if (T[j * W + i] !== 0) continue;
        const cx = qx * CHUNK_CELLS + i - 1;
        const cy = qy * CHUNK_CELLS + j - 1;
        const tx = Math.min(earth.width - 1, Math.max(0, Math.floor(((cx + 0.5) * CELL_SIZE) / WORLD_SCALE)));
        const ty = Math.min(earth.height - 1, Math.max(0, Math.floor(((cy + 0.5) * CELL_SIZE) / WORLD_SCALE)));
        depth[j * W + i] = (earth.depth[ty * earth.width + tx] ?? 0) / 255;
      }
    }

    const { canvas, ctx } = createCanvas(CHUNK_PX, CHUNK_PX);
    const img = ctx.createImageData(CHUNK_PX, CHUNK_PX);
    return { qx, qy, T, H, depth, canvas, ctx, img, row: 0 };
  }

  /**
   * Paints rows of a chunk until `until` (performance.now() ms), at least `minRows` of them; returns the finished
   * canvas once the last row is done, else null.
   */
  private stepBuild(job: BuildJob, until: number, minRows: number): HTMLCanvasElement | null {
    let rows = 0;
    while (job.row < CHUNK_PX && (rows < minRows || performance.now() < until)) {
      this.paintRow(job, job.row++);
      rows++;
    }
    if (job.row < CHUNK_PX) return null;
    job.ctx.putImageData(job.img, 0, 0);
    return job.canvas;
  }

  /** One pixel row `py` of a chunk. */
  private paintRow(job: BuildJob, py: number): void {
    const { qx, qy, T, H, depth } = job;
    const W = CHUNK_CELLS + 2;
    const out = job.img.data;
    const col = this.col;
    const seed = this.seed;
    {
      const j = Math.floor(py / TILE_PX) + 1;
      const v = ((py % TILE_PX) + 0.5) / TILE_PX;
      const cy = qy * CHUNK_CELLS + j - 1;
      const fy = cy + v;
      // Per tile (constant over its TILE_PX pixels): terrain codes around it and its colour variation.
      for (let i = 1; i <= CHUNK_CELLS; i++) {
        const here = j * W + i;
        const t = T[here] ?? 0;
        const cx = qx * CHUNK_CELLS + i - 1;
        const cellVar = hash2(cx, cy, seed + 11);
        const L = T[here - 1] ?? 0;
        const R = T[here + 1] ?? 0;
        const U = T[here - W] ?? 0;
        const D = T[here + W] ?? 0;
        const UL = T[here - W - 1] ?? 0;
        const UR = T[here - W + 1] ?? 0;
        const DL = T[here + W - 1] ?? 0;
        const DR = T[here + W + 1] ?? 0;
        // Hill-shading from the real elevation (light from the upper left of the screen = world -x).
        const gx = (H[here + 1] ?? 0) - (H[here - 1] ?? 0);
        const gy = (H[here + W] ?? 0) - (H[here - W] ?? 0);
        const shade = 1 + Math.max(-0.22, Math.min(0.22, gx * 0.00022 + gy * 0.00007)) + Math.min(0.08, ((H[here] ?? 0) / 6000) * 0.1);
        const d01 = depth[here] ?? 0;
        for (let sx = 0; sx < TILE_PX; sx++) {
          const px = (i - 1) * TILE_PX + sx;
          const u = (sx + 0.5) / TILE_PX;
          const fx = cx + u;
          const n1 = hash2((qx * CHUNK_PX + px) >> 1, (qy * CHUNK_PX + py) >> 1, seed + 5);
          const mott = clamp01(this.noise.noise(fx * 0.22, fy * 0.22) * 0.65 + cellVar * 0.35);
          // Smooth coastline: the shore follows a soft land / sea field interpolated between cell centres (with a
          // little noise), not the cell edges, so a staircase of cells reads as a rounded, natural coast. The game
          // grid (what is passable) is unchanged; only the painting differs by up to half a cell.
          const coastal = (t === 0 || L === 0 || R === 0 || U === 0 || D === 0 || UL === 0 || UR === 0 || DL === 0 || DR === 0) && (t !== 0 || L !== 0 || R !== 0 || U !== 0 || D !== 0 || UL !== 0 || UR !== 0 || DL !== 0 || DR !== 0);
          const f = coastal ? this.landField(T, W, i, j, u, v) + (this.noise.noise(fx * 1.6, fy * 1.6) - 0.5) * 0.22 : t === 0 ? 0 : 1;
          const land = f >= 0.5;
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
            col[0] *= shade;
            col[1] *= shade;
            col[2] *= shade;
          } else {
            // ---- sea: depth from the bathymetry, lighter coastal shelf, foam where it meets land
            const deep = clamp01(d01 * 1.7);
            const wave = Math.sin(fx * 7 + fy * 4.5 + mott * 5) * 0.03 + (n1 - 0.5) * 0.05;
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
              const foam = Math.max(smooth(0.06, 0.0, dL) * 0.5, dL > 0.13 && dL < 0.17 ? 0.18 : 0);
              col[0] += (FOAM[0] - col[0]) * foam;
              col[1] += (FOAM[1] - col[1]) * foam;
              col[2] += (FOAM[2] - col[2]) * foam;
            }
          }
  
          const o = (py * CHUNK_PX + px) * 4;
          out[o] = col[0];
          out[o + 1] = col[1];
          out[o + 2] = col[2];
          out[o + 3] = 255;
        }
      }
    }
  }
}

interface BuildJob {
  qx: number;
  qy: number;
  T: Uint8Array;
  H: Float32Array;
  depth: Float32Array;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
  /** Next pixel row to paint. */
  row: number;
}
