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

/** Gravel / packed-earth apron the bunker sits on, a little wider than its berm. */
function apron(m: Mesh, r: number, n: number, color: string, d: Damage): void {
  m.prism([0, 0, 0], [0, 0, 0.6], disc(r, n), scorch(shade(color, 0.85), d));
  m.prism([0, 0, 0.6], [0, 0, 1], disc(r - 1, n), scorch(color, d));
}

/** Stepped dome (a steel cloche): `steps` cylinders, each narrower, from z0 up `h`. */
function dome(m: Mesh, at: P2, r: number, z0: number, h: number, color: string, steps = 4, n = 14): void {
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    const b = ((i + 1) / steps) * (Math.PI / 2);
    m.cyl([at[0], at[1], z0 + Math.sin(a) * h], [at[0], at[1], z0 + Math.sin(b) * h], r * Math.cos(a) * 0.98 + 0.02, shade(color, 1 + i * 0.05), n);
  }
}

/** Wooden ammunition crates (boxes with lighter lids) by the wall at (x, y). */
function crates(m: Mesh, x: number, y: number, n: number, color = '#5d6a3a'): void {
  for (let i = 0; i < n; i++) {
    const z = i < 2 ? 1 : 2.6;
    const yy = y + (i % 2) * 2.4 - (i > 1 ? 1.2 : 0);
    m.cbox(x - 1.4, x + 1.4, yy - 1.1, yy + 1.1, z, z + 1.6, 0.2, shade(color, 1 - i * 0.04));
    m.box(x - 1.2, x + 1.2, yy - 0.9, yy + 0.9, z + 1.6, z + 1.65, shade(color, 1.18));
  }
}

/** A whip antenna from z0, `h` tall. */
const antenna = (m: Mesh, x: number, y: number, z0: number, h: number): void => m.cyl([x, y, z0], [x, y, z0 + h], 0.12, '#2a2a28', 4);

/** A thin band in the nation's colour painted round an n-gon wall of radius r (turned by rot), at height z. */
function band(m: Mesh, r: number, n: number, z: number, team: string, rot = 0): void {
  const pts = disc(r + 0.03, n).map(([a, b]) => [a * Math.cos(rot) - b * Math.sin(rot), a * Math.sin(rot) + b * Math.cos(rot)] as P2);
  pts.forEach(([x0, y0], i) => {
    const [x1, y1] = pts[(i + 1) % n]!;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const l = Math.hypot(mx, my) || 1;
    m.decal([[x0, y0, z], [x1, y1, z], [x1, y1, z + 0.9], [x0, y0, z + 0.9]], [mx / l, my / l, 0], team, 0);
  });
}

/** USA — modern hexagonal pillbox: chamfered concrete, heavy roof slab, a remote .50 cal station, HESCO ring. */
function usa(m: Mesh, d: Damage, team: string): V3 {
  const C = scorch('#b3ad9c', d);
  const hex = (r: number): P2[] => disc(r, 6);
  apron(m, 18, 6, '#8d8470', d);
  // HESCO barriers: tan mesh baskets in a ring, open at the back.
  const HESCO = scorch('#c4ad7e', d);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.PI / 14;
    if (Math.abs(a - Math.PI) < 0.3) continue;
    if (d.stage >= 4 && i % 2) continue;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const h = d.stage >= 4 ? 1.6 : 4.2;
    m.prism([c * 15.2, s * 15.2, 1], [c * 15.2, s * 15.2, 1 + h], chamfer(3.6, 3.2, 0.3), shade(HESCO, i % 2 ? 0.94 : 1.02));
  }
  if (d.stage < 4) {
    m.prism([0, 0, 1], [0, 0, 2.2], hex(12.8), shade(C, 0.82));
    m.prism([0, 0, 2.2], [0, 0, 10], hex(11.8), C);
    band(m, 11.85, 6, 8.4, team);
    // Roof slab overhanging, chamfered top.
    m.prism([0, 0, 10], [0, 0, 11.8], hex(13.4), shade(C, 1.08));
    m.prism([0, 0, 11.8], [0, 0, 12.6], hex(12.4), shade(C, 1.14));
    for (const a of [-Math.PI / 3, 0, Math.PI / 3]) {
      const x = Math.cos(a) * 10.3;
      const y = Math.sin(a) * 10.3;
      // Splayed embrasure under a little concrete hood.
      m.prism([x, y, 6.4], [x + Math.cos(a) * 1.7, y + Math.sin(a) * 1.7, 6.4], chamfer(5.2, 1.5, 0.4), SLIT);
      m.prism([x + Math.cos(a) * 0.6, y + Math.sin(a) * 0.6, 7.9], [x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 7.9], chamfer(6.4, 0.7, 0.2), shade(C, 1.1));
    }
    if (d.stage < 3) {
      // Remote weapon station: low turret, M2 barrel with a muzzle brake, sight box.
      m.cbox(-4, 3, -3, 3, 12.6, 15, 0.6, '#6d6f5e');
      m.box(-1, 2.2, 3, 4.4, 13.2, 15.4, '#3c3e34');
      m.cyl([3, 0, 14], [11, 0, 14.2], 0.35, '#1e1e1e', 6);
      m.cyl([10.2, 0, 14.15], [11.4, 0, 14.2], 0.55, '#1e1e1e', 6);
      antenna(m, -6, -6, 12.6, 8);
      crates(m, -8, 4, 3);
    }
    m.decal(star(0, 0, 1).map(([u, v]) => [-6 + v * 2.6, -3 + u * 2.6, 12.62] as V3), [0, 0, 1], '#f2f0e6', 0);
  }
  return [11, 0, 14.2];
}

