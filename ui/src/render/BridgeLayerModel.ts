import { FACTIONS } from '../factions';
import type { FactionId } from '../types';
import { Mesh, type P2, type V3, arvHeading, blast, chamfer, disc, drawMesh, star } from './ArvModel';
import { createCanvas } from './Canvas';
import { shade } from './Color';

/**
 * Armoured vehicle-launched bridge (AVLB) of every nation as a detailed polygon model (same renderer as the ARV): a
 * main-battle-tank hull without a turret carrying its folded assault bridge (BridgeLayerSheets draws it in the game).
 * Each nation follows its real-world machine:
 *  - USA: M104 Wolverine — Abrams hull, two flat bridge halves stacked, launch beam over the bow;
 *  - Russia: MTU-72 — T-72 hull, three-section bridge with the side treadways folded in on top;
 *  - China: GQL-111 — Type 84 hull, scissor bridge folded over the hull, big hinge at the bow;
 *  - Europe: Leguan — Leopard 2 hull, two long halves stacked with the cantilever launch arm at the bow;
 *  - Islamic: a desert-sand scissor AVLB on a generic tank hull, its folded bridge standing up as an A.
 */

const RES = 3;
/** Logical size (px) of a picture cell, ground centre in the middle. */
export const BRIDGE_CELL = 80;

type Bridge = 'stack' | 'triple' | 'scissor' | 'arm' | 'upright';

interface Look {
  faction: FactionId;
  body: string;
  track: string;
  steel: string;
  rubber: string;
  deck: string;
  stripe: string;
  bridge: Bridge;
  /** Hull length (half, model units) and the number of road wheels a side. */
  half: number;
  wheels: number;
}

/** The nation's bridge colours (deck, steel, team stripe), shared with the laid Bridge's art. */
export function bridgeColors(f: FactionId): { deck: string; steel: string; stripe: string } {
  const L = look(f);
  return { deck: L.deck, steel: L.steel, stripe: L.stripe };
}

function look(f: FactionId): Look {
  const stripe = FACTIONS[f].colors.primary;
  switch (f) {
    case 'usa':
      return { faction: f, body: '#a08c62', track: '#3a3630', steel: '#8a8478', rubber: '#26241f', deck: '#8c7c58', stripe, bridge: 'stack', half: 17, wheels: 7 };
    case 'russia':
      return { faction: f, body: '#56683a', track: '#2e3028', steel: '#7a7c70', rubber: '#22231f', deck: '#4c5c34', stripe, bridge: 'triple', half: 15.5, wheels: 6 };
    case 'china':
      return { faction: f, body: '#4a5a44', track: '#2c2e2a', steel: '#74786c', rubber: '#212320', deck: '#55654c', stripe, bridge: 'scissor', half: 15.5, wheels: 6 };
    case 'europe':
      return { faction: f, body: '#5c6650', track: '#30322e', steel: '#80847a', rubber: '#232421', deck: '#66705a', stripe, bridge: 'arm', half: 17, wheels: 7 };
    default:
      return { faction: f, body: '#b39c6c', track: '#3c362c', steel: '#8c8270', rubber: '#28241e', deck: '#a48e60', stripe, bridge: 'upright', half: 15.5, wheels: 6 };
  }
}

