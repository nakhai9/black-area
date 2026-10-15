import { ISLAMIC_GREEN, ISLAMIC_GREEN_DOME } from './IslamicPalette';
import { FACTIONS } from '../../factions';
import type { FactionColors, FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import { type IsoPainter, LIGHT, type Vec3 } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { iwan } from './GrandMosque';
import { RA2, facade, parapet, roofClutter } from './Ra2Kit';

const GLASS = RA2.glass;

/** Where the national flag pole stands, per design (art units, z = foot of the pole, h = pole height). */
interface FlagSpot {
  u: number;
  v: number;
  z: number;
  h: number;
}

/**
 * Vertical prism over a convex polygon (u, v corners, clockwise on screen): only the walls that face the camera are
 * painted, lit by their direction, then the roof.
 */
function prism(p: IsoPainter, pts: readonly (readonly [number, number])[], z: number, h: number, wall: string, roof: string): void {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (!a || !b) continue;
    // Outward normal of edge a→b (points listed clockwise in u/v): (dv, -du).
    const nu = b[1] - a[1];
    const nv = -(b[0] - a[0]);
    if (nu + nv <= 0) continue; // faces away from the camera
    const len = Math.hypot(nu, nv) || 1;
    const light = (LIGHT.right * Math.max(0, nu) + LIGHT.left * Math.max(0, nv)) / (Math.max(0, nu) + Math.max(0, nv) || 1);
    const k = 0.75 + 0.25 * (Math.abs(nu) / len);
    p.polygon(
      [
        [a[0], a[1], z],
        [b[0], b[1], z],
        [b[0], b[1], z + h],
        [a[0], a[1], z + h],
      ] as Vec3[],
      shade(wall, light * k + 0.15),
    );
  }
  p.polygon(pts.map(([u, v]) => [u, v, z + h] as Vec3), roof);
}

/** Regular polygon around (cu, cv), first corner pointing towards −v (back), clockwise on screen. */
function ring(cu: number, cv: number, r: number, sides: number, turn = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = turn - Math.PI / 2 + (i * Math.PI * 2) / sides;
    out.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r]);
  }
  return out;
}

/**
 * USA — the Pentagon, filling its plot: a low limestone annex fills the whole square around a five-sided block of five
 * concentric rings. Dark slate roofs alternate with the light wells between the rings, ten corridors run in to the
 * roofed-over centre, the façades carry floors of windows, and the Mall entrance has its columned portico and door.
 * A corner points to the back so a whole façade faces the camera. No lawn, parking or helipad on the ground.
 */
