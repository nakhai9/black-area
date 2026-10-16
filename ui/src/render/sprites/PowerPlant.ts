import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { ISLAMIC_GREEN_DOME } from './IslamicPalette';
import { RA2 } from './Ra2Kit';


/** Per-nation materials (no two alike): pad, tower concrete and the accent of the reactor annex. */
function materials(faction: FactionId): { pad: string; tower: string; annex: string } {
  switch (faction) {
    case 'russia':
      return { pad: '#7e7a6c', tower: '#a29e8a', annex: '#9c8a78' };
    case 'china':
      return { pad: '#8c8474', tower: '#b0aa98', annex: '#b23a2a' };
    case 'europe':
      return { pad: '#9a9cA4', tower: '#c4c6cc', annex: '#d8dce4' };
    case 'islamic':
      return { pad: '#a8987c', tower: '#c4b496', annex: '#d6c49c' };
    default:
      return { pad: RA2.paving, tower: '#b4b6b4', annex: '#e4e4e0' };
  }
}

/** Flat star on a horizontal plane at height z (u, v centre, radius r tiles). */
export function roofStar(p: IsoPainter, cu: number, cv: number, z: number, r: number, color: string, points = 5): void {
  const pts: [number, number, number][] = [];
  for (let k = 0; k < points * 2; k++) {
    const a = -Math.PI * 0.75 + (k * Math.PI) / points;
    const rr = k % 2 ? r * 0.42 : r;
    pts.push([cu + Math.cos(a) * rr, cv + Math.sin(a) * rr, z]);
  }
  p.polygon(pts, color, null);
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
 * Nuclear Power Plant (4×4 tiles), each nation's own design in its team colour (radiation trefoil on the tower):
 *  - USA: tall cooling tower behind a white containment dome with a blue band and a white star;
 *  - Russia: RBMK-style block reactor hall and a red-and-white striped vent stack beside a squat tower;
 *  - China: cooling tower and a reactor hall under a curled red pagoda roof with golden ridge;
 *  - Europe: twin slim cooling towers and an EPR dome ringed with golden stars;
 *  - Islamic: cooling tower and an arched reactor hall crowned by a green dome and a minaret-like stack.
 */
export function createPowerPlantArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  const { pad: PAD, tower: TOWER, annex: ANNEX } = materials(faction);
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
      switch (faction) {
        case 'usa':
          coolingTower(p, 2.5, 1.5, 1.25, 92, TOWER, team.primary);
          radiationIcon(p, 2.5 + 1.05 * Math.SQRT1_2, 1.5 + 1.05 * Math.SQRT1_2, 30, team.primary);
          p.cylinder(1.1, 2.9, 0.85, 2, 14, ANNEX);
          p.cylinder(1.1, 2.9, 0.86, 12, 2.5, team.primary);
          p.dome(1.1, 2.9, 0.85, 16, 16, ANNEX);
          roofStar(p, 1.1, 2.9, 32.5, 0.35, '#ffffff');
          break;
        case 'russia':
          // Vent stack (back), squat tower, then the long block reactor hall in front.
          p.cylinder(0.7, 0.7, 0.28, 2, 100, '#e8e4dc', 10);
          for (let i = 0; i < 6; i++) p.cylinder(0.7, 0.7, 0.29, 2 + i * 16, 8, team.primary);
          coolingTower(p, 2.6, 1.4, 1.15, 70, TOWER, team.primary);
          radiationIcon(p, 2.6 + 0.95 * Math.SQRT1_2, 1.4 + 0.95 * Math.SQRT1_2, 22, team.primary);
          p.box(0.3, 2.5, 3.4, 1.3, 2, 24, ANNEX);
          p.faceRect('left', 0.3, 2.5, 3.4, 1.3, 2, 24, 0, 1, 0.78, 0.92, team.primary);
          p.windows('left', 0.3, 2.5, 3.4, 1.3, 2, 24, 10, 1, RA2.glass, 0.3, 0.6);
          p.box(1.6, 2.7, 0.9, 0.9, 26, 8, shade(ANNEX, 0.85));
          roofStar(p, 2.05, 3.15, 34.2, 0.38, team.primary);
          break;
        case 'china':
          coolingTower(p, 2.6, 1.4, 1.2, 88, TOWER, team.primary);
          radiationIcon(p, 2.6 + 1 * Math.SQRT1_2, 1.4 + 1 * Math.SQRT1_2, 28, team.primary);
          p.box(0.4, 2.4, 2.2, 1.3, 2, 16, '#e0d8c4');
          p.faceRect('left', 0.4, 2.4, 2.2, 1.3, 2, 16, 0, 1, 0, 0.75, ANNEX);
          p.faceRect('right', 0.4, 2.4, 2.2, 1.3, 2, 16, 0, 1, 0, 0.75, shade(ANNEX, 0.8));
          p.hipRoof(0.4, 2.4, 2.2, 1.3, 18, 9, 0.25, ANNEX, 3);
          p.box(1.1, 2.95, 0.8, 0.12, 27, 1.5, team.primary);
          break;
        case 'europe':
          coolingTower(p, 1.2, 1.1, 0.85, 80, TOWER, team.primary);
          coolingTower(p, 2.9, 1.1, 0.85, 80, TOWER, team.primary);
          radiationIcon(p, 2.9 + 0.7 * Math.SQRT1_2, 1.1 + 0.7 * Math.SQRT1_2, 26, team.primary);
          p.cylinder(2, 2.9, 0.9, 2, 16, ANNEX);
          p.dome(2, 2.9, 0.9, 18, 14, ANNEX);
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            p.cylinder(2 + Math.cos(a) * 0.91, 2.9 + Math.sin(a) * 0.91, 0.05, 11, 1.4, team.light);
          }
          p.cylinder(2, 2.9, 0.92, 8, 1.6, team.primary);
          break;
        default: {
          // Islamic: arched hall with a green dome, a slim minaret stack and a crescent finial.
          coolingTower(p, 2.6, 1.4, 1.2, 88, TOWER, team.primary);
          radiationIcon(p, 2.6 + 1 * Math.SQRT1_2, 1.4 + 1 * Math.SQRT1_2, 28, team.primary);
          p.box(0.4, 2.4, 1.9, 1.4, 2, 18, ANNEX);
          p.windows('left', 0.4, 2.4, 1.9, 1.4, 2, 18, 4, 1, shade(team.dark, 1.1), 0.15, 0.7);
          p.faceRect('left', 0.4, 2.4, 1.9, 1.4, 2, 18, 0, 1, 0.85, 0.95, team.primary);
          p.dome(1.35, 3.1, 0.65, 20, 18, ISLAMIC_GREEN_DOME);
          p.pole(1.35, 3.1, 38, 4, '#e8c860');
          p.cylinder(3.5, 3.4, 0.16, 2, 46, ANNEX);
          p.cylinder(3.5, 3.4, 0.22, 36, 2, team.primary);
          p.dome(3.5, 3.4, 0.16, 48, 5, ISLAMIC_GREEN_DOME);
        }
      }
    },
  };
}
