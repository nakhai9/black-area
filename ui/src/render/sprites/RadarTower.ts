import { HALF_TW } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade, withAlpha } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { RA2 } from './Ra2Kit';

/** Art px of height per tile, so a tile of height looks as long as a tile across the ground. */
const ZT = Math.SQRT2 * HALF_TW;
/** Towards the camera in (u, v, z / ZT) space: depth key for the painter's sort and front / back faces. */
const VIEW = [0.612, 0.612, 0.5] as const;

type P3 = readonly [u: number, v: number, z: number];

const depthOf = (p: P3): number => p[0] * VIEW[0] + p[1] * VIEW[1] + (p[2] / ZT) * VIEW[2];

/** Brightness of a surface with unit normal n, matching IsoPainter's LIGHT (top 1, +u 0.86, +v 0.7). */
function light(n: readonly [number, number, number]): number {
  return Math.max(0.28, 0.55 + 0.45 * n[2] + 0.31 * n[0] + 0.15 * n[1]);
}

/**
 * A little 3-D scene in the building's art space: faces and struts are collected, then painted far to near, so
 * a turning dish covers its own back, its struts and its yoke correctly at every angle.
 */
class Scene {
  private readonly prims: { depth: number; draw: () => void }[] = [];

  constructor(private readonly p: IsoPainter) {}