function pentagon(p: IsoPainter, team: FactionColors): void {
  const LIME = '#c9c0a8';
  const SLATE = RA2.roof;
  const WELL = '#a9a392';
  const CU = 1.5;
  const CV = 1.5;
  const TURN = -Math.PI / 4;
  const BASE = 8;
  const Z = BASE;
  const H = 7;
  const TOP = Z + H;
  const R = 1.42;
  const at = (r: number): [number, number][] => ring(CU, CV, r, 5, TURN);
  const flat = (r: number, z: number, color: string): void => p.polygon(at(r).map(([u, v]) => [u, v, z] as Vec3), color, null);

  // Annex: the whole square plot is a low limestone block, the pentagon rises out of it.
  p.box(0, 0, 3, 3, 0, 2, shade(LIME, 0.7));
  p.box(0.03, 0.03, 2.94, 2.94, 2, BASE - 2, LIME, { top: SLATE });
  facade(p, 'left', 0.03, 0.03, 2.94, 2.94, 2, BASE - 2, { cols: 22, floors: 2, glass: GLASS, frame: '#ece6d6', fill: 0.5, seed: 61 });
  facade(p, 'right', 0.03, 0.03, 2.94, 2.94, 2, BASE - 2, { cols: 22, floors: 2, glass: GLASS, frame: '#ece6d6', fill: 0.5, seed: 62 });
  parapet(p, 0.03, 0.03, 2.94, 2.94, BASE, shade(LIME, 1.05), 0.03, 1);
  // Main door in the middle of the front façade.
  p.faceRect('left', 0.03, 0.03, 2.94, 2.94, 2, BASE - 2, 0.42, 0.58, 0, 0.8, '#3b3a36');
  p.faceRect('left', 0.03, 0.03, 2.94, 2.94, 2, BASE - 2, 0.4, 0.6, 0.8, 0.95, team.primary);

  // The block.
  const outer = at(R);
  prism(p, outer, Z, H, LIME, SLATE);

  // Floors of windows on the façades facing the camera.
  for (let i = 0; i < 5; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % 5];
    if (!a || !b || b[1] - a[1] - (b[0] - a[0]) <= 0) continue;
    const du = (b[0] - a[0]) * 0.022;
    const dv = (b[1] - a[1]) * 0.022;
    for (let f = 0; f < 3; f++) {
      const z0 = Z + 1 + f * 2;
      for (let t = 0.04; t < 0.96; t += 0.045) {
        const u = a[0] + (b[0] - a[0]) * t;
        const v = a[1] + (b[1] - a[1]) * t;
        p.polygon([[u, v, z0], [u, v, z0 + 1.1], [u + du, v + dv, z0 + 1.1], [u + du, v + dv, z0]] as Vec3[], GLASS, null);
      }
    }
  }

  // Roof: five slate rings with light wells between them, the centre roofed over.
  for (const r of [1.2, 0.98, 0.76]) {
    flat(r + 0.035, TOP, WELL);
    flat(r - 0.035, TOP, SLATE);
  }
  flat(0.52, TOP, shade(SLATE, 0.9));
  // Ten corridors from the centre to the outer ring (corners and mid-sides).
  const inner = at(0.52);
  const { ctx } = p;
  ctx.strokeStyle = WELL;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const o = outer[i];
    const o2 = outer[(i + 1) % 5];
    const n = inner[i];
    const n2 = inner[(i + 1) % 5];
    if (!o || !o2 || !n || !n2) continue;
    for (const [from, to] of [
      [o, n],
      [[(o[0] + o2[0]) / 2, (o[1] + o2[1]) / 2], [(n[0] + n2[0]) / 2, (n[1] + n2[1]) / 2]],
    ] as const) {
      const [x0, y0] = p.project(from[0], from[1], TOP);
      const [x1, y1] = p.project(to[0], to[1], TOP);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
  }
  ctx.stroke();
  // Central skylight pavilion with a team-colour cap.
  p.cylinder(CU, CV, 0.18, TOP, 3, '#f3efe4');
  p.pyramid(CU - 0.12, CV - 0.12, 0.24, 0.24, TOP + 3, 3, team.primary);

  // Rooftop plant on the outer ring and on the annex corners.
  for (const a of at(1.09)) p.box(a[0] - 0.07, a[1] - 0.07, 0.14, 0.14, TOP, 3, '#a9adb2');
  roofClutter(p, 0.1, 2.3, 0.6, 0.6, BASE, 63);
  roofClutter(p, 2.3, 0.1, 0.6, 0.6, BASE, 64);
  p.pole(CU - 0.9, CV - 0.2, TOP, 16, '#8a8f96');
  p.pole(CU - 0.2, CV - 0.9, TOP, 12, '#8a8f96');

  // Mall entrance: columned portico in the middle of the front façade.
  const f0 = outer[2];
  const f1 = outer[3];
  if (f0 && f1) {
    const mu = (f0[0] + f1[0]) / 2;
    const mv = (f0[1] + f1[1]) / 2;
    p.box(mu - 0.24, mv - 0.06, 0.48, 0.24, Z, 6.5, '#ece6d6', { top: SLATE });
    p.colonnade('left', mu - 0.22, mv - 0.06, 0.44, 0.24, Z, 5.5, 6, '#f8f5ec', '#76705f');
    p.colonnade('right', mu - 0.22, mv - 0.06, 0.44, 0.24, Z, 5.5, 3, '#f8f5ec', '#76705f');
    p.gableRoofV(mu - 0.24, mv - 0.06, 0.48, 0.24, Z + 6.5, 3, '#ece6d6', SLATE);
  }
}

