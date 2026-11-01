import { FACTIONS } from '../factions';
import type { FactionId } from '../types';
import { K, Mesh, type P2, type V3, arvHeading, blast, chamfer, disc, drawMesh, star } from './ArvModel';
import { createCanvas } from './Canvas';
import { shade } from './Color';

/**
 * Air-defence vehicle (`mantis`) of every nation as a detailed polygon model (same renderer as the ARV and bridge layer),
 * after its real-world system; the launcher (or gun turret) is a separate part that traverses on its own:
 *  - USA: Patriot — HEMTT tractor towing the M903 launching station: four big square canisters raised at 38°;
 *  - Europe: SAMP/T NG — 8 × 8 truck with eight round canisters in two rows, erected near-vertical at the rear;
 *  - Russia: S-400 — tractor with the 5P85 semi-trailer launcher: four long round tubes erected near-vertical;
 *  - China: HQ-9 — 8 × 8 truck with four long tubes erected vertical at the rear;
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
}

function look(f: FactionId): Look {
  const stripe = FACTIONS[f].colors.primary;
  switch (f) {
    case 'usa':
      return { faction: f, kind: 'patriot', body: '#a38f63', dark: '#4a4234', steel: '#8a8478', rubber: '#24221e', glass: '#2c3a46', canister: '#b9a87c', stripe };
    case 'europe':
      return { faction: f, kind: 'sampt', body: '#5e6852', dark: '#33372e', steel: '#80847a', rubber: '#232421', glass: '#2a3842', canister: '#717a64', stripe };
    case 'china':
      return { faction: f, kind: 'hq9', body: '#4b5c45', dark: '#2b2e29', steel: '#74786c', rubber: '#212320', glass: '#2a3640', canister: '#5a6b52', stripe };
    case 'islamic':
      return { faction: f, kind: 'pgz', body: '#5d6b3a', dark: '#2c2f26', steel: '#76786a', rubber: '#212320', glass: '#2a3640', canister: '#66753f', stripe };
    default:
      return { faction: f, kind: 's400', body: '#56683a', dark: '#2e3028', steel: '#7a7c70', rubber: '#22231f', glass: '#2a3640', canister: '#64773f', stripe };
  }
}

/**
 * Launcher pack: `cols` × 2 canisters from the pivot at `p`, raised `elev` rad and `len` long, rising towards the rear
 * (−x); the second row sits in front of the first. Each has an exit cover and a band of team colour; side rails and a
 * cradle hold them. Returns the middle of the pack's upper end.
 */
function pack(m: Mesh, L: Look, p: V3, elev: number, len: number, size: number, cols: number, round: boolean): V3 {
  const dir: V3 = [-Math.cos(elev), 0, Math.sin(elev)];
  const up: V3 = [Math.sin(elev), 0, Math.cos(elev)];
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
    }
  }
  const w = (cols * gap) / 2 + 0.3;
  for (const s of [-1, 1]) m.bar(at(-1.4, s * w, gap), at(len + 0.2, s * w, gap), 0.5, gap * 2 + 0.4, shade(L.steel, 0.85));
  m.bar(at(-1.4, 0, -0.4), at(len * 0.85, 0, -0.4), w * 2, 0.8, shade(L.body, 0.9));
  return at(len, 0, gap);
}

/** Hydraulic ram between two points: barrel and polished rod. */
function ram(m: Mesh, L: Look, a: V3, b: V3, r = 0.9): void {
  m.cyl(a, [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55, a[2] + (b[2] - a[2]) * 0.55], r, shade(L.steel, 0.8), 10);
  m.cyl(a, b, r * 0.55, shade(L.steel, 1.2), 10);
}

