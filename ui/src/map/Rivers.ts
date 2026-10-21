import { CELL_SIZE } from '../constants';
import { ValueNoise } from '../core/Random';
import { geoToWorld } from './Geo';

/**
 * The great rivers, painted on the ground (art only: units, pathing and building are unchanged). Each course is a
 * hand-traced list of [lon, lat] points from source to mouth, smoothed (Catmull-Rom) and given small meanders; the
 * river widens from `from` to `to` cells downstream.
 */
export interface RiverDef {
  name: string;
  from: number;
  to: number;
  course: readonly (readonly [number, number])[];
}

export const RIVERS: readonly RiverDef[] = [
  {
    name: 'Nile',
    from: 0.7,
    to: 1.6,
    course: [
      [33.2, 0.5], [32.4, 2.5], [31.6, 4.8], [31.4, 7.5], [30.8, 9.5], [31.6, 12], [32.5, 15.6], [33.6, 17.7], [32.3, 19],
      [30.6, 19.3], [30.9, 20.8], [31.5, 21.8], [32.9, 24.1], [32.7, 25.7], [31.4, 27.2], [31.2, 30], [30.9, 31], [30.4, 31.45],
    ],
  },
  {
    name: 'Amazon',
    from: 0.8,
    to: 2.6,
    course: [
      [-74.6, -10.5], [-74.4, -8.4], [-73.6, -6], [-73.3, -4.5], [-71, -4.2], [-69.9, -4.2], [-67, -3.3], [-64.5, -3.5],
      [-60, -3.1], [-58.5, -3.3], [-56, -2.3], [-54.7, -2.4], [-52.5, -1.8], [-51, -0.6], [-49.8, 0.1],
    ],
  },
  {
    name: 'Yangtze',
    from: 0.6,
    to: 2,
    course: [
      [91, 33.5], [94, 33.2], [97, 33], [98.6, 30.5], [99.6, 27.6], [100.2, 26.8], [101.5, 26.4], [103, 26.5], [104.6, 28.8],
      [106.6, 29.6], [108.5, 30.8], [110.4, 31], [111.3, 30.7], [112.5, 30.1], [114.3, 30.6], [116, 29.8], [117, 30.5],
      [118.8, 32], [120, 32.1], [121.6, 31.6],
    ],
  },
  {
    name: 'Mississippi',
    from: 0.6,
    to: 1.8,
    course: [
      [-95.2, 47.2], [-94, 46.4], [-93.3, 45], [-92, 44.5], [-91.2, 43.3], [-90.8, 41.5], [-91.3, 40], [-90.2, 38.6],
      [-89.4, 37], [-90, 35.1], [-91, 33.5], [-90.9, 32.3], [-91.5, 31], [-90.1, 30], [-89.3, 29.2],
    ],
  },
  {
    name: 'Yenisei',
    from: 0.7,
    to: 2.2,
    course: [
      [96.5, 51.5], [94.4, 51.7], [92, 52.6], [91.5, 53.7], [92.8, 56], [93.3, 58], [92.2, 60], [90, 61.8], [88, 63.8],
      [87.6, 65.8], [86.5, 67.5], [86.2, 69.4], [83.5, 70.8], [82, 72],
    ],
  },
  {
    name: 'Amur',
    from: 0.8,
    to: 1.8,
    course: [
      [121.5, 53.3], [124, 53.6], [126.5, 52.5], [127.5, 50.3], [129.5, 49.4], [131, 47.8], [133, 48], [135, 48.5],
      [136.5, 49.5], [137, 50.5], [138, 52], [139.5, 52.8], [140.8, 53.2],
    ],
  },
  {
    name: 'Volga',
    from: 0.6,
    to: 1.8,
    course: [
      [33, 57.2], [35.9, 56.9], [38.3, 57.6], [39.9, 57.6], [41, 57.5], [44, 56.3], [46.5, 56], [49.1, 55.8], [49.5, 55],
      [48.5, 54.3], [50.1, 53.2], [48.5, 52], [46, 51.5], [45, 50], [44.5, 48.7], [46, 47.5], [48, 46.4], [48.6, 45.8],
    ],
  },
];

