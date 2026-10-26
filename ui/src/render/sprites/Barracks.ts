import { ISLAMIC_GREEN, ISLAMIC_GREEN_DOME } from './IslamicPalette';
import { FACTIONS } from '../../factions';
import type { FactionColors, FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import { type IsoPainter, LIGHT, type Vec3 } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { pictureArt } from './PictureArt';
import { iwan } from './GrandMosque';
import { RA2, facade, parapet } from './Ra2Kit';

const GLASS = RA2.glass;

/** Where the national flag pole stands, per design (art units, z = foot of the pole, h = pole height). */
interface FlagSpot {
  u: number;
  v: number;
  z: number;
  h: number;
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

/*
 * Every Ministry of Defence fills its 5 × 3 plot (FOOTPRINT_BARRACKS) and is mirror-symmetric about its middle
 * (u = 2.5): the long front façade is the 'left' face (v = 3), the 'right' face is the short end.
 */
const W = 5;
const D = 3;
const MU = W / 2;
/** Screen px per tile along a face (faceTransform space). */
const PX = 32;

/**
 * USA — the Pentagon as it really stands, on its own 4 × 4 plot: five storeys of limestone with rows of windows, five
 * concentric rings (A–E) under dark slate roofs with the four light wells between them and the ten corridors running
 * in, the open five-acre central courtyard (lawn, crossing paths, trees and the little pavilion in the middle), the
 * Mall entrance portico on the front façade; around it the ring road, lawns, parking lots and the heliport.
 */
function pentagon(p: IsoPainter, team: FactionColors): void {
  const LIME = '#cfc7b0';
  const SLATE = '#555a60';
  const WELL = '#2e3236';
  const GRASS = '#6d8a46';
  const ASPHALT = '#55585b';
  const PW = 4;
  const PD = 4;
  const CU = PW / 2;
  const CV = PD / 2;
  const TURN = 0; // a corner to the back: one façade faces straight to the front
  const Z = 1.2;
  const H = 13; // five storeys
  const TOP = Z + H;
  const R = 1.72;
  const RC = 0.66; // courtyard (≈ 0.39 of the outer size, as built)
  const at = (r: number, cu = CU, cv = CV): [number, number][] => ring(cu, cv, r, 5, TURN);
  const { ctx } = p;
  const path = (pts: readonly [number, number][], z: number): void => {
    pts.forEach(([u, v], i) => {
      const [x, y] = p.project(u, v, z);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
  };
  /** Flat ring between radii r0 < r1 at height z (even-odd fill). */
  const annulus = (r0: number, r1: number, z: number, color: string): void => {
    ctx.beginPath();
    path(at(r1), z);
    path(at(r0), z);
    ctx.fillStyle = color;
    ctx.fill('evenodd');
  };

  // Ground: lawn, the ring road round the building, parking lots at the back corners, the heliport at the right.
  p.box(0, 0, PW, PD, 0, 1, shade(GRASS, 0.75));
  p.topRect(0.02, 0.02, PW - 0.02, PD - 0.02, 1.01, GRASS);
  annulus(R + 0.04, R + 0.2, 1.02, ASPHALT);
  for (const [u0, v0] of [[0.1, 0.1], [PW - 1.05, 0.1]] as const) {
    p.topRect(u0, v0, u0 + 0.95, v0 + 0.55, 1.03, ASPHALT);
    for (let i = 1; i < 8; i++) p.topRect(u0 + i * 0.118 - 0.006, v0 + 0.05, u0 + i * 0.118 + 0.006, v0 + 0.5, 1.04, '#e6e6e0');
  }
  p.topRect(PW - 0.62, PD - 1.4, PW - 0.12, PD - 0.9, 1.03, ASPHALT);
  ctx.beginPath();
  path(ring(PW - 0.37, PD - 1.15, 0.2, 16), 1.04);
  ctx.strokeStyle = '#f0f0e8';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  for (const [u, v] of [[0.35, PD - 0.35], [0.7, PD - 0.25], [PW - 0.35, 0.95], [0.25, 1.2]] as const) {
    p.cylinder(u, v, 0.03, 1, 3, '#4a3a28');
    p.dome(u, v, 0.14, 4, 6, '#3f6a34');
  }

  // Courtyard first (it is seen over the front ring): lawn, crossing paths, trees, the central pavilion.
  const court = at(RC);
  p.polygon(court.map(([u, v]) => [u, v, Z] as Vec3), GRASS, null);
  ctx.strokeStyle = '#d8d2c0';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const c = court[i];
    if (!c) continue;
    const [x0, y0] = p.project(CU, CV, Z);
    const [x1, y1] = p.project(c[0], c[1], Z);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
  for (const [u, v] of at(RC * 0.6)) p.dome(u, v, 0.07, Z, 3, '#3f6a34');
  p.box(CU - 0.07, CV - 0.07, 0.14, 0.14, Z, 2, '#f1ece0');
  p.pyramid(CU - 0.08, CV - 0.08, 0.16, 0.16, Z + 2, 1.5, '#7a4a32');
  // Inner courtyard walls facing the camera (its back sides), windows on them.
  for (let i = 0; i < 5; i++) {
    const a = court[i];
    const b = court[(i + 1) % 5];
    if (!a || !b) continue;
    const nu = -(b[1] - a[1]);
    const nv = b[0] - a[0];
    if (nu + nv <= 0) continue; // inward-facing walls only, seen from the courtyard
    p.polygon([[a[0], a[1], Z], [b[0], b[1], Z], [b[0], b[1], TOP], [a[0], a[1], TOP]] as Vec3[], shade(LIME, 0.82), null);
    for (let f = 0; f < 5; f++) {
      const z0 = Z + 1 + f * 2.4;
      for (let t = 0.06; t < 0.94; t += 0.1) {
        const u = a[0] + (b[0] - a[0]) * t;
        const v = a[1] + (b[1] - a[1]) * t;
        p.polygon([[u, v, z0], [u, v, z0 + 1.1], [u + (b[0] - a[0]) * 0.04, v + (b[1] - a[1]) * 0.04, z0 + 1.1], [u + (b[0] - a[0]) * 0.04, v + (b[1] - a[1]) * 0.04, z0]] as Vec3[], GLASS, null);
      }
    }
  }

  // Outer façades (walls only), five storeys of windows, a darker plinth course.
  const outer = at(R);
  for (let i = 0; i < 5; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % 5];
    if (!a || !b) continue;
    const nu = b[1] - a[1];
    const nv = -(b[0] - a[0]);
    if (nu + nv <= 0) continue;
    const len = Math.hypot(nu, nv) || 1;
    const light = (LIGHT.right * Math.max(0, nu) + LIGHT.left * Math.max(0, nv)) / (Math.max(0, nu) + Math.max(0, nv) || 1);
    p.polygon([[a[0], a[1], Z], [b[0], b[1], Z], [b[0], b[1], TOP], [a[0], a[1], TOP]] as Vec3[], shade(LIME, light * (0.75 + 0.25 * (Math.abs(nu) / len)) + 0.15));
    p.polygon([[a[0], a[1], Z], [b[0], b[1], Z], [b[0], b[1], Z + 1], [a[0], a[1], Z + 1]] as Vec3[], shade(LIME, 0.7), null);
    const du = (b[0] - a[0]) * 0.016;
    const dv = (b[1] - a[1]) * 0.016;
    for (let f = 0; f < 5; f++) {
      const z0 = Z + 1.6 + f * 2.35;
      for (let t = 0.03; t < 0.97; t += 0.034) {
        const u = a[0] + (b[0] - a[0]) * t;
        const v = a[1] + (b[1] - a[1]) * t;
        p.polygon([[u, v, z0], [u, v, z0 + 1.2], [u + du, v + dv, z0 + 1.2], [u + du, v + dv, z0]] as Vec3[], GLASS, null);
      }
    }
    // Cornice line along the top.
    p.polygon([[a[0], a[1], TOP - 0.5], [b[0], b[1], TOP - 0.5], [b[0], b[1], TOP], [a[0], a[1], TOP]] as Vec3[], shade(LIME, 1.08), null);
  }

  // Roofs: rings E (outer) to A (inner) in slate, the four light wells between them dark, the ten corridors.
  annulus(RC, R, TOP, SLATE);
  for (const r of [0.86, 1.07, 1.28, 1.49]) annulus(r - 0.035, r + 0.035, TOP, WELL);
  ctx.strokeStyle = shade(SLATE, 1.25);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const o = outer[i];
    const o2 = outer[(i + 1) % 5];
    const n = court[i];
    const n2 = court[(i + 1) % 5];
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
  // Rooftop plant boxes on the outer ring's corners.
  for (const [u, v] of at(1.6)) p.box(u - 0.06, v - 0.06, 0.12, 0.12, TOP, 1.6, '#a9adb2');

  // Mall entrance: columned portico with pediment in the middle of the front façade, steps, team-colour banner.
  const f0 = outer[2];
  const f1 = outer[3];
  if (f0 && f1) {
    const mu = (f0[0] + f1[0]) / 2;
    const mv = (f0[1] + f1[1]) / 2;
    p.box(mu - 0.34, mv - 0.02, 0.68, 0.18, Z, 0.8, '#e2dccb');
    p.box(mu - 0.3, mv - 0.06, 0.6, 0.22, Z + 0.8, 8.5, '#ece6d6', { top: SLATE });
    p.colonnade('left', mu - 0.28, mv - 0.06, 0.56, 0.22, Z + 0.8, 7.5, 8, '#fbf8f0', '#6d675a');
    p.colonnade('right', mu - 0.28, mv - 0.06, 0.56, 0.22, Z + 0.8, 7.5, 3, '#fbf8f0', '#6d675a');
    p.gableRoofV(mu - 0.3, mv - 0.06, 0.6, 0.22, Z + 9.3, 2.6, '#ece6d6', SLATE);
    p.box(mu - 0.32, mv + 0.15, 0.64, 0.02, Z + 8.4, 0.9, team.primary);
  }
}

/** Vertical stone pilasters with tall dark window slits between them on both visible faces (Stalinist grid). */
function ribbed(p: IsoPainter, u: number, v: number, w: number, d: number, z: number, h: number, perTile: number, slit: string, t0 = 0.1, t1 = 0.9): void {
  for (const face of ['left', 'right'] as const) {
    const n = Math.max(2, Math.round((face === 'left' ? w : d) * perTile));
    for (let i = 0; i < n; i++) p.faceRect(face, u, v, w, d, z, h, (i + 0.3) / n, (i + 0.7) / n, t0, t1, slit);
  }
}

/** Arched dark gateway on a face (face space): width w, height h, centred at x. */
function archGate(ctx: CanvasRenderingContext2D, x: number, w: number, h: number): void {
  ctx.fillStyle = '#e9e0c8';
  ctx.beginPath();
  ctx.rect(x - w / 2 - 1.2, 0, w + 2.4, h - w / 2);
  ctx.arc(x, h - w / 2, w / 2 + 1.2, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#1e2226';
  ctx.beginPath();
  ctx.rect(x - w / 2, 0, w, h - w / 2);
  ctx.arc(x, h - w / 2, w / 2, 0, Math.PI);
  ctx.fill();
}

/** Gold state crest (stylised double-headed eagle on a red shield) on a face (face space, y up), centred at (x, y). */
function crest(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#d9b23e';
  ctx.beginPath();
  ctx.moveTo(x - r * 1.6, y + r * 0.2);
  ctx.lineTo(x - r * 0.4, y + r * 0.9);
  ctx.lineTo(x, y + r * 0.5);
  ctx.lineTo(x + r * 0.4, y + r * 0.9);
  ctx.lineTo(x + r * 1.6, y + r * 0.2);
  ctx.lineTo(x + r * 0.6, y - r * 0.6);
  ctx.lineTo(x, y - r);
  ctx.lineTo(x - r * 0.6, y - r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b8231c';
  ctx.fillRect(x - r * 0.3, y - r * 0.4, r * 0.6, r * 0.7);
}

/**
 * Russia — the Ministry of Defence on the Frunzenskaya embankment: a monumental beige central block with tall
 * pilasters, the gold crest on its attic and a dark crowning pavilion; long low wings either side with arched
 * gateways next to the centre; two tall stepped towers behind the wings and teal domes between them and the centre.
 */
function stalinist(p: IsoPainter, team: FactionColors): void {
  const STONE = '#dcd2bb';
  const TRIM = '#ece5d2';
  const SLIT = '#5b5a52';
  const ROOF = '#8f8676';
  const DOME = '#5d8a94';
  p.box(0, 0, W, D, 0, 2, '#8f846c');
  for (const u of [0.7, W - 0.7 - 0.75]) {
    p.box(u, 0.1, 0.75, 0.75, 2, 34, STONE, { top: ROOF });
    facade(p, 'left', u, 0.1, 0.75, 0.75, 2, 34, { cols: 5, floors: 9, glass: SLIT, frame: null, fill: 0.5, band: 0.35, seed: 51 });
    facade(p, 'right', u, 0.1, 0.75, 0.75, 2, 34, { cols: 5, floors: 9, glass: SLIT, frame: null, fill: 0.5, band: 0.35, seed: 52 });
    p.box(u - 0.03, 0.07, 0.81, 0.81, 36, 1.4, TRIM);
    p.box(u + 0.1, 0.2, 0.55, 0.55, 37.4, 7, STONE, { top: ROOF });
    ribbed(p, u + 0.1, 0.2, 0.55, 0.55, 37.4, 7, 6, SLIT, 0.15, 0.85);
    p.box(u + 0.07, 0.17, 0.61, 0.61, 44.4, 1.2, TRIM);
    p.box(u + 0.22, 0.32, 0.31, 0.31, 45.6, 4, STONE, { top: ROOF });
  }
  for (const u of [1.85, W - 1.85]) {
    p.cylinder(u, 0.95, 0.3, 20, 4, STONE, 10);
    p.dome(u, 0.95, 0.32, 24, 9, DOME);
  }
  const wing = (u: number, w: number): void => {
    p.box(u, 1.0, w, 1.95, 2, 18, STONE, { top: ROOF });
    p.faceRect('left', u, 1.0, w, 1.95, 2, 18, 0, 1, 0, 0.12, shade(STONE, 0.82));
    p.faceRect('right', u, 1.0, w, 1.95, 2, 18, 0, 1, 0, 0.12, shade(STONE, 0.82));
    ribbed(p, u, 1.0, w, 1.95, 2, 18, 9, SLIT, 0.16, 0.86);
    p.box(u - 0.02, 0.98, w + 0.04, 1.99, 20, 1.4, TRIM);
    parapet(p, u - 0.02, 0.98, w + 0.04, 1.99, 21.4, '#c8bea6', 0.05, 1.6);
  };
  const C0 = 1.75;
  const CW = W - 2 * C0;
  wing(0.08, C0 - 0.08);
  p.faceTransform('left', 0.08, 2.95, 2, (ctx) => archGate(ctx, (C0 - 0.08 - 0.32) * PX, 7, 15));
  // Central block (drawn before the right wing, which stands nearer the camera).
  p.box(C0, 0.6, CW, 2.35, 2, 28, STONE, { top: ROOF });
  p.faceRect('left', C0, 0.6, CW, 2.35, 2, 28, 0, 1, 0, 0.1, shade(STONE, 0.8));
  ribbed(p, C0, 0.6, CW, 2.35, 2, 28, 8, SLIT, 0.14, 0.86);
  p.faceRect('left', C0, 0.6, CW, 2.35, 2, 28, 0, 1, 0.9, 0.95, shade(team.primary, 0.85));
  p.faceRect('left', C0, 0.6, CW, 2.35, 2, 28, 0.4, 0.6, 0, 0.22, '#2a2620');
  p.box(C0 - 0.03, 0.57, CW + 0.06, 2.41, 30, 1.6, TRIM);
  parapet(p, C0 - 0.03, 0.57, CW + 0.06, 2.41, 31.6, '#c8bea6', 0.05, 1.8);
  p.box(C0 + 0.2, 0.8, CW - 0.4, 1.95, 31.6, 6, STONE, { top: ROOF });
  p.faceTransform('left', C0 + 0.2, 2.75, 31.6, (ctx) => crest(ctx, ((CW - 0.4) * PX) / 2, 3.2, 2.4));
  p.box(C0 + 0.4, 1.1, CW - 0.8, 1.3, 37.6, 3, '#3c3a36');
  wing(W - C0, C0 - 0.08);
  p.faceTransform('left', W - C0, 2.95, 2, (ctx) => archGate(ctx, 0.32 * PX, 7, 15));
}

/** The August 1st emblem: gold ring, red disc, gold star, the characters 八一 (face space, y up). */
function bayiEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillStyle = '#e2b23a';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8261d';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c94c';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r * 0.74 : r * 0.3;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, -1);
  ctx.fillStyle = '#c8261d';
  ctx.font = `700 ${(r * 0.62).toFixed(2)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('八一', 0, r * 0.05);
  ctx.restore();
}

/**
 * China — the August 1st Building (八一大楼), after the photo: a broad cream office block of many floors with dense
 * square windows, a dark top band and a grey flared hip roof, taller corner bays at both ends; two identical low
 * pavilion wings in front (tall windows, set-back upper storey); between them the pillared entrance with the emblem.
 */
function bayi(p: IsoPainter, team: FactionColors): void {
  // Clear at game size: bright stone, near-black windows (fewer, bigger), dark tile roofs with light eave lines.
  const STONE = '#f1ebdc';
  const TRIM = '#d8cfb8';
  const TILE = '#4f5458';
  const WIN = '#1f2c36';
  const PAVE = '#b8b2a4';
  p.box(0, 0, W, D, 0, 1.2, PAVE);
  const win = { glass: WIN, frame: null, fill: 0.55, band: 0.38, lit: 0.05 };
  const M0 = 0.45;
  const MW = W - 2 * M0;
  p.box(M0, 0.1, MW, 1.5, 1.2, 40, STONE);
  facade(p, 'left', M0, 0.1, MW, 1.5, 1.2, 36, { ...win, cols: 18, floors: 8, seed: 41 });
  facade(p, 'right', M0, 0.1, MW, 1.5, 1.2, 36, { ...win, cols: 6, floors: 8, seed: 42 });
  // Top floor: a continuous dark window band under the cornice; a stone base course at the foot.
  p.faceRect('left', M0, 0.1, MW, 1.5, 1.2, 40, 0, 1, 0.9, 0.97, WIN);
  p.faceRect('right', M0, 0.1, MW, 1.5, 1.2, 40, 0, 1, 0.9, 0.97, WIN);
  p.faceRect('left', M0, 0.1, MW, 1.5, 1.2, 40, 0, 1, 0, 0.05, shade(STONE, 0.8));
  p.box(M0 - 0.06, 0.04, MW + 0.12, 1.62, 41.2, 1.4, '#f7f3e8');
  p.hipRoof(M0, 0.1, MW, 1.5, 42.6, 8, 0.16, TILE, 2.6);
  p.faceTransform('left', M0, 1.6, 1.2, (ctx) => bayiEmblem(ctx, (MW * PX) / 2, 33, 3.8));
  // Corner bays at both ends, flush with the block's faces and a little taller, each with its own roof.
  for (const u of [M0, M0 + MW - 0.6]) {
    p.box(u, 0.1, 0.6, 1.5, 1.2, 44, STONE);
    facade(p, 'left', u, 0.1, 0.6, 1.5, 1.2, 39, { ...win, cols: 3, floors: 9, seed: 43 });
    facade(p, 'right', u, 0.1, 0.6, 1.5, 1.2, 39, { ...win, cols: 6, floors: 9, seed: 44 });
    // Edge lines so each bay reads as its own tower against the block.
    p.faceRect('left', u, 0.1, 0.6, 1.5, 1.2, 44, 0, 0.04, 0, 1, shade(STONE, 0.78));
    p.faceRect('left', u, 0.1, 0.6, 1.5, 1.2, 44, 0.96, 1, 0, 1, shade(STONE, 0.78));
    p.box(u - 0.06, 0.04, 0.72, 1.62, 45.2, 1.4, '#f7f3e8');
    p.hipRoof(u, 0.1, 0.6, 1.5, 46.6, 6, 0.14, TILE, 2.2);
  }
  const pavilion = (u: number, w: number, seed: number): void => {
    const v = 1.85;
    const d = 1.05;
    p.box(u, v, w, d, 1.2, 12, STONE);
    for (const face of ['left', 'right'] as const) {
      const n = Math.round((face === 'left' ? w : d) * 5);
      for (let i = 0; i < n; i++) p.faceRect(face, u, v, w, d, 1.2, 12, (i + 0.28) / n, (i + 0.72) / n, 0.14, 0.86, WIN);
    }
    p.box(u - 0.05, v - 0.05, w + 0.1, d + 0.1, 13.2, 1, '#f7f3e8');
    p.hipRoof(u, v, w, d, 14.2, 3, 0.12, TILE, 1.2);
    const k = 0.18;
    p.box(u + k, v + k, w - 2 * k, d - 2 * k, 14, 7, STONE);
    facade(p, 'left', u + k, v + k, w - 2 * k, d - 2 * k, 14, 7, { ...win, cols: Math.round((w - 2 * k) * 4), floors: 1, seed });
    facade(p, 'right', u + k, v + k, w - 2 * k, d - 2 * k, 14, 7, { ...win, cols: Math.round((d - 2 * k) * 4), floors: 1, seed: seed + 1 });
    p.hipRoof(u + k, v + k, w - 2 * k, d - 2 * k, 21, 4, 0.12, TILE, 1.6);
  };
  pavilion(0.2, 1.75, 45);
  // Pillared entrance between the wings, the emblem over it, steps down to the front.
  const E0 = 2.05;
  const EW = W - 2 * E0;
  p.box(E0, 1.6, EW, 1.2, 1.2, 16, STONE);
  p.faceRect('left', E0, 1.6, EW, 1.2, 1.2, 16, 0, 1, 0, 0.66, '#1c1c1a');
  for (let i = 0; i <= 4; i++) p.faceRect('left', E0, 1.6, EW, 1.2, 1.2, 16, i / 4 - 0.045, i / 4 + 0.045, 0, 0.68, '#ffffff');
  // Red lintel band carrying a big August 1st emblem.
  p.faceRect('left', E0, 1.6, EW, 1.2, 1.2, 16, 0, 1, 0.68, 1, '#b8231c');
  p.faceTransform('left', E0, 2.8, 1.2, (ctx) => bayiEmblem(ctx, (EW * PX) / 2, 13.2, 3.6));
  p.box(E0 - 0.04, 1.56, EW + 0.08, 1.28, 17.2, 1, TRIM);
  for (let i = 0; i < 2; i++) p.box(E0 - 0.1, 2.8 + i * 0.08, EW + 0.2, 0.08, 1.2, 0.8 - i * 0.4, shade(PAVE, 1.08 - i * 0.04));
  pavilion(W - 0.2 - 1.75, 1.75, 45);
  p.topRect(0.05, 2.92, W - 0.05, 2.97, 1.22, shade(team.primary, 0.85));
}

/**
 * Europe — the NATO headquarters in Brussels (after the photos): long office wings lying parallel to the front in
 * rows one behind the other, each pair meeting at a central spine; every wing's silver roof sweeps up in a long curve
 * from its outer end to the middle, its façades are dark glass behind dense vertical fins; the tall glass atrium is
 * the entrance in the middle of the front, and before it the paved plaza with the ring of member flags and the
 * star sculpture, lawns and curved yellow hedges either side. Mirror-symmetric about the middle of the long front.
 */
function glassHq(p: IsoPainter, team: FactionColors): void {
  const DARK = '#3d4954';
  const FIN = '#c4cbd1';
  const SILVER = '#d4d8dc';
  const GRASS = '#7a9a4c';
  const PZ = 1.2;
  p.box(0, 0, W, D, 0, PZ, '#8a8f94');
  p.topRect(0.05, 0.05, W - 0.05, D - 0.05, PZ + 0.01, GRASS);

  /**
   * One wing from u0 to u1 at depth v .. v + d: the roof rises along its length from `lo` at the outer end to `hi`
   * at the spine end (`spineAtRight`: the spine is at u1).
   */
  const wing = (u0: number, u1: number, v: number, d: number, lo: number, hi: number, spineAtRight: boolean): void => {
    const N = 16;
    const zAt = (k: number): number => {
      const t = spineAtRight ? k / N : 1 - k / N; // 0 at the outer end, 1 at the spine
      return PZ + lo + (hi - lo) * Math.sin((t * Math.PI) / 2);
    };
    const uAt = (k: number): number => u0 + ((u1 - u0) * k) / N;
    // Front façade (v + d): dark glass under the curve, dense white vertical fins, floor lines.
    for (let k = 0; k < N; k++) {
      const ua = uAt(k);
      const ub = uAt(k + 1);
      const za = zAt(k);
      const zb = zAt(k + 1);
      p.polygon([[ua, v + d, PZ], [ub, v + d, PZ], [ub, v + d, zb], [ua, v + d, za]] as Vec3[], DARK, null);
      for (let f = 0; f < 4; f++) {
        const fu = ua + ((ub - ua) * (f + 0.4)) / 4;
        const zf = za + ((zb - za) * (f + 0.4)) / 4;
        p.polygon([[fu, v + d, PZ], [fu + 0.012, v + d, PZ], [fu + 0.012, v + d, zf - 0.6], [fu, v + d, zf - 0.6]] as Vec3[], FIN, null);
      }
      for (let fl = 1; fl < 6; fl++) {
        const z = PZ + fl * 3.6;
        if (z < Math.min(za, zb) - 1) p.polygon([[ua, v + d, z], [ub, v + d, z], [ub, v + d, z + 0.35], [ua, v + d, z + 0.35]] as Vec3[], shade(FIN, 0.85), null);
      }
    }
    // The visible end wall (the right end, u1, when that is the outer end).
    if (!spineAtRight) {
      const z = zAt(N);
      p.polygon([[u1, v, PZ], [u1, v + d, PZ], [u1, v + d, z], [u1, v, z]] as Vec3[], shade(DARK, 0.85), null);
      for (let i = 1; i < 6; i++) p.polygon([[u1, v + (d * i) / 6, PZ], [u1, v + (d * i) / 6 + 0.01, PZ], [u1, v + (d * i) / 6 + 0.01, z - 0.5], [u1, v + (d * i) / 6, z - 0.5]] as Vec3[], FIN, null);
    }
    // Curved silver roof with a bright overhanging edge.
    for (let k = 0; k < N; k++) {
      const ua = uAt(k);
      const ub = uAt(k + 1);
      p.polygon([[ua, v - 0.03, zAt(k)], [ub, v - 0.03, zAt(k + 1)], [ub, v + d + 0.04, zAt(k + 1)], [ua, v + d + 0.04, zAt(k)]] as Vec3[], shade(SILVER, 0.92 + 0.1 * (k / N)), null);
      p.polygon([[ua, v + d + 0.04, zAt(k) - 0.7], [ub, v + d + 0.04, zAt(k + 1) - 0.7], [ub, v + d + 0.04, zAt(k + 1)], [ua, v + d + 0.04, zAt(k)]] as Vec3[], '#f2f4f5', null);
    }
  };

  // Rows of wings from the back to the front, each pair mirrored about the spine (u = 2.5), staggered in length.
  const rows: [number, number, number, number, number][] = [
    // [outer-end offset, depth start, depth, low, high]
    [0.95, 0.12, 0.38, 12, 18],
    [0.55, 0.62, 0.4, 12, 19],
    [0.8, 1.14, 0.42, 13, 20],
    [0.3, 1.68, 0.48, 13, 22],
  ];
  const SP0 = MU - 0.2;
  const SP1 = MU + 0.2;
  rows.forEach(([o, v, d, lo, hi], i) => {
    wing(o, SP0, v, d, lo, hi, true);
    // Spine block joining the pair (behind the front atrium).
    if (i < rows.length - 1) {
      p.box(SP0, v, SP1 - SP0, d + 0.12, PZ, hi + 0.5, DARK, { top: SILVER });
      p.faceRect('left', SP0, v, SP1 - SP0, d + 0.12, PZ, hi + 0.5, 0, 1, 0, 1, shade(DARK, 0.9));
    }
    wing(SP1, W - o, v, d, lo, hi, false);
  });
  // The glass atrium: the entrance in the middle of the front, taller than the wings, the star emblem on its glass.
  const A0 = MU - 0.32;
  p.box(A0, 1.55, 0.64, 0.95, PZ, 25, '#2f4a5e', { top: SILVER });
  for (const face of ['left', 'right'] as const) {
    for (let i = 1; i < 6; i++) p.faceRect(face, A0, 1.55, 0.64, 0.95, PZ, 25, i / 6 - 0.008, i / 6 + 0.008, 0, 1, '#9fb4c2');
    for (let f = 1; f < 7; f++) p.faceRect(face, A0, 1.55, 0.64, 0.95, PZ, 25, 0, 1, f / 7 - 0.006, f / 7 + 0.006, '#9fb4c2');
  }
  p.box(A0 - 0.03, 1.52, 0.7, 1.01, PZ + 25, 1, '#f2f4f5');
  p.faceTransform('left', A0, 2.5, PZ, (ctx) => {
    const cx = 0.64 * 16;
    ctx.strokeStyle = '#e8eef2';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(cx, 9, 2.4, 0, Math.PI * 2);
    for (let k = 0; k < 4; k++) {
      const ang = (k * Math.PI) / 2;
      ctx.moveTo(cx, 9);
      ctx.lineTo(cx + Math.cos(ang) * 3.6, 9 + Math.sin(ang) * 3.6);
    }
    ctx.stroke();
  });
  // Plaza: paving, the ring of member flags round the star sculpture, lawns and curved yellow hedges either side.
  p.topRect(MU - 0.55, 2.5, MU + 0.55, D - 0.04, PZ + 0.02, '#cfccc4');
  for (const s0 of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const ang = Math.PI * (0.15 + (k / 6) * 0.7);
      p.box(MU + s0 * (0.65 + Math.sin(ang) * 0.5) - 0.05, 2.45 + Math.cos(ang) * 0.4 + 0.12, 0.1, 0.1, PZ, 1.2, '#c9b23a');
    }
  }
  p.cylinder(MU, 2.78, 0.06, PZ, 1.5, '#5a4a38', 6);
  const cols = ['#1f3f9a', team.primary, '#c8231e', '#f2f2f2', '#2f8a4e', '#f2c94c', team.light, '#c8231e', '#1f3f9a', '#f2f2f2'];
  cols.forEach((col, k) => {
    const ang = (k / cols.length) * Math.PI * 2;
    const u = MU + Math.cos(ang) * 0.36;
    const v = 2.76 + Math.sin(ang) * 0.17;
    p.pole(u, v, PZ, 10, '#f0f0f0');
    p.polygon([[u, v, PZ + 10], [u + 0.09, v, PZ + 10], [u + 0.09, v, PZ + 8], [u, v, PZ + 8]] as Vec3[], col, null);
  });
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
 * Islamic — a mud-brick desert fortress (Arg plan) filling the plot: crenellated walls, round towers on the four
 * corners and two mid-wall towers, the headquarters keep in the middle under a green dome, the tiled iwan gateway in
 * the middle of the front.
 */
function islamicFort(p: IsoPainter, team: FactionColors): void {
  const BRICK = '#b59670';
  const TOP = '#c7ab84';
  const Z = 2;
  const WH = 18;
  p.box(0, 0, W, D, 0, Z, '#8f7a58');
  fortTower(p, 0.3, 0.3, Z, BRICK);
  fortTower(p, MU, 0.3, Z, BRICK);
  p.box(0.05, 0.05, W - 0.1, D - 0.1, Z, WH, BRICK, { top: TOP });
  p.windows('left', 0.05, 0.05, W - 0.1, D - 0.1, Z, WH, 16, 1, '#2b2219', 0.08, 0.35);
  p.windows('right', 0.05, 0.05, W - 0.1, D - 0.1, Z, WH, 10, 1, '#2b2219', 0.1, 0.35);
  p.faceRect('left', 0.05, 0.05, W - 0.1, D - 0.1, Z, WH, 0.03, 0.97, 0.75, 0.8, ISLAMIC_GREEN);
  p.faceRect('right', 0.05, 0.05, W - 0.1, D - 0.1, Z, WH, 0.05, 0.95, 0.75, 0.8, ISLAMIC_GREEN);
  merlons(p, 0.3, 0.05, W - 0.6, 0.2, Z + WH, 15, TOP);
  merlons(p, 0.05, 0.3, 0.2, D - 0.6, Z + WH, 9, TOP);
  merlons(p, W - 0.25, 0.3, 0.2, D - 0.6, Z + WH, 9, TOP);
  merlons(p, 0.3, D - 0.25, W - 0.6, 0.2, Z + WH, 15, TOP);
  const KZ = Z + WH;
  p.box(1.2, 0.5, W - 2.4, 1.5, KZ, 12, '#cdb994', { top: TOP });
  p.windows('left', 1.2, 0.5, W - 2.4, 1.5, KZ, 12, 8, 1, '#2b2219', 0.15, 0.6);
  p.windows('right', 1.2, 0.5, W - 2.4, 1.5, KZ, 12, 4, 1, '#2b2219', 0.2, 0.6);
  p.faceRect('left', 1.2, 0.5, W - 2.4, 1.5, KZ, 12, 0, 1, 0.82, 0.92, ISLAMIC_GREEN);
  for (const u of [1.45, W - 1.45]) {
    p.cylinder(u, 1.25, 0.16, KZ + 12, 3, '#e4d2a8');
    p.dome(u, 1.25, 0.18, KZ + 15, 7, ISLAMIC_GREEN_DOME);
  }
  p.cylinder(MU, 1.25, 0.34, KZ + 12, 4, '#e4d2a8');
  p.dome(MU, 1.25, 0.38, KZ + 16, 14, ISLAMIC_GREEN_DOME);
  p.pole(MU, 1.25, KZ + 30, 5, '#e2b23a');
  fortTower(p, W - 0.3, 0.3, Z, BRICK);
  fortTower(p, 0.3, D - 0.3, Z, BRICK);
  iwan(p, 'left', [MU - 0.45, D - 0.35, 0.9, 0.3, Z, 30]);
  p.faceRect('left', MU - 0.45, D - 0.35, 0.9, 0.3, Z, 30, 0.12, 0.88, 0.84, 0.92, team.primary);
  fortTower(p, W - 0.3, D - 0.3, Z, BRICK);
}

const DESIGNS: Record<FactionId, (p: IsoPainter, team: FactionColors) => void> = {
  usa: pentagon,
  russia: stalinist,
  china: bayi,
  europe: glassHq,
  islamic: islamicFort,
};

/** Flag pole of each design (art units, z = foot of the pole), on the middle line u = 2.5 or a front corner. */
const FLAGS: Record<FactionId, FlagSpot> = {
  usa: { u: 2, v: 2, z: 1.2, h: 30 },
  russia: { u: MU, v: 1.75, z: 40.6, h: 14 },
  china: { u: MU, v: 2.95, z: 1.2, h: 30 },
  europe: { u: MU, v: 2.76, z: 1.2, h: 14 },
  islamic: { u: MU, v: 1.25, z: 35, h: 14 },
};

/**
 * Ministry of Defence (the infantry building), drawn in each nation's own architecture: the Pentagon (USA), a
 * the Frunzenskaya Ministry of Defence (Russia), the symmetric August 1st Building with its 八一 star (China), a glass alliance
 * headquarters (Europe) and a mud-brick desert fortress (Islamic). The national flag flies on the roof of each; every design fills its plot.
 */
/** `flagOf`: the nation whose flag flies (its owner after a capture; the design stays `faction`'s). */
/** Europe's Ministry of Defence, built and rendered in Blender (tools/blender/building_render.py barracks-europe). */
const EUROPE_PICTURE = { file: 'building-barracks-europe', originX: 100, originY: 70.33, scale: 3, footprint: { w: W, d: D }, zScale: 1.35 };
/** Its flag flies from the roof of the front pavilion (art units; z already divided by the cache's height scale). */
const EUROPE_FLAG = { u: 4.75, v: 1.5, z: 46, h: 14 };

export function createBarracksArt(faction: FactionId, flagOf: FactionId = faction): BuildingArt {
  const team = FACTIONS[faction].colors;
  const flag = FLAGS[faction];
  if (faction === 'europe') {
    const f = EUROPE_FLAG;
    return pictureArt(EUROPE_PICTURE, {
      overlay: (p) => drawNationalPole(p, faction, f.u, f.v, f.z, f.h),
      drawAnimated: (p, time) => drawFlagOnPole(p, flagOf, f.u, f.v, f.z + f.h, time, 0.6, 16, 10),
    });
  }

  return {
    // 5 × 3 plot (FOOTPRINT_BARRACKS), the Pentagon 4 × 4: every design fills its plot edge to edge, symmetric.
    footprint: faction === 'usa' ? { w: 4, d: 4 } : { w: W, d: D },
    height: 72,

    drawStatic(p) {
      DESIGNS[faction](p, team);
      drawNationalPole(p, faction, flag.u, flag.v, flag.z, flag.h);
    },

    drawAnimated(p, time) {
      drawFlagOnPole(p, flagOf, flag.u, flag.v, flag.z + flag.h, time, 0.6, 16, 10);
    },
  };
}
