import { FACTIONS } from '../factions';
import type { FactionId } from '../types';
import { K, KZ, Mesh, type P2, type V3, chamfer, disc, drawMesh, star } from './ArvModel';
import { createCanvas } from './Canvas';
import { hexToRgb, shade } from './Color';

/**
 * Every nation's bunker as a detailed polygon model (same renderer as the ARV): faceted concrete / brick / sandbag
 * bodies with real firing embrasures (lỗ châu mai), rendered on demand into cached cells — 8 gun facings × 5 damage
 * stages (intact, light, heavy, burning, ruin). The whole bunker turns so its main embrasure faces the target.
 */

/** Logical cell (px) and the resolution it is rendered at. */
export const BUNKER_CELL = 80;
const RES = 3;
/** The bunker's ground centre inside a cell. */
export const BUNKER_ANCHOR = { x: 40, y: 54 } as const;
/** Cell px across the bunker with its sandbags (drawn one grid cell wide). */
export const BUNKER_BODY_PX = 50;

const SLIT = '#141414';

interface Damage {
  stage: number; // 0 intact … 4 ruin
}

/** `c` painted over with `t` (share 0–1): the nation's colours in its own military finish. */
function tint(c: string, t: string, k: number): string {
  const a = hexToRgb(c);
  const b = hexToRgb(t);
  const h = (n: number): string => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(a[0] + (b[0] - a[0]) * k)}${h(a[1] + (b[1] - a[1]) * k)}${h(a[2] + (b[2] - a[2]) * k)}`;
}

/** Camouflage patches in the nation's colours on the two forward walls (just above the face at distance r). */
function camo(m: Mesh, r: number, z0: number, z1: number, team: string, base: string): void {
  const spots: [number, number, number][] = [[-0.5, 0.3, 1.6], [0.35, 0.6, 1.3], [0.1, 0.15, 1.1], [-0.2, 0.75, 0.9]];
  spots.forEach(([t, zt, s], i) => {
    const col = i % 2 ? tint(base, team, 0.75) : shade(tint(base, team, 0.55), 0.8);
    for (const side of [-1, 1]) {
      const z = z0 + (z1 - z0) * zt;
      const y = t * r * 0.8;
      m.decal(disc(s, 7).map(([u, v]) => (side > 0 ? [r + 0.02, y + u * 1.4, z + v] : [y + u * 1.4, -r - 0.02, z + v]) as V3), side > 0 ? [1, 0, 0] : [0, -1, 0], col, 2);
    }
  });
}

/** Darkens a colour with the damage stage (soot, scorch). */
const scorch = (c: string, d: Damage): string => shade(c, 1 - d.stage * 0.12);

/** A firing embrasure: a dark slit box pushed into the wall at (x, y) facing `n` (unit, along x or y), w × h. */
function slit(m: Mesh, at: V3, alongX: boolean, w: number, h: number, depth = 0.6): void {
  const [x, y, z] = at;
  if (alongX) m.box(x - depth / 2, x + depth / 2, y - w / 2, y + w / 2, z - h / 2, z + h / 2, SLIT);
  else m.box(x - w / 2, x + w / 2, y - depth / 2, y + depth / 2, z - h / 2, z + h / 2, SLIT);
}

/** A ring of sandbags (stacked rows of small chamfered blocks) on an arc. */
function sandbags(m: Mesh, r: number, from: number, to: number, rows: number, color: string, gap: number[] = []): void {
  for (let row = 0; row < rows; row++) {
    const n = Math.round(((to - from) * r) / 3.2);
    for (let i = 0; i < n; i++) {
      const t = (i + (row % 2) * 0.5) / n;
      if (t > 1) continue;
      const a = from + (to - from) * t;
      if (gap.some((g) => Math.abs(a - g) < 0.18)) continue;
      const c = Math.cos(a);
      const s = Math.sin(a);
      m.prism([c * (r - 1.2), s * (r - 1.2), row * 1.5 + 0.75], [c * (r + 1.2), s * (r + 1.2), row * 1.5 + 0.75], chamfer(2.9, 1.5, 0.4), shade(color, row % 2 ? 0.92 : 1.02));
    }
  }
}

/** USA — hexagonal reinforced-concrete pillbox, thick overhanging roof slab, three embrasures, gun cupola, sandbags. */
function usa(m: Mesh, d: Damage, team: string): V3 {
  const C = scorch(tint('#a8a294', team, 0.22), d);
  const hex = (r: number): P2[] => disc(r, 6).map(([a, b]) => [a, b] as P2);
  m.prism([0, 0, 0], [0, 0, 1.2], hex(15), shade(C, 0.8));
  if (d.stage < 4) {
    m.prism([0, 0, 1.2], [0, 0, 11], hex(12.5), C);
    m.prism([0, 0, 11], [0, 0, 13.5], hex(14), scorch(tint('#b4ae9e', team, 0.6), d));
    // Embrasures on the three forward faces (x is forward).
    for (const a of [-Math.PI / 3, 0, Math.PI / 3]) {
      const x = Math.cos(a) * 11.2;
      const y = Math.sin(a) * 11.2;
      m.prism([x, y, 7], [x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.5, 7], chamfer(5.5, 1.6, 0.4), SLIT);
    }
    // Cupola with the .50 cal.
    if (d.stage < 3) {
      m.cyl([-1, 0, 13.5], [-1, 0, 17], 3.6, shade(C, 1.04), 12);
      m.cyl([-1, 0, 17], [-1, 0, 17.6], 3.9, shade(C, 0.9), 12);
      m.cyl([1.5, 0, 16], [9, 0, 16.3], 0.35, '#222', 6);
      m.box(1, 2.5, -0.8, 0.8, 15, 17, '#2c2c2a');
    }
    m.decal(star(0, 0, 1).map(([u, v]) => [-1 + v * 2.6, u * 2.6, 17.62] as V3), [0, 0, 1], '#f2f0e6', 0);
    m.decal(disc(1, 10).map(([u, v]) => [-6 + v * 1.6, 7 + u * 1.6, 13.52] as V3), [0, 0, 1], team, 0);
  }
  sandbags(m, 17.5, -1.6, 1.6, d.stage < 4 ? 3 : 1, '#a89670', [0]);
  return [10, 0, 16.2];
}

/** Europe — octagonal casemate with a sloped concrete glacis and an armoured steel observation cloche. */
function europe(m: Mesh, d: Damage, team: string): V3 {
  const C = scorch(tint('#8f948c', team, 0.25), d);
  const oct = (r: number): P2[] => disc(r, 8).map(([a, b]) => [a, b] as P2);
  m.prism([0, 0, 0], [0, 0, 1], oct(16), shade(C, 0.75));
  if (d.stage < 4) {
    // Earth / concrete glacis sloping up to the walls.
    for (let i = 0; i < 4; i++) m.prism([0, 0, 1 + i * 1.6], [0, 0, 2.6 + i * 1.6], oct(15.5 - i * 1.1), shade(C, 0.85 + i * 0.04));
    m.prism([0, 0, 7.4], [0, 0, 12], oct(11), C);
    m.prism([0, 0, 12], [0, 0, 13.6], oct(12), scorch(tint('#9aa096', team, 0.6), d));
    // Wide embrasure forward and two flanking ones.
    for (const a of [-Math.PI / 4, 0, Math.PI / 4]) {
      const x = Math.cos(a) * 10.4;
      const y = Math.sin(a) * 10.4;
      m.prism([x, y, 9.8], [x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4, 9.8], chamfer(a === 0 ? 6 : 3.5, 1.5, 0.3), SLIT);
    }
    if (d.stage < 3) {
      // Steel cloche with vision slits all round.
      m.cyl([-2, 0, 13.6], [-2, 0, 17], 3.4, '#5a5e60', 16);
      m.prism([-2, 0, 17], [-2, 0, 18.4], disc(2.6, 16), '#62676a');
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        m.box(-2 + Math.cos(a) * 3.3 - 0.3, -2 + Math.cos(a) * 3.3 + 0.3, Math.sin(a) * 3.3 - 0.6, Math.sin(a) * 3.3 + 0.6, 15, 15.7, SLIT);
      }
      m.cyl([1, 0, 10.5], [12, 0, 10.7], 0.35, '#222', 6);
    }
    europeMark(m, team);
  }
  return [12, 0, 10.6];
}
function europeMark(m: Mesh, team: string): void {
  m.decal(disc(1, 16).map(([u, v]) => [5 + v * 2.2, u * 2.2, 13.62] as V3), [0, 0, 1], '#1f3f9a', 0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    m.decal(star(0, 0, 1).map(([u, v]) => [5 + Math.sin(a) * 1.5 + v * 0.35, Math.cos(a) * 1.5 + u * 0.35, 13.63] as V3), [0, 0, 1], '#f2c94c', 1);
  }
  m.decal(disc(1, 8).map(([u, v]) => [-7 + v * 1.2, 6 + u * 1.2, 13.62] as V3), [0, 0, 1], team, 0);
}

/** Russia — square concrete DOT half sunk in an earth berm, a wide embrasure with the PKM, red star on the front. */
function russia(m: Mesh, d: Damage, team: string): V3 {
  const C = scorch(tint('#8c8a7e', team, 0.2), d);
  const EARTH = scorch('#6e6248', d);
  m.box(-16, 16, -16, 16, 0, 1, shade(EARTH, 0.8));
  // Earth berm: stepped and chamfered, highest at the back.
  for (let i = 0; i < 4; i++) m.cbox(-15 + i * 1.2, 15 - i * 2.4, -15 + i * 1.6, 15 - i * 1.6, 1 + i * 1.8, 2.8 + i * 1.8, 1, shade(EARTH, 0.9 + i * 0.05));
  if (d.stage < 4) {
    m.cbox(-9, 10, -9, 9, 2, 12, 0.8, C);
    m.cbox(-10, 11.5, -10, 10, 12, 14.5, 1, scorch(tint('#8c8a7e', team, 0.55), d));
    // Main embrasure (wide, splayed) and a small one each side.
    m.prism([9.6, 0, 7.5], [11, 0, 7.5], chamfer(8, 2.2, 0.5), SLIT);
    for (const y of [-9.6, 9.6]) m.prism([3, y, 7.5], [3, y + Math.sign(y) * 1.2, 7.5], chamfer(3.2, 1.4, 0.3), SLIT);
    if (d.stage < 3) {
      m.cyl([10, 0, 7.5], [16, 0, 7.6], 0.3, '#1e1e1e', 6);
      // Periscope and ventilation pipe on the roof.
      m.cyl([-5, -4, 14.5], [-5, -4, 17.5], 0.6, '#3c3c38', 8);
      m.cyl([-3, 5, 14.5], [-3, 5, 16], 1, '#5a5a54', 8);
    }
    m.decal(star(0, 0, 1).map(([u, v]) => [11.52, u * 2.6, 3.2 + v * 2.6] as V3), [1, 0, 0], '#f2f0e6', 0);
    m.decal(star(0, 0, 1).map(([u, v]) => [11.53, u * 2.1, 3.2 + v * 2.1] as V3), [1, 0, 0], '#c8231e', 1);
    m.decal([[-8, -9, 14.52], [-4, -9, 14.52], [-4, 9, 14.52], [-8, 9, 14.52]], [0, 0, 1], team, 0);
  }
  return [15, 0, 7.6];
}

/** China — square brick-and-concrete blockhouse with a crenellated parapet and slits on every side. */
function china(m: Mesh, d: Damage, team: string): V3 {
  const BRICK = scorch(tint('#8a7a68', team, 0.2), d);
  const CONC = scorch('#a39c8c', d);
  m.box(-15, 15, -15, 15, 0, 1.2, shade(CONC, 0.8));
  if (d.stage < 4) {
    m.cbox(-10.5, 10.5, -10.5, 10.5, 1.2, 4, 0.3, CONC);
    m.cbox(-10, 10, -10, 10, 4, 15, 0.3, BRICK);
    // Brick courses.
    for (let z = 5; z < 15; z += 2) for (const s of [-1, 1]) m.box(-10.05, 10.05, s * 10.02 - 0.03, s * 10.02 + 0.03, z, z + 0.25, shade(BRICK, 0.8));
    // Slits: two on each face, the forward ones wider.
    for (const y of [-4.5, 4.5]) m.prism([9.6, y, 10], [10.8, y, 10], chamfer(3.6, 1.3, 0.3), SLIT);
    for (const s of [-1, 1]) for (const x of [-4.5, 4.5]) m.prism([x, s * 9.6, 10], [x, s * 10.8, 10], chamfer(2.6, 1.3, 0.3), SLIT);
    m.prism([-9.6, 0, 10], [-10.8, 0, 10], chamfer(2.6, 1.3, 0.3), SLIT);
    // Crenellated parapet.
    m.cbox(-10.6, 10.6, -10.6, 10.6, 15, 16, 0.3, scorch(tint('#a39c8c', team, 0.6), d));
    if (d.stage < 3) camo(m, 10.02, 5, 14, team, '#8a7a68');
    for (let i = 0; i < 6; i++) {
      const t = -9 + i * 3.6;
      if (d.stage >= 2 && i % 2) continue;
      for (const s of [-1, 1]) {
        m.box(t - 0.9, t + 0.9, s * 10.6 - (s > 0 ? 1.2 : 0), s * 10.6 + (s < 0 ? 1.2 : 0), 16, 18.2, shade(CONC, 1.05));
        m.box(s * 10.6 - (s > 0 ? 1.2 : 0), s * 10.6 + (s < 0 ? 1.2 : 0), t - 0.9, t + 0.9, 16, 18.2, shade(CONC, 1.05));
      }
    }
    if (d.stage < 3) m.cyl([7, 0, 17], [14, 0, 17.2], 0.3, '#1e1e1e', 6);
    m.decal(star(0, 0, 1).map(([u, v]) => [10.02, u * 2.4, 6.4 + v * 2.4] as V3), [1, 0, 0], '#f0c419', 0);
    m.decal(star(0, 0, 1).map(([u, v]) => [10.03, u * 1.9, 6.4 + v * 1.9] as V3), [1, 0, 0], '#d0201a', 1);
    m.decal([[-8, -8, 16.02], [8, -8, 16.02], [8, -6, 16.02], [-8, -6, 16.02]], [0, 0, 1], team, 0);
  }
  return [14, 0, 17.1];
}

/** Islamic — round stone-and-sandbag sangar with slits between the bags, timber-beam roof under a tarp. */
function islamic(m: Mesh, d: Damage, team: string): V3 {
  const STONE = scorch(tint('#a8946c', team, 0.2), d);
  m.prism([0, 0, 0], [0, 0, 1], disc(15, 18), shade(STONE, 0.8));
  if (d.stage < 4) {
    m.prism([0, 0, 1], [0, 0, 5], disc(12, 18), STONE);
    sandbags(m, 11, -Math.PI, Math.PI, 4, scorch('#c2ab7c', d), [0, -0.9, 0.9]);
    // Slits between the bags towards the front, with dark recesses.
    for (const a of [0, -0.9, 0.9]) slit(m, [Math.cos(a) * 11.2, Math.sin(a) * 11.2, 8], true, 1.6, 1.3, 2.4);
    if (d.stage < 3) {
      // Timber beams and the tarp over them, a green flag cloth.
      for (const y of [-6, -2, 2, 6]) m.cyl([-9, y, 12.2], [9, y, 12.2], 0.45, '#6a4a2a', 6);
      m.prism([0, -8, 12.9], [0, 8, 12.9], [[-9, -0.25], [9, -0.25], [8, 0.6], [-8, 0.6]], scorch(tint('#7a7058', team, 0.55), d));
      m.cyl([10, 0, 8], [16, 0, 8.1], 0.3, '#1e1e1e', 6);
      m.cyl([-7, 7, 12], [-7, 7, 20], 0.2, '#5a4a32', 4);
      m.decal([[-7, 7.05, 20], [-7, 11, 20], [-7, 11, 17.5], [-7, 7.05, 17.5]], [1, 0, 0], '#1f8a44', 0);
      m.decal([[-6.9, 7.05, 19.4], [-6.9, 9, 19.4], [-6.9, 9, 18.8], [-6.9, 7.05, 18.8]], [1, 0, 0], team, 1);
    }
  } else sandbags(m, 11, -Math.PI, Math.PI, 1, scorch('#c2ab7c', d));
  return [15, 0, 8];
}

const MODELS: Record<FactionId, (m: Mesh, d: Damage, team: string) => V3> = { usa, europe, russia, china, islamic };

/** World heading (radians, the game's) of facing row r (0–7, 45° steps). */
const facing = (r: number): number => (r * Math.PI) / 4;

/** Facing row (0–7) nearest a world aim heading. */
export function bunkerRow(aimHeading: number): number {
  return ((Math.round(aimHeading / (Math.PI / 4)) % 8) + 8) % 8;
}

const cells = new Map<string, HTMLCanvasElement>();
const muzzles = new Map<string, V3>();

/** One picture of a nation's bunker (BUNKER_CELL px, ground centre at BUNKER_ANCHOR), built once and cached. */
export function bunkerCell(faction: FactionId, row: number, stage: number): HTMLCanvasElement {
  const key = `${faction}:${row}:${stage}`;
  let canvas = cells.get(key);
  if (canvas) return canvas;
  const made = createCanvas(BUNKER_CELL * RES, BUNKER_CELL * RES);
  canvas = made.canvas;
  const ctx = made.ctx;
  ctx.scale(RES, RES);
  const mesh = new Mesh();
  const muzzle = MODELS[faction](mesh, { stage }, FACTIONS[faction].colors.primary);
  muzzles.set(faction, muzzle);
  ctx.globalAlpha = 0.3;
  drawMesh(ctx, mesh, facing(row), BUNKER_ANCHOR.x, BUNKER_ANCHOR.y, true, false);
  ctx.globalAlpha = 1;
  drawMesh(ctx, mesh, facing(row), BUNKER_ANCHOR.x, BUNKER_ANCHOR.y, false, false);
  if (stage === 3 || stage === 4) {
    // Fire and smoke over a burning bunker, smoke over the ruin.
    const g = ctx.createRadialGradient(BUNKER_ANCHOR.x, BUNKER_ANCHOR.y - 14, 1, BUNKER_ANCHOR.x, BUNKER_ANCHOR.y - 14, 12);
    g.addColorStop(0, stage === 3 ? 'rgba(255,220,120,0.95)' : 'rgba(90,86,80,0.6)');
    g.addColorStop(0.45, stage === 3 ? 'rgba(255,110,30,0.75)' : 'rgba(70,66,60,0.35)');
    g.addColorStop(1, 'rgba(40,36,34,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(BUNKER_ANCHOR.x, BUNKER_ANCHOR.y - 14, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  cells.set(key, canvas);
  return canvas;
}

/** Cell-px offset of the muzzle from the ground centre for a facing row. */
export function bunkerMuzzleCell(faction: FactionId, row: number): { x: number; y: number } {
  let m = muzzles.get(faction);
  if (!m) {
    m = MODELS[faction](new Mesh(), { stage: 0 }, '#000');
    muzzles.set(faction, m);
  }
  const h = facing(row);
  const c = Math.cos(h);
  const s = Math.sin(h);
  const wx = m[0] * c - m[1] * s;
  const wy = m[0] * s + m[1] * c;
  return { x: (wx - wy) * K, y: (wx + wy) * K * 0.5 - m[2] * KZ };
}
