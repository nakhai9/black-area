import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { facade, parapet } from './Ra2Kit';

const WHITE = '#e4e0d4';
const STONE = '#a29e92';
const GLASS = '#2c3a4e';
const ROOF = '#6c7076';

/** Flag on the roof of the residence. */
const FLAG_POLE: readonly [number, number] = [2.0, 0.95];
const ROOF_Z = 31.5;
const POLE_HEIGHT = 24;
/** Art-space depth: 2.4 units × 1.25 = the 3-cell-deep plot (FOOTPRINT_WHITE_HOUSE). */
const ART_D = 2.4;

/**
 * Washington, D.C. — the White House seen from Pennsylvania Avenue: the white Executive Residence, a long block
 * with pedimented windows, a balustraded roof and chimneys, fronted by the North Portico (four tall Ionic columns
 * under a triangular pediment and a lantern over the door), the low East and West Wings — the whole 5 × 3 plot is building, no lawn in front or behind.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createWashingtonWhiteHouseArt(flag: Allegiance = 'usa'): BuildingArt {
  return {
    footprint: { w: 4, d: ART_D },
    // The White House sits on a 5 × 3 plot (FOOTPRINT_WHITE_HOUSE). The art below is authored in 4 × 2.4 units
    // and drawn 1.25× to fill it.
    scale: 5 / 4,
    height: 96,

    drawStatic(p) {
      // The whole plot is building: no lawn in front or behind.
      p.box(0, 0, 4, ART_D, 0, 3, STONE);

      // West Wing (far side) and East Wing: low, flat-roofed, running the full depth of the plot.
      for (const wu of [0.05, 3.25]) {
        p.box(wu, 0.1, 0.7, 2.2, 3, 12, WHITE, { top: ROOF });
        facade(p, 'left', wu, 0.1, 0.7, 2.2, 3, 12, { cols: 3, floors: 2, glass: GLASS, frame: '#f0ece0', fill: 0.45, seed: 17 });
        facade(p, 'right', wu, 0.1, 0.7, 2.2, 3, 12, { cols: 9, floors: 2, glass: GLASS, frame: '#f0ece0', fill: 0.45, seed: 18 });
        parapet(p, wu, 0.1, 0.7, 2.2, 15, WHITE, 0.04, 1.5);
      }

      // Executive Residence: fills the plot between the wings, the North Portico on its front edge.
      const u = 0.75;
      const v = 0.1;
      const w = 2.5;
      const d = 1.75;
      p.box(u, v, w, d, 3, 10, shade(WHITE, 0.94));
      facade(p, 'left', u, v, w, d, 3, 10, { cols: 12, floors: 1, glass: GLASS, frame: '#c4bfb2', fill: 0.42, seed: 21 });
      facade(p, 'right', u, v, w, d, 3, 10, { cols: 8, floors: 1, glass: GLASS, frame: '#c4bfb2', fill: 0.42, seed: 22 });
      p.box(u - 0.02, v - 0.02, w + 0.04, d + 0.04, 13, 1, shade(WHITE, 0.88));
      p.box(u, v, w, d, 14, 14, WHITE);
      facade(p, 'left', u, v, w, d, 14, 14, { cols: 12, floors: 1, glass: GLASS, frame: '#ffffff', fill: 0.5, seed: 23 });
      facade(p, 'right', u, v, w, d, 14, 14, { cols: 8, floors: 1, glass: GLASS, frame: '#ffffff', fill: 0.5, seed: 24 });
      // Little pediments over the main-floor windows.
      for (let i = 0; i < 12; i++) p.faceRect('left', u, v, w, d, 14, 14, (i + 0.25) / 12, (i + 0.75) / 12, 0.82, 0.9, shade(WHITE, 1.08));
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
    },

    drawAnimated(p, time) {
      drawFlagOnPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], ROOF_Z + 3 + POLE_HEIGHT, time, 0);
    },
  };
}
