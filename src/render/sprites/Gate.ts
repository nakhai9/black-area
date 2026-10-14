import { ISLAMIC_GREEN, ISLAMIC_GREEN_DARK, ISLAMIC_GREEN_DEEP, ISLAMIC_GREEN_DOME, ISLAMIC_GREEN_LIGHT } from './IslamicPalette';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter, Vec3 } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

/** Tower height (px) — well above the 34 px wall slabs. */
const PILLAR_H = 42;
/** Tower inset (cells) inside its end cell, and the beam's inset at the gate's two ends. */
const PIN = 0.12;
const BEAM_IN = 0.06;
/** Tallest point of any style (px), used for the art's bounding height. */
const MAX_H = 86;
const ENDS = [0, 3] as const;
const FRONT = 1 - PIN;

/** Beam across the top of the towers, spanning the (open) middle cells. */
function beam(p: IsoPainter, z: number, h: number, color: string, inset = BEAM_IN, v0 = PIN - 0.04, v1 = 1 - PIN + 0.04): void {
  p.box(inset, v0, 4 - 2 * inset, v1 - v0, z, h, color);
}

/** Flat quad on the front (+v) face between u0..u1 and z0..z1. */
function frontQuad(p: IsoPainter, u0: number, u1: number, z0: number, z1: number, fill: string, v = FRONT): void {
  p.polygon([[u0, v, z0], [u1, v, z0], [u1, v, z1], [u0, v, z1]] as Vec3[], fill, null);
}

function dot(p: IsoPainter, u: number, v: number, z: number, r: number, fill: string): void {
  const [x, y] = p.project(u, v, z);
  p.ctx.fillStyle = fill;
  p.ctx.beginPath();
  p.ctx.arc(x, y, r, 0, Math.PI * 2);
  p.ctx.fill();
}


/** USA: monumental white-marble federal gateway — massive pylons with paired Ionic columns, "UNITED STATES" entablature, stepped attic (no eagle), bronze lanterns and a guard booth (no flags on gates). */
function usa(p: IsoPainter): void {
  const marble = '#eeeae0';
  const gold = '#d9b44a';
  const navy = '#22336b';
  const bronze = '#6b4f2a';
  const PY = 46; // pylon top
  const vf = 0.92; // column line (front)
  for (const u of ENDS) {
    p.box(u + 0.04, 0.06, 0.92, 0.9, 0, 3, shade(marble, 0.8)); // granite stylobate
    p.box(u + 0.1, 0.1, 0.8, 0.7, 3, PY - 3, shade(marble, 0.92)); // massive pylon
    p.box(u + 0.08, 0.08, 0.84, 0.74, PY - 6, 2, marble, { edge: null }); // string course
    for (const cu of [0.24, 0.76]) {
      p.box(u + cu - 0.12, vf - 0.12, 0.24, 0.2, 3, 2, marble); // base
      p.cylinder(u + cu, vf - 0.02, 0.09, 5, PY - 12, marble, 6); // fluted shaft
      p.box(u + cu - 0.13, vf - 0.13, 0.26, 0.22, PY - 7, 2, shade(marble, 0.97)); // Ionic capital
      dot(p, u + cu - 0.1, vf + 0.09, PY - 6, 0.9, shade(marble, 0.6)); // volutes
      dot(p, u + cu + 0.1, vf + 0.09, PY - 6, 0.9, shade(marble, 0.6));
    }
    // Bronze lantern at the pylon's outer front corner.
    const lu = u === 0 ? u + 0.1 : u + 0.9;
    p.box(lu - 0.05, vf - 0.05, 0.1, 0.1, PY - 18, 4, bronze);
    dot(p, lu, vf, PY - 16, 1.1, '#ffe08a');
    p.pyramid(lu - 0.06, vf - 0.06, 0.12, 0.12, PY - 14, 2, bronze);
  }
  // Guard booth built into the left pylon: steel door, lit window, navy awning; bronze plaque on the right pylon.
  frontQuad(p, 0.38, 0.62, 3, 15, navy, 0.81);
  frontQuad(p, 0.42, 0.58, 10, 14, '#bfe0ff', 0.815);
  frontQuad(p, 0.34, 0.66, 15, 16.5, shade(navy, 0.8), 0.82);
  frontQuad(p, 3.38, 3.62, 6, 14, shade(marble, 0.7), 0.81);
  frontQuad(p, 3.42, 3.58, 8, 12, gold, 0.815);
  // Entablature high above the open passage.
  const z = PY - 4;
  beam(p, z, 3, shade(marble, 0.95), 0.04, 0.12, vf + 0.06); // architrave
  beam(p, z + 3, 5, marble, 0.03, 0.1, vf + 0.08); // frieze
  const vF = vf + 0.08;
  frontQuad(p, 0.7, 3.3, z + 4, z + 7, navy, vF);
  const c = p.ctx;
  {
    const [x0, y0] = p.project(0.85, vF, z + 5.5);
    const [x1, y1] = p.project(3.15, vF, z + 5.5);
    c.fillStyle = '#f2e7c4'; // "UNITED STATES" letter strokes
    for (let i = 0; i < 13; i++) {
      if (i === 6) continue;
      const t = (i + 0.5) / 13;
      c.fillRect(x0 + (x1 - x0) * t - 0.7, y0 + (y1 - y0) * t - 1, 1.4, 2);
    }
  }
  beam(p, z + 8, 2, shade(marble, 1.02), 0, 0.08, vf + 0.12); // cornice
  for (let i = 0; i < 16; i++) frontQuad(p, 0.1 + i * 0.24, 0.2 + i * 0.24, z + 7.6, z + 8.2, shade(marble, 0.62), vf + 0.1); // dentils
  // Stepped attic.
  const za = z + 10;
  p.box(0.9, 0.2, 2.2, 0.6, za, 4, marble);
  frontQuad(p, 1.0, 3.0, za + 0.8, za + 3.2, shade(marble, 0.85), 0.8);
  p.box(1.4, 0.3, 1.2, 0.4, za + 4, 3, shade(marble, 0.97));
}