  /** A flat face; `back` is its colour seen from behind (null: the side facing away is not drawn). */
  face(pts: readonly P3[], front: string, back: string | null, seam: string | null = null, alpha = 1): void {
    const n = normal(pts);
    const facing = n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] >= 0;
    if (!facing && back === null) return;
    const base = facing ? front : back!;
    const nn = facing ? n : ([-n[0], -n[1], -n[2]] as const);
    let b = light(nn);
    // Glint where the key light glances off a smooth face.
    if (b > 0.97) b += (b - 0.97) * 3;
    const fill = alpha < 1 ? withAlpha(shadeHex(base, b), alpha) : shade(base, b);
    const d = pts.reduce((s, q) => s + depthOf(q), 0) / pts.length;
    this.prims.push({
      depth: d,
      draw: () => {
        const { ctx } = this.p;
        ctx.beginPath();
        pts.forEach((q, i) => {
          const [x, y] = this.p.project(q[0], q[1], q[2]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        // A hairline of the same fill closes the anti-aliasing gaps between neighbouring faces.
        ctx.strokeStyle = seam ?? fill;
        ctx.lineWidth = seam ? 0.35 : 0.5;
        ctx.stroke();
      },
    });
  }

  /** A strut or tube, cut into pieces so it sorts correctly against the faces it passes. */
  rod(a: P3, b: P3, color: string, width: number, pieces = 4): void {
    for (let i = 0; i < pieces; i++) {
      const s = i / pieces;
      const t = (i + 1) / pieces;
      const q0: P3 = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
      const q1: P3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      this.prims.push({
        depth: (depthOf(q0) + depthOf(q1)) / 2 + 0.002,
        draw: () => {
          const { ctx } = this.p;
          const [x0, y0] = this.p.project(q0[0], q0[1], q0[2]);
          const [x1, y1] = this.p.project(q1[0], q1[1], q1[2]);
          ctx.lineCap = 'round';
          ctx.strokeStyle = shade(color, 0.55);
          ctx.lineWidth = width + 0.8;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.stroke();
          if (width >= 2.5) {
            // Highlight streak along the top of a round tube.
            ctx.strokeStyle = shade(color, 1.25);
            ctx.lineWidth = width * 0.3;
            ctx.beginPath();
            ctx.moveTo(x0, y0 - width * 0.25);
            ctx.lineTo(x1, y1 - width * 0.25);
            ctx.stroke();
          }
        },
      });
    }
  }

  flush(): void {
    this.prims.sort((x, y) => x.depth - y.depth);
    for (const q of this.prims) q.draw();
    this.prims.length = 0;
  }
}

function shadeHex(hex: string, f: number): string {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(shade(hex, f))!;
  const h = (v: string) => Number(v).toString(16).padStart(2, '0');
  return `#${h(m[1]!)}${h(m[2]!)}${h(m[3]!)}`;
}

/** Unit normal of a face in (u, v, z / ZT) space (Newell's method: counter-clockwise seen from the front). */
function normal(pts: readonly P3[]): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const az = a[2] / ZT;
    const bz = b[2] / ZT;
    x += (a[1] - b[1]) * (az + bz);
    y += (az - bz) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/**
 * Tapered tower of `sides` flat panels (a cone at many sides, an octagon at 8, a square at 4) round (cu, cv),
 * radius r0 at z0 narrowing to r1 at z0 + h. `seam` draws the joints between panels.
 */
function frustum(s: Scene, cu: number, cv: number, r0: number, r1: number, z0: number, h: number, color: string, sides: number, seam: string | null, turn = 0, cap = true): void {
  for (let i = 0; i < sides; i++) {
    const a0 = turn + (i / sides) * Math.PI * 2;
    const a1 = turn + ((i + 1) / sides) * Math.PI * 2;
    // Wound so the normal points outwards.
    s.face(
      [
        [cu + Math.cos(a0) * r0, cv + Math.sin(a0) * r0, z0],
        [cu + Math.cos(a1) * r0, cv + Math.sin(a1) * r0, z0],
        [cu + Math.cos(a1) * r1, cv + Math.sin(a1) * r1, z0 + h],
        [cu + Math.cos(a0) * r1, cv + Math.sin(a0) * r1, z0 + h],
      ],
      color,
      null,
      seam,
    );
  }
  if (!cap) return;
  const top: P3[] = [];
  for (let i = sides - 1; i >= 0; i--) {
    const a = turn + (i / sides) * Math.PI * 2;
    top.push([cu + Math.cos(a) * r1, cv + Math.sin(a) * r1, z0 + h]);
  }
  s.face(top.reverse(), shade(color, 0.96), null);
}

/** A point on a tower's surface at angle a (0 = +u, π/2 = +v) and height z: for doors, vents and arches. */
function onTower(cu: number, cv: number, r0: number, r1: number, z0: number, h: number, a: number, z: number, out = 0.01): P3 {
  const r = r0 + ((r1 - r0) * (z - z0)) / h + out;
  return [cu + Math.cos(a) * r, cv + Math.sin(a) * r, z];
}

/** A patch on a tower's surface between angles a0..a1 and heights z0..z1, as one face. */
function towerPatch(s: Scene, t: Tower, a0: number, a1: number, z0: number, z1: number, color: string, out = 0.012): void {
  s.face(
    [
      onTower(t.cu, t.cv, t.r0, t.r1, t.z0, t.h, a0, z0, out),
      onTower(t.cu, t.cv, t.r0, t.r1, t.z0, t.h, a1, z0, out),
      onTower(t.cu, t.cv, t.r0, t.r1, t.z0, t.h, a1, z1, out),
      onTower(t.cu, t.cv, t.r0, t.r1, t.z0, t.h, a0, z1, out),
    ],
    color,
    null,
  );
}

interface Tower {
  cu: number;
  cv: number;
  r0: number;
  r1: number;
  z0: number;
  h: number;
}

/** Facing the camera: the side of a tower at angle π/4 (between +u and +v). */
const FRONT = Math.PI / 4;

type DishKind = 'parabolic' | 'array' | 'cassegrain' | 'peel' | 'mesh';

interface RadarStyle {
  /** Height (art px) of the elevation axis the antenna turns on. */
  pivot: number;
  dish: DishKind;
  /** Tilt of the boresight above the horizon (rad). */
  elevation: number;
  /** Turns per second. */
  rpm: number;
  front: string;
  back: string;
  strut: string;
  yoke: string;
  pedestal: (s: Scene, p: IsoPainter, team: string) => void;
}

const WHITE = '#e8eaec';

/** Pad of the 2 × 2 plot: concrete slab with a kerb, a fence post at each corner. */
function pad(p: IsoPainter, ground: string = RA2.paving): void {
  p.box(0, 0, 2, 2, 0, 2, RA2.concrete);
  p.topRect(0.08, 0.08, 1.92, 1.92, 2, ground);
  p.topRect(0.08, 0.08, 1.92, 0.16, 2.01, RA2.hazard);
}

/** Front door of a tower: a little porch box with a coloured door under a flat canopy (the photo's entrance). */
function porch(s: Scene, t: Tower, door: string, wall: string): void {
  const a = FRONT;
  const w = 0.16;
  const r = t.r0 + 0.12;
  const c = (da: number, rr: number, z: number): P3 => [t.cu + Math.cos(a + da) * rr, t.cv + Math.sin(a + da) * rr, z];
  const z0 = t.z0;
  const z1 = t.z0 + 16;
  // Side walls and front of the porch.
  s.face([c(-w, t.r0 - 0.05, z0), c(-w, r, z0), c(-w, r, z1), c(-w, t.r0 - 0.05, z1)], wall, wall);
  s.face([c(w, r, z0), c(w, t.r0 - 0.05, z0), c(w, t.r0 - 0.05, z1), c(w, r, z1)], wall, wall);
  s.face([c(-w, r, z0), c(w, r, z0), c(w, r, z1), c(-w, r, z1)], wall, null);
  s.flush();
  s.face([c(-w * 0.62, r + 0.004, z0), c(w * 0.62, r + 0.004, z0), c(w * 0.62, r + 0.004, z1 - 3), c(-w * 0.62, r + 0.004, z1 - 3)], door, null, shade(door, 0.6));
  // Canopy slab.
  s.face([c(-w - 0.04, r + 0.06, z1 + 2), c(w + 0.04, r + 0.06, z1 + 2), c(w + 0.04, t.r0 - 0.08, z1 + 2), c(-w - 0.04, t.r0 - 0.08, z1 + 2)], shade(wall, 1.05), null);
  s.face([c(-w - 0.04, r + 0.06, z1), c(w + 0.04, r + 0.06, z1), c(w + 0.04, r + 0.06, z1 + 2), c(-w - 0.04, r + 0.06, z1 + 2)], wall, null);
}

/** Louvred vent: a dark panel with bright slats across, on the tower surface at angle a. */
function vent(s: Scene, t: Tower, a: number, z0: number, z1: number): void {
  const da = 0.16;
  towerPatch(s, t, a - da, a + da, z0, z1, '#5b6066');
  for (let z = z0 + 1.5; z < z1 - 0.5; z += 2.2) towerPatch(s, t, a - da * 0.9, a + da * 0.9, z, z + 0.7, '#c9ccd0', 0.016);
}

/** Railed walkway round the top of a tower, with stair flights down the side. */
function walkway(s: Scene, cu: number, cv: number, r: number, z: number, color: string): void {
  const n = 20;
  const ring: P3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r, z]);
  }
  s.face(ring, '#9aa0a6', '#7b8188');
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    s.rod([cu + Math.cos(a) * r, cv + Math.sin(a) * r, z + 6], [cu + Math.cos(b) * r, cv + Math.sin(b) * r, z + 6], color, 0.7, 1);
    s.rod([cu + Math.cos(a) * r, cv + Math.sin(a) * r, z], [cu + Math.cos(a) * r, cv + Math.sin(a) * r, z + 6], color, 0.6, 1);
  }
}

