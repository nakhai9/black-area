import { starPath } from '../Canvas';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { Face, IsoPainter } from '../IsoPainter';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { parapet, RA2, rnd, roofClutter } from './Ra2Kit';

const PLAZA = '#a3a39c';
const GLASS = '#4a6680';
const FRAME = '#c4c6c2';
const CORE = '#b2b4b0';
const LAWN = '#5a7634';

const WING_H = 36;
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
    p.ctx.fillStyle = '#c9a53a';
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
      p.faceRect(face, u, v, w, d, z, h, 0.03, 0.97, t1 - (t1 - t0) * 0.3, t1, shade(GLASS, face === 'left' ? 0.98 : 1.18));
    }
    // Vertical steel mullions and the odd lit pane.
    const cols = Math.round((face === 'left' ? w : d) * 14);
    for (let c = 1; c < cols; c++) p.faceRect(face, u, v, w, d, z, h, c / cols - 0.006, c / cols + 0.006, 0, 1, shade(FRAME, 0.82));
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      if (rnd(Math.round(u * 10 + v * 7), f, c + (face === 'left' ? 0 : 50)) < 0.08) {
        p.faceRect(face, u, v, w, d, z, h, c / cols + 0.01, (c + 1) / cols - 0.01, (f + 0.3) / floors, (f + 0.85) / floors, RA2.glassLit);
      }
    }
  }
  parapet(p, u, v, w, d, z + h, FRAME, 0.05, 2);
  roofClutter(p, u, v, w, d, z + h, Math.round(u * 13 + v * 5));
}

/** A round glass tower: stacked floor bands of glass and white slabs, its upper floors stepping out of round. */
function glassDrum(p: IsoPainter, cu: number, cv: number, r: number, z: number, h: number): void {
  const floors = Math.round(h / 4.5);
  for (let f = 0; f < floors; f++) {
    const fz = z + (f * h) / floors;
    p.cylinder(cu, cv, r, fz, (h / floors) * 0.7, shade(GLASS, 0.9 + (f % 3) * 0.06), 16);
    p.cylinder(cu, cv, r * 1.02, fz + (h / floors) * 0.7, (h / floors) * 0.3, FRAME);
  }
}

/**
 * Paris — the seat of the European Union's unified government, a building for the whole continent rather than any
 * one nation (inspired by the European Parliament): a tall round glass tower, the domed glass hemicycle of the
 * assembly before it, two curved office wings embracing a court, the ring of twelve gold stars on the esplanade
 * and the Union's flags along the front.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createBrusselsEUHeadquartersArt(flag: Allegiance = 'europe'): BuildingArt {
  return {
    footprint: { w: 4, d: ART_D },
    // The capital sits on a 5 × 8 plot (FOOTPRINT_CAPITAL). The art below is authored in 4 × 6.4 units and drawn
    // 1.25× to fill it: the building keeps its square proportions in v 0…4, and the ceremonial esplanade fills
    // v 4…6.4 in front of it.
    scale: 5 / 4,
    height: 110,

    drawStatic(p) {
      p.box(0, 0, 4, ART_D, 0, 3, PLAZA);
      p.topRect(0.15, 0.15, 3.85, 0.6, 3, LAWN);

      // Two curved office wings, embracing the court (stepped segments along a half ring).
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        const cu = 2.0 + Math.cos(a) * 1.55;
        const cv = 2.3 + Math.sin(a) * 1.55;
        curtainWall(p, cu - 0.22, cv - 0.22, 0.44, 0.44, 3, WING_H * 0.6);
      }

      // The round glass tower at the back of the court, with an open steel crown.
      glassDrum(p, 2.0, 1.25, 0.62, 3, 80);
      p.cylinder(2.0, 1.25, 0.64, 83, 1.2, CORE);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        p.pole(2.0 + Math.cos(a) * 0.6, 1.25 + Math.sin(a) * 0.6, 84, 8, '#c9ccd0');
      }
      p.cylinder(2.0, 1.25, 0.63, 92, 0.8, '#c9ccd0');

      // The hemicycle: a low round assembly hall under a glass dome, in front of the tower.
      p.cylinder(2.0, 2.65, 0.85, 3, 12, FRAME, 18);
      p.cylinder(2.0, 2.65, 0.86, 9, 2, '#2a4f9e');
      p.dome(2.0, 2.65, 0.82, 15, 14, 'rgba(150,200,230,0.85)');
      p.pole(2.0, 2.65, 29, 6, '#c9ccd0');

      // The twelve gold stars ringing the dome's crown (the Union, not one nation).
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const [sx, sy] = p.project(2.0 + Math.cos(a) * 0.5, 2.65 + Math.sin(a) * 0.5, 25);
        p.ctx.fillStyle = '#ffcc00';
        p.ctx.beginPath();
        starPath(p.ctx, sx, sy, 2.4);
        p.ctx.fill();
      }

      for (const u of FLAG_U) drawNationalPole(p, flag, u, FLAG_V, 3, POLE_H);

      esplanade(p);
    },

    drawAnimated(p, time) {
      FLAG_U.forEach((u, i) => drawFlagOnPole(p, flag, u, FLAG_V, 3 + POLE_H, time, i * 0.9, 16, 10));
    },
  };
}
export const BrusselsEUHeadquartersArt: BuildingArt = createBrusselsEUHeadquartersArt();
