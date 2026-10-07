import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

const PAD = '#a3a196';
const CONCRETE = '#d6d4cc';
const TOWER = '#c9c6bc';
const DOME = '#e6e4de';
const PIPE = '#8a8f96';
const FENCE = '#6c7178';

/** Hyperboloid cooling tower centred at (cu, cv): stacked rings, narrowest at 70% of its height. */
function coolingTower(p: IsoPainter, cu: number, cv: number, base: number, h: number): void {
  const rings = 8;
  for (let i = 0; i < rings; i++) {
    const t = (i + 0.5) / rings;
    const r = base * (0.62 + 0.38 * Math.abs(t - 0.7) / 0.7);
    p.cylinder(cu, cv, r, 2 + (i * h) / rings, h / rings + 0.6, shade(TOWER, 1 - i * 0.012));
  }
  p.topRect(cu - base * 0.55, cv - base * 0.55, cu + base * 0.55, cv + base * 0.55, 2 + h, '#5a5a56');
}

/** Tower tops (u, v, z) where the steam rises. */
const STACKS: readonly [number, number, number][] = [
  [1.05, 1.05, 72],
  [2.25, 0.85, 72],
];

/**
 * Nuclear Power Plant (4×4 tiles): two hyperboloid cooling towers at the back, a domed reactor
 * containment with a team-colour band, a turbine hall with pipes, a fence line and a radiation sign.
 * Steam rises from the towers while the plant is generating.
 */
export function createPowerPlantArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  return {
    footprint: { w: 4, d: 4 },
    height: 110,

    drawStatic(p) {
      p.box(0, 0, 4, 4, 0, 2, PAD);

      for (const [u, v] of STACKS) coolingTower(p, u, v, 0.62, 70);

      // Turbine hall with a team-colour roof band and a pipe run to the towers.
      p.box(2.35, 1.8, 1.4, 1.5, 2, 16, CONCRETE, { top: shade(team.primary, 0.9) });
      p.windows('left', 2.35, 1.8, 1.4, 1.5, 2, 16, 4, 2, '#5d7f99', 0.12, 0.45);
      p.faceRect('left', 2.35, 1.8, 1.4, 1.5, 2, 16, 0, 1, 0.84, 1, team.primary);
      p.box(1.6, 1.6, 0.9, 0.12, 10, 3, PIPE);
      p.box(2.3, 1.2, 0.12, 0.6, 10, 3, PIPE);

      // Reactor containment: cylinder + dome, team band near the top.
      p.cylinder(1.25, 2.55, 0.85, 2, 30, CONCRETE);
      p.cylinder(1.25, 2.55, 0.86, 26, 4, team.primary);
      p.dome(1.25, 2.55, 0.85, 32, 22, DOME);

      // Radiation sign on the front of the pad.
      p.faceTransform('left', 1.6, 3.95, 2, (ctx) => {
        ctx.fillStyle = '#f2c40f';
        ctx.beginPath();
        ctx.arc(8, 6, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        for (let k = 0; k < 3; k++) {
          const a = (k * 2 * Math.PI) / 3 - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(8, 6);
          ctx.arc(8, 6, 3.6, a - 0.5, a + 0.5);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = '#f2c40f';
        ctx.beginPath();
        ctx.arc(8, 6, 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(8, 6, 0.7, 0, Math.PI * 2);
        ctx.fill();
      });

      // Fence posts along the front and the right edge.
      for (let i = 0; i <= 8; i++) p.box(0.1 + i * 0.47, 3.85, 0.05, 0.05, 2, 5, FENCE);
      for (let i = 0; i < 8; i++) p.box(3.85, 0.1 + i * 0.47, 0.05, 0.05, 2, 5, FENCE);
    },

    drawAnimated(p, time, active) {
      if (!active) return;
      const ctx = p.ctx;
      STACKS.forEach(([u, v, z], s) => {
        for (let i = 0; i < 4; i++) {
          const t = (time * 0.35 + i / 4 + s * 0.13) % 1;
          const [x, y] = p.project(u, v, z + t * 34);
          ctx.fillStyle = `rgba(240,242,245,${0.55 * (1 - t)})`;
          ctx.beginPath();
          ctx.arc(x + t * 6, y, 4 + t * 7, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
  };
}