/** Track loop, road wheels, sprocket, idler and armoured side skirts on both sides. */
function runningGear(m: Mesh, L: Look): void {
  const h = L.half;
  for (const s of [-1, 1]) {
    const yi = s * 7.4;
    const yo = s * 11.6;
    const loop: P2[] = [];
    for (let i = 0; i <= 8; i++) loop.push([h - 0.4 + Math.sin((i / 8) * Math.PI) * 3.3, 3.3 - Math.cos((i / 8) * Math.PI) * 3.3]);
    for (let i = 0; i <= 8; i++) loop.push([-h + 0.4 - Math.sin((i / 8) * Math.PI) * 3.3, 3.3 + Math.cos((i / 8) * Math.PI) * 3.3]);
    m.prism([0, yi, 0], [0, yo, 0], loop, L.track);
    for (let x = -h + 0.6; x < h - 0.6; x += 1.65) m.box(x, x + 0.8, yi - s * 0.05, yo + s * 0.05, 6.55, 6.95, shade(L.track, 0.75));
    const gap = ((h - 2) * 2) / (L.wheels - 1);
    for (let i = 0; i < L.wheels; i++) {
      const x = -h + 2 + i * gap;
      m.cyl([x, s * 10.5, 2.7], [x, s * 11.7, 2.7], 2.15, L.rubber, 16, shade(L.rubber, 1.3));
      m.cyl([x, s * 11.7, 2.7], [x, s * 11.95, 2.7], 1.55, L.steel, 16);
      m.cyl([x, s * 11.95, 2.7], [x, s * 12.2, 2.7], 0.6, shade(L.steel, 0.8), 8);
    }
    m.cyl([-h - 2.4, s * 10.3, 4.3], [-h - 2.4, s * 11.8, 4.3], 2.3, shade(L.steel, 0.8), 16);
    m.cyl([h + 2, s * 10.3, 4], [h + 2, s * 11.8, 4], 2.1, shade(L.steel, 0.85), 16);
    // Skirt panels with bolt rows.
    const panels = Math.round((h * 2) / 6);
    const pw = (h * 2 + 2) / panels;
    for (let i = 0; i < panels; i++) {
      const x0 = -h - 1 + i * pw;
      m.cbox(x0, x0 + pw - 0.2, s * 11.9 - 0.3, s * 11.9 + 0.3, 4.4, 7.9, 0.15, shade(L.body, i % 2 ? 0.9 : 0.97));
      for (let b = 0; b < 3; b++) m.box(x0 + 0.9 + b * 1.6, x0 + 1.2 + b * 1.6, s * 12.2 - 0.05, s * 12.2 + 0.05, 7.3, 7.6, shade(L.body, 0.6));
    }
  }
}

/** Turretless tank hull: chamfered body, two-plate glacis, driver's hatch and periscopes, engine deck grilles. */
function hull(m: Mesh, L: Look): void {
  const h = L.half;
  m.prism([-h - 3, 0, 8], [h - 1.5, 0, 8], chamfer(18, 8, 1.6).map(([p, q]) => (q < 0 ? [p < 0 ? -9 : 9, q] : [p, q]) as P2), L.body);
  m.bar([h - 1.5, 0, 11.6], [h + 3.5, 0, 6.6], 18, 1.6, shade(L.body, 1.04), 0.3);
  m.bar([h + 3.4, 0, 6.8], [h + 2.6, 0, 3], 18, 1.4, shade(L.body, 0.95), 0.3);
  m.cbox(-h - 3.5, -h - 3, -6, 6, 5, 11, 0.3, shade(L.body, 0.9));
  // Driver's station at the bow: hatch, three periscopes, headlights in guards.
  m.cyl([h - 4, 0, 12], [h - 4, 0, 12.6], 1.8, shade(L.body, 1.08), 14);
  for (let i = -1; i <= 1; i++) m.box(h - 2.6, h - 2, i * 1.3 - 0.45, i * 1.3 + 0.45, 12, 12.7, '#2e3a44');
  for (const y of [-7.4, 7.4]) {
    m.cyl([h - 1.4, y, 12.2], [h + 0.2, y, 12.2], 0.7, shade(L.body, 0.9), 10, '#eee8c8');
    m.bar([h + 0.4, y - 0.9, 13.1], [h + 0.4, y + 0.9, 13.1], 0.2, 0.2, L.steel);
  }
  // Engine deck: louvres, exhaust boxes at the rear corners.
  m.cbox(-h - 2.6, -h + 9, -8.4, 8.4, 12, 12.9, 0.3, shade(L.body, 0.96));
  for (let i = 0; i < 6; i++) m.box(-h - 1.8 + i * 1.6, -h - 1.1 + i * 1.6, -6.6, 6.6, 12.9, 13.15, shade(L.body, 0.62));
  for (const y of [-7.6, 7.6]) m.cbox(-h - 2.8, -h, y - 0.9, y + 0.9, 12.9, 14.2, 0.3, shade(L.body, 0.85));
  // Antenna and its base, smoke dischargers at the bow corners.
  m.cyl([-h + 2, 7, 12.9], [-h + 2, 7, 13.8], 0.45, L.steel, 8);
  m.cyl([-h + 2, 7, 13.8], [-h + 2, 7, 26], 0.08, '#222', 4);
  for (const y of [-8.6, 8.6]) for (let k = 0; k < 3; k++) m.cyl([h - 6 + k * 0.7, y, 12], [h - 5.4 + k * 0.7, y + Math.sign(y) * 1.1, 13], 0.28, shade(L.track, 1.3), 8);
}