/** Curve points added between two course points. */
const SUBDIVIDE = 8;
/** Meander amplitude (cells) and wavelength (cells along the river). */
const MEANDER = 1.2;
const MEANDER_LEN = 9;
/** Wet, darker bank on each side (cells beyond the water's edge). */
const BANK = 0.6;
/** Bucket size (cells) of the segment index. */
const BIN = 16;

interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  wa: number;
  wb: number;
}

export class RiverLayer {
  private readonly bins = new Map<number, Segment[]>();
  private readonly cols: number;
  /** Result of at(): water share and bank share (0..1). */
  readonly hit = { water: 0, bank: 0 };

  constructor(gridWidth: number, seed: number) {
    this.cols = Math.ceil(gridWidth / BIN) + 1;
    const noise = new ValueNoise(seed + 313);
    for (const r of RIVERS) this.addRiver(r, noise);
  }

  private addRiver(r: RiverDef, noise: ValueNoise): void {
    const pts = r.course.map(([lon, lat]) => {
      const w = geoToWorld({ lon, lat });
      return [w.x / CELL_SIZE, w.y / CELL_SIZE] as const;
    });
    const line: [number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
      for (let s = 0; s < SUBDIVIDE; s++) {
        const t = s / SUBDIVIDE;
        const t2 = t * t;
        const t3 = t2 * t;
        const cr = (a: number, b: number, c: number, d: number): number =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        line.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    line.push([pts[pts.length - 1]![0], pts[pts.length - 1]![1]]);

    // Meanders: each point pushed sideways by a noise of the distance travelled.
    let along = 0;
    const bent = line.map(([x, y], i) => {
      const prev = line[Math.max(0, i - 1)]!;
      const next = line[Math.min(line.length - 1, i + 1)]!;
      along += i > 0 ? Math.hypot(x - prev[0], y - prev[1]) : 0;
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const len = Math.hypot(dx, dy) || 1;
      const off = (noise.noise(along / MEANDER_LEN, 0.5) - 0.5) * 2 * MEANDER;
      return [x - (dy / len) * off, y + (dx / len) * off, along] as const;
    });

    const total = along || 1;
    for (let i = 0; i < bent.length - 1; i++) {
      const a = bent[i]!;
      const b = bent[i + 1]!;
      const seg: Segment = {
        ax: a[0],
        ay: a[1],
        bx: b[0],
        by: b[1],
        wa: r.from + (r.to - r.from) * (a[2] / total),
        wb: r.from + (r.to - r.from) * (b[2] / total),
      };
      const pad = Math.max(seg.wa, seg.wb) + BANK + 1;
      const x0 = Math.floor((Math.min(seg.ax, seg.bx) - pad) / BIN);
      const x1 = Math.floor((Math.max(seg.ax, seg.bx) + pad) / BIN);
      const y0 = Math.floor((Math.min(seg.ay, seg.by) - pad) / BIN);
      const y1 = Math.floor((Math.max(seg.ay, seg.by) + pad) / BIN);
      for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) {
          const key = by * this.cols + bx;
          let list = this.bins.get(key);
          if (!list) this.bins.set(key, (list = []));
          list.push(seg);
        }
      }
    }
  }

  /** Is any river near cell (cx, cy)? Cheap test before calling at() per pixel. */
  near(cx: number, cy: number): boolean {
    return this.bins.has(Math.floor(cy / BIN) * this.cols + Math.floor(cx / BIN));
  }

  /** Water and bank share at cell position (fx, fy), into this.hit. */
  at(fx: number, fy: number): { water: number; bank: number } {
    const h = this.hit;
    h.water = 0;
    h.bank = 0;
    const list = this.bins.get(Math.floor(fy / BIN) * this.cols + Math.floor(fx / BIN));
    if (!list) return h;
    let best = Infinity;
    for (const s of list) {
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((fx - s.ax) * dx + (fy - s.ay) * dy) / l2));
      const px = s.ax + dx * t - fx;
      const py = s.ay + dy * t - fy;
      // Distance past the half-width: < 0 inside the water.
      const d = Math.sqrt(px * px + py * py) - (s.wa + (s.wb - s.wa) * t) / 2;
      if (d < best) best = d;
    }
    if (best > BANK) return h;
    h.water = best < -0.15 ? 1 : best > 0.1 ? 0 : (0.1 - best) / 0.25;
    h.bank = best <= 0 ? 0 : 1 - best / BANK;
    return h;
  }
}
