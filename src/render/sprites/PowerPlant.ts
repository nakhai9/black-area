import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { RA2, facade, parapet, roofClutter } from './Ra2Kit';

const PIPE = '#6f757c';
const FENCE = '#565b62';

function materials(faction: FactionId): { pad: string; concrete: string; tower: string; dome: string } {
  switch (faction) {
    case 'russia':
    case 'china':
      return { pad: '#8a8778', concrete: '#9a9880', tower: '#a8a594', dome: '#b8b6a2' };
    case 'islamic':
      return { pad: '#a8987c', concrete: '#c2ac86', tower: '#c4b496', dome: '#d2c4a4' };
    default:
      return { pad: RA2.paving, concrete: '#aab0b4', tower: '#b4b6b4', dome: '#c6cacc' };
  }
}

/** Hyperboloid cooling tower centred at (cu, cv): stacked rings, narrowest at 70% of its height. */
function coolingTower(p: IsoPainter, cu: number, cv: number, base: number, h: number, TOWER: string): void {
  const rings = 8;
  for (let i = 0; i < rings; i++) {
    const t = (i + 0.5) / rings;
    const r = base * (0.62 + 0.38 * Math.abs(t - 0.7) / 0.7);
    p.cylinder(cu, cv, r, 2 + (i * h) / rings, h / rings + 0.6, shade(TOWER, (i % 2 ? 0.96 : 1) - i * 0.01));
  }
  // Soot-dark lip.
  p.cylinder(cu, cv, base * 0.66, 2 + h - 3, 3.2, shade(TOWER, 0.72));
  p.topRect(cu - base * 0.55, cv - base * 0.55, cu + base * 0.55, cv + base * 0.55, 2 + h, '#3c3c38');
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
  const { pad: PAD, concrete: CONCRETE, tower: TOWER, dome: DOME } = materials(faction);
  return {
    footprint: { w: 4, d: 4 },
    height: 110,

    drawStatic(p) {
      p.box(0, 0, 4, 4, 0, 2, PAD);
      // Hazard stripe round the pad edge.
      for (let k = 0; k < 16; k++) {
        const c = k % 2 ? '#2a2a2a' : RA2.hazard;
        p.faceRect('left', 0, 0, 4, 4, 0, 2, k / 16, (k + 1) / 16, 0.2, 0.9, c);
        p.faceRect('right', 0, 0, 4, 4, 0, 2, k / 16, (k + 1) / 16, 0.2, 0.9, shade(c, 0.8));
      }

      for (const [u, v] of STACKS) coolingTower(p, u, v, 0.62, 70, TOWER);

      // Turbine hall with a team-colour roof band and a pipe run to the towers.
      p.box(2.35, 1.8, 1.4, 1.5, 2, 16, CONCRETE, { top: shade(team.primary, 0.9) });
      facade(p, 'left', 2.35, 1.8, 1.4, 1.5, 2, 16, { cols: 5, floors: 2, frame: shade(CONCRETE, 1.1), bandColor: shade(CONCRETE, 0.8), lit: 0.15, seed: 3 });
      facade(p, 'right', 2.35, 1.8, 1.4, 1.5, 2, 16, { cols: 4, floors: 2, frame: null, bandColor: shade(CONCRETE, 0.8), lit: 0.1, seed: 4 });
      p.faceRect('left', 2.35, 1.8, 1.4, 1.5, 2, 16, 0, 1, 0.84, 1, team.primary);
      p.faceRect('right', 2.35, 1.8, 1.4, 1.5, 2, 16, 0, 1, 0.84, 1, shade(team.primary, 0.75));
      parapet(p, 2.35, 1.8, 1.4, 1.5, 18, shade(CONCRETE, 0.85));
      roofClutter(p, 2.35, 1.8, 1.4, 1.5, 18, 11);
      // Coolant pipe runs on stilts with team-colour flanges.
      p.box(1.6, 1.6, 0.9, 0.12, 10, 3, PIPE);
      p.box(2.3, 1.2, 0.12, 0.6, 10, 3, PIPE);
      for (const u of [1.8, 2.15]) p.box(u, 1.6, 0.06, 0.12, 2, 8, '#4a4f55');
      for (const u of [1.7, 2.0]) p.box(u, 1.58, 0.05, 0.16, 9.5, 4, shade(team.primary, 0.8));

      // Reactor containment: cylinder + dome, team band near the top.
      p.cylinder(1.25, 2.55, 0.9, 2, 5, shade(CONCRETE, 0.75));
      p.cylinder(1.25, 2.55, 0.85, 7, 25, CONCRETE);
      p.cylinder(1.25, 2.55, 0.86, 16, 1.2, shade(CONCRETE, 0.82));
      p.cylinder(1.25, 2.55, 0.86, 26, 4, shade(team.primary, 0.85));
      p.dome(1.25, 2.55, 0.85, 32, 22, DOME);
      p.cylinder(1.25, 2.55, 0.14, 52, 3, '#5a5d60');

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
      for (let i = 0; i <= 8; i++) p.box(0.1 + i * 0.47, 3.85, 0.05, 0.05, 2, 6, FENCE);
      p.box(0.1, 3.86, 3.75, 0.03, 7, 0.6, FENCE);
      for (let i = 0; i < 8; i++) p.box(3.85, 0.1 + i * 0.47, 0.05, 0.05, 2, 6, FENCE);
      p.box(3.86, 0.1, 0.03, 3.75, 7, 0.6, FENCE);
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
