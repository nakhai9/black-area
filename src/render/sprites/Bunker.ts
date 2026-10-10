import { HALF_TW } from '../../constants';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter, Vec3 } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { crate, RA2, sandbags } from './Ra2Kit';

/** Centre of the 2×2 plot. */
const C = 1;

/** Corner k (0..7) of a regular octagon of radius r round the plot centre, flats facing the grid axes. */
const oct = (k: number, r: number, z: number): Vec3 => {
  const a = ((k + 0.5) * Math.PI) / 4;
  return [C + Math.cos(a) * r, C + Math.sin(a) * r, z];
};

/** Unit outward normal of octagon side k (between corners k and k+1). */
const sideNormal = (k: number): [number, number] => {
  const a = ((k + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
};

/** Face brightness for a side with normal (nu, nv): +u (right) 0.86, +v (left) 0.70, like IsoPainter.box. */
const lightOf = (nu: number, nv: number): number => 0.78 + 0.08 * (nu - nv);

/** The sides of an octagon that face the camera (outward normal towards +u+v). */
const frontSides = (): number[] => [0, 1, 2, 3, 4, 5, 6, 7].filter((k) => {
  const [nu, nv] = sideNormal(k);
  return nu + nv > 0.01;
});

/** Point on side k of an octagonal frustum: s 0..1 along the side, t 0..1 from bottom ring to top ring. */
const sidePoint = (k: number, s: number, t: number, r0: number, r1: number, z0: number, z1: number): Vec3 => {
  const a0 = oct(k, r0 + (r1 - r0) * t, z0 + (z1 - z0) * t);
  const a1 = oct(k + 1, r0 + (r1 - r0) * t, z0 + (z1 - z0) * t);
  return [a0[0] + (a1[0] - a0[0]) * s, a0[1] + (a1[1] - a0[1]) * s, a0[2]];
};

/** Octagonal frustum (radius r0 at z0 → r1 at z1): visible sides flat-shaded, then the top. */
function octFrustum(p: IsoPainter, r0: number, r1: number, z0: number, z1: number, color: string, top?: string): void {
  for (const k of frontSides()) {
    const [nu, nv] = sideNormal(k);
    p.polygon([oct(k, r0, z0), oct(k + 1, r0, z0), oct(k + 1, r1, z1), oct(k, r1, z1)], shade(color, lightOf(nu, nv)));
  }
  p.polygon(
    [0, 1, 2, 3, 4, 5, 6, 7].map((k) => oct(k, r1, z1)),
    top ?? color,
  );
}

/** Sandbags along an arc round the centre, from angle a0 to a1 (radians, 0 = +u). */
function sandbagArc(p: IsoPainter, r: number, a0: number, a1: number, z = 0, rows = 2): void {
  const n = 5;
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < n; i++) {
      const b0 = a0 + ((a1 - a0) * i) / n;
      const b1 = a0 + ((a1 - a0) * (i + 1)) / n;
      sandbags(p, C + Math.cos(b0) * r, C + Math.sin(b0) * r, C + Math.cos(b1) * r, C + Math.sin(b1) * r, z + row * 2.4);
    }
  }
}

// ---------------------------------------------------------------- West: octagonal concrete pillbox

const W = { r0: 0.66, r1: 0.6, wallTop: 11, chamfer: 14, rTop: 0.46 } as const;
/** Sides carrying a firing slit (the visible ones) — used by the muzzle-flash layer as well. */
const WEST_SLITS = frontSides();

