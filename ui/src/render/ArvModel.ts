import { FACTIONS } from '../factions';
import type { FactionId } from '../types';
import { createCanvas } from './Canvas';
import { shade } from './Color';

/**
 * Armoured recovery vehicle as a detailed polygon model (hundreds of flat-shaded faces: extruded profiles, n-gon
 * cylinders, chamfered armour), painter-sorted and rendered on demand into 80 px picture cells (at RES× resolution,
 * cached), one per heading / pose — see RepairSheets.
 * Reference: tank-chassis ARV with a curved dozer blade at the bow and one long telescopic crane boom standing up into
 * the sky, its hook hanging from the tip; at work the boom leans out over the bow and the hook drops to the ground.
 */

/** Logical cell size (px, as the old sheets) and the resolution it is rendered at. */
export const ARV_CELL = 80;
const RES = 3;
const DIRS = 32;
/** Cell px per model unit along the ground axes, and per unit of height. */
export const K = 0.6;
export const KZ = 0.75;
/** Light from the upper right of the screen (world x, y, up). */
const LIGHT = norm([0.35, -0.55, 0.76]);
/** The camera looks down the (−1, −1, −h) direction: faces turned towards (1, 1, h) are visible. */
const VIEW = norm([1, 1, 1.25]);

export type V3 = [number, number, number];
export type P2 = [number, number];

function norm(v: readonly number[]): V3 {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
}
const X: V3 = [1, 0, 0];

interface Look {
  faction: FactionId;
  body: string;
  track: string;
  steel: string;
  rubber: string;
  stripe: string;
}

/** Each army's paint: no two alike, its team colour on the crane boom. */
function look(f: FactionId): Look {
  const stripe = FACTIONS[f].colors.primary;
  switch (f) {
    case 'usa':
      return { faction: f, body: '#a08c62', track: '#3a3630', steel: '#8a8478', rubber: '#26241f', stripe };
    case 'russia':
      return { faction: f, body: '#56683a', track: '#2e3028', steel: '#7a7c70', rubber: '#22231f', stripe };
    case 'china':
      return { faction: f, body: '#4a5a44', track: '#2c2e2a', steel: '#74786c', rubber: '#212320', stripe };
    case 'europe':
      return { faction: f, body: '#5c6650', track: '#30322e', steel: '#80847a', rubber: '#232421', stripe };
    default:
      return { faction: f, body: '#b39c6c', track: '#3c362c', steel: '#8c8270', rubber: '#28241e', stripe };
  }
}

// ------------------------------------------------------------------ geometry

/** A flat polygon of the model; `c` is a point inside its solid (to turn its normal outwards); `bias` lifts decals. */
interface Poly {
  pts: V3[];
  c: V3;
  color: string;
  bias?: number;
}

export class Mesh {
  readonly polys: Poly[] = [];
  readonly sparks: V3[] = [];

  /** Extrudes a 2D `profile` (side, up) from `a` to `b`: side walls and both end caps. */
  prism(a: V3, b: V3, profile: readonly P2[], color: string, cap = color): void {
    const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const u = norm(d);
    const flat = u[0] * u[0] + u[1] * u[1];
    const up: V3 = flat < 1e-6 ? X : norm([-u[2] * u[0], -u[2] * u[1], flat]);
    const side: V3 = [u[1] * up[2] - u[2] * up[1], u[2] * up[0] - u[0] * up[2], u[0] * up[1] - u[1] * up[0]];
    const at = (o: V3, [p, q]: P2): V3 => [o[0] + side[0] * p + up[0] * q, o[1] + side[1] * p + up[1] * q, o[2] + side[2] * p + up[2] * q];
    const ra = profile.map((q) => at(a, q));
    const rb = profile.map((q) => at(b, q));
    const mid = profile.reduce<P2>((m, q) => [m[0] + q[0] / profile.length, m[1] + q[1] / profile.length], [0, 0]);
    const c = at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], mid);
    for (let i = 0; i < profile.length; i++) {
      const j = (i + 1) % profile.length;
      this.polys.push({ pts: [ra[i]!, ra[j]!, rb[j]!, rb[i]!], c, color });
    }
    this.polys.push({ pts: ra, c, color: cap }, { pts: rb, c, color: cap });
  }

  /** Axis-aligned box from min / max corners (model units: x forward, y across, z up). */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string): void {
    const hy = (y1 - y0) / 2;
    const hz = (z1 - z0) / 2;
    this.prism([x0, (y0 + y1) / 2, (z0 + z1) / 2], [x1, (y0 + y1) / 2, (z0 + z1) / 2], [[-hy, -hz], [hy, -hz], [hy, hz], [-hy, hz]], color);
  }

  /** Box with every long edge chamfered by k (cast / welded armour look). */
  cbox(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, k: number, color: string): void {
    this.prism([x0, (y0 + y1) / 2, (z0 + z1) / 2], [x1, (y0 + y1) / 2, (z0 + z1) / 2], chamfer(y1 - y0, z1 - z0, k), color);
  }

  /** Bar of section w × t from `a` to `b`. */
  bar(a: V3, b: V3, w: number, t: number, color: string, k = 0): void {
    this.prism(a, b, k > 0 ? chamfer(w, t, k) : [[-w / 2, -t / 2], [w / 2, -t / 2], [w / 2, t / 2], [-w / 2, t / 2]], color);
  }

  /** Cylinder of radius r, n sides, from `a` to `b`. */
  cyl(a: V3, b: V3, r: number, color: string, n = 12, cap = color): void {
    this.prism(a, b, disc(r, n), color, cap);
  }

  /** Flat marking lying on a face (pts already on it), drawn just above it. */
  decal(pts: V3[], normal: V3, color: string, order: number): void {
    const c: V3 = [0, 0, 0];
    for (const p of pts) for (let i = 0; i < 3; i++) c[i]! += p[i]! / pts.length;
    this.polys.push({ pts, c: [c[0] - normal[0], c[1] - normal[1], c[2] - normal[2]], color, bias: 0.4 + order * 0.01 });
  }
}