/**
 * One bridge section (treadway pair with a centre gap), lying from x0 to x1 at height z: two ribbed treadways,
 * their kerbs, cross beams underneath and the team-colour stripe along the outer kerbs.
 */
function section(m: Mesh, L: Look, x0: number, x1: number, z: number, width = 21, thick = 1.6, tilt = 0): void {
  const tw = width * 0.4;
  const zi = (x: number): number => z + (x - x0) * tilt;
  for (const s of [-1, 1]) {
    const yc = s * (width / 2 - tw / 2);
    m.prism([x0, yc, zi(x0)], [x1, yc, zi(x1)], chamfer(tw, thick, 0.25), L.deck, shade(L.deck, 0.85));
    // Anti-slip ribs across the treadway.
    for (let x = x0 + 1; x < x1 - 0.6; x += 1.5) {
      m.bar([x, yc - tw / 2 + 0.3, zi(x) + thick / 2 + 0.06], [x, yc + tw / 2 - 0.3, zi(x) + thick / 2 + 0.06], 0.3, 0.14, shade(L.deck, 0.72));
    }
    // Outer kerb with the stripe.
    m.bar([x0, s * (width / 2 - 0.2), zi(x0) + thick / 2 + 0.4], [x1, s * (width / 2 - 0.2), zi(x1) + thick / 2 + 0.4], 0.4, 0.8, shade(L.deck, 1.1));
    m.bar([x0 + 1, s * (width / 2 + 0.02), zi(x0 + 1) + thick / 2], [x1 - 1, s * (width / 2 + 0.02), zi(x1 - 1) + thick / 2], 0.05, 0.6, L.stripe);
  }
  // Cross beams tying the two treadways together.
  for (let x = x0 + 1.5; x < x1 - 1; x += 5) m.bar([x, -width / 2 + tw, zi(x) - thick / 4], [x, width / 2 - tw, zi(x) - thick / 4], 0.9, 0.9, shade(L.steel, 0.85));
  // Tapered ramp ends.
  for (const s of [-1, 1]) {
    const yc = s * (width / 2 - tw / 2);
    m.prism([x1, yc, zi(x1)], [x1 + 1.6, yc, zi(x1) - thick * 0.25], chamfer(tw, thick * 0.5, 0.15), shade(L.deck, 0.9));
  }
}

/** Hydraulic ram between two points: barrel and polished rod. */
function ram(m: Mesh, L: Look, a: V3, b: V3, r = 0.9): void {
  const mid: V3 = [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55, a[2] + (b[2] - a[2]) * 0.55];
  m.cyl(a, mid, r, shade(L.steel, 0.8), 10);
  m.cyl(a, b, r * 0.55, shade(L.steel, 1.2), 10);
}

