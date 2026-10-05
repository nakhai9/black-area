import { shade } from '../Color';
import { drawFlagOnPole } from '../Flags';
import { type IsoPainter, LIGHT } from '../IsoPainter';
import { type BuildingArt, groundShadow } from './BuildingArt';

const MARBLE = '#f2efe6';
const STONE = '#c9c3b2';
const LAWN = '#5f9a42';
const POOL = '#4f9fd1';
const RECESS = '#8e8676';
const GLASS = '#5d6f80';
const BRONZE = '#4a4032';

const FLAG_POLES: readonly [number, number][] = [
  [0.45, 3.5],
  [3.55, 3.5],
];
const POLE_HEIGHT = 44;

/** Senate / House wing: long marble block with two rows of windows. */
function wing(p: IsoPainter, u: number): void {
  const v = 1.3;
  const w = 1.05;
  const d = 1.2;
  p.box(u, v, w, d, 3, 22, MARBLE);
  p.windows('left', u, v, w, d, 3, 22, 6, 2, GLASS);
  p.windows('right', u, v, w, d, 3, 22, 5, 2, GLASS);
  p.box(u - 0.03, v - 0.03, w + 0.06, d + 0.06, 25, 3, MARBLE);
}

/**
 * Washington, D.C. — a stylised U.S. Capitol: twin wings, columned portico,
 * drum + white dome with the Statue of Freedom, lawns and reflecting pool.
 */
export const WashingtonCapitolArt: BuildingArt = {
  footprint: { w: 4, d: 4 },
  height: 112,

  drawStatic(p) {
    groundShadow(p, 4, 4);

    // Plaza, lawns and reflecting pool.
    p.box(0, 0, 4, 4, 0, 3, STONE);
    p.topRect(0.15, 0.15, 3.85, 0.95, 3, LAWN);
    p.topRect(0.15, 2.85, 1.45, 3.85, 3, LAWN);
    p.topRect(2.55, 2.85, 3.85, 3.85, 3, LAWN);
    p.topRect(1.6, 3.3, 2.4, 3.85, 3, shade(STONE, 0.8));
    p.topRect(1.66, 3.36, 2.34, 3.78, 3, POOL);

    wing(p, 0.25);

    // Central block.
    p.box(1.3, 1.0, 1.4, 1.8, 3, 30, MARBLE);
    p.windows('right', 1.3, 1.0, 1.4, 1.8, 3, 30, 6, 3, GLASS);
    p.windows('left', 1.3, 1.0, 1.4, 1.8, 3, 30, 5, 3, GLASS);
    p.box(1.27, 0.97, 1.46, 1.86, 33, 3, MARBLE);

    // Portico: steps, colonnade, entablature, pediment.
    p.box(1.42, 2.8, 1.16, 0.45, 3, 3, STONE);
    p.box(1.55, 2.8, 0.9, 0.4, 6, 20, RECESS, { top: MARBLE });
    p.colonnade('left', 1.55, 2.8, 0.9, 0.4, 6, 20, 6, shade(MARBLE, LIGHT.left + 0.15), RECESS);
    p.colonnade('right', 1.55, 2.8, 0.9, 0.4, 6, 20, 2, shade(MARBLE, LIGHT.right + 0.08), RECESS);
    p.box(1.52, 2.78, 0.96, 0.45, 26, 4, MARBLE);
    p.gableRoofV(1.52, 2.78, 0.96, 0.45, 30, 9, MARBLE, '#d8d2c2');

    wing(p, 2.7);

    // Drum, peristyle, dome, lantern and statue.
    p.cylinder(2.0, 1.9, 0.56, 36, 12, MARBLE, 12);
    p.cylinder(2.0, 1.9, 0.5, 48, 8, MARBLE, 10);
    p.dome(2.0, 1.9, 0.48, 56, 24, '#f6f3ec');
    p.cylinder(2.0, 1.9, 0.11, 79, 7, MARBLE, 4);
    p.dome(2.0, 1.9, 0.11, 86, 5, MARBLE);
    const [sx, sy] = p.project(2.0, 1.9, 90);
    p.ctx.strokeStyle = BRONZE;
    p.ctx.lineWidth = 2;
    p.ctx.beginPath();
    p.ctx.moveTo(sx, sy);
    p.ctx.lineTo(sx, sy - 7);
    p.ctx.stroke();

    for (const [u, v] of FLAG_POLES) p.pole(u, v, 3, POLE_HEIGHT);
  },

  drawAnimated(p, time) {
    FLAG_POLES.forEach(([u, v], i) => drawFlagOnPole(p, 'usa', u, v, 3 + POLE_HEIGHT, time, i * 1.7));
  },
};
