import { HALF_TH, HALF_TW } from '../../constants';
import { archPath } from '../Canvas';
import { shade } from '../Color';
import { drawFlagOnPole } from '../Flags';
import { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

const PLAZA = '#d9d6cc';
const WHITE = '#f3f0e8';
const STONE = '#e2ddd0';
const TEAL = '#2c8f8a';
const GOLD = '#d9b04a';
const GLASS = '#4a8fb0';
const DARK = '#1f4a52';

const MINARETS: readonly [number, number][] = [
  [0.22, 0.22],
  [3.78, 0.22],
  [0.22, 3.78],
  [3.78, 3.78],
];
const FLAG = { u: 2, v: 3.45, z: 2, h: 36 } as const;

/** Slender minaret with balconies and a teal cap. */
function minaret(p: IsoPainter, u: number, v: number): void {
  p.cylinder(u, v, 0.13, 2, 34, WHITE, 8);
  p.cylinder(u, v, 0.19, 36, 3, GOLD);
  p.cylinder(u, v, 0.1, 39, 14, WHITE, 6);
  p.cylinder(u, v, 0.15, 53, 2.5, GOLD);
  p.onion(u, v, 0.12, 55.5, 13, TEAL);
  p.pole(u, v, 68, 4, GOLD);
}

/**
 * CHHG — a neutral, modern Islamic-style complex in Antarctica: a white
 * cubic hall with a glass front and pointed-arch geometry, a teal and gold
 * dome, four minarets and a reflecting pool. Belongs to no nation and can
 * never be destroyed or captured.
 */
/** Painter shifted half a unit along u, so the 4 × 4 complex sits in the middle of the 5 × 4 plaza. */
function centred(p: IsoPainter): IsoPainter {
  return new IsoPainter(p.ctx, p.ox + 0.5 * HALF_TW, p.oy + 0.5 * HALF_TH);
}

export const ChhgArt: BuildingArt = {
  // 5 × 4 plot (FOOTPRINT_LARGE): plaza over all of it, the 4 × 4 complex centred along u.
  footprint: { w: 5, d: 4 },
  height: 112,

  drawStatic(base) {
    base.box(0, 0, 5, 4, 0, 2, PLAZA);
    const p = centred(base);
    // Star-pattern courtyard and reflecting pool.
    p.topRect(1.2, 3.0, 2.8, 3.8, 2, shade(STONE, 0.9));
    p.topRect(1.35, 3.12, 2.65, 3.68, 2, '#6fb4cc');

    for (const [u, v] of MINARETS) minaret(p, u, v);

    // Main hall: stepped white cube, glass curtain on the front, arch screen.
    p.box(0.7, 0.7, 2.6, 2.3, 2, 20, WHITE);
    p.windows('left', 0.7, 0.7, 2.6, 2.3, 2, 20, 6, 2, shade(GLASS, 0.9), 0.1, 0.5);
    p.windows('right', 0.7, 0.7, 2.3, 2.3, 2, 20, 4, 2, GLASS, 0.1, 0.5);
    p.box(0.9, 0.9, 2.2, 1.9, 22, 8, STONE);
    p.faceTransform('left', 0.9, 2.8, 22, (ctx) => {
      ctx.fillStyle = DARK;
      for (let i = 0; i < 5; i++) {
        archPath(ctx, (0.2 + i * 0.4) * 2.2 * HALF_TW * 0.5 + 6, 8, 12);
        ctx.fill();
      }
    });

    // Entrance iwan: tall pointed arch frame with gold trim.
    p.box(1.5, 2.85, 1.0, 0.25, 2, 18, STONE);
    p.faceTransform('left', 1.5, 3.1, 2, (ctx) => {
      ctx.fillStyle = GOLD;
      archPath(ctx, 0.5 * HALF_TW, 16, 18);
      ctx.fill();
      ctx.fillStyle = DARK;
      archPath(ctx, 0.5 * HALF_TW, 11, 14);
      ctx.fill();
    });

    // Central drum + teal/gold dome with finial.
    p.cylinder(2.0, 1.8, 0.75, 30, 10, WHITE, 16);
    p.cylinder(2.0, 1.8, 0.8, 40, 2, GOLD);
    p.dome(2.0, 1.8, 0.72, 42, 26, TEAL);
    p.cylinder(2.0, 1.8, 0.1, 68, 6, GOLD);
    p.pole(2.0, 1.8, 74, 8, GOLD);

    p.pole(FLAG.u, FLAG.v, FLAG.z, FLAG.h);
  },

  drawAnimated(base, time) {
    const p = centred(base);
    drawFlagOnPole(p, 'neutral', FLAG.u, FLAG.v, FLAG.z + FLAG.h, time, 0.2, 18, 11);
    // Softly pulsing light on the finial.
    const [x, y] = p.project(2.0, 1.8, 82);
    p.ctx.fillStyle = `rgba(255,236,170,${(0.55 + Math.sin(time * 2) * 0.3).toFixed(3)})`;
    p.ctx.beginPath();
    p.ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    p.ctx.fill();
  },
};
