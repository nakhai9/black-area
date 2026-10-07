import { starPath } from '../Canvas';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { Face, IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

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
/** Art-space depth: 4 units of headquarters plus 2.4 of esplanade (see the footprint note below). */
const ART_D = 6.4;

/** Esplanade: lawn strips, a glass canopy over the entrance walk and the ring of twelve stars
 *  set into the paving. */
function esplanade(p: IsoPainter): void {
  p.topRect(0.15, 4.1, 1.25, 6.25, 3, LAWN);
  p.topRect(2.75, 4.1, 3.85, 6.25, 3, LAWN);
  p.topRect(1.35, 4.1, 2.65, 6.25, 3, shade(PLAZA, 1.06));

  for (const u of [0.7, 3.3]) {
    p.cylinder(u, 4.5, 0.045, 3, 5, '#6b5b47');
    p.dome(u, 4.5, 0.15, 7, 6, '#588f43');
    p.cylinder(u, 5.9, 0.045, 3, 5, '#6b5b47');
    p.dome(u, 5.9, 0.15, 7, 6, '#588f43');
  }

  // Light glass canopy over the walk out of the doors — kept short so it does not roof the whole square.
  for (const u of [1.45, 2.55]) {
    p.pole(u, 4.2, 3, 13, '#aeb6bd');
    p.pole(u, 4.78, 3, 13, '#aeb6bd');
  }
  p.topRect(1.36, 4.12, 2.64, 4.86, 16, 'rgba(150,200,230,0.45)', shade(FRAME, 0.9));

  // The twelve stars of the European flag, laid in gold on the paving.
  p.topRect(1.24, 4.98, 2.76, 6.2, 3, shade(PLAZA, 1.12));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const [sx, sy] = p.project(2.0 + Math.cos(a) * 0.62, 5.59 + Math.sin(a) * 0.62, 3.2);
    p.ctx.fillStyle = '#ffcc00';
    p.ctx.beginPath();
    starPath(p.ctx, sx, sy, 4);
    p.ctx.fill();
  }
}

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
  footprint: { w: 4, d: ART_D },
  // The capital sits on a 5 × 8 plot (FOOTPRINT_CAPITAL). The art below is authored in 4 × 6.4 units and drawn
  // 1.25× to fill it: the palace itself keeps its square proportions in v 0…4, and the nation's own ceremonial
  // approach fills v 4…6.4 in front of it.
  scale: 5 / 4,
  height: 96,

  drawStatic(p) {
    p.box(0, 0, 4, ART_D, 0, 3, PLAZA);
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

    for (const u of FLAG_U) drawNationalPole(p, 'europe', u, FLAG_V, 3, POLE_H);

    esplanade(p);
  },

  drawAnimated(p, time) {
    FLAG_U.forEach((u, i) => drawFlagOnPole(p, 'europe', u, FLAG_V, 3 + POLE_H, time, i * 0.9, 16, 10));
  },
};