/** Europe — Maginot-style casemate: grassy glacis, green-grey concrete, an armoured steel cloche, camouflage. */
function europe(m: Mesh, d: Damage, team: string): V3 {
  const C = scorch('#9ea395', d);
  const oct = (r: number): P2[] => disc(r, 8);
  apron(m, 18, 8, '#7a7a5c', d);
  for (let i = 0; i < 4; i++) m.prism([0, 0, 1 + i * 1.5], [0, 0, 2.5 + i * 1.5], oct(16 - i * 1.3), scorch(shade('#5f7a3e', 0.9 + i * 0.05), d));
  if (d.stage < 4) {
    m.prism([0, 0, 7], [0, 0, 11.5], oct(11), C);
    if (d.stage < 3) camo(m, 10.2, 7.5, 11, '#6b7a4e', '#9ea395');
    band(m, 11.05, 8, 10.3, team);
    m.prism([0, 0, 11.5], [0, 0, 13.2], oct(12.2), shade(C, 1.1));
    // Wide forward embrasure under a concrete visor, two flanking ones.
    for (const a of [-Math.PI / 4, 0, Math.PI / 4]) {
      const x = Math.cos(a) * 10.2;
      const y = Math.sin(a) * 10.2;
      m.prism([x, y, 9.2], [x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.6, 9.2], chamfer(a === 0 ? 6.5 : 3.6, 1.6, 0.3), SLIT);
    }
    m.prism([10.6, 0, 10.6], [13, 0, 10.6], chamfer(8, 0.8, 0.2), shade(C, 1.12));
    if (d.stage < 3) {
      // Domed steel cloche with vision slits, and a periscope.
      m.cyl([-3, 0, 13.2], [-3, 0, 15.2], 4, '#555a5c', 16);
      dome(m, [-3, 0], 4, 15.2, 3, '#5f6466');
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        m.box(-3 + Math.cos(a) * 3.9 - 0.3, -3 + Math.cos(a) * 3.9 + 0.3, Math.sin(a) * 3.9 - 0.6, Math.sin(a) * 3.9 + 0.6, 14, 14.7, SLIT);
      }
      m.cyl([4, 4, 13.2], [4, 4, 16], 0.5, '#3a3c3c', 8);
      m.cyl([1, 0, 9.6], [13.5, 0, 9.8], 0.35, '#222', 6);
    }
    europeMark(m, team);
  }
  return [13.5, 0, 9.8];
}

function europeMark(m: Mesh, team: string): void {
  m.decal(disc(1, 16).map(([u, v]) => [5 + v * 2.2, u * 2.2, 13.62] as V3), [0, 0, 1], '#1f3f9a', 0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    m.decal(star(0, 0, 1).map(([u, v]) => [5 + Math.sin(a) * 1.5 + v * 0.35, Math.cos(a) * 1.5 + u * 0.35, 13.63] as V3), [0, 0, 1], '#f2c94c', 1);
  }
  m.decal(disc(1, 8).map(([u, v]) => [-7 + v * 1.2, 6 + u * 1.2, 13.62] as V3), [0, 0, 1], team, 0);
}