/** Wheel with tyre, rim and hub across the y axis at (x, y). */
function wheel(m: Mesh, L: Look, x: number, y: number, r: number): void {
  const s = Math.sign(y);
  m.cyl([x, y - s * 1, r], [x, y + s * 1, r], r, L.rubber, 16, shade(L.rubber, 1.3));
  m.cyl([x, y + s * 1, r], [x, y + s * 1.15, r], r * 0.6, L.steel, 12);
  m.cyl([x, y + s * 1.15, r], [x, y + s * 1.4, r], r * 0.2, shade(L.steel, 0.75), 8);
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

/** Flat-fronted truck cab from x0 to x1 (front): windscreen, side windows, roof, grille, headlights, mirrors. */
function cab(m: Mesh, L: Look, x0: number, x1: number, half = 7.8, top = 15.5): void {
  m.cbox(x0, x1, -half, half, 5.5, top, 0.6, L.body);
  m.decal([[x1 + 0.02, -half + 0.8, top - 4.4], [x1 + 0.02, half - 0.8, top - 4.4], [x1 + 0.02, half - 0.8, top - 0.8], [x1 + 0.02, -half + 0.8, top - 0.8]], [1, 0, 0], L.glass, 0);
  for (const s of [-1, 1]) m.decal([[x1 - 1, s * (half + 0.02), top - 4.4], [x1 - 4.5, s * (half + 0.02), top - 4.4], [x1 - 4.5, s * (half + 0.02), top - 1], [x1 - 1, s * (half + 0.02), top - 1]], [0, s, 0], L.glass, 0);
  for (let i = -3; i <= 3; i++) m.box(x1, x1 + 0.2, i * 1.1 - 0.3, i * 1.1 + 0.3, 7, 9.6, shade(L.body, 0.55));
  for (const s of [-1, 1]) {
    m.cyl([x1, s * (half - 1.6), 7.2], [x1 + 0.4, s * (half - 1.6), 7.2], 0.8, '#eee8c8', 10);
    m.bar([x1 - 1.4, s * (half + 1), top - 3], [x1 - 1.4, s * (half + 1), top - 1], 0.3, 0.5, L.dark);
  }
  m.cbox(x1 - 0.4, x1 + 1.4, -half, half, 3.2, 5.8, 0.3, shade(L.body, 0.8));
  m.cbox(x0 + 1, x1 - 2, -half + 1, half - 1, top, top + 0.8, 0.3, shade(L.body, 1.06));
}

/** Chassis rails from x0 to x1 and road wheels on each axle in `axles`. */
function running(m: Mesh, L: Look, x0: number, x1: number, axles: readonly number[], r = 3.2): void {
  for (const y of [-3.4, 3.4]) m.bar([x0, y, 4.6], [x1, y, 4.6], 1.2, 1.8, L.dark);
  for (const x of axles) {
    for (const s of [-1, 1]) wheel(m, L, x, s * 7.6, r);
    m.bar([x, -6.6, r], [x, 6.6, r], 1.2, 1.2, L.dark);
  }
}

/** Patriot: HEMTT tractor towing the M903 launching station (outriggers down, generator at the front of the trailer). */
function patriot(m: Mesh, L: Look): void {
  running(m, L, 6, 24, [20, 14, 9.5]);
  cab(m, L, 15, 24, 7.6, 14.5);
  m.cbox(6, 15, -7.4, 7.4, 6, 8.4, 0.3, shade(L.body, 0.85));
  m.cyl([9.5, 0, 8.4], [9.5, 0, 9.2], 3, shade(L.steel, 0.7), 14);
  // Semi-trailer: gooseneck over the fifth wheel, long deck, two rear axles, outriggers.
  m.cbox(5, 12, -6.5, 6.5, 9.2, 11, 0.3, shade(L.body, 0.95));
  m.cbox(-26, 6, -7.6, 7.6, 6.6, 8.4, 0.3, L.body);
  running(m, L, -26, 5, [-17, -21.5]);
  for (const x of [-25, 4]) for (const s of [-1, 1]) m.bar([x, s * 8, 7.6], [x, s * 10.5, 1], 0.9, 0.9, L.steel);
  // Generator / electronics module at the front of the trailer.
  m.cbox(-1, 5, -7, 7, 8.4, 14.2, 0.4, shade(L.body, 0.92));
  for (let i = 0; i < 4; i++) m.box(-0.5 + i * 1.3, 0.1 + i * 1.3, -7.05, 7.05, 10, 13, shade(L.body, 0.66));
  m.cyl([2, -5, 14.2], [2, -5, 27], 0.08, '#222', 4);
}

/** Patriot launcher (pivot PATRIOT_PIVOT): four big square canisters raised 38° on their cradle. */
function patriotLauncher(m: Mesh, L: Look): void {
  const c = PATRIOT_PIVOT;
  m.cyl([c, 0, 8.4], [c, 0, 9.4], 4.6, shade(L.steel, 0.8), 18);
  m.cbox(c - 3, c + 3, -4, 4, 9.4, 11, 0.3, shade(L.body, 0.9));
  ram(m, L, [c - 4, 0, 10], [c - 10, 0, 15.6], 1.1);
  pack(m, L, [c + 2, 0, 11], 0.66, 22, 4.6, 2, false);
}

/** SAMP/T NG: 8 × 8 truck, crew cab, equipment box, launcher deck with stabiliser jacks. */
function sampt(m: Mesh, L: Look): void {
  running(m, L, -24, 22, [17, 11.5, -10, -16]);
  cab(m, L, 13, 22);
  m.cbox(5, 12.5, -7.4, 7.4, 6, 15.5, 0.4, shade(L.body, 0.92));
  for (let i = 0; i < 4; i++) m.box(5.5 + i * 1.6, 6.2 + i * 1.6, -7.45, 7.45, 9, 13, shade(L.body, 0.66));
  m.cbox(-25, 5, -7.8, 7.8, 5.6, 7.4, 0.2, shade(L.body, 0.88));
  for (const x of [-24, 3]) for (const s of [-1, 1]) m.bar([x, s * 8.2, 6.4], [x, s * 9.6, 1], 0.9, 0.9, L.steel);
  m.cyl([9, 5.5, 15.5], [9, 5.5, 27], 0.08, '#222', 4);
}

/** SAMP/T NG launcher (pivot SAMPT_PIVOT): eight round canisters in two rows, erected near-vertical at the rear. */
function samptLauncher(m: Mesh, L: Look): void {
  const c = SAMPT_PIVOT;
  m.cbox(c - 2, c + 2, -6, 6, 7.4, 9.4, 0.3, shade(L.steel, 0.85));
  ram(m, L, [c + 20, 0, 7.6], [c + 3.6, 0, 18], 1.1);
  pack(m, L, [c, 0, 9.4], 1.4, 20, 2.6, 4, true);
}

/** S-400: tractor with the long 5P85 semi-trailer launcher. */
function s400(m: Mesh, L: Look): void {
  running(m, L, 8, 26, [22, 15, 10.5]);
  cab(m, L, 17, 26, 7.6, 15);
  m.cbox(8, 17, -7.4, 7.4, 6, 8.6, 0.3, shade(L.body, 0.85));
  m.cbox(11, 16.5, -7.2, 7.2, 8.6, 13, 0.3, shade(L.body, 0.92));
  m.cyl([10, 0, 8.6], [10, 0, 9.4], 3, shade(L.steel, 0.7), 14);
  m.cbox(-27, 9, -7.6, 7.6, 6.6, 8.4, 0.3, L.body);
  m.cbox(4, 10, -6.4, 6.4, 8.4, 10.4, 0.3, shade(L.body, 0.95));
  running(m, L, -27, 4, [-14, -18.5, -23]);
  for (const x of [-26, 6]) for (const s of [-1, 1]) m.bar([x, s * 8, 7.6], [x, s * 10.5, 1], 0.9, 0.9, L.steel);
  m.cyl([14, 5.5, 13], [14, 5.5, 26], 0.08, '#222', 4);
}

/** S-400 launcher (pivot S400_PIVOT): four long round tubes erected near-vertical, the erector arm and its ram. */
function s400Launcher(m: Mesh, L: Look): void {
  const c = S400_PIVOT;
  m.cbox(c - 2, c + 2, -6, 6, 8.4, 10.4, 0.3, shade(L.steel, 0.85));
  ram(m, L, [c + 22, 0, 8.6], [c + 4.4, 0, 21], 1.2);
  pack(m, L, [c, 0, 10.4], 1.45, 26, 3.2, 2, true);
}

/** HQ-9: 8 × 8 truck with crew cab, power unit and launcher deck. */
function hq9(m: Mesh, L: Look): void {
  running(m, L, -24, 22, [17.5, 12, -9.5, -15.5]);
  cab(m, L, 12, 22, 7.8, 16);
  m.cbox(4, 11.5, -7.4, 7.4, 6, 13.5, 0.4, shade(L.body, 0.9));
  m.cyl([7.5, -4.5, 13.5], [7.5, -4.5, 15.5], 1, shade(L.dark, 1.3), 10);
  m.cbox(-25, 4, -7.8, 7.8, 5.6, 7.4, 0.2, shade(L.body, 0.88));
  for (const x of [-24, 2]) for (const s of [-1, 1]) m.bar([x, s * 8.2, 6.4], [x, s * 9.6, 1], 0.9, 0.9, L.steel);
  m.cyl([10, 5.5, 16], [10, 5.5, 28], 0.08, '#222', 4);
}

/** HQ-9 launcher (pivot HQ9_PIVOT): four long tubes erected vertical with their erector ram. */
function hq9Launcher(m: Mesh, L: Look): void {
  const c = HQ9_PIVOT;
  m.cbox(c - 2, c + 2, -6, 6, 7.4, 9.4, 0.3, shade(L.steel, 0.85));
  ram(m, L, [c + 19, 0, 7.6], [c + 4.6, 0, 20], 1.2);
  pack(m, L, [c, 0, 9.4], 1.5, 24, 3.4, 2, true);
}

/** Model x (forward) of the launcher's traverse axis on each chassis. */
const PATRIOT_PIVOT = -6;
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
  const front = { patriot: 24, sampt: 22, s400: 26, hq9: 22, pgz: 0 }[L.kind];
  const half = L.kind === 'sampt' || L.kind === 'hq9' ? 7.8 : 7.6;
  const [x, y, z] = L.kind === 'pgz' ? [-6, 8.62, 8] : [front - 6.5, half + 0.04, 9];
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
  return { ...L, body: c(L.body), dark: c(L.dark), steel: c(L.steel), rubber: c(L.rubber), glass: c(L.glass), canister: c(L.canister), stripe: c(L.stripe) };
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
