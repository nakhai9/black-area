import { FACTIONS } from '../factions';
import type { FactionId } from '../types';
import { K, Mesh, type P2, type V3, arvHeading, blast, chamfer, disc, drawMesh, star } from './ArvModel';
import { createCanvas } from './Canvas';
import { shade } from './Color';

/**
 * Air-defence vehicle (`mantis`) of every nation as a detailed polygon model (same renderer as the ARV and bridge layer),
 * after its real-world system; the launcher (or gun turret) is a separate part that traverses on its own:
 *  - USA: Patriot — HEMTT tractor towing the M903 launching station: four big square canisters raised at 30°;
 *  - Europe: SAMP/T NG — 8 × 8 truck with eight round canisters in two rows, raised 30° at the rear;
 *  - Russia: S-400 — tractor with the 5P85 semi-trailer launcher: four long round tubes raised 30°;
 *  - China: HQ-9 — Taian forward-control 8 × 8 (flat-faced cab over the front axles, 2 + 2 axles far apart) in green
 *    digital camouflage, a tall power module and armoured side lockers, four round metal tubes in a square raised 30°;
 *  - Islamic: PGZ-09 — olive tracked chassis, turret with twin 35 mm cannons raised at the sky, tracking and search radars.
 * MantisSheet draws it in the game.
 */

const RES = 3;
/** Logical size (px) of a picture cell, ground centre in the middle. */
export const SAM_CELL = 80;

type Kind = 'patriot' | 'sampt' | 's400' | 'hq9' | 'pgz';

interface Look {
  faction: FactionId;
  kind: Kind;
  body: string;
  dark: string;
  steel: string;
  rubber: string;
  glass: string;
  canister: string;
  stripe: string;
  /** Camouflage blotch colours (two accents), when the vehicle wears them. */
  camo?: [string, string];
}

function look(f: FactionId): Look {
  const stripe = FACTIONS[f].colors.primary;
  switch (f) {
    case 'usa':
      // Desert three-tone, matte CARC: sand-tan base with brown and pale-sand blotches (camo).
      return { faction: f, kind: 'patriot', body: '#b09a6c', dark: '#4a4234', steel: '#8a8478', rubber: '#24221e', glass: '#2c3a46', canister: '#b9a679', stripe, camo: ['#8a6c45', '#d6c79f'] };
    case 'europe':
      // Blue-grey paint (slate with a cool tint).
      return { faction: f, kind: 'sampt', body: '#5f6b72', dark: '#30373c', steel: '#848b90', rubber: '#232426', glass: '#26343e', canister: '#6e7b83', stripe };
    case 'china':
      // PLA Type 07 woodland digital: mid green with dark green and khaki pixels (camo).
      return { faction: f, kind: 'hq9', body: '#56694a', dark: '#2b2e29', steel: '#74786c', rubber: '#212320', glass: '#2a3640', canister: '#8d9290', stripe, camo: ['#2f3f2a', '#8f8d62'] };
    case 'islamic':
      return { faction: f, kind: 'pgz', body: '#5d6b3a', dark: '#2c2f26', steel: '#76786a', rubber: '#212320', glass: '#2a3640', canister: '#66753f', stripe };
    default:
      return { faction: f, kind: 's400', body: '#56683a', dark: '#2e3028', steel: '#7a7c70', rubber: '#22231f', glass: '#2a3640', canister: '#64773f', stripe };
  }
}

/**
 * Launcher pack: `cols` × 2 canisters from the pivot at `p` (the rear of the truck), raised `elev` rad and `len` long,
 * rising towards the front of the vehicle (+x); the second row sits in front of the first. Each has an exit cover and a band of team colour; side rails and a
 * cradle hold them. Returns the middle of the pack's upper end.
 */
function pack(m: Mesh, L: Look, p: V3, elev: number, len: number, size: number, cols: number, round: boolean): V3 {
  const dir: V3 = [Math.cos(elev), 0, Math.sin(elev)];
  const up: V3 = [-Math.sin(elev), 0, Math.cos(elev)];
  const at = (t: number, y: number, k: number): V3 => [p[0] + dir[0] * t + up[0] * k, p[1] + y, p[2] + dir[2] * t + up[2] * k];
  const gap = size + 0.35;
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < cols; c++) {
      const y = (c - (cols - 1) / 2) * gap;
      const k = size / 2 + row * gap;
      const a = at(-1, y, k);
      const b = at(len, y, k);
      if (round) m.cyl(a, b, size / 2, L.canister, 12, shade(L.canister, 0.7));
      else m.prism(a, b, chamfer(size, size, size * 0.12), L.canister, shade(L.canister, 0.72));
      m.cyl(at(len + 0.05, y, k), at(len + 0.3, y, k), size * 0.36, shade(L.canister, 0.5), 10);
      if (round) m.cyl(at(len * 0.42, y, k), at(len * 0.5, y, k), size / 2 + 0.06, L.stripe, 12);
      else m.prism(at(len * 0.42, y, k), at(len * 0.5, y, k), chamfer(size + 0.08, size + 0.08, size * 0.12), L.stripe);
      // Reinforcing hoops along round tubes.
      if (round) for (const t of [len * 0.15, len * 0.75]) m.cyl(at(t, y, k), at(t + 0.5, y, k), size / 2 + 0.12, shade(L.canister, 0.85), 12);
      // Square canisters: stiffening ribs along the corners, flanged ends.
      else {
        for (const t of [len * 0.08, len * 0.3, len * 0.62, len * 0.9]) m.prism(at(t, y, k), at(t + 0.35, y, k), chamfer(size + 0.16, size + 0.16, size * 0.14), shade(L.canister, 0.82));
        m.prism(at(len - 0.4, y, k), at(len, y, k), chamfer(size + 0.24, size + 0.24, size * 0.14), shade(L.canister, 0.7));
      }
      // Frangible exit cover: cross ribs over the cap; data stencil on the canister side.
      const cr = size * 0.34;
      m.bar(at(len + 0.3, y - cr, k), at(len + 0.3, y + cr, k), 0.16, 0.16, shade(L.canister, 1.15));
      m.bar(at(len + 0.3, y, k - cr), at(len + 0.3, y, k + cr), 0.16, 0.16, shade(L.canister, 1.15));
      if (c === 0 || c === cols - 1) {
        const sy = y + (c === 0 ? -1 : 1) * (size / 2 + 0.03);
        const n: V3 = [0, c === 0 ? -1 : 1, 0];
        m.decal([at(len * 0.58, sy, k - size * 0.2), at(len * 0.72, sy, k - size * 0.2), at(len * 0.72, sy, k - size * 0.05), at(len * 0.58, sy, k - size * 0.05)], n, '#d9d6c8', 1);
        m.decal([at(len * 0.58, sy, k + size * 0.05), at(len * 0.66, sy, k + size * 0.05), at(len * 0.66, sy, k + size * 0.14), at(len * 0.58, sy, k + size * 0.14)], n, '#c9a227', 1);
      }
    }
  }
  const w = (cols * gap) / 2 + 0.3;
  for (const s of [-1, 1]) m.bar(at(-1.4, s * w, gap), at(len + 0.2, s * w, gap), 0.5, gap * 2 + 0.4, shade(L.steel, 0.85));
  m.bar(at(-1.4, 0, -0.4), at(len * 0.85, 0, -0.4), w * 2, 0.8, shade(L.body, 0.9));
  // Clamp frames round the whole pack, lifting lugs on top, rear trunnion across the cradle.
  for (const t of [len * 0.22, len * 0.55, len * 0.86]) {
    for (const s of [-1, 1]) m.bar(at(t, s * (w + 0.35), gap), at(t + 0.6, s * (w + 0.35), gap), 0.3, gap * 2 + 0.9, shade(L.steel, 0.7));
    m.bar(at(t, 0, gap * 2 + 0.15), at(t + 0.6, 0, gap * 2 + 0.15), w * 2 + 1, 0.3, shade(L.steel, 0.7));
    for (const s of [-1, 1]) m.cyl(at(t + 0.3, s * (w - 0.6), gap * 2 + 0.3), at(t + 0.3, s * (w - 0.6), gap * 2 + 0.8), 0.22, shade(L.steel, 1.1), 6);
  }
  m.cyl(at(-1, -w - 0.9, -0.6), at(-1, w + 0.9, -0.6), 0.8, shade(L.steel, 0.65), 12);
  // Umbilical cables down each side rail.
  for (const s of [-1, 1]) m.cyl(at(-1.2, s * (w + 0.4), 0.2), at(len * 0.9, s * (w + 0.4), 0.2), 0.14, '#151513', 6);
  return at(len, 0, gap);
}

/** Hydraulic ram between two points: barrel and polished rod. */
function ram(m: Mesh, L: Look, a: V3, b: V3, r = 0.9): void {
  m.cyl(a, [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55, a[2] + (b[2] - a[2]) * 0.55], r, shade(L.steel, 0.8), 10);
  m.cyl(a, b, r * 0.55, shade(L.steel, 1.2), 10);
}

