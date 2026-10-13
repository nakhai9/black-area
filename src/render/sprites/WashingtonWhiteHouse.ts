import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { facade, parapet } from './Ra2Kit';

const WHITE = '#e4e0d4';
const STONE = '#a29e92';
const PATH = '#b7b0a0';
const LAWN = '#5a7634';
const WATER = '#4c6d7c';
const GLASS = '#2c3a4e';
const ROOF = '#6c7076';

/** Flag on the roof of the residence. */
const FLAG_POLE: readonly [number, number] = [2.0, 1.9];
const ROOF_Z = 31.5;
const POLE_HEIGHT = 24;
/** Art-space depth: 4 units of the residence plus 2.4 of North Lawn (see the footprint note below). */
const ART_D = 6.4;

/** Cast-iron lamp post. */
function lamp(p: IsoPainter, u: number, v: number): void {
  p.pole(u, v, 3, 8, '#3a3c3e');
  p.box(u - 0.03, v - 0.03, 0.06, 0.06, 10, 2, '#e8dfb8');
}

/** North Lawn and Pennsylvania Avenue: lawn, the round fountain, the semicircular drive, the iron fence and the avenue. */
function northLawn(p: IsoPainter): void {
  p.topRect(0.15, 3.0, 3.85, 5.5, 3, LAWN);
  // Semicircular drive from the two gates up to the portico.
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * (i / 17);
    const cu = 2.0 + Math.cos(a) * 1.45;
    const cv = 3.0 + Math.sin(a) * 1.35;
    p.topRect(cu - 0.12, cv - 0.12, cu + 0.12, cv + 0.12, 3.02, PATH);
  }
  p.topRect(0.43, 4.3, 0.67, 5.6, 3.02, PATH);
  p.topRect(3.33, 4.3, 3.57, 5.6, 3.02, PATH);
  // Fountain in the middle of the lawn.
  p.cylinder(2.0, 3.9, 0.36, 3, 1.4, STONE);
  p.cylinder(2.0, 3.9, 0.3, 4.4, 0.1, WATER);
  p.cylinder(2.0, 3.9, 0.06, 4.4, 4, WHITE);
  // Black iron fence with stone piers and the two gates, then Pennsylvania Avenue.
  p.box(0.15, 5.55, 3.7, 0.04, 3, 3.5, '#26282a');
  for (let i = 0; i <= 8; i++) p.box(0.12 + i * 0.465, 5.52, 0.08, 0.1, 3, 5, STONE);
  p.topRect(0.05, 5.65, 3.95, 6.35, 3, '#8f8a80');
  for (const lu of [0.3, 1.3, 2.7, 3.7]) lamp(p, lu, 5.75);
}