function drawWest(p: IsoPainter): void {
  // Trampled dirt pad.
  p.polygon([0, 1, 2, 3, 4, 5, 6, 7].map((k) => oct(k, 0.98, 0)), '#7f7559', null);
  // Crates stacked at the back sides.
  crate(p, 0.08, 0.95, 0.3);
  crate(p, 0.12, 1.28, 0.26);
  crate(p, 0.1, 1.0, 0.24, 4.8);
  crate(p, 0.95, 0.08, 0.3);
  crate(p, 1.28, 0.12, 0.26);

  // Reinforced-concrete walls, chamfered top edge.
  octFrustum(p, W.r0, W.r1, 0, W.wallTop, RA2.concrete);
  octFrustum(p, W.r1, W.rTop, W.wallTop, W.chamfer, shade(RA2.concrete, 1.06), shade(RA2.concrete, 1.12));
  for (const k of frontSides()) {
    // Formwork seam lines and a dark weathering band at the foot.
    const band = [sidePoint(k, 0, 0, W.r0, W.r1, 0, W.wallTop), sidePoint(k, 1, 0, W.r0, W.r1, 0, W.wallTop), sidePoint(k, 1, 0.18, W.r0, W.r1, 0, W.wallTop), sidePoint(k, 0, 0.18, W.r0, W.r1, 0, W.wallTop)];
    p.polygon(band, 'rgba(60,52,40,0.35)', null);
    const seam = [sidePoint(k, 0, 0.82, W.r0, W.r1, 0, W.wallTop), sidePoint(k, 1, 0.82, W.r0, W.r1, 0, W.wallTop), sidePoint(k, 1, 0.86, W.r0, W.r1, 0, W.wallTop), sidePoint(k, 0, 0.86, W.r0, W.r1, 0, W.wallTop)];
    p.polygon(seam, shade(RA2.concreteDark, 0.95), null);
    // Horizontal firing slit with a lit lower lip.
    const slit = [sidePoint(k, 0.18, 0.5, W.r0, W.r1, 0, W.wallTop), sidePoint(k, 0.82, 0.5, W.r0, W.r1, 0, W.wallTop), sidePoint(k, 0.82, 0.66, W.r0, W.r1, 0, W.wallTop), sidePoint(k, 0.18, 0.66, W.r0, W.r1, 0, W.wallTop)];
    p.polygon(slit, '#17191b', null);
    const lip = [sidePoint(k, 0.14, 0.44, W.r0, W.r1, 0, W.wallTop), sidePoint(k, 0.86, 0.44, W.r0, W.r1, 0, W.wallTop), sidePoint(k, 0.86, 0.5, W.r0, W.r1, 0, W.wallTop), sidePoint(k, 0.14, 0.5, W.r0, W.r1, 0, W.wallTop)];
    p.polygon(lip, shade(RA2.concrete, 1.2), null);
  }

  // Camouflage net over the back half of the roof (u + v < 2), patched green and brown, hanging a little over the edge.
  const net: Vec3[] = [oct(3, W.rTop + 0.12, W.chamfer - 1), oct(4, W.rTop + 0.12, W.chamfer - 1.5), oct(5, W.rTop + 0.12, W.chamfer - 1.5), oct(6, W.rTop + 0.12, W.chamfer - 1.5), oct(7, W.rTop + 0.12, W.chamfer - 1), [C + 0.2, C + 0.2, W.chamfer + 0.6]];
  p.polygon(net, '#5a6338', 'rgba(30,32,18,0.6)');
  const patches: [number, number, number, string][] = [
    [0.62, 0.78, 0.13, '#6f5a3a'],
    [0.85, 0.6, 0.12, '#47522c'],
    [0.6, 1.05, 0.1, '#7a6a42'],
    [1.02, 0.66, 0.1, '#6f5a3a'],
    [0.8, 0.86, 0.09, '#3e4826'],
  ];
  for (const [u, v, r, c] of patches) {
    const [x, y] = p.project(u, v, W.chamfer + 0.3);
    p.ctx.fillStyle = c;
    p.ctx.beginPath();
    p.ctx.ellipse(x, y, r * 22, r * 11, 0.3, 0, Math.PI * 2);
    p.ctx.fill();
  }
  // Net mesh lines.
  p.ctx.save();
  p.ctx.strokeStyle = 'rgba(25,28,15,0.45)';
  p.ctx.lineWidth = 0.4;
  for (let i = 0; i < 5; i++) {
    const [x0, y0] = p.project(0.55 + i * 0.12, 0.55, W.chamfer + 0.3);
    const [x1, y1] = p.project(0.55, 0.55 + i * 0.12, W.chamfer + 0.3);
    p.ctx.beginPath();
    p.ctx.moveTo(x0, y0);
    p.ctx.lineTo(x1, y1);
    p.ctx.stroke();
  }
  p.ctx.restore();

  // Round black steel cupola with a hatch and a thin radio antenna.
  p.cylinder(C + 0.12, C + 0.12, 0.2, W.chamfer, 4, '#33363a');
  p.cylinder(C + 0.12, C + 0.12, 0.13, W.chamfer + 4, 1, '#26282b');
  const [hx, hy] = p.project(C + 0.12, C + 0.12, W.chamfer + 5);
  p.ctx.fillStyle = '#5a5e64';
  p.ctx.fillRect(hx - 1.5, hy - 0.4, 3, 0.8);
  const [ax, ay] = p.project(C - 0.02, C + 0.24, W.chamfer + 3);
  p.ctx.strokeStyle = '#2a2c2e';
  p.ctx.lineWidth = 0.6;
  p.ctx.beginPath();
  p.ctx.moveTo(ax, ay);
  p.ctx.lineTo(ax - 1.5, ay - 15);
  p.ctx.stroke();
  p.ctx.fillStyle = '#b33a2a';
  p.ctx.fillRect(ax - 2, ay - 16, 1.2, 1.2);

  // Sandbag ring round the front.
  sandbagArc(p, 0.86, -0.25, Math.PI / 2 + 0.25);
}

