import { FACTIONS } from '../factions';
import type { FactionId } from '../types';
import { createCanvas } from './Canvas';
import { shade } from './Color';

/**
 * Armoured recovery vehicle, built as a small 3D model (oriented boxes, flat-shaded, painter-sorted) and rendered into a
 * sheet with the same layout as the old pre-drawn ARV sheets (see RepairSheets): 16 × 15 cells of 80 px.
 *  - rows 0–7: hull, 4 track frames × 32 headings (two rows per frame);
 *  - rows 8–9: ground shadow, 32 headings;
 *  - rows 10–13: crane at work (boom raised, hook down, sparks), 8 frames × 8 headings;
 *  - row 14: burning wreck × 8 headings, then 8 explosion frames.
 * Reference: a tank-chassis ARV with a dozer blade at the front and one long crane boom lying along the hull, its hook
 * hanging past the bow; at work the boom rises and the hook drops to the ground.
 */

const CELL = 80;
const DIRS = 32;
const PER_ROW = 16;
/** Sheet px per model unit along the ground axes, and per unit of height. */
const K = 0.6;
const KZ = 0.75;
/** Light from the upper right of the screen (world x, y, up). */
const LIGHT = norm([0.35, -0.55, 0.76]);
/** The camera looks down the (−1, −1, −h) direction: faces turned towards (1, 1, h) are visible. */
const VIEW = norm([1, 1, 1.25]);

type V3 = [number, number, number];

interface Look {
  faction: FactionId;
  body: string;
  track: string;
  steel: string;
  stripe: string;
}

/** Each army's paint: no two alike, its team colour on the crane boom. */
function look(f: FactionId): Look {
  const team = FACTIONS[f].colors.primary;
  switch (f) {
    case 'usa':
      return { faction: f, body: '#a08c62', track: '#3a3630', steel: '#8a8478', stripe: team };
    case 'russia':
      return { faction: f, body: '#56683a', track: '#2e3028', steel: '#7a7c70', stripe: team };
    case 'china':
      return { faction: f, body: '#4a5a44', track: '#2c2e2a', steel: '#74786c', stripe: team };
    case 'europe':
      return { faction: f, body: '#5c6650', track: '#30322e', steel: '#80847a', stripe: team };
    default:
      return { faction: f, body: '#b39c6c', track: '#3c362c', steel: '#8c8270', stripe: team };
  }
}

interface Box {
  c: V3;
  /** Half-extents along the three local axes. */
  h: V3;
  /** Local axes (unit vectors in model space). */
  ax: [V3, V3, V3];
  color: string;
}

function norm(v: V3 | number[]): V3 {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
}
const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];

/** Axis-aligned box from min / max corners (model units: x forward, y left/right, z up). */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string): Box {
  return { c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], ax: [X, Y, Z], color };
}

/** A beam from `a` to `b`, `w` wide and `t` thick (its width along model y). */
function beam(a: V3, b: V3, w: number, t: number, color: string): Box {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  const u = norm(d);
  const up = norm([-u[2] * u[0], -u[2] * u[1], u[0] * u[0] + u[1] * u[1]]);
  const side: V3 = [u[1] * up[2] - u[2] * up[1], u[2] * up[0] - u[0] * up[2], u[0] * up[1] - u[1] * up[0]];
  return { c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], h: [len / 2, w / 2, t / 2], ax: [u, side, up], color };
}

/** One flat piece of a national marking, in its own 2D space (u across, v up), radius 1 = the marking's size. */
type Decal2 = { poly: [number, number][]; color: string };

const ring = (cx: number, cy: number, r: number, n = 18): [number, number][] =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r] as [number, number]);
const star = (cx: number, cy: number, r: number): [number, number][] =>
  Array.from({ length: 10 }, (_, i) => {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.4 : r;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as [number, number];
  });

/** Each army's own marking (painted on the hull sides and the cab roof). */
function insignia(f: FactionId): Decal2[] {
  switch (f) {
    case 'usa': // white star, US Army vehicle marking
      return [{ poly: star(0, 0, 1), color: '#f2f0e6' }];
    case 'russia': // red star with a white border
      return [{ poly: star(0, 0, 1.12), color: '#f2f0e6' }, { poly: star(0, 0, 0.92), color: '#c8231e' }];
    case 'china': // PLA red star with a golden rim
      return [{ poly: star(0, 0, 1.12), color: '#f0c419' }, { poly: star(0, 0, 0.9), color: '#d0201a' }];
    case 'europe': // blue roundel ringed with twelve golden stars
      return [
        { poly: ring(0, 0, 1.05), color: '#1f3f9a' },
        ...Array.from({ length: 12 }, (_, i) => ({ poly: star(Math.cos((i / 12) * Math.PI * 2) * 0.7, Math.sin((i / 12) * Math.PI * 2) * 0.7, 0.17), color: '#f2c94c' })),
      ];
    default: // green roundel with a white crescent and star
      return [
        { poly: ring(0, 0, 1.05), color: '#1f8a44' },
        { poly: ring(-0.12, 0, 0.62), color: '#f2f0e6' },
        { poly: ring(0.06, 0, 0.52), color: '#1f8a44' },
        { poly: star(0.5, 0, 0.26), color: '#f2f0e6' },
      ];
  }
}