/** Russia — concrete DOT sunk in a grassy berm with a log revetment, camouflage net over the roof, red star. */
function russia(m: Mesh, d: Damage, team: string): V3 {
  const C = scorch('#8f8d80', d);
  const EARTH = scorch('#6e6248', d);
  const GRASS = scorch('#5e7a38', d);
  apron(m, 18, 10, '#6e6248', d);
  for (let i = 0; i < 4; i++) m.cbox(-15 + i * 1.2, 14 - i * 2.4, -15 + i * 1.6, 15 - i * 1.6, 1 + i * 1.8, 2.8 + i * 1.8, 1, i === 3 ? GRASS : shade(EARTH, 0.9 + i * 0.05));
  if (d.stage < 4) {
    // Log revetment along both flanks.
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) m.cyl([-8, s * 10.7, 3 + k * 1.3], [9, s * 10.7, 3 + k * 1.3], 0.65, scorch(k % 2 ? '#6b4b2c' : '#7a5734', d), 6);
    m.cbox(-9, 10, -9, 9, 2, 11.5, 0.8, C);
    m.cbox(-10.5, 11.8, -10, 10, 11.5, 13.8, 1.1, shade(C, 1.08));
    m.prism([9.6, 0, 7.2], [11.2, 0, 7.2], chamfer(8, 2.2, 0.5), SLIT);
    m.prism([10.5, 0, 9], [13, 0, 9], chamfer(10, 0.8, 0.2), shade(C, 1.1));
    for (const y of [-9.6, 9.6]) m.prism([3, y, 7.2], [3, y + Math.sign(y) * 1.2, 7.2], chamfer(3.2, 1.4, 0.3), SLIT);
    if (d.stage < 3) {
      // Camouflage net draped over the roof: a green panel with dark patches.
      m.prism([0, -10.5, 14.1], [0, 10.5, 14.1], [[-11, -0.3], [12, -0.3], [11, 0.4], [-10, 0.4]], '#4c5e32');
      for (const [x, y, s] of [[-5, -5, 2.4], [4, 3, 2], [-2, 6, 1.6], [6, -6, 1.8]] as const) m.decal(disc(s, 7).map(([u, v]) => [x + u, y + v, 14.52] as V3), [0, 0, 1], '#3a4826', 0);
      m.cyl([10, 0, 7.2], [16, 0, 7.3], 0.32, '#1e1e1e', 6);
      m.cyl([-5, -4, 14.5], [-5, -4, 17.5], 0.6, '#3c3c38', 8);
      antenna(m, -7, 6, 14.5, 7);
      crates(m, -12, -2, 2, '#56603a');
    }
    m.decal(star(0, 0, 1).map(([u, v]) => [11.82, u * 2.6, 3.4 + v * 2.6] as V3), [1, 0, 0], '#f2f0e6', 0);
    m.decal(star(0, 0, 1).map(([u, v]) => [11.83, u * 2.1, 3.4 + v * 2.1] as V3), [1, 0, 0], '#c8231e', 1);
    m.decal([[-9, -9.5, 14.53], [-6.5, -9.5, 14.53], [-6.5, 9.5, 14.53], [-9, 9.5, 14.53]], [0, 0, 1], team, 1);
  }
  return [16, 0, 7.3];
}