/** The folded bridge in its nation's style, on top of the hull. */
function bridge(m: Mesh, L: Look): void {
  const h = L.half;
  switch (L.bridge) {
    case 'stack': {
      // Wolverine: two halves stacked flat, overhanging both ends; launch beam and its rams at the bow.
      section(m, L, -h - 6, h + 5, 14.4);
      section(m, L, -h - 5, h + 6, 16.6, 20.4);
      m.cbox(h + 3.5, h + 6.5, -3, 3, 8, 15.4, 0.4, shade(L.steel, 0.95));
      for (const y of [-2.2, 2.2]) ram(m, L, [h - 2, y, 12.2], [h + 4.6, y, 14.2]);
      for (const y of [-6, 6]) m.cbox(-h + 1, -h + 4, y - 1, y + 1, 12.9, 13.6, 0.2, shade(L.steel, 0.8));
      break;
    }
    case 'triple': {
      // MTU-72: centre section on supports, the two end sections folded back on top of it, hinge blocks at the folds.
      for (const x of [-h + 2, h - 6]) for (const y of [-5, 5]) m.cbox(x - 0.8, x + 0.8, y - 0.8, y + 0.8, 12.9, 14.2, 0.2, shade(L.steel, 0.8));
      section(m, L, -h - 2, h + 2, 14.6, 20);
      section(m, L, -h - 1, 0.5, 16.8, 19, 1.4);
      section(m, L, -0.5, h + 1, 16.8, 19, 1.4);
      for (const x of [-h - 2.6, h + 2.6]) m.cbox(x - 1, x + 1, -9.8, 9.8, 14.4, 18.2, 0.3, shade(L.steel, 0.9));
      ram(m, L, [h - 3, 0, 12.2], [h + 3, 0, 15.6], 1.1);
      break;
    }
    case 'scissor': {
      // GQL-111: scissor bridge folded over the hull, the two halves meeting at a heavy hinge above the bow.
      section(m, L, -h - 4, h + 3, 14.6, 19.5);
      section(m, L, -h - 3, h + 3, 17.4, 19.5, 1.6, -0.02);
      m.cyl([h + 3.6, -10.5, 16], [h + 3.6, 10.5, 16], 1.9, shade(L.steel, 0.85), 16);
      for (const y of [-10.6, 10.6]) m.cyl([h + 3.6, y - 0.2, 16], [h + 3.6, y + 0.2, 16], 2.4, shade(L.steel, 0.7), 16);
      // Launch frame: two A-arms and their rams from the hull front.
      for (const y of [-4, 4]) {
        m.bar([h - 2, y, 12], [h + 3.4, y, 15.4], 1.2, 1.2, shade(L.body, 0.9), 0.2);
        ram(m, L, [h - 6, y, 12.4], [h + 2, y, 15.8]);
      }
      break;
    }
    case 'arm': {
      // Leguan: two long halves side by side in height, the cantilever launch arm running over them to the bow.
      section(m, L, -h - 7, h + 4, 14.4, 20.5);
      section(m, L, -h - 6, h + 5, 16.5, 20.5);
      // Launch arm: box girder from the rear pivot over the stack to the bow, its rams and the bow cross head.
      m.cyl([-h - 1, -3.2, 14], [-h - 1, 3.2, 14], 1.4, shade(L.steel, 0.85), 14);
      m.prism([-h - 1, 0, 19.4], [h + 2, 0, 19.4], chamfer(3.6, 2, 0.4), shade(L.body, 1.04));
      m.bar([-h - 1, 0, 14], [-h + 1, 0, 19.4], 3, 1.6, shade(L.body, 0.95), 0.2);
      m.cbox(h + 1, h + 3.5, -6, 6, 17.8, 20.4, 0.4, shade(L.steel, 0.9));
      ram(m, L, [-h + 3, 0, 12.9], [-h + 7, 0, 18.6], 1);
      m.bar([-h + 4, -1.8, 20.42], [h - 2, -1.8, 20.42], 0.6, 0.06, L.stripe);
      break;
    }
    default: {
      // Desert scissor AVLB: the folded bridge standing up as a tall A over the hull, hinge at its apex.
      const top = 31;
      for (const [x0, x1] of [[-h - 3, -2], [h + 1, 2]] as const) {
        for (const s of [-1, 1]) {
          const yc = s * 6.2;
          m.prism([x0, yc, 13.4], [x1, yc, top], chamfer(7.4, 1.4, 0.25), L.deck, shade(L.deck, 0.85));
          m.bar([x0, s * 10, 13.6], [x1, s * 10, top], 0.4, 0.8, shade(L.deck, 1.1));
          m.bar([x0 + (x1 - x0) * 0.1, s * 10.25, 13.6 + (top - 13.4) * 0.1], [x0 + (x1 - x0) * 0.9, s * 10.25, 13.6 + (top - 13.4) * 0.9], 0.05, 0.5, L.stripe);
        }
        for (let t = 0.15; t < 0.95; t += 0.2) {
          const x = x0 + (x1 - x0) * t;
          const z = 13.4 + (top - 13.4) * t;
          m.bar([x, -3, z], [x, 3, z], 0.8, 0.8, shade(L.steel, 0.85));
        }
      }
      m.cyl([0, -10.5, top], [0, 10.5, top], 1.6, shade(L.steel, 0.85), 14);
      for (const y of [-6, 6]) ram(m, L, [h - 4, y, 12.4], [h - 8, y, 19]);
      // Base frame the bridge rests on.
      m.cbox(-h - 2, h, -9.8, 9.8, 12.9, 13.6, 0.3, shade(L.steel, 0.75));
      break;
    }
  }
}

