import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter, Vec3 } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

/** Pillar height (px) and the beam / attic laid across them (px). */
const PILLAR_H = 42;
const BEAM_H = 9;
/** Pillar inset (cells) inside its end cell, and the beam's inset at the gate's two ends. */
const PIN = 0.12;
const BEAM_IN = 0.06;

/** Two end pillars (cells 0 and 3) of a 4 × 1 gate; the two middle cells stay open. */
function pillars(p: IsoPainter, color: string, w = 1 - 2 * PIN): void {
  p.box(PIN, PIN, w, 1 - 2 * PIN, 0, PILLAR_H, color);
  p.box(3 + PIN, PIN, w, 1 - 2 * PIN, 0, PILLAR_H, color);
}

/** Beam across the top of the pillars, spanning the opening. */
function beam(p: IsoPainter, z: number, h: number, color: string, inset = BEAM_IN): void {
  p.box(inset, PIN - 0.04, 4 - 2 * inset, 1 - 2 * PIN + 0.08, z, h, color);
}

/** USA: white marble neoclassical gate — fluted columns, entablature, a pediment and a gilt seal. */
function usa(p: IsoPainter): void {
  const marble = '#e8e4d8';
  for (const u of [0, 3]) {
    p.box(u + PIN, PIN, 1 - 2 * PIN, 1 - 2 * PIN, 0, 3, shade(marble, 0.92)); // plinth
    p.cylinder(u + 0.3, 0.5, 0.13, 3, PILLAR_H - 3, marble, 4);
    p.cylinder(u + 0.7, 0.5, 0.13, 3, PILLAR_H - 3, marble, 4);
  }
  beam(p, PILLAR_H, BEAM_H, marble);
  // Pediment on the front (+v) face, ridge along the gate.
  const v = 1 - PIN + 0.04;
  const z = PILLAR_H + BEAM_H;
  p.polygon(
    [
      [BEAM_IN, v, z],
      [4 - BEAM_IN, v, z],
      [2, v, z + 9],
    ] as Vec3[],
    shade(marble, 0.8),
  );
  p.polygon(
    [
      [BEAM_IN, PIN - 0.04, z],
      [2, PIN - 0.04, z + 9],
      [2, v, z + 9],
      [BEAM_IN, v, z],
    ] as Vec3[],
    shade(marble, 0.95),
  );
  p.polygon(
    [
      [2, PIN - 0.04, z + 9],
      [4 - BEAM_IN, PIN - 0.04, z],
      [4 - BEAM_IN, v, z],
      [2, v, z + 9],
    ] as Vec3[],
    shade(marble, 1.02),
  );
  // Gilt seal on the frieze.
  const [x, y] = p.project(2, v, PILLAR_H + BEAM_H / 2);
  p.ctx.fillStyle = '#d9b44a';
  p.ctx.beginPath();
  p.ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  p.ctx.fill();
  p.ctx.fillStyle = '#2b3f7a';
  p.ctx.beginPath();
  p.ctx.arc(x, y, 1.4, 0, Math.PI * 2);
  p.ctx.fill();
}

/** Russia: Kremlin-style red brick towers with white trim, green tent roofs and ruby stars; swallow-tail merlons. */
function russia(p: IsoPainter): void {
  const brick = '#a8392b';
  const trim = '#ece4d4';
  pillars(p, brick);
  for (const u of [0, 3]) p.box(u + PIN - 0.03, PIN - 0.03, 1 - 2 * PIN + 0.06, 1 - 2 * PIN + 0.06, PILLAR_H - 2, 2, trim);
  beam(p, PILLAR_H - 6, BEAM_H, brick, 1 - PIN);
  // Swallow-tail merlons along the beam.
  for (let i = 0; i < 5; i++) {
    const u = 1 - PIN + 0.12 + i * 0.4;
    p.box(u, 0.38, 0.18, 0.24, PILLAR_H - 6 + BEAM_H, 4, brick);
  }
  for (const u of [0, 3]) {
    p.box(u + 0.24, 0.24, 0.52, 0.52, PILLAR_H, 6, brick);
    p.pyramid(u + 0.2, 0.2, 0.6, 0.6, PILLAR_H + 6, 16, '#3f7a52');
    const [x, y] = p.project(u + 0.5, 0.5, PILLAR_H + 25);
    p.pole(u + 0.5, 0.5, PILLAR_H + 21, 3, '#c9a542');
    p.ctx.fillStyle = '#e0242a';
    star(p.ctx, x, y - 1, 2.4);
  }
}

