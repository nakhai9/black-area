import { starPath } from '../Canvas';
import { shade } from '../Color';
import { drawFlagOnPole } from '../Flags';
import type { Face, IsoPainter } from '../IsoPainter';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { parapet, RA2, rnd, roofClutter } from './Ra2Kit';

const PLAZA = '#a3a39c';
const GLASS = '#4a6680';
const FRAME = '#c4c6c2';
const CORE = '#b2b4b0';

const WING_H = 36;
const PODIUM_H = 9;
/** The capital's one flag, on the crown of the glass tower (its highest point): pole foot (u, v, z) and pole height. */
const TOP_FLAG: readonly [number, number, number] = [2.0, 1.25, 93];
const TOP_POLE_H = 16;
/** Art-space depth: the headquarters plot only (no esplanade forecourt). */
const ART_D = 4;

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
 * assembly before it, office wings filling the plot round a low
 * podium, and the Union's flags along the podium's front edge.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createBrusselsEUHeadquartersArt(flag: Allegiance = 'europe'): BuildingArt {
  return {
    footprint: { w: 4, d: ART_D },
    // The capital sits on a 5 × 5 plot (FOOTPRINT_CAPITAL). The art below is authored in 4 × 4 units and drawn
    // 1.25× to fill it.
    scale: 5 / 4,
    height: 128,

    drawStatic(p) {
      p.box(0, 0, 4, ART_D, 0, 3, PLAZA);

      // Office blocks filling the plot edge to edge: a back range and two side wings embracing the low assembly
      // podium in the middle (the tower and hemicycle rise from its roof).
      curtainWall(p, 0.02, 0.02, 3.96, 0.6, 3, WING_H * 0.6);
      curtainWall(p, 0.02, 0.62, 0.9, 3.36, 3, WING_H * 0.6);
      curtainWall(p, 0.92, 0.62, 2.16, 3.36, 3, PODIUM_H);

      // The round glass tower at the back, with an open steel crown.
      glassDrum(p, 2.0, 1.25, 0.62, 3 + PODIUM_H, 80 - PODIUM_H);
      p.cylinder(2.0, 1.25, 0.64, 83, 1.2, CORE);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        p.pole(2.0 + Math.cos(a) * 0.6, 1.25 + Math.sin(a) * 0.6, 84, 8, '#c9ccd0');
      }
      p.cylinder(2.0, 1.25, 0.63, 92, 0.8, '#c9ccd0');

      // The hemicycle: a round assembly hall under a glass dome, on the podium in front of the tower.
      const hz = 3 + PODIUM_H;
      p.cylinder(2.0, 2.65, 0.85, hz, 12, FRAME, 18);
      p.cylinder(2.0, 2.65, 0.86, hz + 6, 2, '#2a4f9e');
      p.dome(2.0, 2.65, 0.82, hz + 12, 14, 'rgba(150,200,230,0.85)');
      p.pole(2.0, 2.65, hz + 26, 6, '#c9ccd0');

      // The twelve gold stars ringing the dome's crown (the Union, not one nation).
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const [sx, sy] = p.project(2.0 + Math.cos(a) * 0.5, 2.65 + Math.sin(a) * 0.5, 22 + PODIUM_H);
        p.ctx.fillStyle = '#ffcc00';
        p.ctx.beginPath();
        starPath(p.ctx, sx, sy, 2.4);
        p.ctx.fill();
      }

      curtainWall(p, 3.08, 0.62, 0.9, 3.36, 3, WING_H * 0.6);

      // The one flag flies from the highest point: the crown of the glass tower.
      p.pole(TOP_FLAG[0], TOP_FLAG[1], TOP_FLAG[2], TOP_POLE_H, '#d8d8d8');

    },

    drawAnimated(p, time) {
      drawFlagOnPole(p, flag, TOP_FLAG[0], TOP_FLAG[1], TOP_FLAG[2] + TOP_POLE_H, time, 0, 16, 10);
    },
  };
}