/** Regular n-gon of radius r. */
export const disc = (r: number, n = 12): P2[] => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r] as P2);
/** Rectangle w × t with its corners cut by k. */
export const chamfer = (w: number, t: number, k: number): P2[] => [
  [-w / 2 + k, -t / 2], [w / 2 - k, -t / 2], [w / 2, -t / 2 + k], [w / 2, t / 2 - k], [w / 2 - k, t / 2], [-w / 2 + k, t / 2], [-w / 2, t / 2 - k], [-w / 2, -t / 2 + k],
];
export const star = (cx: number, cy: number, r: number): P2[] =>
  Array.from({ length: 10 }, (_, i) => {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.4 : r;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as P2;
  });
const ring = (cx: number, cy: number, r: number, n = 18): P2[] => disc(r, n).map(([x, y]) => [cx + x, cy + y] as P2);

/** Each army's own marking (painted on the hull sides and the cab roof). */
function insignia(f: FactionId): { poly: P2[]; color: string }[] {
  switch (f) {
    case 'usa':
      return [{ poly: star(0, 0, 1), color: '#f2f0e6' }];
    case 'russia':
      return [{ poly: star(0, 0, 1.12), color: '#f2f0e6' }, { poly: star(0, 0, 0.92), color: '#c8231e' }];
    case 'china':
      return [{ poly: star(0, 0, 1.12), color: '#f0c419' }, { poly: star(0, 0, 0.9), color: '#d0201a' }];
    case 'europe':
      return [
        { poly: ring(0, 0, 1.05), color: '#1f3f9a' },
        ...Array.from({ length: 12 }, (_, i) => ({ poly: star(Math.cos((i / 12) * Math.PI * 2) * 0.7, Math.sin((i / 12) * Math.PI * 2) * 0.7, 0.17), color: '#f2c94c' })),
      ];
    default:
      return [
        { poly: ring(0, 0, 1.05), color: '#1f8a44' },
        { poly: ring(-0.12, 0, 0.62), color: '#f2f0e6' },
        { poly: ring(0.06, 0, 0.52), color: '#1f8a44' },
        { poly: star(0.5, 0, 0.26), color: '#f2f0e6' },
      ];
  }
}

// ------------------------------------------------------------------ the model

export type ArvPose = { kind: 'drive'; frame: number } | { kind: 'work'; frame: number } | { kind: 'wreck' };