/** A stair flight zig-zagging up the tower side between two heights at angle a. */
function stairs(s: Scene, t: Tower, a: number, z0: number, z1: number, color: string): void {
  const flights = 3;
  for (let k = 0; k < flights; k++) {
    const za = z0 + ((z1 - z0) * k) / flights;
    const zb = z0 + ((z1 - z0) * (k + 1)) / flights;
    const da = k % 2 === 0 ? 0.18 : -0.18;
    const p0 = onTower(t.cu, t.cv, t.r0, t.r1, t.z0, t.h, a - da, za, 0.1);
    const p1 = onTower(t.cu, t.cv, t.r0, t.r1, t.z0, t.h, a + da, zb, 0.1);
    s.rod(p0, p1, '#5e646b', 1.4, 2);
    s.rod([p0[0], p0[1], p0[2] + 5], [p1[0], p1[1], p1[2] + 5], color, 0.6, 2);
    s.face(
      [p1, onTower(t.cu, t.cv, t.r0, t.r1, t.z0, t.h, a + da + (da > 0 ? 0.12 : -0.12), zb, 0.1), onTower(t.cu, t.cv, t.r0, t.r1, t.z0, t.h, a + da + (da > 0 ? 0.12 : -0.12), zb, 0.02), onTower(t.cu, t.cv, t.r0, t.r1, t.z0, t.h, a + da, zb, 0.02)],
      '#9aa0a6',
      '#9aa0a6',
    );
  }
}