/**
 * Washington, D.C. — the White House seen from Pennsylvania Avenue: the white Executive Residence, a long block
 * with pedimented windows, a balustraded roof and chimneys, fronted by the North Portico (four tall Ionic columns
 * under a triangular pediment and a lantern over the door), the low East and West Wings, the North Lawn with its
 * fountain and drive, the iron fence and the avenue.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createWashingtonWhiteHouseArt(flag: Allegiance = 'usa'): BuildingArt {
  return {
    footprint: { w: 4, d: ART_D },
    // The capital sits on a 5 × 8 plot (FOOTPRINT_CAPITAL). The art below is authored in 4 × 6.4 units and drawn
    // 1.25× to fill it: the residence keeps its proportions in v 0…4, the North Lawn fills v 4…6.4 in front of it.
    scale: 5 / 4,
    height: 96,

    drawStatic(p) {
      p.box(0, 0, 4, ART_D, 0, 3, STONE);
      p.topRect(0.15, 0.15, 3.85, 1.0, 3, LAWN);

      // West Wing (far side) and East Wing: low, flat-roofed, with a colonnaded link.
      for (const wu of [0.15, 3.15]) {
        p.box(wu, 1.25, 0.7, 1.2, 3, 12, WHITE, { top: ROOF });
        facade(p, 'left', wu, 1.25, 0.7, 1.2, 3, 12, { cols: 4, floors: 2, glass: GLASS, frame: '#f0ece0', fill: 0.45, seed: 17 });
        facade(p, 'right', wu, 1.25, 0.7, 1.2, 3, 12, { cols: 6, floors: 2, glass: GLASS, frame: '#f0ece0', fill: 0.45, seed: 18 });
        parapet(p, wu, 1.25, 0.7, 1.2, 15, WHITE, 0.04, 1.5);
      }

      // Executive Residence.
      const u = 0.85;
      const v = 1.0;
      const w = 2.3;
      const d = 1.6;
      p.box(u, v, w, d, 3, 10, shade(WHITE, 0.94));
      facade(p, 'left', u, v, w, d, 3, 10, { cols: 11, floors: 1, glass: GLASS, frame: '#c4bfb2', fill: 0.42, seed: 21 });
      facade(p, 'right', u, v, w, d, 3, 10, { cols: 7, floors: 1, glass: GLASS, frame: '#c4bfb2', fill: 0.42, seed: 22 });
      p.box(u - 0.02, v - 0.02, w + 0.04, d + 0.04, 13, 1, shade(WHITE, 0.88));
      p.box(u, v, w, d, 14, 14, WHITE);
      facade(p, 'left', u, v, w, d, 14, 14, { cols: 11, floors: 1, glass: GLASS, frame: '#ffffff', fill: 0.5, seed: 23 });
      facade(p, 'right', u, v, w, d, 14, 14, { cols: 7, floors: 1, glass: GLASS, frame: '#ffffff', fill: 0.5, seed: 24 });
      // Little pediments over the main-floor windows.
      for (let i = 0; i < 11; i++) p.faceRect('left', u, v, w, d, 14, 14, (i + 0.25) / 11, (i + 0.75) / 11, 0.82, 0.9, shade(WHITE, 1.08));
      p.box(u - 0.04, v - 0.04, w + 0.08, d + 0.08, 28, 2.2, WHITE);
      p.box(u, v, w, d, 30.2, 0.5, WHITE, { top: ROOF });
      parapet(p, u, v, w, d, 30.7, WHITE, 0.05, 2.4);
      p.hipRoof(u + 0.15, v + 0.15, w - 0.3, d - 0.3, 30.7, 4, 0, ROOF);
      for (const cu of [u + 0.25, u + w - 0.25]) for (const cv of [v + 0.4, v + d - 0.4]) p.box(cu - 0.06, cv - 0.06, 0.12, 0.12, 30.7, 8, shade(WHITE, 0.92));

      // North Portico: four tall columns under a triangular pediment, the door and its lantern behind.
      const pu = 1.55;
      const pw = 0.9;
      const pv = v + d;
      p.box(pu - 0.05, pv, pw + 0.1, 0.5, 3, 2, shade(WHITE, 0.9));
      p.faceRect('left', u, v, w, d, 3, 25, 0.44, 0.56, 0, 0.35, '#3b3a36');
      for (let k = 0; k < 4; k++) p.cylinder(pu + 0.1 + k * 0.233, pv + 0.38, 0.05, 5, 23, '#f8f5ee');
      p.box(pu, pv, pw, 0.5, 28, 2.2, WHITE);
      p.gableRoofV(pu, pv, pw, 0.5, 30.2, 7, '#f4f0e8', ROOF);
      p.box(1.97, pv + 0.2, 0.06, 0.06, 18, 3, '#e8dfb8');

      drawNationalPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], ROOF_Z + 3, POLE_HEIGHT);

      northLawn(p);
    },

    drawAnimated(p, time) {
      drawFlagOnPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], ROOF_Z + 3 + POLE_HEIGHT, time, 0);
    },
  };
}