/** Off-road wheel across the y axis at (x, y): tyre with staggered tread lugs, dished rim with stud ring, hub and CTIS valve line. */
function wheel(m: Mesh, L: Look, x: number, y: number, r: number): void {
  const s = Math.sign(y);
  const o = y + s * 1;
  m.cyl([x, y - s * 1, r], [x, o, r], r, L.rubber, 18, shade(L.rubber, 1.3));
  // Sidewall bead ring and tread lugs alternating from each shoulder.
  m.cyl([x, o, r], [x, o + s * 0.06, r], r * 0.86, shade(L.rubber, 1.15), 18);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const pz = r + Math.sin(a) * r;
    const y0 = i % 2 ? y - s * 1 : y - s * 0.1;
    m.bar([px, y0, pz], [px, y0 + s * 1.1, pz], 0.42, 0.42, shade(L.rubber, 0.78));
  }
  m.cyl([x, o + s * 0.06, r], [x, o + s * 0.16, r], r * 0.64, shade(L.steel, 0.72), 16);
  m.cyl([x, o + s * 0.16, r], [x, o + s * 0.26, r], r * 0.5, L.steel, 16);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p: V3 = [x + Math.cos(a) * r * 0.33, o + s * 0.26, r + Math.sin(a) * r * 0.33];
    m.cyl(p, [p[0], o + s * 0.4, p[2]], 0.11, shade(L.steel, 1.25), 6);
  }
  m.cyl([x, o + s * 0.26, r], [x, o + s * 0.55, r], r * 0.2, shade(L.steel, 0.75), 10, shade(L.steel, 1.1));
  m.bar([x, o + s * 0.5, r], [x + r * 0.45, o + s * 0.3, r + r * 0.45], 0.12, 0.12, '#151513');
}