/** Where the markings sit: hull sides (both), rear of the cab's side, and on the cab roof. Wrecks keep none. */
function decals(L: Look, wreck: boolean): { pts: V3[]; n: V3; color: string; order: number }[] {
  if (wreck) return [];
  const out: { pts: V3[]; n: V3; color: string; order: number }[] = [];
  const parts = insignia(L.faction);
  // Side of the hull, centred at x = -2, z = 9.9 (radius 2), on both sides; cab roof at (9.5, 4.8) (radius 1.6).
  for (const side of [-1, 1]) {
    parts.forEach((d, i) => out.push({ pts: d.poly.map(([u, v]) => [-2 + u * side * 2, side * 9.03, 9.9 + v * 2] as V3), n: [0, side, 0], color: d.color, order: i }));
  }
  parts.forEach((d, i) => out.push({ pts: d.poly.map(([u, v]) => [11 + v * 1.4, 1.6 - u * 1.4, 18.62] as V3), n: [0, 0, 1], color: d.color, order: i }));
  // Number plate / tactical sign on the glacis in the team colour.
  out.push({ pts: [[19, -3, 8.6], [19, 3, 8.6], [17.5, 3, 11.2], [17.5, -3, 11.2]], n: norm([0.86, 0, 0.5]), color: L.stripe, order: 0 });
  return out;
}

type Pose = { kind: 'drive'; frame: number } | { kind: 'work'; frame: number } | { kind: 'wreck' };