/** Russia — Stalinist ministry on the embankment: cream façade with a columned portico and a tower with a red star. */
function stalinist(p: IsoPainter, team: FactionColors): void {
  const CREAM = '#e3d5b0';
  const TRIM = '#f4ecd6';
  p.box(0, 0, 3, 3, 0, 2, '#8f846c');
  // Main block filling the plot, with two front pavilions flanking the portico.
  const blocks: readonly [number, number, number, number][] = [
    [0.05, 0.05, 2.9, 2.5],
    [0.05, 2.55, 1.0, 0.4],
    [1.95, 2.55, 1.0, 0.4],
  ];
  blocks.forEach(([u, v, w, d], k) => {
    p.box(u, v, w, d, 2, 20, CREAM, { top: RA2.roof });
    p.faceRect('left', u, v, w, d, 2, 20, 0, 1, 0, 0.18, '#8f846c');
    p.faceRect('right', u, v, w, d, 2, 20, 0, 1, 0, 0.18, '#8f846c');
    facade(p, 'left', u, v, w, d, 5.6, 16.4, { cols: Math.max(3, Math.round(w * 7)), floors: 4, frame: TRIM, bandColor: '#b9ab88', lit: 0.1, seed: 11 + k });
    facade(p, 'right', u, v, w, d, 5.6, 16.4, { cols: Math.max(2, Math.round(d * 7)), floors: 4, frame: TRIM, bandColor: '#a99c7c', lit: 0.1, seed: 14 + k });
    p.box(u - 0.02, v - 0.02, w + 0.04, d + 0.04, 22, 2, TRIM);
    parapet(p, u - 0.02, v - 0.02, w + 0.04, d + 0.04, 24, '#b9ab88');
  });
  roofClutter(p, 0.15, 0.15, 0.7, 0.7, 24, 21);
  roofClutter(p, 2.15, 0.15, 0.7, 0.7, 24, 22);
  roofClutter(p, 0.15, 1.7, 0.6, 0.6, 24, 23);
  roofClutter(p, 2.25, 1.7, 0.6, 0.6, 24, 24);
  // Portico of columns at the front, the entrance door behind it.
  p.faceRect('left', 0.05, 0.05, 2.9, 2.5, 2, 20, 0.43, 0.57, 0, 0.6, '#3a332a');
  p.colonnade('left', 1.08, 2.55, 0.84, 0.4, 2, 18, 6, TRIM, '#6d6555');
  p.box(1.05, 2.53, 0.9, 0.44, 20, 3, TRIM);
  p.faceRect('left', 1.05, 2.53, 0.9, 0.44, 20, 3, 0, 1, 0, 1, shade(team.primary, LIGHT.left + 0.1));
  // Central raised block, stepped tower, spire and the red star.
  p.box(0.98, 0.98, 1.04, 1.14, 24, 6, TRIM);
  p.box(1.22, 1.15, 0.56, 0.56, 30, 10, CREAM);
  facade(p, 'left', 1.22, 1.15, 0.56, 0.56, 30, 10, { cols: 3, floors: 1, frame: TRIM, seed: 14 });
  facade(p, 'right', 1.22, 1.15, 0.56, 0.56, 30, 10, { cols: 3, floors: 1, frame: TRIM, seed: 15 });
  p.box(1.3, 1.23, 0.4, 0.4, 40, 7, TRIM);
  p.pyramid(1.3, 1.23, 0.4, 0.4, 47, 16, '#b8a46a');
  const [sx, sy] = p.project(1.5, 1.43, 66);
  p.ctx.fillStyle = '#d42a1e';
  p.ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 4 : 1.7;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    p.ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
  }
  p.ctx.closePath();
  p.ctx.fill();
}

