import type { FactionColors } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { RA2 } from './Ra2Kit';

const SHELL = '#d9d6cd';

function line(p: IsoPainter, a: [number, number, number], b: [number, number, number], color: string, width: number): void {
  const [ax, ay] = p.project(a[0], a[1], a[2]);
  const [bx, by] = p.project(b[0], b[1], b[2]);
  const { ctx } = p;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

/**
 * Oil derrick (4 × 4 plot), drawn as one round fuel storage tank: a tall welded steel shell with a team-colour band,
 * a low conical roof with a vent, a stair winding up the side, inside a concrete bund wall with a pipe and valve.
 * A small lamp on the roof shows whether the field is pumping (green) or resting (red).
 */
export function createOilDerrickArt(team: FactionColors): BuildingArt {
  return {
    footprint: { w: 4, d: 4 },
    height: 70,

    drawStatic(p) {
      // Pad and the low bund wall round the tank.
      p.box(0, 0, 4, 4, 0, 3, RA2.concrete);
      p.topRect(0.25, 0.25, 3.75, 3.75, 3, '#9b968a');
      p.box(0.2, 0.2, 3.6, 0.1, 3, 4, '#b8b3a6');
      p.box(0.2, 0.2, 0.1, 3.6, 3, 4, '#b8b3a6');
      p.box(0.2, 3.7, 3.6, 0.1, 3, 4, '#c4bfb2');
      p.box(3.7, 0.2, 0.1, 3.6, 3, 4, '#c4bfb2');
      // Shell in three courses so the team band reads as a stripe, not a lid.
      const R = 1.25;
      p.cylinder(2, 2, R, 3, 20, SHELL, 18);
      p.cylinder(2, 2, R, 23, 5, team.primary);
      p.cylinder(2, 2, R, 28, 14, shade(SHELL, 0.97), 18);
      // Conical roof, rim and vent.
      p.cylinder(2, 2, R * 1.02, 42, 1.2, '#a9a69d');
      p.dome(2, 2, R, 43, 8, '#bdbab1');
      p.cylinder(2, 2, 0.1, 50, 3, '#6f757c');
      // Stair winding up the front of the shell, with a handrail.
      for (let k = 0; k < 10; k++) {
        const a0 = 0.15 + k * 0.13;
        const a1 = a0 + 0.13;
        const at = (a: number, z: number): [number, number, number] => [2 + Math.cos(a) * (R + 0.06), 2 + Math.sin(a) * (R + 0.06), z];
        line(p, at(a0, 4 + k * 3.8), at(a1, 4 + (k + 1) * 3.8), '#4a4f55', 1.6);
        line(p, at(a0, 9 + k * 3.8), at(a1, 9 + (k + 1) * 3.8), '#4a4f55', 0.6);
      }
      // Fill pipe and red valve out to the bund wall.
      p.box(3.2, 2.9, 0.6, 0.1, 4, 1.8, '#6f757c');
      p.box(3.45, 2.85, 0.12, 0.2, 4, 3, '#c43d2d');
    },

    drawAnimated(p, _time, active) {
      const [lx, ly] = p.project(2, 2, 54);
      p.ctx.fillStyle = active ? '#5cff6a' : '#ff4a3a';
      p.ctx.beginPath();
      p.ctx.arc(lx, ly, 1.8, 0, Math.PI * 2);
      p.ctx.fill();
    },
  };
}