/** China: a paifang — red lacquer columns, a painted beam and a yellow glazed roof with upturned eaves. */
function china(p: IsoPainter): void {
  const red = '#b52a22';
  for (const u of [0, 3]) {
    p.box(u + 0.28, 0.3, 0.44, 0.4, 0, 2, '#9c968a'); // stone base
    p.cylinder(u + 0.5, 0.5, 0.15, 2, PILLAR_H - 2, red);
  }
  beam(p, PILLAR_H - 4, BEAM_H, '#2f6f78', 0.18);
  p.box(0.18, 0.4, 3.64, 0.2, PILLAR_H - 4, 2, '#d9a93a', { edge: null }); // gilt band
  p.hipRoof(0.2, 0.25, 3.6, 0.5, PILLAR_H + BEAM_H - 4, 8, 0.18, '#d8a92e', 3);
  // Ridge ornaments.
  for (const u of [0.45, 3.55]) p.pole(u, 0.5, PILLAR_H + BEAM_H + 4, 3, '#a8781e');
}

/** Europe: a sandstone triumphal gate (Brandenburg Gate) — Doric columns, a deep attic with the EU star ring. */
function europe(p: IsoPainter): void {
  const stone = '#d8c39a';
  for (const u of [0, 3]) {
    p.box(u + PIN, PIN, 1 - 2 * PIN, 1 - 2 * PIN, 0, 3, shade(stone, 0.9));
    p.cylinder(u + 0.3, 0.5, 0.12, 3, PILLAR_H - 3, stone, 3);
    p.cylinder(u + 0.7, 0.5, 0.12, 3, PILLAR_H - 3, stone, 3);
  }
  beam(p, PILLAR_H, 4, shade(stone, 0.96));
  p.box(0.3, PIN, 3.4, 1 - 2 * PIN, PILLAR_H + 4, 7, stone); // attic
  // Blue panel with a ring of gold stars on the attic's front face.
  const v = 1 - PIN;
  p.polygon(
    [
      [1.3, v, PILLAR_H + 5],
      [2.7, v, PILLAR_H + 5],
      [2.7, v, PILLAR_H + 10],
      [1.3, v, PILLAR_H + 10],
    ] as Vec3[],
    '#1f3f99',
    null,
  );
  const [cx, cy] = p.project(2, v, PILLAR_H + 7.5);
  p.ctx.fillStyle = '#f4cf3a';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.ctx.fillRect(cx + Math.cos(a) * 3.2 - 0.5, cy + Math.sin(a) * 1.9 - 0.5, 1, 1);
  }
  // Bronze quadriga block on top.
  p.box(1.7, 0.35, 0.6, 0.3, PILLAR_H + 11, 4, '#5e7a5c');
}

/** Islamic: a tiled iwan gate — sand-stone towers with blue tile bands and domes, a pointed arch over the way through. */
function islamic(p: IsoPainter): void {
  const sand = '#d9c29a';
  const tile = '#2a6fb0';
  pillars(p, sand);
  for (const u of [0, 3]) p.box(u + PIN - 0.02, PIN - 0.02, 1 - 2 * PIN + 0.04, 1 - 2 * PIN + 0.04, PILLAR_H - 6, 3, tile, { edge: null });
  // Arch block: its front face is cut by a pointed arch (the opening below it stays clear).
  const z0 = PILLAR_H - 8;
  const z1 = PILLAR_H + BEAM_H;
  const v0 = PIN;
  const v1 = 1 - PIN;
  const arch: Vec3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    // Pointed (two-centred) arch from u = 3 - PIN to u = 1 + PIN, apex at the middle.
    const u = 3 - PIN - t * (2 - 2 * PIN);
    const k = 1 - Math.abs(2 * t - 1);
    arch.push([u, v1, z0 + (z1 - 3 - z0) * Math.sin((k * Math.PI) / 2)]);
  }
  p.box(1 - PIN, v0, 2 + 2 * PIN, v1 - v0, z1 - 1, 1, sand); // top slab (gives the block its top face)
  p.polygon([[1 - PIN, v1, z1], [3 + PIN, v1, z1], [3 + PIN, v1, z0], ...arch, [1 - PIN, v1, z0]] as Vec3[], tile);
  for (const u of [0, 3]) {
    p.box(u + 0.2, 0.2, 0.6, 0.6, PILLAR_H, 3, sand);
    p.dome(u + 0.5, 0.5, 0.28, PILLAR_H + 3, 9, '#2f8fa6');
    p.pole(u + 0.5, 0.5, PILLAR_H + 12, 4, '#d4b24a');
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
 * Nation Gate (4 × 1): two end pillars with the way through the two middle cells, in the nation's own architecture —
 * USA marble portico, Russian Kremlin towers, Chinese paifang, European triumphal gate, Islamic tiled iwan.
 */
export function createGateArt(faction: FactionId): BuildingArt {
  return {
    footprint: { w: 4, d: 1 },
    height: PILLAR_H + BEAM_H + 24,
    drawStatic: (p) => STYLES[faction](p),
  };
}