const STYLES: Record<FactionId, RadarStyle> = {
  // USA: the photo itself — a white panelled cone with a porch and vents, a deep parabolic dish on a tripod feed.
  usa: {
    pivot: 96,
    dish: 'parabolic',
    elevation: 0.62,
    rpm: 0.07,
    front: WHITE,
    back: '#c8ccd0',
    strut: '#e2e4e6',
    yoke: '#d4d7da',
    pedestal: (s, p, team) => {
      pad(p, '#6f8a45');
      const t: Tower = { cu: 1, cv: 1, r0: 0.9, r1: 0.36, z0: 2, h: 66 };
      frustum(s, t.cu, t.cv, t.r0, t.r1, t.z0, t.h, '#e2e5e8', 30, 'rgba(70,78,88,0.45)');
      s.flush();
      for (const z of [20, 38, 54]) {
        const tt = { ...t };
        towerPatch(s, tt, FRONT - 1.7, FRONT + 1.7, z, z + 0.6, '#b9bec4', 0.006);
      }
      vent(s, t, FRONT - 0.55, 6, 22);
      vent(s, t, FRONT + 0.75, 6, 22);
      towerPatch(s, t, FRONT + 1.25, FRONT + 1.38, 24, 27, team, 0.008);
      porch(s, t, '#26407a', '#d9dcdf');
      stairs(s, t, FRONT - 1.35, 22, 66, '#c8ccd0');
      frustum(s, 1, 1, 0.4, 0.38, 68, 10, '#d6d9dc', 24, null);
      walkway(s, 1, 1, 0.55, 68, '#e6e8ea');
      frustum(s, 1, 1, 0.3, 0.3, 78, 8, '#cfd3d7', 20, 'rgba(70,78,88,0.3)');
      s.flush();
    },
  },
  // Russia: an olive steel lattice mast with an equipment cabin, a flat rotating phased-array panel (Nebo-style).
  russia: {
    pivot: 88,
    dish: 'array',
    elevation: 0.16,
    rpm: 0.18,
    front: '#7d8a5a',
    back: '#5a6342',
    strut: '#4f5838',
    yoke: '#5c6644',
    pedestal: (s, p, team) => {
      pad(p, '#8a8577');
      const legs: [number, number][] = [
        [0.25, 0.25],
        [1.75, 0.25],
        [1.75, 1.75],
        [0.25, 1.75],
      ];
      const top = (u: number, v: number): [number, number] => [1 + (u - 1) * 0.42, 1 + (v - 1) * 0.42];
      const H = 62;
      for (let i = 0; i < 4; i++) {
        const [u0, v0] = legs[i]!;
        const [u1, v1] = legs[(i + 1) % 4]!;
        const [tu0, tv0] = top(u0, v0);
        const [tu1, tv1] = top(u1, v1);
        s.rod([u0, v0, 2], [tu0, tv0, H], '#5c6644', 2.2, 6);
        // X-bracing in four bays up each side, and the girts between them.
        for (let k = 0; k < 4; k++) {
          const f0 = k / 4;
          const f1 = (k + 1) / 4;
          const at = (u: number, v: number, tu: number, tv: number, f: number): P3 => [u + (tu - u) * f, v + (tv - v) * f, 2 + (H - 2) * f];
          s.rod(at(u0, v0, tu0, tv0, f0), at(u1, v1, tu1, tv1, f1), '#6b7650', 0.8, 3);
          s.rod(at(u1, v1, tu1, tv1, f0), at(u0, v0, tu0, tv0, f1), '#6b7650', 0.8, 3);
          s.rod(at(u0, v0, tu0, tv0, f1), at(u1, v1, tu1, tv1, f1), '#5c6644', 1, 3);
        }
        // Concrete footing under each leg.
        s.face([[u0 - 0.1, v0 - 0.1, 5], [u0 + 0.1, v0 - 0.1, 5], [u0 + 0.1, v0 + 0.1, 5], [u0 - 0.1, v0 + 0.1, 5]], '#a8a598', null);
      }
      s.flush();
      // Equipment cabin on the mast head, with a vision slit and a red star plate.
      p.box(0.58, 0.58, 0.84, 0.84, H, 15, '#6e7a4e');
      p.box(0.62, 1.4, 0.76, 0.02, H + 7, 3, '#2c3a4e');
      p.box(1.4, 0.62, 0.02, 0.76, H + 7, 3, '#2c3a4e');
      p.box(1.4, 0.9, 0.02, 0.2, H + 2, 4, team);
      p.box(0.55, 0.55, 0.9, 0.9, H + 15, 1.5, '#4f5838');
      p.cylinder(1, 1, 0.22, H + 16.5, 6, '#5c6644', 12);
    },
  },
  // China: a pale octagonal tower with a red band and a glazed operations ring; a Cassegrain dish with a sub-reflector.
  china: {
    pivot: 94,
    dish: 'cassegrain',
    elevation: 0.75,
    rpm: 0.09,
    front: '#e4e7ea',
    back: '#b9bec4',
    strut: '#d0d4d8',
    yoke: '#b8bdc3',
    pedestal: (s, p, team) => {
      pad(p, '#8d8a80');
      const t: Tower = { cu: 1, cv: 1, r0: 0.82, r1: 0.5, z0: 2, h: 58 };
      frustum(s, t.cu, t.cv, t.r0, t.r1, t.z0, t.h, '#d3d6d9', 8, 'rgba(60,66,74,0.55)', Math.PI / 8);
      s.flush();
      frustum(s, 1, 1, t.r0 - 0.044 + 0.012, t.r0 - 0.072 + 0.012, 10, 5, team, 8, null, Math.PI / 8, false);
      porch(s, t, '#7a1e1e', '#cfd2d5');
      for (const a of [FRONT - 0.79, FRONT + 0.79]) for (let z = 22; z < 52; z += 10) towerPatch(s, t, a - 0.12, a + 0.12, z, z + 5, '#2c3a4e', 0.012);
      // Glazed operations ring and its eave.
      frustum(s, 1, 1, 0.56, 0.56, 60, 10, '#3c5068', 16, 'rgba(200,215,230,0.6)');
      frustum(s, 1, 1, 0.66, 0.6, 70, 3, '#c9cdd1', 16, null);
      frustum(s, 1, 1, 0.34, 0.32, 73, 12, '#c2c6cb', 16, 'rgba(60,66,74,0.3)');
      s.flush();
    },
  },
  // Europe: a round concrete air-traffic tower with a blue band, carrying a wide orange-peel surveillance reflector.
  europe: {
    pivot: 90,
    dish: 'peel',
    elevation: 0.1,
    rpm: 0.2,
    front: '#dfe2e5',
    back: '#9da4ab',
    strut: '#7c848c',
    yoke: '#8a9198',
    pedestal: (s, p, team) => {
      pad(p, '#7e8a6a');
      const t: Tower = { cu: 1, cv: 1, r0: 0.6, r1: 0.52, z0: 2, h: 64 };
      frustum(s, t.cu, t.cv, t.r0, t.r1, t.z0, t.h, '#bdb9ae', 28, null);
      s.flush();
      for (let z = 8; z < 64; z += 9) towerPatch(s, t, FRONT - 1.6, FRONT + 1.6, z, z + 0.5, '#a8a499', 0.006);
      towerPatch(s, t, FRONT - 1.7, FRONT + 1.7, 50, 55, team, 0.008);
      for (let z = 14; z < 46; z += 9) towerPatch(s, t, FRONT - 0.09, FRONT + 0.09, z, z + 5, '#2c3a4e', 0.01);
      porch(s, t, '#2f3d52', '#c9c5ba');
      frustum(s, 1, 1, 0.74, 0.74, 66, 2, '#9ea3a8', 28, null);
      walkway(s, 1, 1, 0.74, 68, '#d8dbde');
      frustum(s, 1, 1, 0.46, 0.4, 68, 12, '#c7c3b8', 24, null);
      s.flush();
    },
  },
  // Islamic world: a sandstone octagon with pointed-arch niches, a green band and crenels; a fine-mesh dish with a gold rim.
  islamic: {
    pivot: 92,
    dish: 'mesh',
    elevation: 0.55,
    rpm: 0.11,
    front: '#e6e1d4',
    back: '#a39b88',
    strut: '#c9a64a',
    yoke: '#a8916a',
    pedestal: (s, p, team) => {
      pad(p, '#b9a57e');
      const t: Tower = { cu: 1, cv: 1, r0: 0.84, r1: 0.6, z0: 2, h: 60 };
      frustum(s, t.cu, t.cv, t.r0, t.r1, t.z0, t.h, '#cdb184', 8, 'rgba(90,64,30,0.55)', Math.PI / 8);
      s.flush();
      // Pointed arch niche on every visible panel, a green band, and a tile frieze under the crenels.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 4;
        for (const [z0, z1] of [
          [8, 26],
          [32, 48],
        ] as const) {
          towerPatch(s, t, a - 0.13, a + 0.13, z0, z1, '#6f5532', 0.012);
          s.face([onTower(1, 1, t.r0, t.r1, t.z0, t.h, a - 0.13, z1, 0.012), onTower(1, 1, t.r0, t.r1, t.z0, t.h, a + 0.13, z1, 0.012), onTower(1, 1, t.r0, t.r1, t.z0, t.h, a, z1 + 6, 0.012)], '#6f5532', null);
        }
      }
      frustum(s, 1, 1, t.r0 - 0.104 + 0.012, t.r0 - 0.116 + 0.012, 28, 3, team, 8, null, Math.PI / 8, false);
      frustum(s, 1, 1, 0.62, 0.62, 56, 6, '#2f7d78', 8, 'rgba(240,220,160,0.7)', Math.PI / 8);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const c: P3 = [1 + Math.cos(a) * 0.62, 1 + Math.sin(a) * 0.62, 62];
        frustum(s, c[0], c[1], 0.06, 0.06, 62, 4, '#cdb184', 4, null);
      }
      frustum(s, 1, 1, 0.34, 0.3, 62, 18, '#c2a679', 16, null);
      s.flush();
    },
  },
};

