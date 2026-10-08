import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import { type IsoPainter, LIGHT } from '../IsoPainter';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';

const WHITE = '#fbfaf6';
const STONE = '#c9c3b2';
const PATH = '#d9d3c1';
const LAWN = '#5f9a42';
const WATER = '#4f9fd1';
const RECESS = '#9a9486';
const GLASS = '#4d5e6e';
const ROOF = '#9ea3a6';

/** Flag on the roof, above the South Portico. */
const FLAG_POLE: readonly [number, number] = [2.0, 1.85];
const ROOF_Z = 31.5;
const POLE_HEIGHT = 24;
/** Art-space depth: 4 units of the residence plus 2.4 of South Lawn (see the footprint note below). */
const ART_D = 6.4;

/** One elm on the lawn. */
function elm(p: IsoPainter, u: number, v: number): void {
  p.cylinder(u, v, 0.045, 3, 5, '#6b513a');
  p.dome(u, v, 0.18, 7, 8, '#4f7f3b');
}

/** South Lawn: open grass, the round fountain, a curved drive and elms along both sides. */
function southLawn(p: IsoPainter): void {
  p.topRect(0.15, 2.9, 3.85, 6.25, 3, LAWN);
  // Drive sweeping round the lawn.
  p.topRect(0.35, 3.0, 0.6, 6.0, 3, PATH);
  p.topRect(3.4, 3.0, 3.65, 6.0, 3, PATH);
  p.topRect(0.35, 5.8, 3.65, 6.05, 3, PATH);
  // Fountain.
  p.cylinder(2.0, 4.3, 0.42, 3, 1.5, STONE);
  p.cylinder(2.0, 4.3, 0.36, 4.5, 0.1, WATER);
  p.cylinder(2.0, 4.3, 0.06, 4.5, 4, WHITE);
  for (let i = 0; i < 4; i++) {
    const v = 3.4 + i * 0.75;
    elm(p, 0.15, v);
    elm(p, 3.85, v);
  }
}

/** East / West Wing: low colonnaded terrace on either side of the residence. */
function sideWing(p: IsoPainter, u: number): void {
  p.box(u, 1.45, 0.6, 0.85, 3, 11, RECESS, { top: WHITE });
  p.colonnade('left', u, 1.45, 0.6, 0.85, 3, 11, 4, shade(WHITE, LIGHT.left + 0.1), RECESS);
  p.box(u - 0.02, 1.43, 0.64, 0.89, 14, 2, WHITE);
}

/**
 * Washington, D.C. — a stylised White House: the three-storey Executive Residence with its balustraded roof,
 * the curved South Portico and Truman Balcony, low East/West colonnades, the South Lawn and its fountain.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createWashingtonWhiteHouseArt(flag: Allegiance = 'usa'): BuildingArt {
  return {
    footprint: { w: 4, d: ART_D },
    // The capital sits on a 5 × 8 plot (FOOTPRINT_CAPITAL). The art below is authored in 4 × 6.4 units and drawn
    // 1.25× to fill it: the residence keeps its proportions in v 0…4, the South Lawn fills v 4…6.4 in front of it.
    scale: 5 / 4,
    height: 96,

    drawStatic(p) {

      // Grounds: north lawn behind, gravel round the house.
      p.box(0, 0, 4, ART_D, 0, 3, STONE);
      p.topRect(0.15, 0.15, 3.85, 1.2, 3, LAWN);

      sideWing(p, 0.15);

      // Executive Residence: white sandstone block, two rows of windows over a rusticated ground floor.
      const u = 0.75;
      const v = 1.2;
      const w = 2.5;
      const d = 1.45;
      p.box(u, v, w, d, 3, 8, shade(WHITE, 0.94));
      p.windows('left', u, v, w, d, 3, 8, 11, 1, GLASS);
      p.windows('right', u, v, w, d, 3, 8, 5, 1, GLASS);
      p.box(u, v, w, d, 11, 16, WHITE);
      p.windows('left', u, v, w, d, 11, 16, 11, 2, GLASS);
      p.windows('right', u, v, w, d, 11, 16, 5, 2, GLASS);
      // Cornice and roof balustrade, low grey roof behind it.
      p.box(u - 0.03, v - 0.03, w + 0.06, d + 0.06, 27, 2, WHITE);
      p.box(u, v, w, d, 29, 2.5, WHITE, { top: ROOF });
      p.hipRoof(u + 0.2, v + 0.2, w - 0.4, d - 0.4, 31.5, 4, 0, ROOF);

      // South Portico: curved bow of columns, Truman Balcony, flat top with balustrade.
      p.cylinder(2.0, v + d, 0.4, 3, 24, WHITE, 8);
      p.cylinder(2.0, v + d, 0.42, 14, 1.2, WHITE);
      p.cylinder(2.0, v + d, 0.43, 27, 1.5, WHITE);
      // Steps down to the lawn.
      p.box(1.6, v + d + 0.35, 0.8, 0.25, 3, 1.5, STONE);

      sideWing(p, 3.25);

      drawNationalPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], ROOF_Z + 3, POLE_HEIGHT);

      southLawn(p);
    },

    drawAnimated(p, time) {
      drawFlagOnPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], ROOF_Z + 3 + POLE_HEIGHT, time, 0);
    },
  };
}
export const WashingtonWhiteHouseArt: BuildingArt = createWashingtonWhiteHouseArt();
