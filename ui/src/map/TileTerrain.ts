import { CELL_SIZE, WORLD_SCALE } from '../constants';
import { createCanvas } from '../render/Canvas';
import type { EarthData } from './EarthData';
import type { TileMap } from './TileMap';
import type { GroundLift } from './GroundLift';

/**
 * Tile-based ground. The Earth (real land, lakes, elevation and sea depth from NASA / Natural Earth data) has
 * been turned into the hidden grid of the game: every cell is one terrain tile (water, sand, grass, forest,
 * desert, rock, snow). The ground is painted tile by tile, crisp and flat-shaded like the building art:
 * tiles carry their own texture, shores get a beach strip and foam, mountains get hill-shading, and the sea
 * deepens with the real bathymetry. Chunks of CHUNK_CELLS × CHUNK_CELLS tiles are rendered on demand and cached.
 */
import { CHUNK_CELLS, CHUNK_PX, ChunkPainter, LV, PAD, SRC_CELLS, SRC_PX, type ChunkData, type PaintJob, paintJob } from './ChunkPainter';

/** Painted chunks kept (LRU); the ones around the view are kept too, so panning finds them ready. */
const CACHE_LIMIT = 420;
/** Chunks painted ahead all round the view (in chunks), so the camera always pans onto finished ground. */
const AHEAD = 2;
/** Below this zoom the quarter-size copies are drawn. */
const ZOOMED_OUT = 5;
/** Quarter-size copies made per frame at most. */
const HALVES_PER_FRAME = 4;
/** Main-thread painting budget per frame, used only where Web Workers are unavailable. */
const BUILD_BUDGET_MS = 4;
const MIN_ROWS_PER_FRAME = 16;

type Tile = { full: HTMLCanvasElement; half: HTMLCanvasElement | null };
type View = { x: number; y: number; w: number; h: number };

export class TileTerrain {
  /** Painted chunks; `half` is a quarter-size copy used when zoomed out (much cheaper to draw). */
  private readonly cache = new Map<string, Tile>();
  /** Chunk keys drawn or kept ready since the last sweep (see sweep()). */
  private readonly touched = new Set<string>();
  /** Painted chunks whose ground changed (a building came or went): still drawn until their repaint is done. */
  private readonly stale = new Set<string>();
  /** Repaint count per chunk: a worker answer for an older version is thrown away. */
  private readonly version = new Map<string, number>();
  /** Chunks sent to a worker, with the version they were sent for. */
  private readonly inFlight = new Map<string, number>();
  /** Chunks waiting for a free worker, nearest the view first (rebuilt every frame). */
  private queue: [number, number][] = [];
  private readonly workers: { w: Worker; busy: boolean }[] = [];
  /** Main-thread painting (no Web Workers only). */
  private readonly painter: ChunkPainter;
  private readonly pending = new Map<string, PaintJob>();
  /** Waiters of prepare(): resolved once every chunk they need is painted. */
  private readonly waiters: { keys: string[]; done: () => void }[] = [];