/** Arched mudguard over the wheel at x on both sides of a truck `half` wide, tyre radius r. */
function fender(m: Mesh, L: Look, x: number, half: number, r: number): void {
  const arc: P2[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const a = 0.25 + (i / n) * (Math.PI - 0.5);
    arc.push([Math.cos(a) * (r + 0.95), Math.sin(a) * (r + 0.95)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = 0.25 + (i / n) * (Math.PI - 0.5);
    arc.push([Math.cos(a) * (r + 0.55), Math.sin(a) * (r + 0.55)]);
  }
  for (const s of [-1, 1]) {
    m.prism([x, s * (half - 1.3), r], [x, s * (half + 1.25), r], arc, shade(L.body, 0.86), shade(L.body, 0.7));
    // Rubber mud flap behind the wheel.
    m.box(x - r - 0.9, x - r - 0.7, s * (half - 1), s * (half + 1.1), 0.9, r + 0.4, L.rubber);
  }
}

/** Track loop, road wheels, sprocket and idler on both sides of a light tracked chassis. */
function tracks(m: Mesh, L: Look, h: number): void {
  for (const s of [-1, 1]) {
    const yi = s * 6.6;
    const yo = s * 10.2;
    const loop: P2[] = [];
    for (let i = 0; i <= 8; i++) loop.push([h - 0.4 + Math.sin((i / 8) * Math.PI) * 3, 3 - Math.cos((i / 8) * Math.PI) * 3]);
    for (let i = 0; i <= 8; i++) loop.push([-h + 0.4 - Math.sin((i / 8) * Math.PI) * 3, 3 + Math.cos((i / 8) * Math.PI) * 3]);
    m.prism([0, yi, 0], [0, yo, 0], loop, L.dark);
    for (let x = -h + 0.6; x < h - 0.6; x += 1.5) m.box(x, x + 0.7, yi - s * 0.05, yo + s * 0.05, 5.9, 6.25, shade(L.dark, 0.75));
    const gap = ((h - 2) * 2) / 5;
    for (let i = 0; i < 6; i++) {
      const x = -h + 2 + i * gap;
      m.cyl([x, s * 9.2, 2.5], [x, s * 10.4, 2.5], 2, L.rubber, 14, shade(L.rubber, 1.3));
      m.cyl([x, s * 10.4, 2.5], [x, s * 10.65, 2.5], 1.4, L.steel, 12);
    }
    m.cyl([h + 1.8, s * 9, 3.8], [h + 1.8, s * 10.5, 3.8], 2, shade(L.steel, 0.85), 14);
    m.cyl([-h - 2.2, s * 9, 3.8], [-h - 2.2, s * 10.5, 3.8], 2, shade(L.steel, 0.8), 14);
    // Thin side skirt over the upper run.
    m.box(-h - 2, h + 2, s * 10.5 - 0.15, s * 10.5 + 0.15, 5.6, 6.8, shade(L.body, 0.92));
  }
}

/** PGZ-09 hull: the tracked chassis with a driver's hatch at the front left and the engine at the front right. */
function pgz(m: Mesh, L: Look): void {
  const h = 17;
  tracks(m, L, h);
  m.cbox(-h - 2.5, h, -8.6, 8.6, 5.4, 11, 0.5, L.body);
  m.bar([h - 0.3, 0, 10.8], [h + 3.2, 0, 6.2], 17.2, 1.2, shade(L.body, 1.04), 0.3);
  m.cyl([h - 3, -4.5, 11], [h - 3, -4.5, 11.6], 1.6, shade(L.body, 1.1), 12);
  for (let i = 0; i < 3; i++) m.box(h - 1.4, h - 0.9, -6.6 + i * 1.3, -6 + i * 1.3, 11, 11.6, L.glass);
  for (let i = 0; i < 5; i++) m.box(h - 8 + i * 1.3, h - 7.4 + i * 1.3, 1.5, 7.5, 11, 11.25, shade(L.body, 0.6));
  for (const s of [-1, 1]) m.cyl([h + 0.8, s * 6.6, 10.8], [h + 1.6, s * 6.6, 10.8], 0.6, shade(L.body, 0.9), 10, '#eee8c8');
  // Stowage boxes along the rear deck and the tow cable.
  for (const s of [-1, 1]) m.cbox(-h - 2, -h + 6, s * 7.6 - 1, s * 7.6 + 1, 11, 12.6, 0.2, shade(L.body, 0.9));
  m.cyl([-h - 2.6, -6, 9], [-h - 2.6, 6, 9], 0.35, shade(L.steel, 0.6), 6);
}

/** PGZ-09 turret (pivot PGZ_PIVOT): welded box, twin 35 mm guns, tracking radar dish at the front, search radar at the back. */
function pgzTurret(m: Mesh, L: Look): void {
  const c = PGZ_PIVOT;
  m.cyl([c, 0, 11], [c, 0, 12], 7.4, shade(L.steel, 0.8), 20);
  // Turret body: sloped front, flat roof, overhanging bustle.
  m.prism([c - 8, 0, 12], [c + 7, 0, 12], [[-6.2, 0], [6.2, 0], [5.6, 6.4], [-5.6, 6.4]], L.body);
  m.prism([c + 7, 0, 12], [c + 9.5, 0, 12], [[-6.2, 0], [6.2, 0], [5.4, 3.6], [-5.4, 3.6]], shade(L.body, 1.04));
  m.cbox(c - 10.5, c - 8, -5.6, 5.6, 13, 18, 0.4, shade(L.body, 0.94));
  m.cyl([c - 1, 2.6, 18.4], [c - 1, 2.6, 19], 1.4, shade(L.body, 1.08), 12);
  m.box(c + 4, c + 4.6, -2.8, -1.4, 18.4, 19.2, L.glass);
  // Twin 35 mm cannons in armoured pods on the cheeks, raised 40° at the sky: trunnion, pod, long barrel, muzzle brake.
  const ce = Math.cos(GUN_ELEVATION);
  const se = Math.sin(GUN_ELEVATION);
  const gun = (t: number, y: number): V3 => [c + 2 + t * ce, y, 15.4 + t * se];
  for (const s of [-1, 1]) {
    const y = s * 7.4;
    m.cyl([c + 2, s * 6, 15.4], [c + 2, s * 8.8, 15.4], 1.5, shade(L.steel, 0.75), 12);
    m.bar(gun(-3, y), gun(6, y), 2.6, 2.8, shade(L.body, 0.96), 0.4);
    m.cyl(gun(6, y), gun(20, y), 0.42, shade(L.steel, 0.7), 8);
    m.cyl(gun(6, y), gun(8.5, y), 0.75, shade(L.steel, 0.8), 10);
    m.cyl(gun(19, y), gun(20.6, y), 0.6, shade(L.steel, 0.6), 8);
  }
  // Tracking radar: round dish on the turret front, facing forward.
  m.cyl([c + 6.8, 0, 19.5], [c + 7.6, 0, 19.5], 2.6, shade(L.steel, 0.9), 16, shade(L.dark, 1.3));
  m.bar([c + 6, 0, 18.4], [c + 6.8, 0, 19.5], 1, 1, L.steel);
  // Search radar: wide panel on a short mast over the bustle.
  m.cyl([c - 9.2, 0, 18], [c - 9.2, 0, 20.5], 0.6, L.steel, 8);
  m.cbox(c - 9.8, c - 8.8, -5, 5, 20.5, 23.6, 0.3, shade(L.body, 0.88));
  m.decal([[c - 8.78, -4.6, 20.9], [c - 8.78, 4.6, 20.9], [c - 8.78, 4.6, 23.2], [c - 8.78, -4.6, 23.2]], [1, 0, 0], shade(L.dark, 1.2), 0);
  // Smoke dischargers on the turret front corners and a whip antenna.
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) m.cyl([c + 5, s * (4.6 + k * 0.6), 17.6], [c + 6, s * (4.9 + k * 0.6), 18.4], 0.28, shade(L.dark, 1.3), 8);
  m.cyl([c - 6, -4.5, 18.4], [c - 6, -4.5, 30], 0.08, '#222', 4);
}

/**
 * Armoured truck cab from x0 to x1 (front): side profile with a raked windscreen, split panes and wipers, framed doors with
 * windows, handles and steps, grille with guard, bumper with headlights and tow hooks, mirrors on arms, roof hatch, beacon
 * and air-intake snorkel.
 */
function cab(m: Mesh, L: Look, x0: number, x1: number, half = 7.8, top = 15.5): void {
  const hood = top - 4.6;
  const rake = 1.6;
  const side: P2[] = [[x0, 5.5], [x1, 5.5], [x1, hood], [x1 - rake, top - 0.4], [x1 - rake - 0.6, top], [x0 + 0.6, top], [x0, top - 0.6]];
  const mid = (x0 + x1) / 2;
  // Profile (x, z) extruded across y; prism's side axis is +x along +y.
  m.prism([mid, -half, 5.5], [mid, half, 5.5], side.map(([x, z]) => [x - mid, z - 5.5] as P2), L.body, shade(L.body, 0.95));
  // Windscreen on the raked face: two panes with a centre pillar, rubber frame, wipers.
  const nx = Math.cos(Math.atan2(rake, 4.2));
  const nz = Math.sin(Math.atan2(rake, 4.2));
  const ws = (t: number, y: number): V3 => [x1 - rake * t + nx * 0.03, y, hood + (top - 0.4 - hood) * t + nz * 0.03];
  for (const s of [-1, 1]) {
    const a = s * 0.4;
    const b = s * (half - 0.9);
    m.decal([ws(0.12, a), ws(0.12, b), ws(0.9, b), ws(0.9, a)], [nx, 0, nz], shade(L.dark, 0.8), 0);
    m.decal([ws(0.17, a + s * 0.2), ws(0.17, b - s * 0.2), ws(0.85, b - s * 0.2), ws(0.85, a + s * 0.2)], [nx, 0, nz], L.glass, 1);
    // Glint across the upper pane.
    m.decal([ws(0.6, a + s * 0.6), ws(0.6, a + s * 1.6), ws(0.8, a + s * 1.2), ws(0.8, a + s * 0.4)], [nx, 0, nz], shade(L.glass, 1.8), 2);
    m.bar(ws(0.16, s * 2.6), ws(0.55, s * 1.4), 0.12, 0.12, '#151513');
  }
  // Doors: seams, window, handle, two steps below; door hinge line.
  for (const s of [-1, 1]) {
    const y = s * (half + 0.02);
    const n: V3 = [0, s, 0];
    const d0 = x1 - 8.4;
    const d1 = x1 - 1.6;
    m.decal([[d0, y, 6], [d0 + 0.14, y, 6], [d0 + 0.14, y, top - 0.8], [d0, y, top - 0.8]], n, shade(L.body, 0.55), 0);
    m.decal([[d1 - 0.14, y, 6], [d1, y, 6], [d1, y, top - 0.8], [d1 - 0.14, y, top - 0.8]], n, shade(L.body, 0.55), 0);
    m.decal([[d1 - 0.6, y, top - 4.4], [d0 + 1.6, y, top - 4.4], [d0 + 1.6, y, top - 1.2], [d1 - 1.4, y, top - 1.2], [d1 - 0.6, y, top - 2]], n, L.glass, 1);
    m.bar([d0 + 1, s * (half + 0.15), top - 5.2], [d0 + 2, s * (half + 0.15), top - 5.2], 0.25, 0.25, shade(L.steel, 0.6));
    for (const z of [2.6, 4.4]) m.box(d0 + 0.6, d0 + 3.6, s * (half - 0.6), s * (half + 0.5), z, z + 0.3, shade(L.steel, 0.65));
    m.bar([d0 + 0.6, s * (half + 0.3), 2.6], [d0 + 0.6, s * (half + 0.3), 5.5], 0.2, 0.2, shade(L.steel, 0.65));
    // Mirror on a bent arm.
    m.bar([x1 - 1.2, s * half, top - 2], [x1 - 0.6, s * (half + 1.4), top - 1.4], 0.15, 0.15, L.dark);
    m.cbox(x1 - 1, x1 - 0.4, s * (half + 1) - 0.4, s * (half + 1) + 0.4, top - 2.8, top - 0.8, 0.15, L.dark);
    m.decal([[x1 - 0.38, s * (half + 1) - 0.3, top - 2.6], [x1 - 0.38, s * (half + 1) + 0.3, top - 2.6], [x1 - 0.38, s * (half + 1) + 0.3, top - 1], [x1 - 0.38, s * (half + 1) - 0.3, top - 1]], [1, 0, 0], shade(L.glass, 1.5), 0);
  }
  // Grille slats with a brush guard, headlight pods, blackout lights, bumper with tow hooks.
  for (let i = -3; i <= 3; i++) m.box(x1, x1 + 0.2, i * 1.1 - 0.3, i * 1.1 + 0.3, 6.8, hood - 0.6, shade(L.body, 0.5));
  for (const z of [7, hood - 0.8]) m.cyl([x1 + 0.7, -4.2, z], [x1 + 0.7, 4.2, z], 0.16, shade(L.steel, 0.7), 6);
  for (const y of [-4.2, -1.4, 1.4, 4.2]) m.bar([x1 + 0.7, y, 6.2], [x1 + 0.7, y, hood - 0.4], 0.16, 0.16, shade(L.steel, 0.7));
  for (const s of [-1, 1]) {
    m.cbox(x1 - 0.2, x1 + 0.6, s * (half - 1.6) - 1, s * (half - 1.6) + 1, 6.2, 8.2, 0.3, shade(L.body, 0.75));
    m.cyl([x1 + 0.6, s * (half - 1.6), 7.2], [x1 + 0.8, s * (half - 1.6), 7.2], 0.75, '#eee8c8', 12, '#fffbe0');
    m.cyl([x1 + 0.6, s * (half - 0.4), 8.8], [x1 + 0.8, s * (half - 0.4), 8.8], 0.3, '#d8902a', 8);
    m.bar([x1 + 1.4, s * 4.2, 4.2], [x1 + 2.1, s * 4.2, 4.2], 0.5, 0.9, shade(L.steel, 0.55));
  }
  m.cbox(x1 - 0.4, x1 + 1.4, -half, half, 3.2, 5.8, 0.3, shade(L.body, 0.8));
  m.decal([[x1 + 1.42, -2, 4], [x1 + 1.42, 2, 4], [x1 + 1.42, 2, 5], [x1 + 1.42, -2, 5]], [1, 0, 0], '#d9d6c8', 1);
  // Roof: raised panel, round crew hatch, amber beacon, whip mount; snorkel up the right A-pillar.
  m.cbox(x0 + 1, x1 - rake - 1, -half + 1, half - 1, top, top + 0.6, 0.3, shade(L.body, 1.06));
  m.cyl([x0 + 3.2, 2.4, top + 0.6], [x0 + 3.2, 2.4, top + 1], 1.5, shade(L.body, 1.12), 14);
  m.cyl([x0 + 3.2, 2.4, top + 1], [x0 + 3.2, 2.4, top + 1.15], 0.9, shade(L.body, 0.9), 10);
  m.cyl([x1 - rake - 1.6, -half + 1.8, top + 0.6], [x1 - rake - 1.6, -half + 1.8, top + 1.4], 0.45, '#e09a22', 8, '#f4c24a');
  m.cyl([x1 - 1.4, half + 0.5, 6], [x1 - 1.4, half + 0.5, top + 1.5], 0.55, shade(L.body, 0.8), 10);
  m.cyl([x1 - 1.4, half + 0.5, top + 1.5], [x1 - 0.6, half + 0.5, top + 2], 0.65, shade(L.dark, 1.2), 10);
}

/** Chassis rails from x0 to x1, road wheels with mudguards on each axle in `axles`, axle beams and differentials. */
function running(m: Mesh, L: Look, x0: number, x1: number, axles: readonly number[], r = 3.2): void {
  for (const y of [-3.4, 3.4]) m.bar([x0, y, 4.6], [x1, y, 4.6], 1.2, 1.8, L.dark);
  // Cross members.
  for (let x = x0 + 2; x < x1 - 1; x += 6) m.bar([x, -3.4, 4.6], [x, 3.4, 4.6], 0.6, 1.2, shade(L.dark, 0.85));
  for (const x of axles) {
    for (const s of [-1, 1]) wheel(m, L, x, s * 7.6, r);
    m.bar([x, -6.6, r], [x, 6.6, r], 1.2, 1.2, L.dark);
    m.cyl([x - 1, 0, r], [x + 1, 0, r], 1.2, shade(L.dark, 1.15), 10);
    // Leaf spring pack above the axle.
    for (const s of [-1, 1]) m.bar([x - 2.2, s * 4.6, r + 1.2], [x + 2.2, s * 4.6, r + 1.2], 0.9, 0.5, shade(L.steel, 0.55), 0.15);
    fender(m, L, x, 7.6, r);
  }
}

/** Side kit between the axles at x0–x1 on one side s: strapped fuel tank, battery / tool lockers, step. */
function sideKit(m: Mesh, L: Look, x0: number, x1: number, s: number, half: number): void {
  const len = x1 - x0;
  if (s > 0) {
    m.cyl([x0, s * (half - 1.4), 4.2], [x0 + len * 0.6, s * (half - 1.4), 4.2], 1.4, shade(L.body, 0.85), 14, shade(L.body, 0.7));
    for (const t of [0.15, 0.45]) m.cyl([x0 + len * t, s * (half - 1.4), 4.2], [x0 + len * t + 0.3, s * (half - 1.4), 4.2], 1.48, shade(L.steel, 0.55), 14);
    m.cyl([x0 + len * 0.5, s * (half - 1.4), 5.6], [x0 + len * 0.5, s * (half - 1.4), 6], 0.4, shade(L.steel, 0.9), 8);
    m.cbox(x0 + len * 0.66, x1, s * (half - 2.6), s * (half - 0.2), 2.6, 5.6, 0.25, shade(L.body, 0.8));
  } else {
    m.cbox(x0, x0 + len * 0.45, s * (half - 0.2), s * (half - 2.6), 2.6, 5.6, 0.25, shade(L.body, 0.8));
    m.cbox(x0 + len * 0.5, x1, s * (half - 0.2), s * (half - 2.6), 2.8, 5.6, 0.25, shade(L.dark, 1.15));
    for (const x of [x0 + len * 0.6, x0 + len * 0.85]) m.bar([x, s * (half - 0.15), 4.6], [x + 0.8, s * (half - 0.15), 4.6], 0.2, 0.25, shade(L.steel, 0.6));
  }
  for (const x of [x0 + 0.6, x1 - 0.6]) m.bar([x, s * (half - 0.3), 2.8], [x, s * (half - 0.3), 5.6], 0.3, 0.3, shade(L.steel, 0.6));
}

/** Equipment shelter x0–x1 (front), half-width `half`, z0–z1: louvred sides, door seams and handles, roof air conditioner, grab rails. */
function shelter(m: Mesh, L: Look, x0: number, x1: number, half: number, z0: number, z1: number): void {
  m.cbox(x0, x1, -half, half, z0, z1, 0.4, shade(L.body, 0.92));
  const h = z1 - z0;
  for (const s of [-1, 1]) {
    const y = s * (half + 0.02);
    const n: V3 = [0, s, 0];
    for (let i = 0; i < 5; i++) {
      const z = z0 + h * 0.55 + i * 0.6;
      m.bar([x0 + 0.8, s * (half + 0.08), z], [x0 + (x1 - x0) * 0.42, s * (half + 0.08), z], 0.16, 0.26, shade(L.body, 0.62));
    }
    const dx = x0 + (x1 - x0) * 0.5;
    m.decal([[dx, y, z0 + 0.6], [dx + 0.12, y, z0 + 0.6], [dx + 0.12, y, z1 - 0.6], [dx, y, z1 - 0.6]], n, shade(L.body, 0.55), 0);
    m.decal([[x1 - 0.7, y, z0 + 0.6], [x1 - 0.58, y, z0 + 0.6], [x1 - 0.58, y, z1 - 0.6], [x1 - 0.7, y, z1 - 0.6]], n, shade(L.body, 0.55), 0);
    m.decal([[dx, y, z1 - 0.6], [x1 - 0.58, y, z1 - 0.6], [x1 - 0.58, y, z1 - 0.72], [dx, y, z1 - 0.72]], n, shade(L.body, 0.55), 0);
    m.bar([dx + 0.8, s * (half + 0.15), z0 + h * 0.5], [dx + 0.8, s * (half + 0.15), z0 + h * 0.5 + 1.2], 0.22, 0.22, shade(L.steel, 0.6));
    for (const z of [z0 + 1.2, z1 - 1.4]) m.box(x1 - 0.8, x1 - 0.3, s * half, s * (half + 0.2), z, z + 0.6, shade(L.steel, 0.6));
    // Grab rail along the roof edge.
    m.bar([x0 + 0.6, s * (half - 0.5), z1 + 0.6], [x1 - 0.6, s * (half - 0.5), z1 + 0.6], 0.15, 0.15, shade(L.steel, 0.8));
    for (const x of [x0 + 0.6, x1 - 0.6]) m.bar([x, s * (half - 0.5), z1], [x, s * (half - 0.5), z1 + 0.6], 0.15, 0.15, shade(L.steel, 0.8));
  }
  // Roof air conditioner with fan grille.
  const cx = (x0 + x1) / 2;
  m.cbox(cx - 2, cx + 2, -2.6, 2.6, z1, z1 + 1.4, 0.3, shade(L.body, 0.85));
  m.cyl([cx, 0, z1 + 1.4], [cx, 0, z1 + 1.55], 1.6, shade(L.dark, 1.1), 14);
  for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) m.bar([cx - Math.cos(a) * 1.5, -Math.sin(a) * 1.5, z1 + 1.6], [cx + Math.cos(a) * 1.5, Math.sin(a) * 1.5, z1 + 1.6], 0.12, 0.08, shade(L.steel, 0.7));
}

