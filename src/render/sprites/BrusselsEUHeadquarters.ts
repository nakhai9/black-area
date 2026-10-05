import { shade } from '../Color';
import { drawFlagOnPole } from '../Flags';
import type { Face, IsoPainter } from '../IsoPainter';
import { type BuildingArt, groundShadow } from './BuildingArt';

const PLAZA = '#b9bcc0';
const GLASS = '#79a6c8';
const FRAME = '#e3e6ea';
const CORE = '#d5d9de';
const LAWN = '#6aa04c';

const WING_H = 36;
const CORE_H = 46;
const FLAG_U = [0.55, 1.15, 2.85, 3.45] as const;
const FLAG_V = 3.7;
const POLE_H = 30;

/** Curtain wall: alternating white floor slabs and glass bands. */
function curtainWall(p: IsoPainter, u: number, v: number, w: number, d: number, z: number, h: number): void {
  p.box(u, v, w, d, z, h, FRAME);
  const floors = Math.round(h / 4.5);
  for (const face of ['left', 'right'] as Face[]) {
    for (let f = 0; f < floors; f++) {
      const t0 = (f + 0.3) / floors;
      const t1 = (f + 0.85) / floors;
      p.faceRect(face, u, v, w, d, z, h, 0.03, 0.97, t0, t1, shade(GLASS, face === 'left' ? 0.78 : 0.95));
    }
  }
}

/**
 * Brussels — stylised EU headquarters (Berlaymont-inspired): a cross-shaped
 * glass-and-steel block around a taller core, with a row of EU flags.
 */
export const BrusselsEUHeadquartersArt: BuildingArt = {
  footprint: { w: 4, d: 4 },
  height: 96,

  drawStatic(p) {
    groundShadow(p, 4, 4);
    p.box(0, 0, 4, 4, 0, 3, PLAZA);
    p.topRect(0.15, 0.15, 1.35, 1.35, 3, LAWN);
    p.topRect(2.65, 0.15, 3.85, 1.35, 3, LAWN);
    p.topRect(0.15, 2.65, 1.35, 3.4, 3, LAWN);
    p.topRect(2.65, 2.65, 3.85, 3.4, 3, LAWN);

    // Cross plan: back wing, left wing, core, right wing, front wing.
    curtainWall(p, 1.55, 0.35, 0.9, 1.2, 3, WING_H);
    curtainWall(p, 0.35, 1.55, 1.2, 0.9, 3, WING_H);
    curtainWall(p, 1.55, 1.55, 0.9, 0.9, 3, CORE_H);
    p.box(1.65, 1.65, 0.7, 0.7, 3 + CORE_H, 4, CORE);
    curtainWall(p, 2.45, 1.55, 1.2, 0.9, 3, WING_H);
    curtainWall(p, 1.55, 2.45, 0.9, 1.2, 3, WING_H);

    // Roof plant + EU emblem ring.
    p.box(1.8, 1.8, 0.4, 0.4, 3 + CORE_H + 4, 6, '#9aa3ab');
    const [ex, ey] = p.project(2.0, 2.0, 3 + CORE_H + 22);
    p.ctx.strokeStyle = '#ffcc00';
    p.ctx.lineWidth = 1.2;
    p.ctx.beginPath();
    p.ctx.arc(ex, ey, 6, 0, Math.PI * 2);
    p.ctx.stroke();
    p.pole(2.0, 2.0, 3 + CORE_H + 10, 8, '#9aa3ab');

    for (const u of FLAG_U) p.pole(u, FLAG_V, 3, POLE_H);
  },

  drawAnimated(p, time) {
    FLAG_U.forEach((u, i) => drawFlagOnPole(p, 'europe', u, FLAG_V, 3 + POLE_H, time, i * 0.9, 16, 10));
  },
};