  constructor(
    private readonly map: TileMap,
    private readonly earth: EarthData,
    seed: number,
    private readonly lift: GroundLift,
  ) {
    this.painter = new ChunkPainter(seed, map.height);
    try {
      // Every core but one paints ground (2 … 6 workers): chunks come in parallel and never cost the main thread a frame.
      const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
        w.postMessage({ t: 'init', seed, mapHeight: map.height });
        const slot = { w, busy: false };
        w.onmessage = (e: MessageEvent<{ key: string; pixels: Uint8ClampedArray }>) => {
          slot.busy = false;
          this.arrived(e.data.key, e.data.pixels);
          this.dispatch();
        };
        w.onerror = () => {
          slot.busy = false;
        };
        this.workers.push(slot);
      }
    } catch {
      this.workers.length = 0; // no module workers: the main thread paints, a few rows per frame
    }
  }

  /** Size of a chunk in world px. */
  static readonly CHUNK_WORLD = CHUNK_CELLS * CELL_SIZE;

  /** Chunks covering `view` (world rect) grown by `ahead` chunks, nearest its centre first. */
  private around(view: View, ahead: number): [number, number][] {
    const cw = TileTerrain.CHUNK_WORLD;
    const maxX = Math.ceil(this.map.width / CHUNK_CELLS) - 1;
    const maxY = Math.ceil(this.map.height / CHUNK_CELLS) - 1;
    const x0 = Math.max(0, Math.floor(view.x / cw) - ahead);
    const y0 = Math.max(0, Math.floor(view.y / cw) - ahead);
    const x1 = Math.min(maxX, Math.floor((view.x + view.w) / cw) + ahead);
    const y1 = Math.min(maxY, Math.floor((view.y + view.h) / cw) + ahead);
    const midX = (view.x + view.w / 2) / cw;
    const midY = (view.y + view.h / 2) / cw;
    const out: [number, number][] = [];
    for (let qy = y0; qy <= y1; qy++) for (let qx = x0; qx <= x1; qx++) out.push([qx, qy]);
    out.sort((a, b) => Math.hypot(a[0] + 0.5 - midX, a[1] + 0.5 - midY) - Math.hypot(b[0] + 0.5 - midX, b[1] + 0.5 - midY));
    return out;
  }

  /** Not painted (or outdated) and not already with a worker for its current version. */
  private needs(key: string): boolean {
    return (!this.cache.has(key) || this.stale.has(key)) && this.inFlight.get(key) !== (this.version.get(key) ?? 0);
  }

  /** Hands queued chunks to idle workers. */
  private dispatch(): void {
    for (const slot of this.workers) {
      if (slot.busy) continue;
      let next: [number, number] | undefined;
      while ((next = this.queue.shift())) if (this.needs(`${next[0]},${next[1]}`)) break;
      if (!next) return;
      const key = `${next[0]},${next[1]}`;
      const data = this.gather(next[0], next[1]);
      this.inFlight.set(key, this.version.get(key) ?? 0);
      slot.busy = true;
      slot.w.postMessage({ t: 'paint', key, data }, [data.T.buffer, data.H.buffer, data.GX.buffer, data.GY.buffer, data.depth.buffer, data.L.buffer]);
    }
  }

  /** A worker finished chunk `key`: into the cache (an answer for an outdated version is dropped). */
  private arrived(key: string, pixels: Uint8ClampedArray): void {
    const sent = this.inFlight.get(key);
    this.inFlight.delete(key);
    if (sent !== (this.version.get(key) ?? 0)) return;
    const { canvas, ctx } = createCanvas(CHUNK_PX, CHUNK_PX);
    ctx.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, CHUNK_PX, CHUNK_PX), 0, 0);
    this.store(key, canvas);
  }

  private store(key: string, canvas: HTMLCanvasElement): void {
    const old = this.cache.get(key);
    if (old) {
      old.full.width = old.full.height = 0;
      if (old.half) old.half.width = old.half.height = 0;
    }
    this.cache.delete(key);
    this.cache.set(key, { full: canvas, half: null });
    this.stale.delete(key);
    this.touched.add(key);
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i]!;
      if (w.keys.every((k) => this.cache.has(k) && !this.stale.has(k))) {
        this.waiters.splice(i, 1);
        w.done();
      }
    }
  }

  /** Queues the chunks of `view` and AHEAD chunks round it (nearest first) and starts the idle workers on them. */
  private request(view: View): [number, number][] {
    const all = this.around(view, AHEAD);
    this.queue = all.filter(([qx, qy]) => this.needs(`${qx},${qy}`));
    for (const [qx, qy] of all) this.touched.add(`${qx},${qy}`);
    this.dispatch();
    return all;
  }

  /**
   * Resolves once the ground of `view` and AHEAD chunks round it is painted (the loading screen waits for it, so the
   * first frame shows finished ground everywhere).
   */
  prepare(view: View): Promise<void> {
    const keys = this.request(view).map(([qx, qy]) => `${qx},${qy}`);
    if (this.workers.length === 0) {
      for (const k of keys) {
        if (this.cache.has(k)) continue;
        const [qx, qy] = k.split(',').map(Number) as [number, number];
        this.store(k, this.paintHere(paintJob(this.gather(qx, qy)), Infinity, 0)!);
      }
      return Promise.resolve();
    }
    if (keys.every((k) => this.cache.has(k) && !this.stale.has(k))) return Promise.resolve();
    return new Promise((done) => this.waiters.push({ keys, done }));
  }

  /**
   * Draws the chunks that cover `view` (world rect) under the current ground transform, and keeps the workers painting
   * the ground ahead of the camera. A chunk not painted yet (only after a far jump) is handed to `fallback` (the smooth
   * base texture) until its painting arrives.
   */
  draw(ctx: CanvasRenderingContext2D, view: View, zoom: number, fallback: (x: number, y: number, w: number, h: number) => void): void {
    const cw = TileTerrain.CHUNK_WORLD;
    this.request(view);
    const start = performance.now();
    let built = 0;
    let halves = 0;
    for (const [qx, qy] of this.around(view, 0)) {
      const key = `${qx},${qy}`;
      let tile = this.cache.get(key);
      if (tile) {
        this.cache.delete(key); // refresh LRU position
        this.cache.set(key, tile);
      }
      if (this.workers.length === 0 && (!tile || this.stale.has(key)) && (built === 0 || performance.now() - start < BUILD_BUDGET_MS)) {
        let job = this.pending.get(key);
        if (!job) {
          job = paintJob(this.gather(qx, qy));
          this.pending.set(key, job);
        }
        const canvas = this.paintHere(job, start + BUILD_BUDGET_MS, built === 0 ? MIN_ROWS_PER_FRAME : 0);
        built++;
        if (canvas) {
          this.pending.delete(key);
          this.store(key, canvas);
          tile = this.cache.get(key);
        }
      }
      if (!tile) {
        fallback(qx * cw, qy * cw, cw, cw);
        continue;
      }
      this.touched.add(key);
      // A few quarter-size copies per frame (a zoom-out would otherwise make every visible one at once); the full
      // picture is drawn until its copy exists.
      if (zoom < ZOOMED_OUT && !tile.half && halves++ < HALVES_PER_FRAME) {
        const { canvas: half, ctx: hctx } = createCanvas(CHUNK_PX / 2, CHUNK_PX / 2);
        hctx.imageSmoothingQuality = 'high';
        hctx.drawImage(tile.full, 0, 0, CHUNK_PX / 2, CHUNK_PX / 2);
        tile.half = half;
      }
      // A hair of overlap hides the seams that anti-aliased chunk borders would show on the diamond ground.
      ctx.drawImage(zoom < ZOOMED_OUT && tile.half ? tile.half : tile.full, qx * cw - 0.2, qy * cw - 0.2, cw + 0.4, cw + 0.4);
    }
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  /**
   * The ground of cells (x, y, w, d) changed (a building was placed or removed, so its lift levels): the chunks
   * whose painting can show those cells are repainted (the old picture stays until the new one is done).
   */
  invalidate(x: number, y: number, w: number, d: number): void {
    const r = PAD + 2;
    const qx0 = Math.floor((x - r) / CHUNK_CELLS);
    const qy0 = Math.floor((y - r) / CHUNK_CELLS);
    const qx1 = Math.floor((x + w + r) / CHUNK_CELLS);
    const qy1 = Math.floor((y + d + r) / CHUNK_CELLS);
    for (let qy = qy0; qy <= qy1; qy++) {
      for (let qx = qx0; qx <= qx1; qx++) {
        const key = `${qx},${qy}`;
        this.pending.delete(key);
        this.version.set(key, (this.version.get(key) ?? 0) + 1);
        if (this.cache.has(key)) this.stale.add(key);
      }
    }
  }

  /**
   * Drops every painted chunk that was neither drawn nor kept ready since the previous sweep — ground the player has
   * panned away from. They are repainted if the camera goes back.
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
      this.stale.delete(key);
      dropped++;
    }
    this.touched.clear();
    return { dropped, freedMB: freed / 1048576 };
  }

  /** Main-thread painting of a job until `until` (ms), at least `minRows` rows; the finished canvas, else null. */
  private paintHere(job: PaintJob, until: number, minRows: number): HTMLCanvasElement | null {
    let rows = 0;
    while (job.row < SRC_PX && (rows < minRows || performance.now() < until)) {
      this.painter.paintRow(job, job.row++);
      rows++;
    }
    while (job.row >= SRC_PX && job.warpRow < CHUNK_PX && (rows < minRows || performance.now() < until)) {
      this.painter.warpRow(job, job.warpRow++);
      rows++;
    }
    if (job.warpRow < CHUNK_PX) return null;
    const { canvas, ctx } = createCanvas(CHUNK_PX, CHUNK_PX);
    ctx.putImageData(new ImageData(job.out as Uint8ClampedArray<ArrayBuffer>, CHUNK_PX, CHUNK_PX), 0, 0);
    return canvas;
  }

  /** What chunk (qx, qy) needs to be painted: the terrain codes, heights, slopes and sea depths around it, and its lift. */
  private gather(qx: number, qy: number): ChunkData {
    const { map, earth } = this;
    const W = SRC_CELLS + 2;
    const T = new Uint8Array(W * W);
    const H = new Float32Array(W * W);
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        const cx = qx * CHUNK_CELLS - PAD + i - 1;
        const cy = qy * CHUNK_CELLS - PAD + j - 1;
        T[j * W + i] = map.codeAt(cx, cy);
        H[j * W + i] = map.reliefAt(cx, cy);
      }
    }
    // Sea depth of every cell from the bathymetry of the Earth data (0 shallow … 1 deepest).
    const depth = new Float32Array(W * W);
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        if (T[j * W + i] !== 0) continue;
        const cx = qx * CHUNK_CELLS - PAD + i - 1;
        const cy = qy * CHUNK_CELLS - PAD + j - 1;
        const tx = Math.min(earth.width - 1, Math.max(0, Math.floor(((cx + 0.5) * CELL_SIZE) / WORLD_SCALE)));
        const ty = Math.min(earth.height - 1, Math.max(0, Math.floor(((cy + 0.5) * CELL_SIZE) / WORLD_SCALE)));
        depth[j * W + i] = (earth.depth[ty * earth.width + tx] ?? 0) / 255;
      }
    }

    // Slope at every cell centre (central differences, one-sided at the border), for the shaded relief.
    const GX = new Float32Array(W * W);
    const GY = new Float32Array(W * W);
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        const l = i > 0 ? i - 1 : i;
        const r = i < W - 1 ? i + 1 : i;
        const u = j > 0 ? j - 1 : j;
        const d = j < W - 1 ? j + 1 : j;
        GX[j * W + i] = (H[j * W + r]! - H[j * W + l]!) / Math.max(1, r - l);
        GY[j * W + i] = (H[d * W + i]! - H[u * W + i]!) / Math.max(1, d - u);
      }
    }

    // Lift (iso px) at the cell corners of the painted area (corner 0 = its top-left).
    const L = new Float32Array(LV * LV);
    const vx0 = qx * CHUNK_CELLS - PAD;
    const vy0 = qy * CHUNK_CELLS - PAD;
    for (let j = 0; j < LV; j++) for (let i = 0; i < LV; i++) L[j * LV + i] = this.lift.vertex(vx0 + i, vy0 + j);
    return { qx, qy, T, H, GX, GY, depth, L };
  }
}