/** Stabiliser jack at x on side s: box beam out of the deck at height z, vertical ram, round foot pad, hazard stripes. */
function jack(m: Mesh, L: Look, x: number, s: number, z: number, half: number): void {
  const out = half + 2.6;
  m.bar([x, s * (half - 0.5), z], [x, s * out, z], 1.1, 1.1, L.steel, 0.15);
  for (let i = 0; i < 3; i++) {
    const y0 = half + 0.4 + i * 0.75;
    m.decal([[x - 0.56, s * y0, z + 0.57], [x + 0.56, s * y0, z + 0.57], [x + 0.56, s * (y0 + 0.35), z + 0.57], [x - 0.56, s * (y0 + 0.35), z + 0.57]], [0, 0, 1], '#c9a227', 1);
  }
  m.cbox(x - 0.8, x + 0.8, s * out - 0.8, s * out + 0.8, z - 0.6, z + 1.4, 0.2, shade(L.steel, 0.85));
  ram(m, L, [x, s * out, z - 0.6], [x, s * out, 0.6], 0.5);
  m.cyl([x, s * out, 0], [x, s * out, 0.5], 1.2, shade(L.steel, 0.55), 12);
}

/** Launcher deck x0–x1, half-width `half`, z0–z1: tread-plate top, rivet line, tie-down rings, rear lights and a step ladder. */
function deck(m: Mesh, L: Look, x0: number, x1: number, half: number, z0: number, z1: number): void {
  m.cbox(x0, x1, -half, half, z0, z1, 0.2, shade(L.body, 0.88));
  for (let x = x0 + 1; x < x1 - 0.5; x += 1.8) {
    for (const s of [-1, 1]) m.cyl([x, s * half, (z0 + z1) / 2], [x, s * (half + 0.12), (z0 + z1) / 2], 0.13, shade(L.steel, 1.1), 6);
  }
  for (let x = x0 + 1.5; x < x1 - 1; x += 2.4) m.decal([[x, -half + 0.6, z1 + 0.01], [x + 0.25, -half + 0.6, z1 + 0.01], [x + 0.25, half - 0.6, z1 + 0.01], [x, half - 0.6, z1 + 0.01]], [0, 0, 1], shade(L.body, 0.72), 0);
  for (const x of [x0 + 3, x1 - 3]) for (const s of [-1, 1]) m.cyl([x, s * (half + 0.1), z1 - 0.4], [x, s * (half + 0.45), z1 - 0.4], 0.3, shade(L.steel, 0.6), 8);
  for (const s of [-1, 1]) {
    m.cbox(x0 - 0.3, x0 + 0.2, s * (half - 2.4), s * (half - 0.6), z0 - 0.4, z0 + 0.8, 0.1, shade(L.dark, 1.1));
    m.box(x0 - 0.35, x0 - 0.3, s * (half - 2.2), s * (half - 1.5), z0 - 0.2, z0 + 0.6, '#b0221c');
    m.box(x0 - 0.35, x0 - 0.3, s * (half - 1.4), s * (half - 0.8), z0 - 0.2, z0 + 0.6, '#d8902a');
  }
  for (const s of [-1, 1]) m.bar([x0 - 0.4, s * 1.4, 1.2], [x0 - 0.4, s * 1.4, z0], 0.2, 0.3, shade(L.steel, 1.05));
  for (let z = 2; z < z0; z += 1.4) m.bar([x0 - 0.4, -1.4, z], [x0 - 0.4, 1.4, z], 0.18, 0.18, shade(L.steel, 1.05));
}