/** Builds the antenna in its own frame (a: along the boresight, b: right, c: up), placed by `put`. */
function antenna(s: Scene, st: RadarStyle, put: (a: number, b: number, c: number) => P3): void {
  const ring = (n: number, f: (i: number) => P3): P3[] => Array.from({ length: n }, (_, i) => f(i));
  const paraboloid = (R: number, f: number, rings: number, segs: number, front: string, back: string, seam: string | null, alpha = 1, shift = 0): void => {
    const pt = (r: number, th: number): P3 => put((r * r) / (4 * f) - shift, r * Math.cos(th), r * Math.sin(th));
    for (let i = 0; i < rings; i++) {
      const r0 = (R * i) / rings;
      const r1 = (R * (i + 1)) / rings;
      for (let j = 0; j < segs; j++) {
        const t0 = (j / segs) * Math.PI * 2;
        const t1 = ((j + 1) / segs) * Math.PI * 2;
        // Wound so the normal points out of the concave (front) side.
        s.face(i === 0 ? [pt(r1, t0), pt(r1, t1), pt(0, 0)] : [pt(r1, t0), pt(r1, t1), pt(r0, t1), pt(r0, t0)], front, back, seam, alpha);
      }
    }
  };
  const o = put(0, 0, 0);
  const fwd = put(1, 0, 0);
  /** The back of the antenna faces the camera: its backing truss shows (else the reflector hides it). */
  const backShows = (fwd[0] - o[0]) * VIEW[0] + (fwd[1] - o[1]) * VIEW[1] + ((fwd[2] - o[2]) / ZT) * VIEW[2] < 0.15;
  const rimAt = (R: number, f: number, th: number, shift = 0): P3 => put((R * R) / (4 * f) - shift, R * Math.cos(th), R * Math.sin(th));

  switch (st.dish) {
    case 'parabolic':
    case 'mesh': {
      const mesh = st.dish === 'mesh';
      const R = mesh ? 1.08 : 1.18;
      const f = mesh ? 0.5 : 0.46;
      const shift = 0.32;
      paraboloid(R, f, 6, 36, st.front, st.back, mesh ? 'rgba(120,100,60,0.55)' : 'rgba(90,100,110,0.32)', mesh ? 0.72 : 1, shift);
      // Rim stiffener, and the backing truss from the rim to the hub behind.
      for (let j = 0; j < 36; j++) s.rod(rimAt(R, f, (j / 36) * Math.PI * 2, shift), rimAt(R, f, ((j + 1) / 36) * Math.PI * 2, shift), mesh ? '#c9a64a' : '#d4d8dc', 1.3, 1);
      if (backShows) for (let j = 0; j < 8; j++) s.rod(rimAt(R * 0.97, f, (j / 8) * Math.PI * 2, shift + 0.02), put(-shift - 0.28, 0, 0), st.back, 1, 3);
      // Tripod to the feed at the focus, and the feed cone from the vertex.
      const focus = put(f - shift, 0, 0);
      for (const th of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3]) s.rod(rimAt(R * 0.96, f, th, shift), focus, st.strut, 2.2, 5);
      s.rod(put(f - shift - 0.12, 0, 0), put(f - shift + 0.05, 0, 0), '#d9dcdf', 7, 2);
      s.rod(put(-shift, 0, 0), put(0.32 - shift, 0, 0), '#e0e3e6', mesh ? 4 : 6.5, 3);
      break;
    }
    case 'cassegrain': {
      const R = 1.05;
      const f = 0.36;
      const shift = 0.4;
      paraboloid(R, f, 6, 36, st.front, st.back, 'rgba(90,100,110,0.3)', 1, shift);
      for (let j = 0; j < 36; j++) s.rod(rimAt(R, f, (j / 36) * Math.PI * 2, shift), rimAt(R, f, ((j + 1) / 36) * Math.PI * 2, shift), '#c8333a', 1.6, 1);
      const sub = f * 0.92 - shift;
      for (const th of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) s.rod(rimAt(R * 0.95, f, th + Math.PI / 4, shift), put(sub, 0.13 * Math.cos(th + Math.PI / 4), 0.13 * Math.sin(th + Math.PI / 4)), st.strut, 1.6, 4);
      // Sub-reflector: a small convex disc facing back into the dish.
      s.face(ring(14, (i) => put(sub, 0.2 * Math.cos((-i / 14) * Math.PI * 2), 0.2 * Math.sin((-i / 14) * Math.PI * 2))), '#f0f2f4', '#c2c7cc');
      s.rod(put(-shift, 0, 0), put(0.22 - shift, 0, 0), '#d6d9dc', 5, 2);
      if (backShows) for (let j = 0; j < 8; j++) s.rod(rimAt(R * 0.97, f, (j / 8) * Math.PI * 2, shift + 0.02), put(-shift - 0.25, 0, 0), st.back, 1, 3);
      break;
    }
    case 'array': {
      // Flat panel of 10 × 4 radiating bays, dipoles on the face, a truss behind.
      const W = 1.25;
      const Hh = 0.48;
      const nb = 10;
      const nc = 4;
      for (let i = 0; i < nb; i++) {
        for (let k = 0; k < nc; k++) {
          const b0 = -W + (2 * W * i) / nb;
          const b1 = -W + (2 * W * (i + 1)) / nb;
          const c0 = -Hh + (2 * Hh * k) / nc;
          const c1 = -Hh + (2 * Hh * (k + 1)) / nc;
          s.face([put(0, b1, c0), put(0, b1, c1), put(0, b0, c1), put(0, b0, c0)], (i + k) % 2 ? st.front : shade(st.front, 0.94), st.back, 'rgba(30,36,20,0.6)');
          s.rod(put(0.05, (b0 + b1) / 2 - 0.05, (c0 + c1) / 2), put(0.05, (b0 + b1) / 2 + 0.05, (c0 + c1) / 2), '#d8d4b8', 0.9, 1);
        }
      }
      // Frame round the panel, the truss behind it, and the IFF strip on top.
      const corners: P3[] = [put(0.01, -W, -Hh), put(0.01, W, -Hh), put(0.01, W, Hh), put(0.01, -W, Hh)];
      for (let i = 0; i < 4; i++) s.rod(corners[i]!, corners[(i + 1) % 4]!, '#4a5232', 1.6, 6);
      for (const b of [-W, -W / 2, 0, W / 2, W]) {
        s.rod(put(-0.02, b, Hh), put(-0.32, 0, 0), st.strut, 0.9, 3);
        s.rod(put(-0.02, b, -Hh), put(-0.32, 0, 0), st.strut, 0.9, 3);
      }
      s.face([put(0.02, W * 0.8, Hh + 0.04), put(0.02, W * 0.8, Hh + 0.14), put(0.02, -W * 0.8, Hh + 0.14), put(0.02, -W * 0.8, Hh + 0.04)], '#8f9a6a', '#5a6342', 'rgba(30,36,20,0.6)');
      break;
    }
    case 'peel': {
      // Wide doubly curved reflector (airport surveillance radar), feed horn on a boom below.
      const W = 1.3;
      const Hh = 0.42;
      const f = 1.0;
      const nb = 14;
      const nc = 5;
      const pt = (b: number, c: number): P3 => put((b * b + c * c * 2.2) / (4 * f) - 0.15, b, c + 0.1);
      for (let i = 0; i < nb; i++) {
        for (let k = 0; k < nc; k++) {
          const b0 = -W + (2 * W * i) / nb;
          const b1 = -W + (2 * W * (i + 1)) / nb;
          const c0 = -Hh + (2 * Hh * k) / nc;
          const c1 = -Hh + (2 * Hh * (k + 1)) / nc;
          s.face([pt(b1, c0), pt(b1, c1), pt(b0, c1), pt(b0, c0)], st.front, st.back, 'rgba(60,70,80,0.4)');
        }
      }
      for (let i = 0; i < nb; i++) {
        const b0 = -W + (2 * W * i) / nb;
        const b1 = -W + (2 * W * (i + 1)) / nb;
        s.rod(pt(b0, Hh), pt(b1, Hh), '#7c848c', 1.2, 1);
        s.rod(pt(b0, -Hh), pt(b1, -Hh), '#7c848c', 1.2, 1);
      }
      for (const b of [-W, -W / 2, 0, W / 2, W]) s.rod(pt(b, 0), put(-0.32, 0, 0), st.strut, 1.1, 3);
      s.rod(put(-0.15, 0, -0.3), put(0.75, 0, -0.42), st.strut, 1.8, 4);
      s.rod(put(0.62, 0, -0.42), put(0.82, 0, -0.42), '#5d646c', 6, 2);
      // IFF bar riding on top.
      const iff = (b: number, c: number): P3 => put(0.05, b, c);
      s.face([iff(1.0, 0.62), iff(1.0, 0.76), iff(-1.0, 0.76), iff(-1.0, 0.62)], '#cfd3d6', '#8b9299', 'rgba(60,70,80,0.5)');
      s.rod(iff(-0.4, 0.52), iff(-0.4, 0.62), st.strut, 1, 1);
      s.rod(iff(0.4, 0.52), iff(0.4, 0.62), st.strut, 1, 1);
      break;
    }
  }
}