function build(L: Look, pose: ArvPose): Mesh {
  const m = new Mesh();
  const wreck = pose.kind === 'wreck';
  const body = wreck ? '#2c2a26' : L.body;
  const dark = wreck ? '#1c1a18' : L.track;
  const steel = wreck ? '#34302c' : L.steel;
  const rubber = wreck ? '#151412' : L.rubber;
  const step = pose.kind === 'drive' ? pose.frame * 0.4 : 0;

  // ---- running gear (both sides)
  for (const s of [-1, 1]) {
    const yi = s * 7.4;
    const yo = s * 11.6;
    // Track loop with rounded ends, and the track pads on its top run (they creep back frame by frame).
    const loop: P2[] = [];
    for (let i = 0; i <= 8; i++) loop.push([16.6 + Math.sin((i / 8) * Math.PI) * 3.3, 3.3 - Math.cos((i / 8) * Math.PI) * 3.3]);
    for (let i = 0; i <= 8; i++) loop.push([-16.6 - Math.sin((i / 8) * Math.PI) * 3.3, 3.3 + Math.cos((i / 8) * Math.PI) * 3.3]);
    m.prism([0, yi, 0], [0, yo, 0], loop, dark);
    for (let x = -16.4 + (step % 1.65); x < 16.4; x += 1.65) m.box(x, x + 0.8, yi - s * 0.05, yo + s * 0.05, 6.55, 6.95, shade(dark, 0.75));
    for (let x = -16.4 + (step % 1.65); x < 16.4; x += 1.65) m.box(x, x + 0.8, yi - s * 0.05, yo + s * 0.05, -0.3, 0.05, shade(dark, 0.75));
    // Road wheels: rubber tyre, steel disc, hub cap.
    for (let i = 0; i < 7; i++) {
      const x = -15 + i * 5;
      m.cyl([x, s * 10.5, 2.7], [x, s * 11.7, 2.7], 2.15, rubber, 16, shade(rubber, 1.3));
      m.cyl([x, s * 11.7, 2.7], [x, s * 11.95, 2.7], 1.55, steel, 16);
      m.cyl([x, s * 11.95, 2.7], [x, s * 12.2, 2.7], 0.6, shade(steel, 0.8), 8);
    }
    // Drive sprocket (rear) with teeth, idler (front), three return rollers.
    m.cyl([-19.4, s * 10.3, 4.3], [-19.4, s * 11.8, 4.3], 2.3, shade(steel, 0.8), 16);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + step;
      m.box(-19.4 + Math.cos(a) * 2.5 - 0.3, -19.4 + Math.cos(a) * 2.5 + 0.3, s * 10.4, s * 11.7, 4.3 + Math.sin(a) * 2.5 - 0.3, 4.3 + Math.sin(a) * 2.5 + 0.3, shade(steel, 0.7));
    }
    m.cyl([19, s * 10.3, 4], [19, s * 11.8, 4], 2.1, shade(steel, 0.85), 16);
    m.cyl([19, s * 11.8, 4], [19, s * 12.1, 4], 0.7, shade(steel, 0.7), 8);
    for (const x of [-8, 0, 8]) m.cyl([x, s * 10.2, 6.1], [x, s * 11.4, 6.1], 0.55, steel, 8);
    // Armoured side skirts in panels with bolt rows, front and rear mudguards.
    for (let i = 0; i < 6; i++) {
      const x0 = -18 + i * 6;
      m.cbox(x0, x0 + 5.8, s * 11.9 - 0.3, s * 11.9 + 0.3, 4.4, 7.9, 0.15, shade(body, i % 2 ? 0.9 : 0.97));
      if (!wreck) for (let b = 0; b < 4; b++) m.box(x0 + 0.8 + b * 1.4, x0 + 1.1 + b * 1.4, s * 12.2 - 0.05, s * 12.2 + 0.05, 7.3, 7.6, shade(body, 0.6));
    }
    m.bar([16, s * 9.6, 8], [20.5, s * 9.6, 7.4], 4.6, 0.4, shade(body, 0.85));
    m.bar([-20, s * 9.6, 8], [-21.6, s * 9.6, 6.6], 4.6, 0.4, shade(body, 0.85));
    if (!wreck) {
      // Fender stowage: tool boxes with lids and hasps, jerry cans with ribs and handles.
      for (const x of [-15.5, -9.8]) {
        m.cbox(x, x + 4.6, s * 9.6 - 1.7, s * 9.6 + 1.7, 12, 14.2, 0.25, shade(body, 0.86));
        m.cbox(x - 0.1, x + 4.7, s * 9.6 - 1.8, s * 9.6 + 1.8, 14.2, 14.7, 0.2, shade(body, 0.95));
        m.box(x + 2, x + 2.6, s * 11.45, s * 11.55, 13, 13.8, steel);
      }
      for (const x of [6.6, 9]) {
        m.cbox(x, x + 2.1, s * 10 - 1.2, s * 10 + 1.2, 12, 15.2, 0.35, '#4c5a3a');
        m.box(x + 0.3, x + 1.8, s * 10 - 1.25, s * 10 + 1.25, 13.3, 13.5, shade('#4c5a3a', 0.7));
        m.bar([x + 0.5, s * 10, 15.2], [x + 1.6, s * 10, 15.2], 0.4, 0.5, '#3a4430');
      }
      // Tow cables coiled along the hull side (thin round ropes).
      for (const z of [9.6, 10.6]) m.cyl([-18.5, s * 9.15, z], [-6.5, s * 9.15, z], 0.3, '#2a2a26', 6);
    }
  }

  // ---- hull
  // Main hull: chamfered top edges, glacis in two plates, rear plate with access door.
  m.prism([-20, 0, 8], [15.5, 0, 8], chamfer(18, 8, 1.6).map(([p, q]) => (q < 0 ? [p < 0 ? -9 : 9, q] : [p, q]) as P2), body);
  m.bar([15.5, 0, 11.6], [20.5, 0, 6.6], 18, 1.6, shade(body, 1.04), 0.3);
  m.bar([20.4, 0, 6.8], [19.6, 0, 3], 18, 1.4, shade(body, 0.95), 0.3);
  m.cbox(-20.5, -20, -6, 6, 5, 11, 0.3, shade(body, 0.9));
  if (!wreck) {
    m.box(-20.8, -20.5, -2.5, 2.5, 6, 10.5, shade(body, 0.8));
    m.bar([-20.9, -1.6, 8.2], [-20.9, 1.6, 8.2], 0.25, 0.25, steel);
  }
  // Curved dozer blade on its arms and rams.
  if (!wreck) {
    const blade: P2[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      blade.push([24 - Math.sin(t * Math.PI) * 1.2 + t * 0.4, 0.2 + t * 6.2]);
    }
    for (let i = 8; i >= 0; i--) {
      const t = i / 8;
      blade.push([24.6 - Math.sin(t * Math.PI) * 1.2 + t * 0.4, 0.2 + t * 6.2]);
    }
    m.prism([0, -11.2, 0], [0, 11.2, 0], blade, steel, shade(steel, 0.8));
    m.bar([23.9, -11.2, 0.3], [23.9, 11.2, 0.3], 0.5, 0.6, shade(steel, 1.2)); // cutting edge
    for (const y of [-7, 7]) {
      m.bar([16, y, 5.5], [23.8, y, 2.2], 1.3, 1.3, shade(steel, 0.85), 0.3);
      m.cyl([17.5, y + 1.6, 9.2], [23, y + 1.6, 5], 0.55, steel, 8);
      m.cyl([17.5, y + 1.6, 9.2], [20.2, y + 1.6, 7.2], 0.8, shade(steel, 0.75), 8);
    }
    // Spare track links on the glacis, headlights in guards, tow eyes.
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
      const x = 16.4 + i * 1.3;
      const z = 11 - i * 1.3;
      m.bar([x, -5 + j * 2.5, z], [x, -3.4 + j * 2.5, z], 1, 0.45, shade(dark, 1.1));
    }
    for (const y of [-7.6, 7.6]) {
      m.cyl([15.6, y, 13], [17.2, y, 13], 0.75, shade(body, 0.9), 10, '#eee8c8');
      for (const dz of [-0.9, 0.9]) m.bar([17.4, y - 0.9, 13 + dz], [17.4, y + 0.9, 13 + dz], 0.2, 0.2, steel);
    }
    for (const y of [-5, 5]) m.cyl([20.6, y - 0.5, 4], [20.6, y + 0.5, 4], 0.7, shade(steel, 0.7), 8);
  }
  // Rear recovery spade (anchor) with its rams, tow hooks.
  m.prism([0, -7.5, 0], [0, 7.5, 0], [[-20.6, 9], [-20.1, 9], [-23.4, 0.6], [-24.4, 0.2], [-24.2, 0.9]], steel);
  if (!wreck) for (const y of [-5, 5]) {
    m.cyl([-20.4, y, 11], [-22.8, y, 4], 0.5, steel, 8);
    m.cyl([-21, y, 7], [-21.8, y, 7], 0.6, shade(dark, 1.2), 8);
  }

  // ---- engine deck: grille, exhausts, winch drum, tow bars, railing, fuel drums
  m.cbox(-19.6, -7, -8.6, 8.6, 12, 13.2, 0.4, shade(body, 0.96));
  if (!wreck) {
    for (let i = 0; i < 7; i++) m.box(-18.8 + i * 1.5, -18.1 + i * 1.5, -6.5, 6.5, 13.2, 13.5, shade(body, 0.62));
    for (const y of [-8, 8]) {
      m.cbox(-19.4, -15.4, y - 0.9, y + 0.9, 13.2, 15.2, 0.3, shade(body, 0.85));
      for (let i = 0; i < 4; i++) m.box(-19.2 + i, -18.8 + i, y + Math.sign(y) * 0.92, y + Math.sign(y) * 0.98, 13.5, 14.9, '#1a1a18');
      m.cyl([-19.6, y, 14.4], [-21, y, 14.4], 0.45, '#3a3430', 8);
    }
    // Recovery winch drum with flanges and rope.
    m.cyl([-11, -6.5, 15], [-11, 6.5, 15], 1.5, shade(steel, 0.9), 14);
    for (const y of [-6.7, 6.7]) m.cyl([-11, y - 0.2, 15], [-11, y + 0.2, 15], 2, shade(steel, 0.7), 14);
    m.cyl([-11, -6, 15], [-11, 6, 15], 1.65, '#2c2a26', 14);
    m.cbox(-12.8, -9.2, -7.4, 7.4, 13.2, 13.9, 0.2, shade(body, 0.9));
    // Tow bars racked on the deck.
    for (const y of [-2.2, -1]) m.cyl([-18, y, 13.9], [-8.5, y, 13.9], 0.35, shade(steel, 0.9), 8);
    // Railing round the rear deck.
    for (const [x, y] of [[-19.5, -8.4], [-19.5, 8.4], [-13.5, -8.4], [-13.5, 8.4], [-7.6, -8.4], [-7.6, 8.4]] as const) m.cyl([x, y, 13.2], [x, y, 16.4], 0.15, steel, 6);
    for (const y of [-8.4, 8.4]) m.cyl([-19.5, y, 16.4], [-7.6, y, 16.4], 0.15, steel, 6);
    m.cyl([-19.5, -8.4, 16.4], [-19.5, 8.4, 16.4], 0.15, steel, 6);
    // Fuel drums at the rear corners.
    for (const y of [-5.2, 5.2]) m.cyl([-17.6, y, 13.2], [-17.6, y, 16.2], 1.05, '#4a5440', 12, '#5a6450');
  }

  // ---- commander's cab (front left of the hull)
  m.prism([4, 4.5, 15], [14.2, 4.5, 15], chamfer(9, 6, 1), body);
  m.bar([14, 4.5, 16.6], [15.6, 4.5, 13.4], 9, 1, shade(body, 1.04), 0.2);
  if (!wreck) {
    for (let i = 0; i < 4; i++) m.box(14.6, 15.3, 1 + i * 1.9, 2.4 + i * 1.9, 15.6, 16.9, '#3a4650');
    // Cupola with periscopes, open hatch and the MG.
    m.cyl([10, 5, 18], [10, 5, 19.8], 2.2, shade(body, 1.06), 16);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      m.box(10 + Math.cos(a) * 2.1 - 0.35, 10 + Math.cos(a) * 2.1 + 0.35, 5 + Math.sin(a) * 2.1 - 0.35, 5 + Math.sin(a) * 2.1 + 0.35, 18.9, 19.5, '#2e3a44');
    }
    m.prism([8.4, 5, 19.8], [7.4, 5, 22.4], disc(1.7, 12), shade(body, 1.1));
    m.box(10.4, 11.6, 2.4, 3.2, 19.8, 21, shade(steel, 0.8));
    m.cyl([11, 2.8, 20.6], [16, 2.8, 20.9], 0.16, '#222', 6);
    m.cbox(10.2, 11.8, 2.2, 3.4, 20.2, 21.2, 0.15, '#2a2a28');
    // Smoke grenade launchers, 4 tubes a side.
    for (const y of [0.4, 8.6]) for (let k = 0; k < 4; k++) m.cyl([12.4 + k * 0.6, y, 17.6], [13.4 + k * 0.6, y + (y < 4 ? -1.2 : 1.2), 18.8], 0.28, shade(dark, 1.3), 8);
    // Antennas with their bases.
    for (const [x, y] of [[-16, 7.2], [6, 8.2]] as const) {
      m.cyl([x, y, 13.2], [x, y, 14.2], 0.45, steel, 8);
      m.cyl([x, y, 14.2], [x, y, 28], 0.08, '#222', 4);
    }
  }

  // ---- crane: turntable, two-section telescopic boom, ram, sheave, rope, hook
  m.cyl([1, -5, 12], [1, -5, 13.4], 3.8, shade(body, 0.95), 20);
  m.cbox(-2.6, 4, -8.4, -1.6, 13.4, 16.4, 0.6, shade(body, 1.03));
  const pivot: V3 = [-1, -5, 17];
  let tip: V3;
  if (pose.kind === 'work') {
    const el = 0.82 + Math.sin((pose.frame / 8) * Math.PI * 2) * 0.03;
    tip = [pivot[0] + Math.cos(el) * 32, pivot[1], pivot[2] + Math.sin(el) * 32];
  } else if (wreck) {
    tip = [pivot[0] + 28, pivot[1] - 6, 2];
  } else {
    tip = [pivot[0] + Math.cos(1.08) * 29, pivot[1], pivot[2] + Math.sin(1.08) * 29];
  }
  const along = (t: number, dz = 0): V3 => [pivot[0] + (tip[0] - pivot[0]) * t, pivot[1] + (tip[1] - pivot[1]) * t, pivot[2] + (tip[2] - pivot[2]) * t + dz];
  m.cyl([pivot[0], pivot[1] - 2.5, pivot[2]], [pivot[0], pivot[1] + 2.5, pivot[2]], 1.7, steel, 14);
  m.prism(pivot, along(0.62), chamfer(4, 3.6, 0.8), body);
  m.prism(along(0.56), tip, chamfer(3, 2.6, 0.6), shade(body, 1.06));
  if (!wreck) {
    // Reinforcing side plates on the outer section, the team-colour stripe, and the boom-head.
    for (const dy of [-2.05, 2.05]) {
      const a = along(0.08);
      const b = along(0.5);
      m.bar([a[0], a[1] + dy, a[2]], [b[0], b[1] + dy, b[2]], 0.2, 2.2, shade(body, 0.85));
    }
    m.bar(along(0.18, 1.85), along(0.5, 1.85), 4.05, 0.3, L.stripe);
    m.cbox(tip[0] - 1, tip[0] + 1, tip[1] - 1.9, tip[1] + 1.9, tip[2] - 1.2, tip[2] + 1.2, 0.3, shade(body, 0.95));
    // Two-stage hydraulic ram from the turntable to the boom.
    const ram = along(0.42, -1.6);
    const foot: V3 = [pivot[0] + 6.5, pivot[1], 13.2];
    m.cyl(foot, [foot[0] + (ram[0] - foot[0]) * 0.58, foot[1], foot[2] + (ram[2] - foot[2]) * 0.58], 1.05, shade(steel, 0.8), 10);
    m.cyl(foot, ram, 0.6, shade(steel, 1.15), 10);
    // Tip sheave, rope (two falls) and hook block with its hook.
    m.cyl([tip[0], tip[1] - 2.1, tip[2]], [tip[0], tip[1] + 2.1, tip[2]], 1.6, steel, 14);
    const hookZ = pose.kind === 'work' ? 3 : tip[2] - 9;
    const sway = pose.kind === 'work' ? Math.sin((pose.frame / 8) * Math.PI * 2) * 0.8 : 0;
    const hook: V3 = [tip[0] + sway, tip[1], hookZ];
    for (const dy of [-0.5, 0.5]) m.cyl([tip[0] - 1, tip[1] + dy, tip[2]], [hook[0], hook[1] + dy, hook[2] + 3], 0.12, '#1e1e1e', 4);
    m.cyl([hook[0], hook[1] - 0.9, hook[2] + 2.2], [hook[0], hook[1] + 0.9, hook[2] + 2.2], 1.3, '#c8a032', 14);
    m.bar([hook[0], hook[1], hook[2] + 1.2], [hook[0], hook[1], hook[2] - 0.2], 0.5, 0.5, '#8a6a20');
    m.bar([hook[0], hook[1], hook[2] - 0.2], [hook[0] + 1, hook[1], hook[2] + 0.4], 0.45, 0.45, '#8a6a20');
    // Winch rope from the drum up to the boom root.
    m.cyl([-11, -5, 16.6], [pivot[0], pivot[1], pivot[2] + 1.6], 0.12, '#1e1e1e', 4);
    if (pose.kind === 'work') {
      for (let i = 0; i < 8; i++) {
        const a = (pose.frame * 1.7 + i * 2.1) % (Math.PI * 2);
        const r = 1.5 + ((pose.frame + i) % 3);
        m.sparks.push([hook[0] + Math.cos(a) * r, hook[1] + Math.sin(a) * r, 1 + ((pose.frame * 3 + i) % 4)]);
      }
    }
  }

  // ---- markings: hull sides, cab roof, team plate on the glacis
  if (!wreck) {
    insignia(L.faction).forEach((d, i) => {
      for (const s of [-1, 1]) m.decal(d.poly.map(([u, v]) => [-2 + u * s * 1.7, s * 9.02, 8.7 + v * 1.7] as V3), [0, s, 0], d.color, i);
      m.decal(d.poly.map(([u, v]) => [10 + v * 1.4, 1.6 - u * 1.4, 18.02] as V3), [0, 0, 1], d.color, i);
    });
    m.decal([[19.6, -3, 8.2], [19.6, 3, 8.2], [17.8, 3, 10.4], [17.8, -3, 10.4]], norm([0.8, 0, 0.6]), L.stripe, 0);
  }
  return m;
}