/** Vertical exhaust stack at (x, y) from z0 to z1 with perforated heat shield and a rain cap. */
function exhaust(m: Mesh, L: Look, x: number, y: number, z0: number, z1: number): void {
  m.cyl([x, y, z0], [x, y, z1], 0.45, shade(L.steel, 0.5), 10);
  m.cyl([x, y, z0 + (z1 - z0) * 0.3], [x, y, z0 + (z1 - z0) * 0.75], 0.7, shade(L.steel, 0.8), 10);
  m.bar([x, y, z1], [x + 0.6, y, z1 + 0.5], 0.9, 0.12, '#1e1c1a');
}

/** Irregular camouflage blotch centred (x, z) on the side face y = ±`y` (both sides), w × h. */
function blot(m: Mesh, x: number, y: number, z: number, w: number, h: number, color: string, seed: number): void {
  const n = 7;
  const poly: P2[] = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 0.7 + 0.3 * Math.abs(Math.sin(seed * 3.1 + i * 1.7));
    return [Math.cos(a) * (w / 2) * k, Math.sin(a) * (h / 2) * k];
  });
  for (const s of [-1, 1]) m.decal(poly.map(([u, v]) => [x + u * s, s * y, z + v] as V3), [0, s, 0], color, 0);
}

/** Irregular camouflage blotch on the top face z = `z`, centred (x, y), w × h. */
function blotTop(m: Mesh, x: number, y: number, z: number, w: number, h: number, color: string, seed: number): void {
  const n = 7;
  const pts: V3[] = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 0.7 + 0.3 * Math.abs(Math.sin(seed * 2.3 + i * 1.9));
    return [x + Math.cos(a) * (w / 2) * k, y + Math.sin(a) * (h / 2) * k, z];
  });
  m.decal(pts, [0, 0, 1], color, 0);
}

/** Mud splashed on a wheel's outer face and the chassis just above it. */
function mud(m: Mesh, x: number, half: number, r: number): void {
  for (const s of [-1, 1]) {
    m.decal(disc(r * 0.95, 12).filter(([, v]) => v < r * 0.2).map(([u, v]) => [x + u, s * (half + 1.02), r + v] as V3), [0, s, 0], '#5a4b37', 1);
  }
}

/** Patriot: 8 × 8 HEMTT tractor towing the M903 launching station on its semi-trailer (outriggers down, generator at the front). */
function patriot(m: Mesh, L: Look): void {
  const [brown, black] = L.camo ?? [L.dark, L.dark];
  const axles = [21.4, 15.6, 10.4, 4.6];
  running(m, L, 2, 24, axles, 2.9);
  for (const x of axles) mud(m, x, 7.6, 2.9);
  cab(m, L, 15, 24, 7.6, 14.5);
  m.cbox(3, 15, -7.4, 7.4, 6, 8.4, 0.3, shade(L.body, 0.85));
  // Fifth wheel, fuel tank and air tanks on the frame, exhaust stack and grab handles behind the cab.
  m.cyl([7.5, 0, 8.4], [7.5, 0, 9.2], 3, shade(L.steel, 0.7), 14);
  for (const s of [-1, 1]) m.cyl([13.6, s * 6.4, 6.6], [7.8, s * 6.4, 6.6], 1.3, shade(L.body, 0.8), 10);
  m.cyl([14.6, -6.2, 8.4], [14.6, -6.2, 17.5], 0.45, shade(L.steel, 0.55), 8);
  for (const s of [-1, 1]) m.bar([15.1, s * 6.4, 9], [15.1, s * 6.4, 13.5], 0.25, 0.25, L.steel);
  // Semi-trailer: gooseneck over the fifth wheel, long deck, two rear axles, outriggers with jack pads.
  m.cbox(3, 11, -6.5, 6.5, 9.2, 11, 0.3, shade(L.body, 0.95));
  m.cbox(-26, 4, -7.6, 7.6, 6.6, 8.4, 0.3, L.body);
  running(m, L, -26, 3, [-17, -21.5]);
  for (const x of [-17, -21.5]) mud(m, x, 7.6, 3.2);
  for (const x of [-25, 2]) {
    for (const s of [-1, 1]) {
      m.bar([x, s * 8, 7.6], [x, s * 10.5, 1], 0.9, 0.9, L.steel);
      ram(m, L, [x, s * 10.5, 4.2], [x, s * 10.5, 0.6], 0.45);
      m.box(x - 1, x + 1, s * 9.5, s * 11.5, 0, 0.4, shade(L.steel, 0.6));
    }
  }
  // Rivet / bolt line along the deck sides and the panel seams.
  for (let x = -25; x <= 3; x += 2) for (const s of [-1, 1]) m.cyl([x, s * 7.6, 7.5], [x, s * 7.75, 7.5], 0.14, shade(L.steel, 1.1), 6);
  // Generator / electronics module at the front of the trailer: louvres, doors, cable reels.
  m.cbox(-3, 3, -7, 7, 8.4, 14.2, 0.4, shade(L.body, 0.92));
  for (let i = 0; i < 4; i++) m.box(-2.5 + i * 1.3, -1.9 + i * 1.3, -7.05, 7.05, 10, 13, shade(L.body, 0.66));
  for (const s of [-1, 1]) m.cyl([-3.6, s * 4.5, 9.4], [-3.6, s * 3, 9.4], 1.3, shade(L.dark, 1.2), 12);
  m.cyl([0, -5, 14.2], [0, -5, 27], 0.08, '#222', 4);
  // Cables and hoses from the generator to the launcher base.
  for (const [s, z] of [[-1, 9.2], [1, 9.6]] as const) {
    m.cyl([-3, s * 5.8, z], [-5.5, s * 5.2, 8.7], 0.25, '#151513', 6);
    m.cyl([-5.5, s * 5.2, 8.7], [-6, s * 3.6, 9], 0.25, '#151513', 6);
  }
  // Steel ladder at the rear of the trailer.
  for (const s of [-1, 1]) m.bar([-26.4, s * 1.6, 1], [-26.4, s * 1.6, 8.4], 0.2, 0.3, shade(L.steel, 1.05));
  for (let z = 2; z < 8.4; z += 1.5) m.bar([-26.4, -1.6, z], [-26.4, 1.6, z], 0.18, 0.18, shade(L.steel, 1.05));
  // Camouflage on the cab, generator module and trailer deck (clear of the cab-door marking).
  blot(m, 22, 7.62, 12.6, 3.6, 2.2, brown, 1);
  blot(m, 16.2, 7.62, 7.6, 2.4, 3, black, 2);
  blot(m, 9, 7.42, 7.2, 4, 1.6, black, 3);
  blot(m, -1.2, 7.02, 12.4, 3.4, 2.6, brown, 4);
  blot(m, 1.6, 7.02, 9.6, 2.2, 1.8, black, 5);
  for (const [x, c, k] of [[-22, brown, 6], [-14, black, 7], [-8, brown, 8]] as const) blot(m, x, 7.62, 7.5, 4.2, 1.6, c, k);
  blotTop(m, 19, -2.5, 15.32, 4, 3, brown, 9);
  blotTop(m, 0, 2.4, 14.22, 3.4, 4, black, 10);
  blotTop(m, -18, -3, 8.42, 6, 4, brown, 11);
  blotTop(m, -10, 3.5, 8.42, 4, 3, black, 12);
  // Yellow warning stencils on the outriggers' deck edge and white data stencil on the generator.
  for (const s of [-1, 1]) {
    for (const x of [-25, 2]) m.decal([[x - 1, s * 7.62, 6.9], [x + 1, s * 7.62, 6.9], [x + 1, s * 7.62, 7.4], [x - 1, s * 7.62, 7.4]], [0, s, 0], '#c9a227', 1);
    m.decal([[-2.4, s * 7.02, 13.3], [2.4, s * 7.02, 13.3], [2.4, s * 7.02, 13.7], [-2.4, s * 7.02, 13.7]], [0, s, 0], '#d9d6c8', 1);
  }
}

/** Patriot launcher (pivot PATRIOT_PIVOT): 2 × 2 block of big square canisters raised 30° on their cradle, twin rams. */
function patriotLauncher(m: Mesh, L: Look): void {
  const c = PATRIOT_PIVOT;
  const [brown, black] = L.camo ?? [L.dark, L.dark];
  m.cyl([c, 0, 8.4], [c, 0, 9.4], 4.6, shade(L.steel, 0.8), 18);
  m.cbox(c - 3, c + 3, -4, 4, 9.4, 11, 0.3, shade(L.body, 0.9));
  for (const s of [-1, 1]) ram(m, L, [c + 15, s * 2.6, 9.4], [c + 9.7, s * 2.6, 17.7], 1);
  const elev = LAUNCH_ELEVATION;
  pack(m, L, [c + 2, 0, 11], elev, 26, 4.6, 2, false);
  // Camouflage bands across the canister block (brown and black) and the hydraulic lines along its sides.
  const dir: V3 = [Math.cos(elev), 0, Math.sin(elev)];
  const up: V3 = [-Math.sin(elev), 0, Math.cos(elev)];
  const at = (t: number, y: number, k: number): V3 => [c + 2 + dir[0] * t + up[0] * k, y, 11 + dir[2] * t + up[2] * k];
  const gap = 4.6 + 0.35;
  for (const [t0, t1, col] of [[3, 6.5, brown], [13, 15, black], [17.5, 20.5, brown]] as const) {
    for (let row = 0; row < 2; row++) {
      for (const y of [-gap / 2, gap / 2]) m.prism(at(t0, y, 2.3 + row * gap), at(t1, y, 2.3 + row * gap), chamfer(4.68, 4.68, 0.55), col);
    }
  }
  for (const s of [-1, 1]) m.cyl(at(0, s * (gap + 0.5), 1), at(18, s * (gap + 0.5), 1), 0.18, '#151513', 6);
}