/** Russia: Kremlin Spasskaya towers — red brick with white trim, tiered stages, green tent spires with ruby stars; swallow-tail merlons. */
function russia(p: IsoPainter): void {
  const brick = '#a8392b';
  const trim = '#ece4d4';
  const roof = '#2f6b4a';
  for (const u of ENDS) {
    p.box(u + PIN, PIN, 1 - 2 * PIN, 1 - 2 * PIN, 0, PILLAR_H - 8, brick);
    p.faceRect('left', u + PIN, PIN, 1 - 2 * PIN, 1 - 2 * PIN, 0, PILLAR_H - 8, 0.3, 0.7, 0.35, 0.6, '#3a1612'); // window
    p.faceRect('left', u + PIN, PIN, 1 - 2 * PIN, 1 - 2 * PIN, 0, PILLAR_H - 8, 0, 1, 0.75, 0.8, trim);
  }
  // Span wall high above the passage, with a white cornice and swallow-tail merlons.
  beam(p, PILLAR_H - 18, 10, brick, 1 - PIN, 0.3, 0.7);
  p.box(1 - PIN, 0.3, 2 + 2 * PIN, 0.4, PILLAR_H - 9, 1, trim, { edge: null });
  for (let i = 0; i < 5; i++) {
    const u = 1.08 + i * 0.4;
    p.box(u, 0.4, 0.22, 0.2, PILLAR_H - 8, 4, brick);
    p.polygon([[u + 0.07, 0.6, PILLAR_H - 4], [u + 0.15, 0.6, PILLAR_H - 4], [u + 0.11, 0.6, PILLAR_H - 6]] as Vec3[], shade(brick, 0.4), null);
  }
  for (const u of ENDS) {
    p.box(u + PIN - 0.03, PIN - 0.03, 1 - 2 * PIN + 0.06, 1 - 2 * PIN + 0.06, PILLAR_H - 8, 2, trim); // string course
    p.box(u + 0.2, 0.2, 0.6, 0.6, PILLAR_H - 6, 8, brick); // clock stage
    p.faceRect('left', u + 0.2, 0.2, 0.6, 0.6, PILLAR_H - 6, 8, 0.15, 0.85, 0.3, 0.8, '#f2ece0');
    dot(p, u + 0.5, 0.8, PILLAR_H - 2, 1.1, '#c9a542');
    for (const cu of [0.2, 0.8]) p.pyramid(u + cu - 0.05, 0.75, 0.1, 0.1, PILLAR_H + 2, 5, '#c9a542'); // pinnacles
    p.cylinder(u + 0.5, 0.5, 0.2, PILLAR_H + 2, 5, trim, 8); // octagonal belfry
    p.box(u + 0.32, 0.32, 0.36, 0.36, PILLAR_H + 7, 1, brick, { edge: null });
    p.pyramid(u + 0.3, 0.3, 0.4, 0.4, PILLAR_H + 8, 9, roof); // tent spire
    p.pole(u + 0.5, 0.5, PILLAR_H + 17, 2, '#c9a542');
    const [x, y] = p.project(u + 0.5, 0.5, PILLAR_H + 21);
    p.ctx.fillStyle = '#c9a542';
    star(p.ctx, x, y, 3.2);
    p.ctx.fillStyle = '#e0242a';
    star(p.ctx, x, y, 2.4);
  }
}