/** China — the August 1st Building: broad stepped modern block, golden emblem with the red star, no forecourt. */
function bayi(p: IsoPainter, team: FactionColors): void {
  const STONE = '#d8ccb2';
  const DARK = '#7e7466';
  p.box(0, 0, 3, 3, 0, 2, '#9a907e');
  // Low wings filling the whole plot.
  p.box(0.05, 0.05, 2.9, 2.9, 2, 14, STONE, { top: RA2.roof });
  facade(p, 'left', 0.05, 0.05, 2.9, 2.9, 2, 14, { cols: 20, floors: 3, frame: '#e6dcc6', bandColor: '#b5a88e', seed: 31 });
  facade(p, 'right', 0.05, 0.05, 2.9, 2.9, 2, 14, { cols: 20, floors: 3, frame: '#e6dcc6', bandColor: '#a5987e', seed: 32 });
  parapet(p, 0.05, 0.05, 2.9, 2.9, 16, '#c4b89e', 0.06, 2);
  roofClutter(p, 0.12, 0.12, 0.55, 1.2, 16, 33);
  roofClutter(p, 2.3, 0.12, 0.55, 1.2, 16, 34);
  roofClutter(p, 0.12, 2.2, 0.55, 0.6, 16, 36);
  roofClutter(p, 2.3, 2.2, 0.55, 0.6, 16, 37);
  // Central tower in three steps with vertical window strips, its front on the plot's front edge.
  p.box(0.8, 0.9, 1.4, 2.05, 2, 30, STONE, { top: RA2.roof });
  for (let s = 0.1; s < 0.95; s += 0.12) p.faceRect('left', 0.8, 0.9, 1.4, 2.05, 2, 30, s, s + 0.05, 0.3, 0.92, GLASS);
  facade(p, 'right', 0.8, 0.9, 1.4, 2.05, 2, 30, { cols: 10, floors: 6, frame: '#e6dcc6', bandColor: '#a5987e', seed: 35 });
  p.box(0.95, 1.05, 1.1, 1.75, 32, 8, STONE, { top: DARK });
  p.box(1.1, 1.2, 0.8, 1.45, 40, 6, STONE, { top: DARK });
  // Entrance doors at the foot of the tower.
  p.faceRect('left', 0.8, 0.9, 1.4, 2.05, 2, 30, 0.3, 0.7, 0, 0.22, '#3a3329');
  // Golden emblem with the red star over the entrance.
  p.faceTransform('left', 0.8, 2.95, 18, (ctx) => {
    const cx = 0.7 * 1.4 * 32 * 0.5;
    ctx.fillStyle = '#e2b23a';
    ctx.beginPath();
    ctx.arc(cx, 6, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8261d';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 4 : 1.6;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(cx + Math.cos(a) * r, 6 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });
  // Team-coloured banners beside the entrance.
  for (const u of [0.95, 1.95]) p.faceRect('left', 0.8, 0.9, 1.4, 2.05, 2, 30, (u - 0.8) / 1.4, (u - 0.8) / 1.4 + 0.05, 0.1, 0.55, team.primary);
  p.pole(1.7, 1.4, 46, 14, '#8a8f96');
}

/** Europe — glass headquarters with interlaced wings (alliance HQ style) rising from a glass podium that fills the plot. */
function glassHq(p: IsoPainter, team: FactionColors): void {
  const BLUE = '#5f7488';
  const STEEL = '#a6abb0';
  const PZ = 8;
  p.box(0, 0, 3, 3, 0, 2, '#7d868e');
  // Podium filling the plot, with the glazed entrance in the front facade.
  p.box(0.05, 0.05, 2.9, 2.9, 2, PZ - 2, BLUE, { top: STEEL });
  facade(p, 'left', 0.05, 0.05, 2.9, 2.9, 2, PZ - 2, { cols: 22, floors: 1, frame: '#c9ccd0', fill: 0.8, band: 0.22, lit: 0.18, seed: 40 });
  facade(p, 'right', 0.05, 0.05, 2.9, 2.9, 2, PZ - 2, { cols: 22, floors: 1, frame: '#c9ccd0', fill: 0.8, band: 0.22, seed: 41 });
  p.faceRect('left', 0.05, 0.05, 2.9, 2.9, 2, PZ - 2, 0.4, 0.6, 0, 0.85, RA2.glassLit);
  p.faceRect('left', 0.05, 0.05, 2.9, 2.9, 2, PZ - 2, 0, 1, 0.88, 1, team.primary);
  parapet(p, 0.05, 0.05, 2.9, 2.9, PZ, STEEL, 0.04, 1.2);
  // Spine.
  p.box(0.05, 0.05, 0.55, 2.9, PZ, 16, BLUE, { top: STEEL });
  roofClutter(p, 0.05, 0.05, 0.55, 2.9, PZ + 16, 41);
  // Interlaced wings ("fingers") reaching out of the spine to the far edge, alternating heights.
  const wings: readonly [number, number][] = [
    [0.15, 18],
    [1.2, 22],
    [2.25, 18],
  ];
  for (const [v, h] of wings) {
    p.box(0.6, v, 2.05, 0.6, PZ, h, BLUE, { top: STEEL });
    facade(p, 'left', 0.6, v, 2.05, 0.6, PZ, h, { cols: 14, floors: 4, frame: '#c9ccd0', fill: 0.8, band: 0.22, lit: 0.18, seed: 42 + h });
    facade(p, 'right', 0.6, v, 2.05, 0.6, PZ, h, { cols: 4, floors: 4, frame: '#c9ccd0', fill: 0.8, band: 0.22, seed: 43 + h });
    parapet(p, 0.6, v, 2.05, 0.6, PZ + h, STEEL, 0.04, 1.5);
    p.box(1.2, v + 0.15, 0.25, 0.3, PZ + h, 3, '#a9adb2');
    // Curved tip of each wing.
    p.cylinder(2.65, v + 0.3, 0.3, PZ, h, BLUE);
  }
  // Member-state flags in team colours on the podium roof between the wings.
  for (let i = 0; i < 5; i++) {
    const u = 0.8 + i * 0.4;
    p.pole(u, 2.05, PZ, 10, '#e6e6e6');
    p.polygon([[u, 2.05, PZ + 10], [u + 0.14, 2.05, PZ + 10], [u + 0.14, 2.05, PZ + 7], [u, 2.05, PZ + 7]] as Vec3[], i % 2 ? team.primary : team.light, null);
  }
}

/** Merlons along the top of a wall box, `n` of them, on its long axis. */
function merlons(p: IsoPainter, u: number, v: number, w: number, d: number, z: number, n: number, color: string): void {
  const alongU = w >= d;
  const len = alongU ? w : d;
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const s = i * step + step * 0.2;
    if (alongU) p.box(u + s, v, step * 0.6, d, z, 3, color, { edge: null });
    else p.box(u, v + s, w, step * 0.6, z, 3, color, { edge: null });
  }
}

/** Round corner tower of mud brick with a crenellated top. */
function fortTower(p: IsoPainter, u: number, v: number, z: number, brick: string): void {
  p.cylinder(u, v, 0.26, z, 26, brick, 8);
  p.cylinder(u, v, 0.3, z + 26, 3, shade(brick, 1.08));
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.05 + (i / 5) * 0.9);
    p.box(u + Math.cos(a) * 0.24 - 0.04, v + Math.sin(a) * 0.24 - 0.04, 0.08, 0.08, z + 29, 3, shade(brick, 1.08), { edge: null });
  }
}

