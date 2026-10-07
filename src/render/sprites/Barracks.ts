import { FACTIONS } from '../../factions';
import type { FactionColors, FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import { type IsoPainter, LIGHT, type Vec3 } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

const GLASS = '#3d4650';
const LAWN = '#5f8f45';
const ASPHALT = '#7b7d80';

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

/** Small tree. */
function tree(p: IsoPainter, u: number, v: number): void {
  p.cylinder(u, v, 0.035, 2, 4, '#6b513a');
  p.dome(u, v, 0.13, 6, 6, '#4f7f3b');
}

/**
 * USA — the Pentagon, filling its plot: a low five-sided limestone block of five concentric rings. Dark slate roofs
 * alternate with the light wells between the rings, ten corridors run out from the central courtyard (lawn,
 * paths and the gazebo), the façades carry five floors of windows, the Mall entrance has its columned portico, and
 * a helipad and parking lots sit in the corners. A corner points to the back so a whole façade faces the camera.
 */
function pentagon(p: IsoPainter, team: FactionColors): void {
  const LIME = '#e0d9c6';
  const SLATE = '#6c747b';
  const WELL = '#c8c2b2';
  const CU = 1.5;
  const CV = 1.5;
  const TURN = -Math.PI / 4;
  const Z = 2;
  const H = 11;
  const TOP = Z + H;
  const R = 1.42;
  const at = (r: number): [number, number][] => ring(CU, CV, r, 5, TURN);
  const flat = (r: number, z: number, color: string): void => p.polygon(at(r).map(([u, v]) => [u, v, z] as Vec3), color, null);

  // Grounds: lawn, helipad and parking lots in the corners of the plot.
  p.box(0, 0, 3, 3, 0, 2, '#9ea3a6');
  p.topRect(0.04, 0.04, 2.96, 2.96, 2, LAWN);
  flat(R + 0.1, 2, ASPHALT);
  p.topRect(0.06, 2.32, 0.66, 2.94, 2, ASPHALT);
  for (let t = 0.1; t < 0.6; t += 0.1) p.topRect(0.06 + t, 2.4, 0.08 + t, 2.62, 2, '#e9e6dc');
  p.topRect(2.32, 0.06, 2.94, 0.66, 2, ASPHALT);
  for (let t = 0.1; t < 0.6; t += 0.1) p.topRect(2.4, 0.06 + t, 2.62, 0.08 + t, 2, '#e9e6dc');
  // Helipad (front corner).
  p.cylinder(2.62, 2.62, 0.24, 2, 0.6, '#5d6064');
  const [hx, hy] = p.project(2.62, 2.62, 2.6);
  p.ctx.fillStyle = '#f2f2ee';
  p.ctx.font = '700 5px "Segoe UI", sans-serif';
  p.ctx.textAlign = 'center';
  p.ctx.textBaseline = 'middle';
  p.ctx.fillText('H', hx, hy);

  // The block.
  const outer = at(R);
  prism(p, outer, Z, H, LIME, SLATE);

  // Five floors of windows on the façades facing the camera.
  for (let i = 0; i < 5; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % 5];
    if (!a || !b || b[1] - a[1] - (b[0] - a[0]) <= 0) continue;
    const du = (b[0] - a[0]) * 0.022;
    const dv = (b[1] - a[1]) * 0.022;
    for (let f = 0; f < 5; f++) {
      const z0 = Z + 1.2 + f * 1.9;
      for (let t = 0.04; t < 0.96; t += 0.045) {
        const u = a[0] + (b[0] - a[0]) * t;
        const v = a[1] + (b[1] - a[1]) * t;
        p.polygon([[u, v, z0], [u, v, z0 + 1.1], [u + du, v + dv, z0 + 1.1], [u + du, v + dv, z0]] as Vec3[], GLASS, null);
      }
    }
  }

  // Roof: five slate rings with light wells between them (E ring outside … A ring inside).
  for (const r of [1.2, 0.98, 0.76]) {
    flat(r + 0.035, TOP, WELL);
    flat(r - 0.035, TOP, SLATE);
  }
  // Ten corridors from the courtyard to the outer ring (corners and mid-sides).
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

  // Central courtyard, seen through the hole in the roof: far inner walls, lawn, cross paths and the gazebo.
  ctx.save();
  ctx.beginPath();
  inner.forEach(([u, v], i) => {
    const [x, y] = p.project(u, v, TOP);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  p.polygon(inner.map(([u, v]) => [u, v, Z] as Vec3), '#6fa04f', null);
  p.topRect(CU - 0.03, CV - 0.5, CU + 0.03, CV + 0.5, Z, '#d9d3c1');
  p.topRect(CU - 0.5, CV - 0.03, CU + 0.5, CV + 0.03, Z, '#d9d3c1');
  for (let i = 0; i < 5; i++) {
    const a = inner[i];
    const b = inner[(i + 1) % 5];
    if (!a || !b || b[1] - a[1] - (b[0] - a[0]) >= 0) continue;
    p.polygon([[a[0], a[1], Z], [b[0], b[1], Z], [b[0], b[1], TOP], [a[0], a[1], TOP]] as Vec3[], shade(LIME, 0.8), null);
  }
  tree(p, CU - 0.25, CV - 0.05);
  tree(p, CU + 0.05, CV - 0.28);
  p.cylinder(CU + 0.06, CV + 0.06, 0.09, Z, 3.5, '#f3efe4');
  p.pyramid(CU - 0.04, CV - 0.04, 0.2, 0.2, Z + 3.5, 3, team.primary);
  ctx.restore();

  // Mall entrance: columned portico in the middle of the front façade.
  const f0 = outer[2];
  const f1 = outer[3];
  if (f0 && f1) {
    const mu = (f0[0] + f1[0]) / 2;
    const mv = (f0[1] + f1[1]) / 2;
    p.box(mu - 0.24, mv - 0.06, 0.48, 0.24, Z, 9.5, '#ece6d6', { top: SLATE });
    p.colonnade('left', mu - 0.22, mv - 0.06, 0.44, 0.24, Z, 8.5, 6, '#f8f5ec', '#76705f');
    p.colonnade('right', mu - 0.22, mv - 0.06, 0.44, 0.24, Z, 8.5, 3, '#f8f5ec', '#76705f');
    p.gableRoofV(mu - 0.24, mv - 0.06, 0.48, 0.24, Z + 9.5, 3, '#ece6d6', SLATE);
  }
}

/** Russia — Stalinist ministry on the embankment: cream façade with a columned portico and a tower with a red star. */
function stalinist(p: IsoPainter, team: FactionColors): void {
  const CREAM = '#e3d5b0';
  const TRIM = '#f4ecd6';
  p.box(0, 0, 3, 3, 0, 2, '#a59f92');
  p.topRect(0.15, 2.45, 2.85, 2.9, 2, '#bdb6a6');
  // Long wings.
  p.box(0.2, 0.3, 2.6, 1.15, 2, 20, CREAM, { top: '#8e8a80' });
  p.windows('left', 0.2, 0.3, 2.6, 1.15, 2, 20, 12, 3, GLASS, 0.08, 0.45);
  p.windows('right', 0.2, 0.3, 2.6, 1.15, 2, 20, 5, 3, GLASS, 0.08, 0.45);
  p.box(0.18, 0.28, 2.64, 1.19, 22, 2, TRIM);
  // Central block with a portico of columns.
  p.box(1.0, 1.0, 1.0, 1.1, 2, 26, CREAM, { top: '#8e8a80' });
  p.colonnade('left', 1.08, 1.75, 0.84, 0.4, 2, 18, 6, TRIM, '#6d6555');
  p.box(1.05, 1.73, 0.9, 0.44, 20, 3, TRIM);
  p.box(0.98, 0.98, 1.04, 1.14, 28, 2, TRIM);
  // Stepped tower, spire and the red star.
  p.box(1.22, 1.15, 0.56, 0.56, 30, 10, CREAM);
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
  // Team band over the entrance.
  p.faceRect('left', 1.05, 1.73, 0.9, 0.44, 20, 3, 0, 1, 0, 1, shade(team.primary, LIGHT.left + 0.1));
}

/** China — the August 1st Building: broad stepped modern block, golden emblem with the red star, grand forecourt. */
function bayi(p: IsoPainter, team: FactionColors): void {
  const STONE = '#d8ccb2';
  const DARK = '#7e7466';
  p.box(0, 0, 3, 3, 0, 2, '#b3aa98');
  p.topRect(0.2, 2.2, 2.8, 2.9, 2, '#c7bfae');
  // Low wings.
  p.box(0.15, 0.35, 2.7, 1.3, 2, 14, STONE, { top: '#9a9182' });
  p.windows('left', 0.15, 0.35, 2.7, 1.3, 2, 14, 14, 2, GLASS, 0.08, 0.4);
  p.windows('right', 0.15, 0.35, 2.7, 1.3, 2, 14, 6, 2, GLASS, 0.08, 0.4);
  // Central tower in three steps with vertical window strips.
  p.box(0.8, 0.5, 1.4, 1.35, 2, 30, STONE, { top: '#9a9182' });
  for (let s = 0.1; s < 0.95; s += 0.12) p.faceRect('left', 0.8, 0.5, 1.4, 1.35, 2, 30, s, s + 0.05, 0.08, 0.92, GLASS);
  p.box(0.95, 0.65, 1.1, 1.05, 32, 8, STONE, { top: DARK });
  p.box(1.1, 0.8, 0.8, 0.75, 40, 6, STONE, { top: DARK });
  // Golden emblem with the red star over the entrance.
  p.faceTransform('left', 0.8, 1.85, 18, (ctx) => {
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
  // Entrance steps and team-coloured banners.
  p.box(1.05, 1.85, 0.9, 0.3, 2, 2, '#e8e1d0');
  for (const u of [0.95, 1.95]) p.faceRect('left', 0.8, 0.5, 1.4, 1.35, 2, 30, (u - 0.8) / 1.4, (u - 0.8) / 1.4 + 0.05, 0.1, 0.55, team.primary);
  tree(p, 0.35, 2.55);
  tree(p, 2.65, 2.55);
}

/** Europe — glass headquarters with interlaced wings (alliance HQ style) around a green plaza. */
function glassHq(p: IsoPainter, team: FactionColors): void {
  const BLUE = '#6f93b3';
  const STEEL = '#c9ced3';
  p.box(0, 0, 3, 3, 0, 2, '#a9aeb2');
  p.topRect(0.2, 0.2, 2.8, 2.8, 2, LAWN);
  // Spine.
  p.box(0.25, 0.3, 0.55, 2.2, 2, 16, BLUE, { top: STEEL });
  // Interlaced wings ("fingers") reaching out of the spine, alternating heights.
  const wings: readonly [number, number][] = [
    [0.4, 18],
    [1.05, 22],
    [1.7, 18],
  ];
  for (const [v, h] of wings) {
    p.box(0.8, v, 1.85, 0.4, 2, h, BLUE, { top: STEEL });
    p.windows('left', 0.8, v, 1.85, 0.4, 2, h, 9, 3, shade(BLUE, 0.7), 0.06, 0.35);
    p.windows('right', 0.8, v, 1.85, 0.4, 2, h, 2, 3, shade(BLUE, 0.75), 0.06, 0.35);
    // Curved tip of each wing.
    p.cylinder(2.65, v + 0.2, 0.2, 2, h, BLUE);
  }
  // Ring of member-state flags in team colours along the plaza.
  for (let i = 0; i < 6; i++) {
    const u = 0.5 + i * 0.38;
    p.pole(u, 2.55, 2, 12, '#e6e6e6');
    p.polygon([[u, 2.55, 14], [u + 0.14, 2.55, 14], [u + 0.14, 2.55, 11], [u, 2.55, 11]] as Vec3[], i % 2 ? team.primary : team.light, null);
  }
}

const DESIGNS: Record<FactionId, (p: IsoPainter, team: FactionColors) => void> = {
  usa: pentagon,
  russia: stalinist,
  china: bayi,
  europe: glassHq,
};

/** Flag pole of each design, placed on open ground in front of the building. */
const FLAGS: Record<FactionId, FlagSpot> = {
  usa: { u: 1.05, v: 2.85, z: 2, h: 30 },
  russia: { u: 0.4, v: 2.65, z: 2, h: 30 },
  china: { u: 1.5, v: 2.6, z: 2, h: 34 },
  europe: { u: 2.7, v: 2.7, z: 2, h: 30 },
};

/**
 * Ministry of Defence (the infantry building), drawn in each nation's own architecture: the Pentagon (USA), a
 * Stalinist ministry with a red-star spire (Russia), the August 1st Building (China) and a glass alliance
 * headquarters (Europe). The national flag flies in front of each.
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