/** China: Tiananmen-style paifang — red lacquer columns, green/blue dougong band, gilt plaque and stacked yellow glazed roofs with upturned eaves. */
function china(p: IsoPainter): void {
  const red = '#b52a22';
  const gold = '#e0ac2c';
  for (const u of ENDS) {
    p.box(u + 0.16, 0.2, 0.68, 0.6, 0, 3, '#a8a294'); // marble plinth
    p.cylinder(u + 0.32, 0.5, 0.1, 3, PILLAR_H - 7, red);
    p.cylinder(u + 0.68, 0.5, 0.1, 3, PILLAR_H - 7, red);
    p.hipRoof(u + 0.2, 0.3, 0.6, 0.4, PILLAR_H - 6, 5, 0.12, gold, 2); // side roofs
  }
  // Painted beams (green / blue dougong) high above the way through.
  beam(p, PILLAR_H - 4, 4, '#2f7a5a', 0.15, 0.3, 0.7);
  for (let i = 0; i < 12; i++) frontQuad(p, 0.2 + i * 0.3, 0.32 + i * 0.3, PILLAR_H - 3, PILLAR_H - 1, '#2d4f9a', 0.7);
  p.box(0.15, 0.3, 3.7, 0.4, PILLAR_H, 3, red);
  // Gilt plaque in the centre.
  frontQuad(p, 1.7, 2.3, PILLAR_H - 2, PILLAR_H + 3, '#1f3a7a', 0.72);
  frontQuad(p, 1.78, 2.22, PILLAR_H - 1, PILLAR_H + 2, gold, 0.73);
  // Main roof, then an upper tier over the centre span.
  p.hipRoof(0.2, 0.3, 3.6, 0.4, PILLAR_H + 3, 6, 0.2, gold, 4);
  p.box(1.1, 0.38, 1.8, 0.24, PILLAR_H + 7, 3, red);
  p.hipRoof(1.1, 0.38, 1.8, 0.24, PILLAR_H + 10, 6, 0.18, gold, 4);
  for (const u of [1.05, 2.95]) p.pole(u, 0.5, PILLAR_H + 15, 3, '#a8781e'); // ridge beasts
  dot(p, 2, 0.5, PILLAR_H + 17, 1.4, '#e8c45a');
}

/** Europe: Brandenburg Gate / triumphal arch — sandstone Doric columns, an attic with an EU-blue star band and a bronze quadriga. */
function europe(p: IsoPainter): void {
  const stone = '#d8c39a';
  const bronze = '#4f6b52';
  for (const u of ENDS) {
    p.box(u + PIN - 0.03, PIN - 0.03, 1 - 2 * PIN + 0.06, 1 - 2 * PIN + 0.06, 0, 3, shade(stone, 0.85));
    p.box(u + PIN + 0.05, PIN + 0.05, 1 - 2 * PIN - 0.1, 0.4, 3, PILLAR_H - 3, shade(stone, 0.9)); // back pier
    for (const cu of [0.26, 0.74]) p.cylinder(u + cu, 0.72, 0.11, 3, PILLAR_H - 3, stone, 5);
  }
  beam(p, PILLAR_H, 3, shade(stone, 0.95)); // architrave
  beam(p, PILLAR_H + 3, 3, stone); // frieze
  for (let i = 0; i < 13; i++) frontQuad(p, 0.15 + i * 0.29, 0.22 + i * 0.29, PILLAR_H + 3.5, PILLAR_H + 5.5, shade(stone, 0.6), 1 - PIN + 0.04);
  // Stepped attic.
  p.box(0.2, PIN + 0.04, 3.6, 1 - 2 * PIN - 0.08, PILLAR_H + 6, 6, stone);
  p.box(1.0, 0.3, 2.0, 0.4, PILLAR_H + 12, 3, shade(stone, 0.95));
  for (const u of ENDS) p.box(u + 0.3, 0.35, 0.4, 0.3, PILLAR_H + 12, 3, shade(stone, 0.92)); // corner plinths
  // EU-blue band with a ring of gold stars.
  const v = 1 - PIN - 0.04;
  frontQuad(p, 1.2, 2.8, PILLAR_H + 7, PILLAR_H + 11, '#1f3f99', v);
  const [cx, cy] = p.project(2, v, PILLAR_H + 9);
  p.ctx.fillStyle = '#f4cf3a';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.ctx.fillRect(cx + Math.cos(a) * 3.4 - 0.5, cy + Math.sin(a) * 1.6 - 0.5, 1, 1);
  }
  // Bronze quadriga: four horses, chariot, goddess with a staff.
  const z = PILLAR_H + 15;
  p.box(1.55, 0.42, 0.9, 0.16, z, 2, bronze);
  for (let i = 0; i < 4; i++) p.box(1.6 + i * 0.2, 0.45, 0.12, 0.12, z + 2, 3, bronze);
  p.box(1.9, 0.38, 0.22, 0.2, z + 2, 3, shade(bronze, 0.85));
  p.box(1.97, 0.44, 0.08, 0.08, z + 5, 5, bronze);
  p.pole(2.08, 0.48, z + 6, 6, bronze);
}