/**
 * Islamic — garrison in a mud-brick desert fortress (an Arg plan): one solid crenellated block filling the plot, with
 * round corner towers, the headquarters keep on top under a small green dome, and a tiled iwan gateway on the front
 * edge with a team-coloured banner over the arch.
 */
function islamicFort(p: IsoPainter, team: FactionColors): void {
  const BRICK = '#b59670';
  const TOP = '#c7ab84';
  const Z = 2;
  const WH = 18;
  p.box(0, 0, 3, 3, 0, Z, '#8f7a58');

  // Back corner tower, then the solid fortress block.
  fortTower(p, 0.3, 0.3, Z, BRICK);
  p.box(0.05, 0.05, 2.9, 2.9, Z, WH, BRICK, { top: TOP });
  p.windows('left', 0.05, 0.05, 2.9, 2.9, Z, WH, 10, 1, '#2b2219', 0.1, 0.35);
  p.windows('right', 0.05, 0.05, 2.9, 2.9, Z, WH, 10, 1, '#2b2219', 0.1, 0.35);
  p.faceRect('left', 0.05, 0.05, 2.9, 2.9, Z, WH, 0.05, 0.95, 0.75, 0.8, ISLAMIC_GREEN);
  p.faceRect('right', 0.05, 0.05, 2.9, 2.9, Z, WH, 0.05, 0.95, 0.75, 0.8, ISLAMIC_GREEN);
  merlons(p, 0.3, 0.05, 2.4, 0.2, Z + WH, 9, TOP);
  merlons(p, 0.05, 0.3, 0.2, 2.4, Z + WH, 9, TOP);
  merlons(p, 2.75, 0.3, 0.2, 2.4, Z + WH, 9, TOP);
  merlons(p, 0.3, 2.75, 2.4, 0.2, Z + WH, 9, TOP);

  // Headquarters keep on the roof, with a small dome.
  const KZ = Z + WH;
  p.box(0.55, 0.5, 1.9, 1.5, KZ, 12, '#cdb994', { top: TOP });
  p.windows('left', 0.55, 0.5, 1.9, 1.5, KZ, 12, 6, 1, '#2b2219', 0.2, 0.6);
  p.windows('right', 0.55, 0.5, 1.9, 1.5, KZ, 12, 4, 1, '#2b2219', 0.2, 0.6);
  p.faceRect('left', 0.55, 0.5, 1.9, 1.5, KZ, 12, 0, 1, 0.82, 0.92, ISLAMIC_GREEN);
  p.cylinder(1.5, 1.25, 0.32, KZ + 12, 4, '#e4d2a8');
  p.dome(1.5, 1.25, 0.36, KZ + 16, 14, ISLAMIC_GREEN_DOME);
  p.pole(1.5, 1.25, KZ + 30, 5, '#e2b23a');

  // Side corner towers.
  fortTower(p, 2.7, 0.3, Z, BRICK);
  fortTower(p, 0.3, 2.7, Z, BRICK);

  // Tiled iwan gateway on the front edge (the soldiers' door), team banner over the arch.
  iwan(p, 'left', [1.1, 2.65, 0.8, 0.3, Z, 30]);
  p.faceRect('left', 1.1, 2.65, 0.8, 0.3, Z, 30, 0.12, 0.88, 0.84, 0.92, team.primary);
  fortTower(p, 2.7, 2.7, Z, BRICK);
}

