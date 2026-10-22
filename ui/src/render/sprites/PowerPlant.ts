import { HALF_TH, HALF_TW } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { RA2 } from './Ra2Kit';


/** Per-nation materials (no two alike): pad and tower concrete. */
function materials(faction: FactionId): { pad: string; tower: string } {
  switch (faction) {
    case 'russia':
      return { pad: '#7e7a6c', tower: '#b4b0a0' };
    case 'china':
      return { pad: '#8c8474', tower: '#c2bcac' };
    case 'europe':
      return { pad: '#9a9cA4', tower: '#cfd1d4' };
    case 'islamic':
      return { pad: '#a8987c', tower: '#cec2a6' };
    default:
      return { pad: RA2.paving, tower: '#c6c8c4' };
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
  const R = 9;
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

/** Cooling towers: base radius (tiles), height (px) and their centres on the plot. */
const TOWER_R = 0.85;
const TOWER_H = 80;
const TOWERS: readonly [number, number][] = [
  [1.15, 1.0],
  [2.85, 1.2],
];

/**
 * Hyperboloid cooling tower centred at (cu, cv) on the ground at z: one smooth shell (no rings), waist at 72% of
 * its height, lit across its curve and darker towards its foot, a row of support legs round the foot, a lip and the
 * open throat at the top.
 */
function coolingTower(p: IsoPainter, cu: number, cv: number, z: number, base: number, h: number, TOWER: string): void {
  const { ctx } = p;
  const k = Math.SQRT2;
  const radius = (t: number): number => base * (0.6 + 0.4 * Math.pow(Math.abs(t - 0.72) / 0.72, 1.6) * (t < 0.72 ? 1 : 0.55));
  const [cx, y0] = p.project(cu, cv, z);
  const steps = 24;
  const rb = radius(0);
  const rt = radius(1);
  const shell = (): void => {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = cx - radius(t) * k * HALF_TW;
      if (i === 0) ctx.moveTo(x, y0 - t * h);
      else ctx.lineTo(x, y0 - t * h);
    }
    ctx.ellipse(cx, y0 - h, rt * k * HALF_TW, rt * k * HALF_TH, 0, Math.PI, 0, false);
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      ctx.lineTo(cx + radius(t) * k * HALF_TW, y0 - t * h);
    }
    ctx.ellipse(cx, y0, rb * k * HALF_TW, rb * k * HALF_TH, 0, 0, Math.PI, false);
    ctx.closePath();
  };
  // Shell: smooth concrete, shaded across (light from the right) with a soft highlight.
  const wx = rb * k * HALF_TW;
  const g = ctx.createLinearGradient(cx - wx, 0, cx + wx, 0);
  g.addColorStop(0, shade(TOWER, 0.6));
  g.addColorStop(0.45, shade(TOWER, 0.92));
  g.addColorStop(0.68, shade(TOWER, 1.12));
  g.addColorStop(0.82, shade(TOWER, 1.0));
  g.addColorStop(1, shade(TOWER, 0.78));
  shell();
  ctx.fillStyle = g;
  ctx.fill();
  const v = ctx.createLinearGradient(0, y0 - h, 0, y0);
  v.addColorStop(0, 'rgba(255,255,255,0.06)');
  v.addColorStop(0.75, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = v;
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,16,12,0.35)';
  ctx.lineWidth = 0.75;
  ctx.stroke();
  // Support legs: a dark band of slanted columns round the foot.
  ctx.save();
  shell();
  ctx.clip();
  ctx.fillStyle = 'rgba(25,22,18,0.55)';
  ctx.fillRect(cx - wx - 1, y0 - 2.2, wx * 2 + 2, 2.2 + rb * k * HALF_TH + 1);
  ctx.strokeStyle = shade(TOWER, 0.95);
  ctx.lineWidth = 0.7;
  for (let x = cx - wx; x <= cx + wx; x += 3.4) {
    ctx.beginPath();
    ctx.moveTo(x, y0 + rb * k * HALF_TH);
    ctx.lineTo(x + 0.8, y0 - 2.2);
    ctx.stroke();
  }
  ctx.restore();
  // Lip and the open throat.
  ctx.fillStyle = shade(TOWER, 0.8);
  ctx.beginPath();
  ctx.ellipse(cx, y0 - h, rt * k * HALF_TW, rt * k * HALF_TH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34322e';
  ctx.beginPath();
  ctx.ellipse(cx, y0 - h, rt * k * HALF_TW * 0.9, rt * k * HALF_TH * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Chimney stack at (cu, cv): white and team-colour bands alternating up its height, a dark cap. */
function chimney(p: IsoPainter, cu: number, cv: number, z: number, r: number, h: number, team: string): void {
  const bands = 7;
  for (let i = 0; i < bands; i++) p.cylinder(cu, cv, r * (1 - i * 0.03), z + (i * h) / bands, h / bands + 0.3, i % 2 ? '#f2f0ea' : team);
  p.cylinder(cu, cv, r * 0.82, z + h, 1.2, '#3a3834');
}

/** Thin wire fence round the pad's edge: posts and two rails; the back two sides first, the front two last. */
function fence(p: IsoPainter, side: 'back' | 'front'): void {
  const E0 = 0.12;
  const E1 = 3.88;
  const Z = 1.2;
  const H = 7;
  const runs: [number, number, number, number][] =
    side === 'back'
      ? [
          [E0, E0, E1, E0],
          [E0, E0, E0, E1],
        ]
      : [
          [E0, E1, E1, E1],
          [E1, E0, E1, E1],
        ];
  const { ctx } = p;
  for (const [u0, v0, u1, v1] of runs) {
    const n = Math.round(Math.hypot(u1 - u0, v1 - v0) / 0.32);
    ctx.strokeStyle = '#5c5f62';
    ctx.lineWidth = 0.6;
    for (let i = 0; i <= n; i++) {
      const u = u0 + ((u1 - u0) * i) / n;
      const v = v0 + ((v1 - v0) * i) / n;
      const [x, y] = p.project(u, v, Z);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - H);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(150,154,158,0.9)';
    ctx.lineWidth = 0.4;
    for (const z of [Z + H * 0.45, Z + H]) {
      const [ax, ay] = p.project(u0, v0, z);
      const [bx, by] = p.project(u1, v1, z);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }
}

/** Guard post at the front corner of the fence: a small booth with windows, a flat roof and a team-colour band. */
function guardPost(p: IsoPainter, team: string): void {
  const [u, v, w, d, z, h] = [3.15, 3.15, 0.55, 0.55, 1.2, 13];
  p.box(u, v, w, d, z, h, '#d9d6cc', { top: '#8a8c88' });
  p.faceRect('left', u, v, w, d, z, h, 0.15, 0.85, 0.45, 0.8, '#3d566a');
  p.faceRect('right', u, v, w, d, z, h, 0.15, 0.85, 0.45, 0.8, '#4a6478');
  p.faceRect('left', u, v, w, d, z, h, 0, 1, 0.86, 0.96, team);
  p.faceRect('right', u, v, w, d, z, h, 0, 1, 0.86, 0.96, shade(team, 0.85));
  p.box(u - 0.04, v - 0.04, w + 0.08, d + 0.08, z + h, 1, '#6e706c');
  // Barrier arm beside it.
  p.box(u - 0.55, v + 0.3, 0.5, 0.03, z + 4, 0.6, '#d8262b');
}

/**
 * Nuclear Power Plant (4×4 tiles), the same for every nation: two smooth cooling towers (steam rising, a radiation trefoil on
 * the front one) and a chimney striped white and in its team colour, on a concrete pad behind a thin wire fence with a guard post (each nation's own concrete).
 */
export function createPowerPlantArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  const { pad: PAD, tower: TOWER } = materials(faction);
  return {
    footprint: { w: 4, d: 4 },
    height: 120,

    drawStatic(p) {
      // Only three pieces on a fenced concrete pad: two cooling towers (radiation trefoil on the front one) and the
      // striped chimney.
      p.box(0.04, 0.04, 3.92, 3.92, 0, 1.2, PAD);
      p.topRect(0.1, 0.1, 3.9, 3.9, 1.21, shade(PAD, 1.08));
      fence(p, 'back');
      coolingTower(p, TOWERS[0]![0], TOWERS[0]![1], 1.2, TOWER_R, TOWER_H, TOWER);
      chimney(p, 0.75, 2.95, 1.2, 0.17, 96, team.primary);
      coolingTower(p, TOWERS[1]![0], TOWERS[1]![1], 1.2, TOWER_R, TOWER_H, TOWER);
      radiationIcon(p, TOWERS[1]![0] + 0.62 * Math.SQRT1_2, TOWERS[1]![1] + 0.62 * Math.SQRT1_2, 30, team.primary);
      fence(p, 'front');
      guardPost(p, team.primary);
    },

    drawAnimated(p, time) {
      // Steam rising from both towers: soft white puffs drifting up and fading.
      const { ctx } = p;
      TOWERS.forEach(([cu, cv], n) => {
        const [x, y] = p.project(cu, cv, 2 + TOWER_H);
        for (let k = 0; k < 4; k++) {
          const t = (time * 0.25 + n * 0.37 + k / 4) % 1;
          const r = 8 + t * 14;
          ctx.fillStyle = `rgba(245,247,250,${(0.55 * (1 - t)).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(x + t * 10, y - 4 - t * 34, r, r * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
  };
}