/** Islamic: Naqsh-e Jahan style gate — sandstone towers with tile bands and minarets (balconies, green onion domes, gold crescents), a tall pishtaq with a pointed iwan arch full of muqarnas, gold calligraphy. */
function islamic(p: IsoPainter): void {
  const sand = '#dcc59c';
  const cream = '#efe2c2';
  const gold = '#d4b24a';
  const TH = 46; // tower top
  for (const u of ENDS) {
    p.box(u + 0.06, 0.06, 0.88, 0.88, 0, 3, shade(sand, 0.82)); // plinth
    p.box(u + 0.1, 0.1, 0.8, 0.8, 3, TH - 3, sand);
    const bands: [number, number, string][] = [[11, 2, ISLAMIC_GREEN], [28, 2, ISLAMIC_GREEN_DEEP], [TH - 6, 4, ISLAMIC_GREEN]];
    for (const [bz, bh, col] of bands) p.box(u + 0.08, 0.08, 0.84, 0.84, bz, bh, col, { edge: null });
    for (let i = 0; i < 6; i++) frontQuad(p, u + 0.13 + i * 0.13, u + 0.19 + i * 0.13, TH - 4.8, TH - 3.2, ISLAMIC_GREEN_LIGHT, 0.93); // tile lozenges
    // Blind pointed niche framed in green.
    p.faceTransform('left', u + 0.28, 0.9, 14, (ctx) => {
      ctx.fillStyle = ISLAMIC_GREEN_DEEP;
      ctx.beginPath();
      ctx.moveTo(-1, 0);
      ctx.lineTo(-1, 9);
      ctx.quadraticCurveTo(-1, 14, 4.5, 18);
      ctx.quadraticCurveTo(10, 14, 10, 9);
      ctx.lineTo(10, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = ISLAMIC_GREEN_DARK;
      ctx.beginPath();
      ctx.moveTo(1, 0);
      ctx.lineTo(1, 9);
      ctx.quadraticCurveTo(1, 12.5, 4.5, 15);
      ctx.quadraticCurveTo(8, 12.5, 8, 9);
      ctx.lineTo(8, 0);
      ctx.closePath();
      ctx.fill();
    });
  }
  // Pishtaq across the passage: rises above the towers; the pointed arch springs at z0, so the way through stays open below.
  const u0 = 0.9;
  const u1 = 3.1;
  const v0 = 0.2;
  const vF = 0.9;
  const z0 = 26;
  const apex = 52;
  const top = 60;
  const K = 0.55; // < 1 → pointed crown
  const N = 16;
  const arch: Vec3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const s = 1 - Math.abs(2 * t - 1);
    arch.push([3 - 2 * t, vF, z0 + (apex - z0) * Math.pow(s, K)]);
  }
  const at = (v: number) => arch.map(([a, , c]) => [a, v, c] as Vec3);
  const frame = (v: number): Vec3[] => [[u0, v, top], [u1, v, top], [u1, v, z0], ...at(v), [u0, v, z0]];
  p.polygon(frame(v0), shade(sand, 0.7)); // rear face
  p.box(u0, v0, u1 - u0, vF - v0, top - 2, 2, sand); // roof slab
  // Iwan half-vault: dark recess with muqarnas rows in the upper arch.
  const halfW = (z: number) => 1 - Math.pow(Math.min(1, Math.max(0, (z - z0) / (apex - z0))), 1 / K);
  const vM = vF - 0.03;
  const mz = 37;
  const vault: Vec3[] = at(vM).filter((q) => q[2] >= mz);
  vault.unshift([2 + halfW(mz), vM, mz]);
  vault.push([2 - halfW(mz), vM, mz]);
  p.polygon(vault, ISLAMIC_GREEN_DARK, null);
  for (let r = 0; r < 4; r++) {
    const zb = mz + r * 3.4;
    const hw = halfW(zb + 3.4) * 0.95;
    const n = Math.max(1, 6 - r);
    const w = (2 * hw) / n;
    for (let k = 0; k < n; k++) {
      const a = 2 - hw + k * w;
      p.polygon(
        [[a, vM, zb + 3.4], [a + w, vM, zb + 3.4], [a + w * 0.85, vM, zb + 1], [a + w / 2, vM, zb], [a + w * 0.15, vM, zb + 1]] as Vec3[],
        (k + r) % 2 ? cream : ISLAMIC_GREEN_LIGHT,
        shade(sand, 0.5),
      );
    }
  }
  // Front face of the pishtaq, green arch border and frame, gold calligraphy band.
  p.polygon(frame(vF), shade(sand, 1.02));
  const vT = vF + 0.01;
  const inner = at(vT);
  const outer = arch.map(([a, , c]) => [2 + (a - 2) * 1.06, vT, c + 1.4] as Vec3);
  for (let i = 0; i < N; i++) p.polygon([inner[i], inner[i + 1], outer[i + 1], outer[i]], ISLAMIC_GREEN, null);
  frontQuad(p, u0, u0 + 0.06, z0, top, ISLAMIC_GREEN_DEEP, vT);
  frontQuad(p, u1 - 0.06, u1, z0, top, ISLAMIC_GREEN_DEEP, vT);
  frontQuad(p, u0, u1, top - 1.5, top, ISLAMIC_GREEN_DEEP, vT);
  frontQuad(p, u0 + 0.08, u1 - 0.08, top - 5, top - 2, gold, vT);
  {
    const [x0, y0] = p.project(u0 + 0.15, vF, top - 3.5);
    const [x1, y1] = p.project(u1 - 0.15, vF, top - 3.5);
    p.ctx.fillStyle = ISLAMIC_GREEN_DARK; // calligraphy strokes
    for (let i = 0; i < 18; i++) {
      const t = (i + 0.5) / 18;
      const tall = i % 3 === 0;
      p.ctx.fillRect(x0 + (x1 - x0) * t - 0.4, y0 + (y1 - y0) * t - (tall ? 1.3 : 0.6), 0.8, tall ? 2.4 : 1.2);
    }
  }
  for (const su of [1.1, 2.9]) {
    dot(p, su, vT, apex - 1, 2, ISLAMIC_GREEN_DEEP); // spandrel rosettes
    dot(p, su, vT, apex - 1, 1, gold);
  }
  for (let i = 0; i < 9; i++) p.box(u0 + 0.06 + i * 0.24, 0.45, 0.12, 0.1, top, 2.5, i % 2 ? ISLAMIC_GREEN : ISLAMIC_GREEN_DEEP, { edge: null }); // cresting
  // Minarets on the towers: balconies, green onion domes, gold crescent finials.
  for (const u of ENDS) {
    const cu = u + 0.5;
    p.cylinder(cu, 0.5, 0.26, TH, 3, sand, 8);
    p.cylinder(cu, 0.5, 0.17, TH + 3, 13, cream, 6);
    p.cylinder(cu, 0.5, 0.26, TH + 15, 1.5, ISLAMIC_GREEN_DEEP);
    p.cylinder(cu, 0.5, 0.15, TH + 16.5, 7, ISLAMIC_GREEN, 6);
    p.cylinder(cu, 0.5, 0.23, TH + 23.5, 1.2, ISLAMIC_GREEN_DARK);
    p.onion(cu, 0.5, 0.17, TH + 24.7, 8, ISLAMIC_GREEN_DOME, ISLAMIC_GREEN_LIGHT);
    p.pole(cu, 0.5, TH + 32.5, 3, gold);
    const [x, y] = p.project(cu, 0.5, TH + 36.5);
    p.ctx.fillStyle = gold;
    p.ctx.beginPath();
    p.ctx.arc(x, y, 2, 0, Math.PI * 2);
    p.ctx.arc(x + 0.9, y - 0.4, 1.6, 0, Math.PI * 2, true);
    p.ctx.fill('evenodd');
  }
}

/** Five-pointed star centred on (x, y). */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

const STYLES: Record<FactionId, (p: IsoPainter) => void> = { usa, russia, china, europe, islamic };

/**
 * Nation Gate (4 × 1): two end towers with the way through the two middle cells, in the nation's own architecture —
 * USA marble portico, Russian Kremlin towers, Chinese paifang, European triumphal gate, Islamic tiled iwan.
 */
export function createGateArt(faction: FactionId): BuildingArt {
  return {
    footprint: { w: 4, d: 1 },
    height: MAX_H,
    drawStatic: (p) => STYLES[faction](p),
  };
}