/** SAMP/T NG: 8 × 8 truck, crew cab, equipment box, launcher deck with stabiliser jacks. */
function sampt(m: Mesh, L: Look): void {
  running(m, L, -24, 22, [17, 11.5, -10, -16]);
  cab(m, L, 13, 22);
  shelter(m, L, 5, 12.5, 7.4, 6, 15.5);
  deck(m, L, -25, 5, 7.8, 5.6, 7.4);
  for (const s of [-1, 1]) sideKit(m, L, -7, 8.2, s, 7.8);
  for (const x of [-24, 3]) for (const s of [-1, 1]) jack(m, L, x, s, 6.4, 7.8);
  exhaust(m, L, 12.8, -6.4, 7, 18);
  // Spare wheel standing behind the shelter, cable reels and the comms mast.
  m.cyl([4.2, -3, 10.6], [3.2, -3, 10.6], 3, L.rubber, 16, shade(L.rubber, 1.3));
  m.cyl([4.25, -3, 10.6], [4.35, -3, 10.6], 1.8, L.steel, 12);
  for (const y of [2, 5]) m.cyl([4.2, y, 9.2], [2.8, y, 9.2], 1.3, shade(L.dark, 1.2), 12, shade(L.steel, 0.7));
  m.cyl([9, 5.5, 17], [9, 5.5, 18.4], 0.35, L.steel, 8);
  m.cyl([9, 5.5, 18.4], [9, 5.5, 29], 0.08, '#222', 4);
}

/** SAMP/T NG launcher (pivot SAMPT_PIVOT): eight round canisters in two rows, raised 30° at the rear. */
function samptLauncher(m: Mesh, L: Look): void {
  const c = SAMPT_PIVOT;
  m.cbox(c - 2, c + 2, -6, 6, 7.4, 9.4, 0.3, shade(L.steel, 0.85));
  ram(m, L, [c + 13, 0, 7.6], [c + 7.7, 0, 16.1], 1.1);
  pack(m, L, [c, 0, 9.4], LAUNCH_ELEVATION, 26, 2.6, 4, true);
}

/** S-400: tractor with the long 5P85 semi-trailer launcher. */
function s400(m: Mesh, L: Look): void {
  running(m, L, 8, 26, [22, 15, 10.5]);
  cab(m, L, 17, 26, 7.6, 15);
  m.cbox(8, 17, -7.4, 7.4, 6, 8.6, 0.3, shade(L.body, 0.85));
  shelter(m, L, 11, 16.5, 7.2, 8.6, 13);
  m.cyl([10, 0, 8.6], [10, 0, 9.4], 3, shade(L.steel, 0.7), 14);
  exhaust(m, L, 16.8, -6.2, 8.6, 17.5);
  // Semi-trailer: gooseneck over the fifth wheel, deck, three rear axles, jacks, landing legs, ladder.
  deck(m, L, -27, 9, 7.6, 6.6, 8.4);
  m.cbox(4, 10, -6.4, 6.4, 8.4, 10.4, 0.3, shade(L.body, 0.95));
  for (const s of [-1, 1]) m.bar([3, s * 6, 8.4], [9.5, s * 6, 10.2], 0.4, 0.6, shade(L.body, 0.8));
  running(m, L, -27, 4, [-14, -18.5, -23]);
  for (const s of [-1, 1]) sideKit(m, L, -10.5, 3.5, s, 7.6);
  for (const x of [-26, 6]) for (const s of [-1, 1]) jack(m, L, x, s, 7.6, 7.6);
  for (const s of [-1, 1]) {
    m.bar([1.5, s * 5, 6.6], [1.5, s * 5, 1], 0.6, 0.6, shade(L.steel, 0.75));
    m.box(0.8, 2.2, s * 5 - 0.7, s * 5 + 0.7, 0.6, 1, shade(L.steel, 0.55));
  }
  // Hoses from the tractor to the trailer.
  for (const [y, c] of [[-1.2, '#151513'], [1.2, '#7a2a1c']] as const) {
    m.cyl([11, y, 9], [9.6, y, 10.6], 0.2, c, 6);
    m.cyl([9.6, y, 10.6], [8.8, y, 9.8], 0.2, c, 6);
  }
  m.cyl([14, 5.5, 13.6], [14, 5.5, 14.8], 0.35, L.steel, 8);
  m.cyl([14, 5.5, 14.8], [14, 5.5, 27], 0.08, '#222', 4);
}

/** S-400 launcher (pivot S400_PIVOT): four long round tubes raised 30°, the erector arm and its ram. */
function s400Launcher(m: Mesh, L: Look): void {
  const c = S400_PIVOT;
  m.cbox(c - 2, c + 2, -6, 6, 8.4, 10.4, 0.3, shade(L.steel, 0.85));
  ram(m, L, [c + 13, 0, 8.6], [c + 7.7, 0, 17.1], 1.2);
  tubes(m, L, [c, 0, 10.4], LAUNCH_ELEVATION, 30, 7);
}

/**
 * S-400 tube pack: four long round transport-launch tubes in a 2 × 2 bundle from the pivot at `p`, raised `elev`, with a
 * clear gap between tubes so each reads as its own cylinder. Per tube: domed rear cap with the gas-generator housing, bolted
 * flanges, raised hoops, team band, seam line, stencils, and a front end cap with a rim, cross ribs and a dark bore. Two
 * slim saddle yokes and a tubular spine under the bundle hold it; no box frame.
 */
function tubes(m: Mesh, L: Look, p: V3, elev: number, len: number, size: number): void {
  const dir: V3 = [Math.cos(elev), 0, Math.sin(elev)];
  const up: V3 = [-Math.sin(elev), 0, Math.cos(elev)];
  const at = (t: number, y: number, k: number): V3 => [p[0] + dir[0] * t + up[0] * k, p[1] + y, p[2] + dir[2] * t + up[2] * k];
  const r = size / 2;
  const gap = size + 0.7;
  const hoop = shade(L.canister, 0.78);
  const lite = shade(L.canister, 1.18);
  for (let row = 0; row < 2; row++) {
    for (const y of [-gap / 2, gap / 2]) {
      const k = r + 1.2 + row * gap;
      // Body, lighter top strip (seam) so the roundness shows.
      m.cyl(at(-0.6, y, k), at(len, y, k), r, L.canister, 20, shade(L.canister, 0.7));
      m.bar(at(0.5, y, k + r - 0.05), at(len - 0.6, y, k + r - 0.05), 0.5, 0.12, lite);
      // Domed rear: stepped caps and the gas-generator housing with its cable plug.
      m.cyl(at(-1.2, y, k), at(-0.6, y, k), r * 0.92, shade(L.canister, 0.72), 18);
      m.cyl(at(-1.7, y, k), at(-1.2, y, k), r * 0.7, shade(L.canister, 0.62), 16);
      m.cyl(at(-2.1, y, k), at(-1.7, y, k), r * 0.38, shade(L.steel, 0.6), 12);
      // Bolted flanges at both ends, raised hoops, team-colour band.
      for (const t of [0, len - 0.8]) {
        m.cyl(at(t, y, k), at(t + 0.5, y, k), r + 0.22, hoop, 20);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          m.cyl(at(t + 0.5, y + Math.cos(a) * (r + 0.1), k + Math.sin(a) * (r + 0.1)), at(t + 0.65, y + Math.cos(a) * (r + 0.1), k + Math.sin(a) * (r + 0.1)), 0.09, shade(L.steel, 1.2), 5);
        }
      }
      for (const t of [len * 0.22, len * 0.62, len * 0.8]) m.cyl(at(t, y, k), at(t + 0.35, y, k), r + 0.14, hoop, 20);
      m.cyl(at(len * 0.42, y, k), at(len * 0.5, y, k), r + 0.08, L.stripe, 20);
      // Front end cap: rim, dark bore, cross ribs, lifting eye.
      m.cyl(at(len, y, k), at(len + 0.3, y, k), r + 0.12, shade(L.canister, 0.65), 20, shade(L.canister, 0.9));
      m.cyl(at(len + 0.3, y, k), at(len + 0.34, y, k), r * 0.78, '#1a1b18', 18);
      const cr = r * 0.75;
      m.bar(at(len + 0.38, y - cr, k), at(len + 0.38, y + cr, k), 0.18, 0.18, lite);
      m.bar(at(len + 0.38, y, k - cr), at(len + 0.38, y, k + cr), 0.18, 0.18, lite);
      m.cyl(at(len + 0.38, y, k), at(len + 0.48, y, k), r * 0.2, lite, 10);
      // Stencils on the outer side of each tube.
      const sd = Math.sign(y);
      const sy = y + sd * (r + 0.02);
      const n: V3 = [0, sd, 0];
      m.decal([at(len * 0.55, sy, k - 0.5), at(len * 0.75, sy, k - 0.5), at(len * 0.75, sy, k + 0.1), at(len * 0.55, sy, k + 0.1)], n, '#d9d6c8', 1);
      m.decal([at(len * 0.3, sy, k - 0.3), at(len * 0.38, sy, k - 0.3), at(len * 0.38, sy, k + 0.3), at(len * 0.3, sy, k + 0.3)], n, '#c9a227', 1);
    }
  }
  // Saddle yokes: thin straps hugging each tube pair, joined by a post between them.
  const k0 = r + 1.2;
  for (const t of [len * 0.3, len * 0.7]) {
    for (const y of [-gap / 2, gap / 2]) {
      m.cyl(at(t, y, k0), at(t + 0.4, y, k0), r + 0.26, shade(L.steel, 0.65), 20);
      m.cyl(at(t, y, k0 + gap), at(t + 0.4, y, k0 + gap), r + 0.26, shade(L.steel, 0.65), 20);
    }
    m.bar(at(t + 0.2, 0, 0.2), at(t + 0.2, 0, k0 + gap + r), 0.5, 0.5, shade(L.steel, 0.65));
    m.bar(at(t + 0.2, -gap / 2, k0 + gap / 2), at(t + 0.2, gap / 2, k0 + gap / 2), 0.4, 0.4, shade(L.steel, 0.65));
  }
  // Tubular spine, rear trunnion, cables to the gas generators.
  m.cyl(at(-1.4, 0, 0.4), at(len * 0.8, 0, 0.4), 0.8, shade(L.steel, 0.8), 14);
  m.cyl(at(-0.6, -gap - 0.8, 0.2), at(-0.6, gap + 0.8, 0.2), 0.9, shade(L.steel, 0.6), 14);
  for (const s of [-1, 1]) m.cyl(at(-2, s * gap / 2, k0 + gap / 2), at(-2.4, s * gap / 2, 0.6), 0.16, '#151513', 6);
}