const DESIGNS: Record<FactionId, (p: IsoPainter, team: FactionColors) => void> = {
  usa: pentagon,
  russia: stalinist,
  china: bayi,
  europe: glassHq,
  islamic: islamicFort,
};

/** Flag pole of each design, on the roof (no open ground inside the plot). */
const FLAGS: Record<FactionId, FlagSpot> = {
  usa: { u: 0.35, v: 2.65, z: 8, h: 24 },
  russia: { u: 0.35, v: 2.75, z: 24, h: 22 },
  china: { u: 0.35, v: 2.65, z: 16, h: 26 },
  europe: { u: 0.33, v: 2.7, z: 24, h: 20 },
  islamic: { u: 1.0, v: 1.0, z: 32, h: 18 },
};

/**
 * Ministry of Defence (the infantry building), drawn in each nation's own architecture: the Pentagon (USA), a
 * Stalinist ministry with a red-star spire (Russia), the August 1st Building (China), a glass alliance
 * headquarters (Europe) and a mud-brick desert fortress (Islamic). The national flag flies on the roof of each; every design fills its plot.
 */
export function createBarracksArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  const flag = FLAGS[faction];

  return {
    footprint: { w: 3, d: 3 },
    // Authored in 3 × 3 units, drawn 4/3× to fill its 4 × 4 plot (FOOTPRINT_SMALL) edge to edge.
    scale: 4 / 3,
    height: 72,

    drawStatic(p) {
      DESIGNS[faction](p, team);
      drawNationalPole(p, faction, flag.u, flag.v, flag.z, flag.h);
    },

    drawAnimated(p, time) {
      drawFlagOnPole(p, faction, flag.u, flag.v, flag.z + flag.h, time, 0.6, 16, 10);
    },
  };
}