/** The nation's marking on the hull sides. */
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
  marks.forEach((d, i) => {
    for (const s of [-1, 1]) m.decal(d.poly.map(([u, v]) => [2 + u * s * 1.7, s * 9.02, 9 + v * 1.7] as V3), [0, s, 0], d.color, i);
  });
}

function build(L: Look): Mesh {
  const m = new Mesh();
  runningGear(m, L);
  hull(m, L);
  bridge(m, L);
  markings(m, L);
  return m;
}

const cells = new Map<string, HTMLCanvasElement>();

/** One picture of a nation's bridge layer at world heading `h` (BRIDGE_CELL px, ground centre in the middle), cached. */
export function bridgeLayerCell(faction: FactionId, h: number): HTMLCanvasElement {
  const key = `${faction}:${h.toFixed(3)}`;
  let canvas = cells.get(key);
  if (canvas) return canvas;
  const made = createCanvas(BRIDGE_CELL * RES, BRIDGE_CELL * RES);
  canvas = made.canvas;
  const ctx = made.ctx;
  ctx.scale(RES, RES);
  const mid = BRIDGE_CELL / 2;
  const mesh = build(look(faction));
  ctx.globalAlpha = 0.35;
  drawMesh(ctx, mesh, h, mid, mid + 6, true, false);
  ctx.globalAlpha = 1;
  drawMesh(ctx, mesh, h, mid, mid + 6, false, false, true);
  cells.set(key, canvas);
  return canvas;
}

/** Sidebar picture (w × h canvas) of the nation's bridge layer, three-quarter view. */
export function bridgeLayerPortrait(faction: FactionId, w = 128, h = 96): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(w, h);
  const size = Math.min(w, h) * 2.3;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bridgeLayerCell(faction, 0.45), (w - size) / 2, (h - size) / 2, size, size);
  return canvas;
}

export type BridgeLayerCell = { kind: 'drive' | 'shadow' | 'wreck'; dir: number } | { kind: 'blast'; frame: number };

/** The burnt-out wreck: every colour charred dark. */
function charred(L: Look): Look {
  const c = (x: string): string => shade(x, 0.42);
  return { ...L, body: c(L.body), track: c(L.track), steel: c(L.steel), rubber: c(L.rubber), deck: c(L.deck), stripe: c(L.stripe) };
}

/**
 * One in-game picture of a nation's bridge layer (BRIDGE_CELL px, ground centre in the middle) for screen direction
 * `dir` (0–31, as the ARV's), its shadow, burning wreck or an explosion frame; built on first use and cached.
 */
export function bridgeLayerSheetCell(faction: FactionId, cell: BridgeLayerCell): HTMLCanvasElement {
  const key = `sheet:${faction}:${cell.kind}:${'dir' in cell ? cell.dir : cell.frame}`;
  let canvas = cells.get(key);
  if (canvas) return canvas;
  const made = createCanvas(BRIDGE_CELL * RES, BRIDGE_CELL * RES);
  canvas = made.canvas;
  const ctx = made.ctx;
  ctx.scale(RES, RES);
  const mid = BRIDGE_CELL / 2;
  if (cell.kind === 'blast') blast(ctx, cell.frame, mid, mid);
  else {
    const L = look(faction);
    const wreck = cell.kind === 'wreck';
    drawMesh(ctx, build(wreck ? charred(L) : L), arvHeading(cell.dir), mid, mid, cell.kind === 'shadow', wreck, !wreck);
  }
  cells.set(key, canvas);
  return canvas;
}