/** The model for one pose. */
function model(L: Look, pose: Pose): { boxes: Box[]; lines: { a: V3; b: V3; color: string; w: number }[]; sparks: V3[]; marks: ReturnType<typeof decals> } {
  const wreck = pose.kind === 'wreck';
  const body = wreck ? '#2c2a26' : L.body;
  const dark = wreck ? '#1c1a18' : L.track;
  const steel = wreck ? '#34302c' : L.steel;
  const boxes: Box[] = [];
  const lines: { a: V3; b: V3; color: string; w: number }[] = [];
  const sparks: V3[] = [];
  // Tracks with road wheels; the tread blocks step back a little each frame.
  const step = pose.kind === 'drive' ? pose.frame : 0;
  for (const s of [-1, 1]) {
    boxes.push(box(-20, 20, s * 9.5 - 2, s * 9.5 + 2, 0, 6.5, dark));
    for (let i = 0; i < 7; i++) {
      const x = -16 + i * 5.3;
      boxes.push(box(x - 1.8, x + 1.8, s * 11.6 - 0.2, s * 11.6 + 0.2, 1, 4.6, shade(dark, 1.35)));
    }
    for (let i = 0; i < 10; i++) {
      const x = -19 + ((i * 4 + step) % 40);
      boxes.push(box(x, x + 1, s * 9.5 - 2.1, s * 9.5 + 2.1, 6.4, 6.9, shade(dark, 0.7)));
    }
    // Side skirt in armour panels, idler and drive sprocket, mudguards.
    for (let i = 0; i < 6; i++) boxes.push(box(-18 + i * 6, -12.2 + i * 6, s * 11.7 - 0.3, s * 11.7 + 0.3, 4.6, 7.6, shade(body, i % 2 ? 0.9 : 0.96)));
    boxes.push(box(17.5, 20, s * 9.5 - 2.3, s * 9.5 + 2.3, 2.5, 6, shade(dark, 1.2)));
    boxes.push(box(-21, -18.5, s * 9.5 - 2.3, s * 9.5 + 2.3, 2.5, 6.5, shade(dark, 1.2)));
    boxes.push(box(16, 19.5, s * 9.5 - 2.4, s * 9.5 + 2.4, 7.6, 8.1, shade(body, 0.85)));
    // Fender stowage: tool boxes and jerry cans along the track guards.
    if (!wreck) {
      for (const x of [-15, -9, 1]) boxes.push(box(x, x + 4.2, s * 9.6 - 1.6, s * 9.6 + 1.6, 12, 14.4, shade(body, 0.88)));
      boxes.push(box(7, 9, s * 10 - 1, s * 10 + 1, 12, 15, '#4c5a3a'));
      boxes.push(box(9.4, 11.4, s * 10 - 1, s * 10 + 1, 12, 15, '#4c5a3a'));
      // Tow cable coiled along the hull side.
      lines.push({ a: [-18, s * 9.1, 10.5], b: [-6, s * 9.1, 10.5], color: '#2a2a26', w: 0.6 });
      lines.push({ a: [-18, s * 9.1, 9.6], b: [-6, s * 9.1, 9.6], color: '#2a2a26', w: 0.6 });
    }
  }
  // Hull, sloped glacis, dozer blade.
  boxes.push(box(-20, 16, -9, 9, 4, 12, body));
  boxes.push(beam([16, 0, 12], [21, 0, 6], 18, 2.2, shade(body, 1.05)));
  if (!wreck) {
    boxes.push(beam([20, 0, 6.5], [24, 0, 0.5], 22, 1.2, steel));
    // Blade arms, spare track links on the glacis, headlights with guards, tow hooks.
    for (const y of [-7, 7]) boxes.push(beam([15, y, 6], [21, y, 3.5], 1.4, 1.4, steel));
    for (let i = 0; i < 3; i++) boxes.push(beam([17 + i * 1.2, -6, 11.6 - i * 1.4], [17 + i * 1.2, 6, 11.6 - i * 1.4], 1, 0.5, dark));
    for (const y of [-7.5, 7.5]) {
      boxes.push(box(16, 17.4, y - 0.8, y + 0.8, 12, 13.6, '#e8e4c8'));
      lines.push({ a: [17.6, y - 1, 12], b: [17.6, y - 1, 14], color: steel, w: 0.4 });
    }
  }
  // Rear recovery spade, tow hooks and winch housing.
  boxes.push(beam([-20, 0, 9], [-23, 0, 1], 15, 1.3, steel));
  for (const y of [-6, 6]) boxes.push(box(-21.5, -20, y - 0.7, y + 0.7, 7, 8.6, dark));
  boxes.push(box(-20.5, -19.6, -5, 5, 4.5, 11, shade(body, 0.85)));
  // Engine deck with grilles and the rear railing.
  boxes.push(box(-19, -8, -8, 8, 12, 13, shade(body, 0.95)));
  for (let i = 0; i < 4; i++) boxes.push(box(-18 + i * 2.6, -16.8 + i * 2.6, -6, 6, 13, 13.3, shade(body, 0.7)));
  if (!wreck) {
    for (const y of [-8, 8]) lines.push({ a: [-19, y, 13], b: [-8, y, 13], color: steel, w: 0.5 });
    for (const x of [-19, -14, -8]) for (const y of [-8, 8]) lines.push({ a: [x, y, 13], b: [x, y, 16], color: steel, w: 0.45 });
    for (const y of [-8, 8]) lines.push({ a: [-19, y, 16], b: [-8, y, 16], color: steel, w: 0.45 });
  }
  // Commander's cab (front left): armoured superstructure, cupola with hatch, vision blocks, smoke launchers, MG.
  boxes.push(box(4, 15, 0, 9, 12, 18, body));
  boxes.push(box(5, 14, 0.6, 8.4, 18, 18.6, shade(body, 0.9)));
  boxes.push(box(8, 12, 3, 7, 18.6, 20.4, shade(body, 1.08)));
  if (!wreck) {
    boxes.push(beam([8.5, 5, 20.4], [7.2, 5, 23], 3.4, 0.5, shade(body, 1.1)));
    for (let i = 0; i < 4; i++) boxes.push(box(14.6, 15.3, 1 + i * 1.9, 2.3 + i * 1.9, 15, 16.8, '#3a4650'));
    for (let i = 0; i < 3; i++) boxes.push(beam([13 + i * 0.8, 9, 16], [14 + i * 0.8, 10.4, 17.4], 0.8, 0.8, dark));
    boxes.push(beam([10, 3.5, 21], [15, 3.5, 21.6], 0.6, 0.6, '#262626'));
  }
  // Exhaust louvres on the engine deck side.
  if (!wreck) for (let i = 0; i < 5; i++) boxes.push(box(-18 + i * 1.6, -17 + i * 1.6, 8.6, 9.1, 7, 11, shade(dark, 1.4)));
  // Crane turntable (front right) and the long boom with its stripe in the team colour.
  boxes.push(box(-3, 5, -9, -1, 12, 16, shade(body, 1.04)));
  // The long boom points up into the sky (about 62°) on the move; at work it leans out over the bow, hook down.
  const pivot: V3 = [-1, -5, 17];
  let tip: V3;
  if (pose.kind === 'work') {
    const bob = Math.sin((pose.frame / 8) * Math.PI * 2) * 0.03;
    const el = 0.82 + bob;
    tip = [pivot[0] + Math.cos(el) * 32, pivot[1], pivot[2] + Math.sin(el) * 32];
  } else if (wreck) {
    tip = [pivot[0] + 28, pivot[1] - 6, 2]; // collapsed onto the ground
  } else {
    tip = [pivot[0] + Math.cos(1.08) * 29, pivot[1], pivot[2] + Math.sin(1.08) * 29]; // kept inside its 80 px sheet cell
  }
  boxes.push(beam(pivot, tip, 3.6, 3.2, body));
  if (!wreck) {
    const mid: V3 = [(pivot[0] + tip[0]) / 2, pivot[1], (pivot[2] + tip[2]) / 2 + 1.7];
    boxes.push(beam([pivot[0] + (tip[0] - pivot[0]) * 0.25, pivot[1], pivot[2] + (tip[2] - pivot[2]) * 0.25 + 1.7], mid, 3.7, 0.5, L.stripe));
    // Boom ram (hydraulic cylinder) from the hull to the boom.
    const ram: V3 = [pivot[0] + (tip[0] - pivot[0]) * 0.4, pivot[1], pivot[2] + (tip[2] - pivot[2]) * 0.4];
    boxes.push(beam([pivot[0] + 6, pivot[1], 12.5], ram, 1.4, 1.4, steel));
    // Sheave at the tip, cable and hook block.
    const hookZ = pose.kind === 'work' ? 3 : tip[2] - 9;
    const sway = pose.kind === 'work' ? Math.sin((pose.frame / 8) * Math.PI * 2) * 0.8 : 0;
    const hook: V3 = [tip[0] + sway, tip[1], hookZ];
    lines.push({ a: tip, b: [hook[0], hook[1], hook[2] + 2.5], color: '#1e1e1e', w: 0.5 });
    boxes.push(box(hook[0] - 1, hook[0] + 1, hook[1] - 1, hook[1] + 1, hook[2], hook[2] + 2.5, '#c8a032'));
    if (pose.kind === 'work') {
      // Welding sparks round the work spot.
      for (let i = 0; i < 6; i++) {
        const a = (pose.frame * 1.7 + i * 2.1) % (Math.PI * 2);
        const r = 1.5 + ((pose.frame + i) % 3);
        sparks.push([hook[0] + Math.cos(a) * r, hook[1] + Math.sin(a) * r, 1 + ((pose.frame * 3 + i) % 4)]);
      }
    }
    // Antennas.
    lines.push({ a: [-17, 7, 13], b: [-17, 7, 30], color: '#2a2a2a', w: 0.35 });
    lines.push({ a: [10, 8, 20], b: [10, 8, 30], color: '#2a2a2a', w: 0.35 });
  }
  return { boxes, lines, sparks, marks: decals(L, wreck) };
}