/** China — brick-and-concrete blockhouse: concrete plinth and roof, crenellated parapet, sandbag front, red star. */
function china(m: Mesh, d: Damage, team: string): V3 {
  const BRICK = scorch('#8d6e5a', d);
  const CONC = scorch('#aba493', d);
  apron(m, 17, 4, '#8a8270', d);
  if (d.stage < 4) {
    m.cbox(-11, 11, -11, 11, 1, 4, 0.4, CONC);
    m.cbox(-10, 10, -10, 10, 4, 14, 0.3, BRICK);
    for (let z = 5; z < 14; z += 1.6) {
      for (const s of [-1, 1]) {
        m.box(-10.05, 10.05, s * 10.02 - 0.03, s * 10.02 + 0.03, z, z + 0.2, shade(BRICK, 0.78));
        m.box(s * 10.02 - 0.03, s * 10.02 + 0.03, -10.05, 10.05, z, z + 0.2, shade(BRICK, 0.78));
      }
    }
    band(m, 14.14, 4, 12.4, team, Math.PI / 4);
    for (const y of [-4.5, 4.5]) m.prism([9.6, y, 9.5], [10.8, y, 9.5], chamfer(3.6, 1.3, 0.3), SLIT);
    for (const s of [-1, 1]) for (const x of [-4.5, 4.5]) m.prism([x, s * 9.6, 9.5], [x, s * 10.8, 9.5], chamfer(2.6, 1.3, 0.3), SLIT);
    // Concrete roof slab and crenellated parapet.
    m.cbox(-10.8, 10.8, -10.8, 10.8, 14, 15.2, 0.3, shade(CONC, 1.06));
    for (let i = 0; i < 6; i++) {
      const t = -9 + i * 3.6;
      if (d.stage >= 2 && i % 2) continue;
      for (const s of [-1, 1]) {
        m.box(t - 0.9, t + 0.9, s * 10.8 - (s > 0 ? 1.2 : 0), s * 10.8 + (s < 0 ? 1.2 : 0), 15.2, 17.2, shade(CONC, 1.1));
        m.box(s * 10.8 - (s > 0 ? 1.2 : 0), s * 10.8 + (s < 0 ? 1.2 : 0), t - 0.9, t + 0.9, 15.2, 17.2, shade(CONC, 1.1));
      }
    }
    if (d.stage < 3) {
      sandbags(m, 14.5, -0.9, 0.9, 2, scorch('#b29e74', d), [0]);
      m.cyl([7, 0, 16.2], [15, 0, 16.4], 0.32, '#1e1e1e', 6);
      antenna(m, -8, -8, 15.2, 7);
      crates(m, -13, 5, 2, '#5b6236');
    }
    m.decal(star(0, 0, 1).map(([u, v]) => [10.02, u * 2.4, 6.6 + v * 2.4] as V3), [1, 0, 0], '#f0c419', 0);
    m.decal(star(0, 0, 1).map(([u, v]) => [10.03, u * 1.9, 6.6 + v * 1.9] as V3), [1, 0, 0], '#d0201a', 1);
  } else sandbags(m, 12, -Math.PI, Math.PI, 1, scorch('#b29e74', d));
  return [15, 0, 16.3];
}

/** Islamic — round fieldstone sangar topped with sandbags, timber roof under a canvas tarp, a green banner. */
function islamic(m: Mesh, d: Damage, team: string): V3 {
  const STONE = scorch('#b09a72', d);
  apron(m, 17, 18, '#a38d64', d);
  if (d.stage < 4) {
    m.prism([0, 0, 1], [0, 0, 5.5], disc(12.4, 18), STONE);
    // Fieldstones: irregular darker blocks on the wall.
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const z = 2 + (k % 3) * 1.1;
      const c = Math.cos(a);
      const s = Math.sin(a);
      m.decal(disc(0.9, 6).map(([u, v]) => [c * 12.42 - s * u * 1.3, s * 12.42 + c * u * 1.3, z + v * 0.7] as V3), [c, s, 0], shade(STONE, 0.82 + (k % 2) * 0.1), 0);
    }
    band(m, 12.4, 18, 4.2, team);
    sandbags(m, 11, -Math.PI, Math.PI, 3, scorch('#c9b384', d), [0, -0.9, 0.9]);
    for (const a of [0, -0.9, 0.9]) slit(m, [Math.cos(a) * 11.2, Math.sin(a) * 11.2, 7.3], true, 1.6, 1.3, 2.4);
    if (d.stage < 3) {
      for (const y of [-6, -2, 2, 6]) m.cyl([-10, y, 10.6], [10, y, 10.6], 0.45, '#6a4a2a', 6);
      // Canvas tarp, sagging in the middle.
      m.prism([0, -9, 11.2], [0, 9, 11.2], [[-10, -0.25], [10, -0.25], [9, 0.5], [0, 0.2], [-9, 0.5]], scorch('#c8b78e', d));
      m.cyl([10, 0, 7.3], [16, 0, 7.4], 0.3, '#1e1e1e', 6);
      m.cyl([-7, 7, 11], [-7, 7, 20], 0.2, '#5a4a32', 4);
      m.decal([[-7, 7.05, 20], [-7, 11.5, 20], [-7, 11.5, 17.2], [-7, 7.05, 17.2]], [1, 0, 0], '#1f8a44', 0);
      m.decal([[-6.9, 7.05, 19.2], [-6.9, 11.5, 19.2], [-6.9, 11.5, 18.6], [-6.9, 7.05, 18.6]], [1, 0, 0], team, 1);
      crates(m, -13, -4, 2, '#7a6a44');
    }
  } else sandbags(m, 11, -Math.PI, Math.PI, 1, scorch('#c9b384', d));
  return [16, 0, 7.4];
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
