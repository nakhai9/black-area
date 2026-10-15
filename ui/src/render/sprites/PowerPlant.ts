import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { RA2 } from './Ra2Kit';


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

/** Radiation trefoil centred on (u, v, z): team-colour blades on a dark disc, facing the viewer. */
function radiationIcon(p: IsoPainter, u: number, v: number, z: number, color: string): void {
  const [x, y] = p.project(u, v, z);
  const { ctx } = p;
  const R = 11;
  ctx.fillStyle = '#1c1c1c';
  ctx.beginPath();
  ctx.arc(x, y, R + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * Math.PI) / 3 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(x, y, R, a - Math.PI / 6, a + Math.PI / 6);
    ctx.arc(x, y, R * 0.3, a + Math.PI / 6, a - Math.PI / 6, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, R * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

/** Hyperboloid cooling tower centred at (cu, cv): many thin rings, narrowest at 70% of its height, with a coloured band at mid-height. */
function coolingTower(p: IsoPainter, cu: number, cv: number, base: number, h: number, TOWER: string, band: string): void {
  const rings = 30;
  for (let i = 0; i < rings; i++) {
    const t = (i + 0.5) / rings;
    const r = base * (0.62 + (0.38 * Math.abs(t - 0.7)) / 0.7);
    p.cylinder(cu, cv, r, 2 + (i * h) / rings, h / rings + 0.4, i === 13 || i === 14 ? band : shade(TOWER, 1 - i * 0.004));
  }
  // Soot-dark lip.
  p.cylinder(cu, cv, base * 0.66, 2 + h - 3, 3.2, shade(TOWER, 0.72));
  p.cylinder(cu, cv, base * 0.6, 2 + h, 0.3, '#3c3c38');
}

/**
 * Nuclear Power Plant (4×4 tiles): one great hyperboloid cooling tower with a team-colour band, on a hazard-striped
 * pad, with the radiation trefoil in the team colour on the front of its shell.
 */
export function createPowerPlantArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  const { pad: PAD, tower: TOWER } = materials(faction);
  return {
    footprint: { w: 4, d: 4 },
    height: 110,

    drawStatic(p) {
      p.box(0, 0, 4, 4, 0, 2, PAD);
      for (let k = 0; k < 16; k++) {
        const c = k % 2 ? '#2a2a2a' : RA2.hazard;
        p.faceRect('left', 0, 0, 4, 4, 0, 2, k / 16, (k + 1) / 16, 0.2, 0.9, c);
        p.faceRect('right', 0, 0, 4, 4, 0, 2, k / 16, (k + 1) / 16, 0.2, 0.9, shade(c, 0.8));
      }
      // One great hyperboloid cooling tower filling the plot, a team-colour band round its waist.
      coolingTower(p, 2, 2, 1.5, 92, TOWER, team.primary);
      // Radiation trefoil painted on the front of the shell, below the band.
      radiationIcon(p, 2 + 1.26 * Math.SQRT1_2, 2 + 1.26 * Math.SQRT1_2, 30, team.primary);
    },
  };
}