/** Sheet heading (0–31, clockwise from screen-up) → world heading (inverse of RepairSheets' direction()). */
function headingOf(d: number): number {
  const a = (d / DIRS) * Math.PI * 2;
  return Math.atan2(-2 * Math.cos(a) - Math.sin(a), Math.sin(a) - 2 * Math.cos(a));
}

/** Draws one pose of the model at world heading `h` with its ground centre at (cx, cy). */
function render(ctx: CanvasRenderingContext2D, L: Look, pose: Pose, h: number, cx: number, cy: number, shadow: boolean): void {
  const c = Math.cos(h);
  const s = Math.sin(h);
  const world = (p: V3): V3 => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
  const proj = (w: V3): [number, number] => [cx + (w[0] - w[1]) * K, cy + (w[0] + w[1]) * K * 0.5 - w[2] * KZ];
  const { boxes, lines, sparks, marks } = model(L, pose);
  const faces: { pts: [number, number][]; depth: number; fill: string }[] = [];
  for (const b of boxes) {
    const corner = (i: number, j: number, k: number): V3 => {
      const p: V3 = [b.c[0], b.c[1], b.c[2]];
      for (let a = 0; a < 3; a++) {
        const sgn = [i, j, k][a]!;
        const ax = b.ax[a]!;
        p[0] += ax[0] * b.h[a]! * sgn;
        p[1] += ax[1] * b.h[a]! * sgn;
        p[2] += ax[2] * b.h[a]! * sgn;
      }
      return world(p);
    };
    for (let a = 0; a < 3; a++) {
      for (const sgn of [-1, 1]) {
        const n = world(b.ax[a]!.map((v) => v * sgn) as V3);
        const pts: V3[] = [];
        const o = [(a + 1) % 3, (a + 2) % 3];
        for (const [p, q] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          const idx = [0, 0, 0];
          idx[a] = sgn;
          idx[o[0]!] = p;
          idx[o[1]!] = q;
          pts.push(corner(idx[0]!, idx[1]!, idx[2]!));
        }
        if (shadow) {
          if (a !== 2 || sgn !== 1) continue;
          faces.push({ pts: pts.map((w) => proj([w[0] + w[2] * 0.35, w[1] - w[2] * 0.2, 0])), depth: 0, fill: '#000' });
          continue;
        }
        if (n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] <= 0.001) continue;
        const lit = 0.5 + 0.62 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
        const cen = pts.reduce((m, w) => [m[0] + w[0] / 4, m[1] + w[1] / 4, m[2] + w[2] / 4] as V3, [0, 0, 0] as V3);
        faces.push({ pts: pts.map(proj), depth: cen[0] + cen[1] + cen[2] * 0.6, fill: shade(b.color, lit) });
      }
    }
  }
  if (shadow) {
    // Every box top projected down and pushed away from the light: one dark blot.
    ctx.fillStyle = '#000';
    for (const f of faces) {
      ctx.beginPath();
      f.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  // National markings: painted just above the face they sit on (drawn right after it, in their own order).
  for (const m of marks) {
    const n = world(m.n);
    if (n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] <= 0.001) continue;
    const ws = m.pts.map(world);
    const cen = ws.reduce((a, w) => [a[0] + w[0] / ws.length, a[1] + w[1] / ws.length, a[2] + w[2] / ws.length] as V3, [0, 0, 0] as V3);
    const lit = 0.62 + 0.5 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    faces.push({ pts: ws.map(proj), depth: cen[0] + cen[1] + cen[2] * 0.6 + 0.5 + m.order * 0.01, fill: shade(m.color, lit) });
  }
  faces.sort((p, q) => p.depth - q.depth);
  ctx.lineJoin = 'round';
  for (const f of faces) {
    ctx.beginPath();
    f.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = f.fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,8,0.35)';
    ctx.lineWidth = 0.35;
    ctx.stroke();
  }
  for (const l of lines) {
    const a = proj(world(l.a));
    const b = proj(world(l.b));
    ctx.strokeStyle = l.color;
    ctx.lineWidth = l.w;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  for (const sp of sparks) {
    const [x, y] = proj(world(sp));
    ctx.fillStyle = '#fff2a0';
    ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
    ctx.fillStyle = 'rgba(255,170,40,0.7)';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  if (pose.kind === 'wreck') {
    // Flames and smoke over the burnt-out hull.
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

/** Explosion frame k (0–7) centred at (cx, cy): a fireball that swells and fades into smoke. */
function blast(ctx: CanvasRenderingContext2D, k: number, cx: number, cy: number): void {
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

/** Builds the whole ARV sheet for `faction` (same layout as the old pre-drawn sheets). */
export function buildArvSheet(faction: FactionId): HTMLCanvasElement {
  const L = look(faction);
  const { canvas, ctx } = createCanvas(PER_ROW * CELL, 15 * CELL);
  const at = (col: number, row: number): [number, number] => [col * CELL + CELL / 2, row * CELL + CELL / 2];
  for (let d = 0; d < DIRS; d++) {
    const h = headingOf(d);
    const col = d % PER_ROW;
    const sub = Math.floor(d / PER_ROW);
    for (let f = 0; f < 4; f++) {
      const [x, y] = at(col, f * 2 + sub);
      render(ctx, L, { kind: 'drive', frame: f }, h, x, y, false);
    }
    const [sx, sy] = at(col, 8 + sub);
    render(ctx, L, { kind: 'drive', frame: 0 }, h, sx, sy, true);
  }
  for (let d8 = 0; d8 < 8; d8++) {
    const h = headingOf(d8 * 4);
    for (let f = 0; f < 8; f++) {
      const [x, y] = at((d8 % 2) * 8 + f, 10 + Math.floor(d8 / 2));
      render(ctx, L, { kind: 'work', frame: f }, h, x, y, false);
    }
    const [wx, wy] = at(d8, 14);
    render(ctx, L, { kind: 'wreck' }, h, wx, wy, false);
  }
  for (let k = 0; k < 8; k++) {
    const [x, y] = at(8 + k, 14);
    blast(ctx, k, x, y);
  }
  return canvas;
}