// ------------------------------------------------------------------ rendering

/** Sheet heading (0–31, clockwise from screen-up) → world heading (inverse of RepairSheets' direction()). */
export function arvHeading(d: number): number {
  const a = (d / DIRS) * Math.PI * 2;
  return Math.atan2(-2 * Math.cos(a) - Math.sin(a), Math.sin(a) - 2 * Math.cos(a));
}

/** Draws the mesh at world heading `h`, ground centre (cx, cy); as its ground shadow when `shadow`. */
/** Half-way vector between the light and the eye (Blinn-Phong): faces turned near it catch a metallic glint. */
const HALF = norm([LIGHT[0] + VIEW[0], LIGHT[1] + VIEW[1], LIGHT[2] + VIEW[2]]);

/**
 * `metal`: painted steel instead of matt concrete — a soft specular glint on faces turned towards the sun, a slight
 * sheen gradient across each face and pale worn edges, so hulls read as metal (ARV, bridge layer; not bunkers).
 */
export function drawMesh(ctx: CanvasRenderingContext2D, mesh: Mesh, h: number, cx: number, cy: number, shadow: boolean, flames: boolean, metal = false): void {
  const c = Math.cos(h);
  const s = Math.sin(h);
  const world = (p: V3): V3 => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
  const proj = (w: V3): P2 => [cx + (w[0] - w[1]) * K, cy + (w[0] + w[1]) * K * 0.5 - w[2] * KZ];
  const faces: { pts: P2[]; depth: number; fill: string; spec: number; dark: string; edge: boolean }[] = [];
  for (const pl of mesh.polys) {
    const ws = pl.pts.map(world);
    if (shadow) {
      if (pl.bias === undefined) faces.push({ pts: ws.map((w) => proj([w[0] + w[2] * 0.35, w[1] - w[2] * 0.2, 0])), depth: 0, fill: '#000', spec: 0, dark: '#000', edge: false });
      continue;
    }
    // Newell normal, turned away from the inside of its solid.
    let n: V3 = [0, 0, 0];
    for (let i = 0; i < ws.length; i++) {
      const p = ws[i]!;
      const q = ws[(i + 1) % ws.length]!;
      n = [n[0] + (p[1] - q[1]) * (p[2] + q[2]), n[1] + (p[2] - q[2]) * (p[0] + q[0]), n[2] + (p[0] - q[0]) * (p[1] + q[1])];
    }
    n = norm(n);
    const cen = ws.reduce<V3>((m, w) => [m[0] + w[0] / ws.length, m[1] + w[1] / ws.length, m[2] + w[2] / ws.length], [0, 0, 0]);
    const inside = world(pl.c);
    if (n[0] * (cen[0] - inside[0]) + n[1] * (cen[1] - inside[1]) + n[2] * (cen[2] - inside[2]) < 0) n = [-n[0], -n[1], -n[2]];
    if (n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] <= 0.001) continue;
    const lit = 0.48 + 0.64 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    // Markings (decals) stay matt; steel faces get a glint, strongest on faces turned half-way to the sun and the eye.
    const spec = metal && pl.bias === undefined ? Math.pow(Math.max(0, n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]), 10) : 0;
    const fill = shade(pl.color, metal ? lit * 1.08 + spec * 0.85 : lit);
    faces.push({
      pts: ws.map(proj),
      depth: cen[0] + cen[1] + cen[2] * 0.6 + (pl.bias ?? 0),
      fill,
      spec,
      dark: metal ? shade(pl.color, lit * 0.68) : fill,
      edge: metal && pl.bias === undefined && lit > 0.75,
    });
  }
  ctx.lineJoin = 'round';
  if (shadow) {
    ctx.fillStyle = '#000';
    for (const f of faces) {
      ctx.beginPath();
      f.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  faces.sort((p, q) => p.depth - q.depth);
  for (const f of faces) {
    ctx.beginPath();
    f.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (f.dark !== f.fill) {
      // Steel sheen: lighter at the face's top, a little darker at its foot.
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const [, y] of f.pts) {
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      const g = ctx.createLinearGradient(0, y0, 0, Math.max(y0 + 0.01, y1));
      g.addColorStop(0, f.fill);
      g.addColorStop(1, f.dark);
      ctx.fillStyle = g;
    } else ctx.fillStyle = f.fill;
    ctx.fill();
    // A thin seam of the same face colour closes the anti-aliasing gaps between neighbouring faces.
    ctx.strokeStyle = f.fill;
    ctx.lineWidth = 0.25;
    ctx.stroke();
    if (f.edge) {
      // Paint worn off the edges of sunlit plates: a faint bright rim.
      ctx.strokeStyle = `rgba(235, 240, 245, ${0.3 + f.spec * 0.5})`;
      ctx.lineWidth = 0.3;
      ctx.stroke();
    }
  }
  for (const sp of mesh.sparks) {
    const [x, y] = proj(world(sp));
    ctx.fillStyle = 'rgba(255,170,40,0.75)';
    ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
    ctx.fillStyle = '#fff6b0';
    ctx.fillRect(x - 0.3, y - 0.3, 0.6, 0.6);
  }
  if (flames) {
    for (const [x, z, r] of [[-12, 14, 3.4], [6, 19, 2.6], [-2, 15, 2.2]] as const) {
      const [fx, fy] = proj(world([x, 0, z]));
      const g = ctx.createRadialGradient(fx, fy - r, 0.5, fx, fy - r, r * 2.2);
      g.addColorStop(0, 'rgba(255,230,140,0.95)');
      g.addColorStop(0.4, 'rgba(255,120,30,0.8)');
      g.addColorStop(1, 'rgba(60,40,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx, fy - r, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Explosion frame k (0–7): a fireball that swells and fades into smoke. */
export function blast(ctx: CanvasRenderingContext2D, k: number, cx: number, cy: number): void {
  const t = (k + 1) / 8;
  const r = 6 + 22 * Math.sqrt(t);
  const g = ctx.createRadialGradient(cx, cy - 8, 1, cx, cy - 8, r);
  g.addColorStop(0, `rgba(255,245,200,${1 - t * 0.8})`);
  g.addColorStop(0.35, `rgba(255,150,40,${0.95 - t * 0.6})`);
  g.addColorStop(0.75, `rgba(120,60,30,${0.7 - t * 0.4})`);
  g.addColorStop(1, 'rgba(40,36,34,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy - 8, r, 0, Math.PI * 2);
  ctx.fill();
}

export type ArvCell =
  | { kind: 'drive'; dir: number; frame: number }
  | { kind: 'shadow'; dir: number }
  | { kind: 'work'; dir: number; frame: number }
  | { kind: 'wreck'; dir: number }
  | { kind: 'blast'; frame: number };

const cells = new Map<string, HTMLCanvasElement>();

/**
 * One picture of a nation's ARV: ARV_CELL × ARV_CELL logical px (ground centre in the middle), rendered at RES×
 * and cached the first time it is asked for, so only the headings and frames actually seen are ever built.
 */
export function arvCell(faction: FactionId, cell: ArvCell): HTMLCanvasElement {
  const key = `${faction}:${cell.kind}:${'dir' in cell ? cell.dir : ''}:${'frame' in cell ? cell.frame : ''}`;
  let canvas = cells.get(key);
  if (canvas) return canvas;
  const made = createCanvas(ARV_CELL * RES, ARV_CELL * RES);
  canvas = made.canvas;
  const ctx = made.ctx;
  ctx.scale(RES, RES);
  const mid = ARV_CELL / 2;
  const L = look(faction);
  if (cell.kind === 'blast') blast(ctx, cell.frame, mid, mid);
  else {
    const pose: ArvPose = cell.kind === 'work' ? { kind: 'work', frame: cell.frame } : cell.kind === 'wreck' ? { kind: 'wreck' } : { kind: 'drive', frame: cell.kind === 'drive' ? cell.frame : 0 };
    drawMesh(ctx, build(L, pose), arvHeading(cell.dir), mid, mid, cell.kind === 'shadow', cell.kind === 'wreck', cell.kind !== 'wreck');
  }
  cells.set(key, canvas);
  return canvas;
}