/** Flat-faced forward-control cab x0–x1 over the front axles (Taian TAS5501): vertical front, wraparound windscreen. */
function flatCab(m: Mesh, L: Look, x0: number, x1: number, half: number, top: number): void {
  m.cbox(x0, x1, -half, half, 5.2, top, 0.6, L.body);
  const n: V3 = [1, 0, 0];
  const f = x1 + 0.03;
  // Three-pane windscreen across the whole front, dark frame, wipers; a sun visor over it.
  m.decal([[f, -half + 0.6, top - 5.4], [f, half - 0.6, top - 5.4], [f, half - 0.6, top - 0.9], [f, -half + 0.6, top - 0.9]], n, shade(L.dark, 0.8), 0);
  for (const [a, b] of [[-half + 0.9, -2.3], [-2, 2], [2.3, half - 0.9]] as const) {
    m.decal([[f, a, top - 5.1], [f, b, top - 5.1], [f, b, top - 1.2], [f, a, top - 1.2]], n, L.glass, 1);
    m.decal([[f, a + 0.4, top - 2.4], [f, a + 1.3, top - 2.4], [f, a + 1, top - 1.4], [f, a + 0.3, top - 1.4]], n, shade(L.glass, 1.8), 2);
  }
  for (const y of [-3.6, 0.4]) m.bar([f + 0.05, y, top - 5], [f + 0.05, y + 2.4, top - 3.2], 0.12, 0.12, '#151513');
  m.cbox(x1 - 0.3, x1 + 0.6, -half, half, top - 0.7, top - 0.3, 0.1, shade(L.body, 0.8));
  // Grille band, headlights in the bumper, tow eyes, a winch drum in the middle.
  for (let i = -4; i <= 4; i++) m.box(f, f + 0.15, i * 1.4 - 0.4, i * 1.4 + 0.4, top - 8.6, top - 6.2, shade(L.body, 0.5));
  m.cbox(x1 - 0.2, x1 + 1.2, -half - 0.2, half + 0.2, 3.4, 6.2, 0.3, shade(L.dark, 1.15));
  for (const sd of [-1, 1]) {
    m.cyl([x1 + 1.2, sd * (half - 1.6), 5.2], [x1 + 1.4, sd * (half - 1.6), 5.2], 0.7, '#eee8c8', 12, '#fffbe0');
    m.cyl([x1 + 1.2, sd * (half - 3.2), 5.2], [x1 + 1.4, sd * (half - 3.2), 5.2], 0.35, '#d8902a', 8);
    m.bar([x1 + 1.3, sd * 2.6, 3.2], [x1 + 2, sd * 2.6, 3.2], 0.5, 0.8, shade(L.steel, 0.55));
  }
  m.cyl([x1 + 1.3, -1.6, 4.8], [x1 + 1.3, 1.6, 4.8], 0.8, shade(L.steel, 0.7), 12);
  // Doors with windows, steps, mirrors on long arms; roof hatch, beacon and antenna.
  for (const sd of [-1, 1]) {
    const y = sd * (half + 0.02);
    const nn: V3 = [0, sd, 0];
    m.decal([[x1 - 5.2, y, 6.2], [x1 - 5.06, y, 6.2], [x1 - 5.06, y, top - 0.8], [x1 - 5.2, y, top - 0.8]], nn, shade(L.body, 0.55), 0);
    m.decal([[x1 - 4.6, y, top - 4.6], [x1 - 1, y, top - 4.6], [x1 - 1, y, top - 1.2], [x1 - 4.6, y, top - 1.2]], nn, L.glass, 1);
    for (const z of [2.6, 4.2]) m.box(x1 - 4.6, x1 - 1.6, sd * (half - 0.6), sd * (half + 0.5), z, z + 0.3, shade(L.steel, 0.65));
    m.bar([x1 - 0.2, sd * half, top - 1.5], [x1 + 0.8, sd * (half + 1.8), top - 1.2], 0.15, 0.15, L.dark);
    m.cbox(x1 + 0.4, x1 + 1, sd * (half + 1.6) - 0.4, sd * (half + 1.6) + 0.4, top - 3, top - 0.9, 0.15, L.dark);
  }
  m.cyl([x0 + 2.5, -2.5, top], [x0 + 2.5, -2.5, top + 0.5], 1.4, shade(L.body, 1.1), 14);
  m.cyl([x0 + 1.5, 5.6, top], [x0 + 1.5, 5.6, top + 13], 0.08, '#222', 4);
  m.cyl([x1 - 1.5, -half + 1.5, top], [x1 - 1.5, -half + 1.5, top + 0.8], 0.45, '#e09a22', 8, '#f4c24a');
}

/** HQ-9: Taian forward-control 8 × 8, power module behind the cab, armoured side lockers, launcher deck and jacks. */
function hq9(m: Mesh, L: Look): void {
  const H = 8.2;
  const [darkG, khaki] = L.camo ?? [L.dark, L.dark];
  const axles = [19.5, 14.5, -9, -14.5];
  running(m, L, -25, 23, axles, 3.4);
  for (const x of axles) mud(m, x, 7.6, 3.4);
  flatCab(m, L, 15.5, 24, H, 17);
  // Tall power / fire-control module, full width, louvred, with two air-filter drums on its roof.
  m.cbox(5, 15, -H + 0.2, H - 0.2, 6, 18.5, 0.4, shade(L.body, 0.94));
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 6; i++) m.box(6 + i * 1.4, 6.8 + i * 1.4, sd * (H - 0.25), sd * (H - 0.1), 12, 17, shade(L.body, 0.62));
    m.decal([[11.5, sd * (H - 0.18), 7], [11.62, sd * (H - 0.18), 7], [11.62, sd * (H - 0.18), 11], [11.5, sd * (H - 0.18), 11]], [0, sd, 0], shade(L.body, 0.5), 0);
  }
  for (const y of [-3.6, 3.6]) {
    m.cyl([9, y, 18.5], [9, y, 21], 1.6, shade(L.steel, 0.8), 14);
    m.cyl([9, y, 21], [9, y, 21.4], 1.8, shade(L.dark, 1.1), 14);
  }
  exhaust(m, L, 14.4, H - 0.8, 7, 21);
  // Launcher deck with long armoured lockers down both sides (no side fuel tanks), jacks fore and aft.
  deck(m, L, -25.5, 5, H, 5.6, 7.4);
  for (const sd of [-1, 1]) {
    m.cbox(-7, 13, sd * (H - 2.4), sd * (H + 0.1), 2.4, 5.8, 0.25, shade(L.body, 0.82));
    for (const x of [-4, 1, 6, 10.5]) m.decal([[x, sd * (H + 0.12), 2.9], [x + 0.12, sd * (H + 0.12), 2.9], [x + 0.12, sd * (H + 0.12), 5.3], [x, sd * (H + 0.12), 5.3]], [0, sd, 0], shade(L.body, 0.55), 0);
  }
  for (const x of [-24.5, 3.5]) for (const sd of [-1, 1]) jack(m, L, x, sd, 6.4, H);
  // Digital camouflage: square pixels of dark green and khaki on the sides and the tops.
  const px = (x: number, z: number, w: number, h: number, c: string): void => {
    for (const sd of [-1, 1]) m.decal([[x, sd * (H + 0.06), z], [x + w, sd * (H + 0.06), z], [x + w, sd * (H + 0.06), z + h], [x, sd * (H + 0.06), z + h]], [0, sd, 0], c, 0);
  };
  for (const [x, z, w, h, c] of [
    [16.4, 12.6, 1.6, 1.2, darkG],
    [17.6, 11.6, 1.2, 1, khaki],
    [6, 7.2, 2, 1.4, darkG],
    [7.6, 8.4, 1.2, 1.2, khaki],
    [12.2, 13, 1.6, 1.6, darkG],
    [13.4, 7.4, 1.2, 1.2, khaki],
    [-20, 5.8, 2.4, 1.2, darkG],
    [-12, 5.9, 1.6, 1.2, khaki],
    [-4, 6, 2, 1, darkG],
    [2, 6, 1.4, 1.2, khaki],
  ] as const) px(x, z, w, h, c);
  const top = (x: number): number => (x > 15 ? 17.01 : x > 4 ? 18.51 : 7.41);
  for (const [x, y, w, h, c] of [[18, -3, 3, 2.4, darkG], [9, 1, 3, 3, khaki], [-18, -2, 4, 3, darkG], [-6, 2, 3, 2.4, khaki]] as const) {
    const z = top(x);
    m.decal([[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]], [0, 0, 1], c, 0);
  }
}