// ---------------------------------------------------------------- East: concrete dome on an earth mound

const E = { moundR0: 0.95, moundR1: 0.78, mound: 5, domeR: 0.56, domeH: 12 } as const;

function drawEast(p: IsoPainter, faction: FactionId): void {
  // Log revetment at the back (u = 0 and v = 0 edges), stacked logs with dark gaps.
  const LOG = '#7a5634';
  for (let i = 0; i < 4; i++) {
    const z = i * 2.6;
    p.box(0.18, 0.08, 1.6, 0.14, z, 2.4, shade(LOG, i % 2 ? 0.9 : 1));
    p.box(0.08, 0.18, 0.14, 1.6, z, 2.4, shade(LOG, i % 2 ? 1 : 0.9));
  }
  p.box(0.12, 0.05, 0.1, 0.1, 0, 12, '#5d4126');
  p.box(1.72, 0.05, 0.1, 0.1, 0, 12, '#5d4126');
  p.box(0.05, 1.72, 0.1, 0.1, 0, 12, '#5d4126');

  // Raised octagonal earth mound with a grass top.
  octFrustum(p, E.moundR0, E.moundR1, 0, E.mound, '#7a6446', RA2.grass);
  for (const [u, v, r] of [[0.55, 1.35, 0.08], [1.4, 0.5, 0.07], [1.5, 1.2, 0.06], [0.6, 0.55, 0.07]] as const) {
    const [x, y] = p.project(u, v, E.mound);
    p.ctx.fillStyle = shade(RA2.grass, 0.78);
    p.ctx.beginPath();
    p.ctx.ellipse(x, y, r * 22, r * 11, 0, 0, Math.PI * 2);
    p.ctx.fill();
  }

  // Low faceted concrete dome, pale grey-green.
  const DOME = '#a3aa98';
  p.dome(C, C, E.domeR, E.mound, E.domeH, DOME);
  const [cx, cy] = p.project(C, C, E.mound);
  const rx = E.domeR * Math.SQRT2 * HALF_TW;
  const ctx = p.ctx;
  ctx.save();
  ctx.strokeStyle = 'rgba(40,46,36,0.35)';
  ctx.lineWidth = 0.5;
  // Facet meridians and one ring course.
  for (const f of [-0.66, -0.33, 0, 0.33, 0.66]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(f) * rx, E.domeH, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy - E.domeH * 0.55, rx * 0.84, rx * 0.3, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();

  // Square firing ports round the dome's front.
  for (const port of eastPorts(p)) {
    ctx.fillStyle = shade(DOME, 1.18);
    ctx.fillRect(port[0] - 2, port[1] - 1.6, 4, 3.2);
    ctx.fillStyle = '#17191b';
    ctx.fillRect(port[0] - 1.5, port[1] - 1.1, 3, 2.2);
  }

  // Small black hatch on top.
  p.cylinder(C - 0.05, C - 0.05, 0.12, E.mound + E.domeH - 1.2, 1.4, '#2b2d30');

  // Emblem on the dome: red star (Russia, China) or green crescent (Islamic).
  const ex = cx + rx * 0.05;
  const ey = cy - E.domeH * 0.55;
  if (faction === 'islamic') {
    ctx.fillStyle = '#2f7a3a';
    ctx.beginPath();
    ctx.arc(ex, ey, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(DOME, 1.02);
    ctx.beginPath();
    ctx.arc(ex + 1.3, ey - 0.5, 2.7, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#a8322a';
    ctx.strokeStyle = '#5e1a14';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 1.4 : 3.4;
      ctx.lineTo(ex + Math.cos(a) * r, ey + Math.sin(a) * r * 0.85);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Short sandbag line in front.
  sandbags(p, 1.98, 1.25, 1.25, 1.98, 0);
  sandbags(p, 1.98, 1.25, 1.25, 1.98, 2.4);
}

/**
 * Firing ports of the east dome, as screen offsets from the dome base centre (x, y): left, front, right.
 * Computed from the dome radius so the static and animated layers agree.
 */
const EAST_PORT_OFFSETS: readonly [number, number][] = [
  [-0.62, -5.5],
  [0, -4.6],
  [0.62, -5.5],
];

/** Screen positions of the east ports for a painter. */
function eastPorts(p: IsoPainter): [number, number][] {
  const [cx, cy] = p.project(C, C, E.mound);
  const rx = E.domeR * Math.SQRT2 * HALF_TW;
  return EAST_PORT_OFFSETS.map(([fx, dy]) => [cx + fx * rx, cy + dy]);
}

/** Screen positions of the west slits (centre of each visible slit). */
function westSlits(p: IsoPainter): [number, number][] {
  return WEST_SLITS.map((k) => {
    const [u, v, z] = sidePoint(k, 0.5, 0.58, W.r0, W.r1, 0, W.wallTop);
    return p.project(u, v, z);
  });
}

/** Brief yellow muzzle flash. */
function flash(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, s);
  g.addColorStop(0, 'rgba(255,250,210,1)');
  g.addColorStop(0.4, 'rgba(255,214,90,0.9)');
  g.addColorStop(1, 'rgba(255,150,30,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Bunker (2×2): a self-firing machine-gun pillbox. West (USA, Europe): an octagonal grey concrete pillbox with
 * firing slits, a steel cupola, a camouflage net and sandbags. East (Russia, China, Islamic): a low faceted concrete
 * dome on an earth mound behind a log revetment, with the nation's emblem. Muzzle flashes blink at the slits while firing.
 */
export function createBunkerArt(faction: FactionId): BuildingArt {
  const west = faction === 'usa' || faction === 'europe';
  return {
    footprint: { w: 2, d: 2 },
    height: west ? 34 : 22,

    drawStatic(p) {
      if (west) drawWest(p);
      else drawEast(p, faction);
    },

    drawAnimated(p, time, active) {
      if (!active) return;
      const pts = west ? westSlits(p) : eastPorts(p);
      const i = Math.floor(time * 18) % pts.length;
      const pt = pts[i];
      if (pt && Math.floor(time * 36) % 2 === 0) flash(p.ctx, pt[0], pt[1], 3.2);
    },
  };
}