/**
 * Radar Tower (2 × 2 plot), after the big earth-station dish: a pedestal in each nation's own style with the
 * antenna turning a full 360° on top. The pedestal is the cached sprite; the antenna, its yoke and struts are
 * built in 3-D every frame (see Scene) so it reads solid from every bearing.
 * USA parabolic dish on a white cone · Russia phased-array panel on a lattice mast · China Cassegrain dish on an
 * octagon · Europe orange-peel surveillance reflector on a round tower · Islamic world mesh dish on an arched octagon.
 */
export function createRadarTowerArt(faction: FactionId): BuildingArt {
  const st = STYLES[faction];
  const team = FACTIONS[faction].colors.primary;
  const phase = { usa: 0.4, russia: 2.1, china: 3.3, europe: 4.6, islamic: 5.5 }[faction];
  return {
    footprint: { w: 2, d: 2 },
    height: st.pivot + 62,
    fitHeight: true,

    drawStatic(p) {
      const s = new Scene(p);
      st.pedestal(s, p, team);
    },

    drawAnimated(p, time) {
      const s = new Scene(p);
      const az = phase + time * st.rpm * Math.PI * 2;
      const ca = Math.cos(az);
      const sa = Math.sin(az);
      const ce = Math.cos(st.elevation);
      const se = Math.sin(st.elevation);
      const put = (a: number, b: number, c: number): P3 => {
        const a1 = a * ce - c * se;
        const c1 = a * se + c * ce;
        return [1 + a1 * ca - b * sa, 1 + a1 * sa + b * ca, st.pivot + c1 * ZT];
      };
      // Turntable yoke: two arms up from the bearing to the elevation axle, and a counterweight behind.
      const base = (b: number, back: number): P3 => [1 + back * ca - b * sa, 1 + back * sa + b * ca, st.pivot - 12];
      s.rod(base(-0.26, 0), put(-0.18, -0.3, 0), st.yoke, 3.4, 3);
      s.rod(base(0.26, 0), put(-0.18, 0.3, 0), st.yoke, 3.4, 3);
      s.rod(put(-0.18, -0.34, 0), put(-0.18, 0.34, 0), shade(st.yoke, 0.85), 2.6, 3);
      s.rod(base(0, -0.1), base(0, -0.42), shade(st.yoke, 0.8), 6, 2);
      antenna(s, st, put);
      s.flush();
    },
  };
}