/** HQ-9 launcher (pivot HQ9_PIVOT): four round metal tubes in a square, raised 30° toward the cab by twin rams. */
function hq9Launcher(m: Mesh, L: Look): void {
  const c = HQ9_PIVOT;
  m.cbox(c - 2.5, c + 2.5, -7, 7, 7.4, 9.6, 0.3, shade(L.steel, 0.85));
  for (const sd of [-1, 1]) ram(m, L, [c + 13, sd * 3, 7.6], [c + 7.7, sd * 3, 16.3], 1);
  pack(m, L, [c, 0, 9.6], LAUNCH_ELEVATION, 28, 4, 2, true);
}

/** Model x (forward) of the launcher's traverse axis on each chassis. */
/** Every missile launcher is raised 30° toward the cab. */
const LAUNCH_ELEVATION = Math.PI / 6;
const PATRIOT_PIVOT = -24;
const SAMPT_PIVOT = -22;
const S400_PIVOT = -24;
const HQ9_PIVOT = -22;
const PGZ_PIVOT = -1;
/** PGZ-09 gun elevation (rad): always laid up at the sky, as it only engages aircraft. */
const GUN_ELEVATION = 0.7;

/** Forward offset (model units) of the nation's launcher pivot from the vehicle's centre. */
export function samPivot(faction: FactionId): number {
  return { patriot: PATRIOT_PIVOT, sampt: SAMPT_PIVOT, s400: S400_PIVOT, hq9: HQ9_PIVOT, pgz: PGZ_PIVOT }[look(faction).kind];
}

/** Overall length (model units) of the nation's vehicle: MantisSheet draws them all about a supply truck long. */
export function samLength(faction: FactionId): number {
  return { patriot: 50, sampt: 47, s400: 53, hq9: 47, pgz: 40 }[look(faction).kind];
}

/** The nation's marking on the vehicle's sides. */
function markings(m: Mesh, L: Look): void {
  const marks: { poly: P2[]; color: string }[] =
    L.faction === 'usa'
      ? [{ poly: star(0, 0, 1), color: '#f2f0e6' }]
      : L.faction === 'russia'
        ? [{ poly: star(0, 0, 1.12), color: '#f2f0e6' }, { poly: star(0, 0, 0.92), color: '#c8231e' }]
        : L.faction === 'china'
          ? [{ poly: star(0, 0, 1.12), color: '#f0c419' }, { poly: star(0, 0, 0.9), color: '#d0201a' }]
          : L.faction === 'europe'
            ? [{ poly: disc(1.05, 18), color: '#1f3f9a' }, ...Array.from({ length: 12 }, (_, i) => ({ poly: star(Math.cos((i / 12) * Math.PI * 2) * 0.7, Math.sin((i / 12) * Math.PI * 2) * 0.7, 0.17), color: '#f2c94c' }))]
            : [{ poly: disc(1.05, 18), color: '#1f8a44' }, { poly: star(0.1, 0, 0.5), color: '#f2f0e6' }];
  // Trucks: on the cab doors; PGZ-09: on the hull sides under the turret.
  const front = { patriot: 24, sampt: 22, s400: 26, hq9: 24, pgz: 0 }[L.kind];
  const half = L.kind === 'hq9' ? 8.2 : L.kind === 'sampt' ? 7.8 : 7.6;
  const [x, y, z] = L.kind === 'pgz' ? [-6, 8.62, 8] : L.kind === 'hq9' ? [10, half + 0.04, 9.4] : [front - 6.5, half + 0.04, 9];
  marks.forEach((d, i) => {
    for (const s of [-1, 1]) m.decal(d.poly.map(([u, v]) => [x + u * s * 1.7, s * y, z + v * 1.7] as V3), [0, s, 0], d.color, i);
  });
}

/** `hull`: chassis and markings; `launcher`: the traversing launcher moved to its pivot at the origin; `whole`: both in place (wreck). */
function build(L: Look, part: 'hull' | 'launcher' | 'whole'): Mesh {
  const m = new Mesh();
  if (part !== 'launcher') {
    ({ patriot, sampt, s400, hq9, pgz })[L.kind](m, L);
    markings(m, L);
  }
  if (part !== 'hull') {
    const from = m.polys.length;
    ({ patriot: patriotLauncher, sampt: samptLauncher, s400: s400Launcher, hq9: hq9Launcher, pgz: pgzTurret })[L.kind](m, L);
    if (part === 'launcher') {
      const dx = -samPivot(L.faction);
      // Faces share their corner points: move each point (and inside point) once.
      const moved = new Set<V3>();
      for (const pl of m.polys.slice(from)) {
        for (const p of [...pl.pts, pl.c]) {
          if (moved.has(p)) continue;
          moved.add(p);
          p[0] += dx;
        }
      }
    }
  }
  return m;
}

export type SamCell = { kind: 'drive' | 'shadow' | 'launcher' | 'launcherShadow' | 'wreck'; dir: number } | { kind: 'blast'; frame: number };

/** The burnt-out wreck: every colour charred dark. */
function charred(L: Look): Look {
  const c = (x: string): string => shade(x, 0.42);
  return { ...L, body: c(L.body), dark: c(L.dark), steel: c(L.steel), rubber: c(L.rubber), glass: c(L.glass), canister: c(L.canister), stripe: c(L.stripe), camo: L.camo && [c(L.camo[0]), c(L.camo[1])] };
}

const cells = new Map<string, HTMLCanvasElement>();

/**
 * One in-game picture of a nation's air-defence vehicle (SAM_CELL px, ground centre in the middle) for screen direction
 * `dir` (0–31, clockwise from N), its shadow, burning wreck or an explosion frame; built on first use and cached.
 */
export function samSheetCell(faction: FactionId, cell: SamCell): HTMLCanvasElement {
  const key = `${faction}:${cell.kind}:${'dir' in cell ? cell.dir : cell.frame}`;
  let canvas = cells.get(key);
  if (canvas) return canvas;
  const made = createCanvas(SAM_CELL * RES, SAM_CELL * RES);
  canvas = made.canvas;
  const ctx = made.ctx;
  ctx.scale(RES, RES);
  const mid = SAM_CELL / 2;
  if (cell.kind === 'blast') blast(ctx, cell.frame, mid, mid);
  else {
    const L = look(faction);
    const wreck = cell.kind === 'wreck';
    const launcher = cell.kind === 'launcher' || cell.kind === 'launcherShadow';
    const shadow = cell.kind === 'shadow' || cell.kind === 'launcherShadow';
    drawMesh(ctx, build(wreck ? charred(L) : L, wreck ? 'whole' : launcher ? 'launcher' : 'hull'), arvHeading(cell.dir), mid, mid, shadow, wreck, !wreck);
  }
  cells.set(key, canvas);
  return canvas;
}

/** True for the nations whose big long-range missile leaves the heavier smoke trail (S-400, HQ-9). */
export function heavyMissile(faction: FactionId): boolean {
  const k = look(faction).kind;
  return k === 's400' || k === 'hq9';
}

/** Screen offset (cell px) of the launcher pivot from the vehicle's ground centre at sheet direction `dir`. */
export function samPivotOffset(faction: FactionId, dir: number): { x: number; y: number } {
  const h = arvHeading(dir);
  const p = samPivot(faction);
  const wx = p * Math.cos(h);
  const wy = p * Math.sin(h);
  return { x: (wx - wy) * K, y: (wx + wy) * K * 0.5 };
}

/** Gun instead of missiles: `twin` for the PGZ-09 (two 35 mm cannons), else null. */
export function samGun(faction: FactionId): 'twin' | null {
  return look(faction).kind === 'pgz' ? 'twin' : null;
}
